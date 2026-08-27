# Knowledge Ontology v1.1 · Migration Plan

> 状态：实施前规划 · 待审议
> 日期：2026-05-24
> 前置文档：`docs/knowledge-ontology-v1.1.md`
> 决策已定：**D1.1 = A**（ULID）／**D1.2 = C**（优先级表）／**D1.3 = C**（单成员先行）／**D1.4 = B**（同步建 cluster）／**D1.5 = C**（懒回填）

---

## 0. TL;DR + 3 PR 路线

v1.1 把"概念"从 v1 内嵌叶子的 KP 上抬两步：底层 KP 仍归属课程体系，向上聚合为跨体系的 **Cluster**；学情、AdaptiveController、备课层都以 `clusterId` 为锚。本计划全部 **additive**——不删一个 v1 字段、不改一个 v1 主键、对运行时零侵入，可以三个 PR 独立 revert。

- **PR1（纯加表 + 类型）**：4 张新表 SQL + `shared-types` 新增 `knowledge-point.ts` + zod schema + 单测。运行时未消费。
- **PR2（学情接 cluster）**：`student_responses` ALTER + 写路径填 `cluster_id` + 懒回填 helper + UPDATE 回写。
- **PR3（Adaptive/Delivery 切语义）**：`masteryMap` 文档化为 clusterId 键空间 + 运行时 `clst_/kp_` 前缀断言 + slide/quiz 渲染层契约切换。

**最该先拍的 1 个未决**：**单库迁移期间的写入冲突窗口（H.2）**。better-sqlite3 + WAL + `IF NOT EXISTS` 现状下，drizzle migrator 与 `student-response-store.ts` 的 inline DDL 是两条并存路径（见 §C.2），动手前必须确认是用哪一条迁移 PR2 的 ALTER。

---

## A. 新增表 DDL（SQL 全文）

### A.0 设计取舍：JSON 列 vs 关联表

| 关注点 | JSON 列内嵌 | 独立关联表 |
|---|---|---|
| 单 KP 取出 sourceRefs | 1 行 + JSON.parse | join + 多行 |
| 按 source 反查 KP | sqlite JSON1 `json_each` 全表扫 | 索引命中 |
| 写入幂等去重 | 应用层处理 | UNIQUE 约束兜底 |
| sqlite 兼容性 | 需 JSON1 扩展（默认编译开启） | 纯 SQL 安全 |
| schema 演化 | 字段可加，向后兼容 | 需要 ALTER 关联表 |

**结论**：
- `provenance.sourceRefs[]` → **拆独立表 `knowledge_point_sources`**。理由：需要按 source 反查（"展示所有来自 pep-cn 的 KP"）、UNIQUE 约束（同 KP × 同 source × 同 externalId 不应重复）、sourceRefs 增长无上限（v1.1 §8 已提到归档场景）。
- `KP.aliases[]` / `Cluster.aliases[]` / `KP.annotations.*` → **保留 JSON 列**。理由：仅随主 KP 一起读写、无反查需求、体量小。
- 叶子↔KP 多对多 → **独立关联表 `chapter_node_knowledge_points`**。理由：必须支持"一个 KP 被哪些叶子引用"反查（跨教材统计）、避免 JSON 数组 ALTER。

### A.1 `knowledge_point_clusters`

```sql
CREATE TABLE IF NOT EXISTS `knowledge_point_clusters` (
  `id`                  text PRIMARY KEY NOT NULL,                    -- ULID
  `canonical_name_en`   text NOT NULL,
  `subject`             text NOT NULL,
  `grade_band_hint`     text,
  `aliases`             text NOT NULL DEFAULT '[]',                   -- JSON: Array<{lang, name}>
  `cross_system_notes`  text,
  `common_misconceptions` text,                                       -- JSON: Annotation<string[]> | null
  `assessability`       text,                                         -- JSON: Annotation<AssessabilityLevel> | null
  `created_by`          text NOT NULL,                                -- 'manual' | 'llm-aligned' | 'term-dictionary' | 'auto-singleton'
  `verified`            integer NOT NULL DEFAULT 0,
  `annotator_version`   text,
  `created_at`          integer NOT NULL,
  `curated_at`          integer,
  `updated_at`          integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_kpc_canon_subject`
  ON `knowledge_point_clusters` (`canonical_name_en`, `subject`);
CREATE INDEX IF NOT EXISTS `idx_kpc_subject` ON `knowledge_point_clusters` (`subject`);
CREATE INDEX IF NOT EXISTS `idx_kpc_updated_at` ON `knowledge_point_clusters` (`updated_at`);
```

> `canonical_name_en + subject` 联合 UNIQUE 防止运营误建重复 cluster。注意非英文 cluster（如语文单成员簇）允许 canonical_name_en 写中文 fallback——是否强制英文留作 §J 未决 J-1。

### A.2 `knowledge_points`

```sql
CREATE TABLE IF NOT EXISTS `knowledge_points` (
  `id`                  text PRIMARY KEY NOT NULL,                    -- ULID
  `cluster_id`          text NOT NULL,
  `curriculum_system`   text NOT NULL,                                -- 'pep-cn' | 'kokutei-jp' | ...
  `canonical_name`      text NOT NULL,
  `aliases`             text NOT NULL DEFAULT '[]',                   -- JSON: string[]
  `canonical_hash`      text NOT NULL,                                -- nv1:sha1(...)
  `subject`             text NOT NULL,
  `grade_band`          text NOT NULL,
  `title`               text NOT NULL,
  `summary`             text NOT NULL DEFAULT '',
  `annotations`         text NOT NULL DEFAULT '{}',                   -- JSON: KnowledgePointAnnotations
  `confidence`          real,
  `verified`            integer NOT NULL DEFAULT 0,
  `annotator_version`   text NOT NULL,
  `labeled_at`          integer NOT NULL,
  `curated_at`          integer,
  `updated_at`          integer NOT NULL,
  FOREIGN KEY (`cluster_id`) REFERENCES `knowledge_point_clusters`(`id`) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_kp_canonical_hash` ON `knowledge_points` (`canonical_hash`);
CREATE INDEX IF NOT EXISTS `idx_kp_cluster` ON `knowledge_points` (`cluster_id`);
CREATE INDEX IF NOT EXISTS `idx_kp_subject_grade` ON `knowledge_points` (`subject`, `grade_band`);
CREATE INDEX IF NOT EXISTS `idx_kp_curriculum` ON `knowledge_points` (`curriculum_system`);
```

> sqlite `foreign_keys = ON` 已在 `client.ts` pragma 启用，FK 实际生效。`ON DELETE RESTRICT` 防止误删 cluster 时 dangling KP。

### A.3 `knowledge_point_sources`（provenance.sourceRefs 拆表）

```sql
CREATE TABLE IF NOT EXISTS `knowledge_point_sources` (
  `id`                text PRIMARY KEY NOT NULL,                      -- ULID
  `knowledge_point_id` text NOT NULL,
  `source`            text NOT NULL,                                  -- KnowledgePointSource
  `external_id`       text,
  `evidence_snippet`  text,
  `confidence`        real,
  `ingested_at`       integer NOT NULL,
  FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_kps_unique`
  ON `knowledge_point_sources` (`knowledge_point_id`, `source`, `external_id`);
CREATE INDEX IF NOT EXISTS `idx_kps_kp` ON `knowledge_point_sources` (`knowledge_point_id`);
CREATE INDEX IF NOT EXISTS `idx_kps_source` ON `knowledge_point_sources` (`source`);
```

> UNIQUE 索引允许 `external_id` 为 NULL（sqlite 语义：多 NULL 不冲突），所以纯 `manual` 录入不会被联合唯一卡住——这是预期行为。

### A.4 `chapter_node_knowledge_points`（叶子↔KP 多对多）

```sql
CREATE TABLE IF NOT EXISTS `chapter_node_knowledge_points` (
  `chapter_node_id`     text NOT NULL,                                -- textbook tree leaf id
  `knowledge_point_id`  text NOT NULL,
  `position`            integer NOT NULL DEFAULT 0,                   -- 叶子内 KP 显示顺序
  `created_at`          integer NOT NULL,
  PRIMARY KEY (`chapter_node_id`, `knowledge_point_id`),
  FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_cnkp_kp` ON `chapter_node_knowledge_points` (`knowledge_point_id`);
CREATE INDEX IF NOT EXISTS `idx_cnkp_chapter` ON `chapter_node_knowledge_points` (`chapter_node_id`);
```

> `chapter_node_id` 不加 FK——教材叶子目前只活在 `packages/textbook-index` 的 JSON 索引文件中，不在 SQLite 表。这是预设妥协，详见 §H.3。

---

## B. ALTER 现有表

### B.1 `student_responses` 加列（PR2）

sqlite 限制提醒：`ALTER TABLE ... ADD COLUMN` 安全，但新加的列**不能带非 NULL 默认值**（除非默认值是常量字面量）；**不能加 FK 约束**；不能内联建索引。

```sql
ALTER TABLE `student_responses` ADD COLUMN `knowledge_point_cluster_id` text;
ALTER TABLE `student_responses` ADD COLUMN `knowledge_point_id`         text;
ALTER TABLE `student_responses` ADD COLUMN `curriculum_system`          text;

CREATE INDEX IF NOT EXISTS `idx_sr_cluster`    ON `student_responses` (`knowledge_point_cluster_id`);
CREATE INDEX IF NOT EXISTS `idx_sr_kp`         ON `student_responses` (`knowledge_point_id`);
CREATE INDEX IF NOT EXISTS `idx_sr_curriculum` ON `student_responses` (`curriculum_system`);
```

三列均允许 NULL，旧行（懒回填前）保持 NULL，新写入路径必须填 `cluster_id`（KP/curriculumSystem 视上下文可空）。

### B.2 不动 `objective_ids`

**结论：保留不动，不重命名、不删除、不语义切换**。

理由：
- `objective_ids` 是 v1 时代的"目标/KP id 数组"，含义已经被消费方（`delivery-adapter.ts`、`AdaptiveController` 间接）固化。
- v1.1 引入的是**新维度（cluster）**，不是替代——`objective_ids` 留作 audit/排错。
- 任何对 `objective_ids` 的语义改动都会触发跨包 ripple，违反 additive 原则。

后续 v1.2 决定是否清理时，再走独立 PR + 数据导出。

---

## C. Migration 文件落到 `packages/db/src/migrations/`

### C.1 编号

当前 `packages/db/src/migrations/` 已有：
- 0000 ~ 0003：drizzle migrator 生成（`meta/_journal.json` 中已登记）
- 0004 `courses_v2`、0005 `student_responses`：**手写 SQL，未登记到 `_journal.json`**

**事实：drizzle migrator 实际只跑 0000–0003**（journal 截止 0003）。0004/0005 是靠 `student-response-store.ts` 类型的 `IF NOT EXISTS` 启动建表，或在仓库初始化时手工跑过一次。这是当前迁移系统的**事实分叉**，详见 §C.2。

下一个编号：**0006**。建议拆 4 个文件，每个聚焦一个变更，便于单独 revert：

```
0006_knowledge_point_clusters.sql
0007_knowledge_points.sql
0008_knowledge_point_sources.sql
0009_chapter_node_knowledge_points.sql
0010_student_responses_kp_columns.sql   ← PR2 专属，PR1 不含
```

PR1 包含 0006–0009。PR2 包含 0010。

### C.2 选择"哪条迁移通道"——动手前必须拍

现状两条通道并存：

| 通道 | 实现 | 现状用法 |
|---|---|---|
| α · drizzle migrator | `migrate(db, { migrationsFolder })`，靠 `meta/_journal.json` | 仅在测试里调用（见 `__tests__/*.test.ts`）；生产路径未确认是否调用 |
| β · 启动时 `IF NOT EXISTS` 内联 DDL | `student-response-store.ts:41` `db.exec(TABLE_SQL)` | 实际生产路径 |

**推荐**：v1.1 走 α + 同时补登 0004/0005 到 `_journal.json`（一次性补救），所有新表通过 drizzle migrator 跑。
- 同步**保留** β 模式作为兜底：在 `packages/db/src/client.ts` 增加一次性 `runStartupMigrations()`，把 0006–0010 的 `IF NOT EXISTS` DDL exec 一遍，幂等。
- α/β 都 `IF NOT EXISTS`，互不冲突。

> 这是 §0 标记的"最该先拍"决策——如果用户选纯 α 而不补 β，PR1 必须先有独立 PR0 把 `_journal.json` 补齐 + 验证生产路径确实调用 migrator。

### C.3 旧库重复执行的兜底

所有 0006–0010 的 DDL **全部使用 `IF NOT EXISTS`**（包括索引）。即使两条通道都跑，也只是 no-op。zone：drizzle migrator 自身用 hash 校验，重复执行不会重跑——这是 drizzle 的标准行为。

---

## D. TypeScript 层改动清单

按 PR 划分：

### D.1 PR1（纯加表 + 类型）

| 文件 | 类型 | 内容 |
|---|---|---|
| `packages/shared-types/src/knowledge-point.ts` | 新增 | `KnowledgePointId` / `KnowledgePointClusterId` 类型别名；`KnowledgePoint` / `KnowledgePointCluster` / `SourceRef` / `KnowledgePointAnnotations` interface；zod schema `knowledgePointSchema` / `knowledgePointClusterSchema` / `sourceRefSchema`；`isClusterId(s)` / `isKpId(s)` 类型守卫（前缀 `clst_` / `kp_` 判定）；ULID 生成 helper `newClusterId()` / `newKpId()`。 |
| `packages/shared-types/src/index.ts` | 修改 | export 上述类型与 schema。 |
| `packages/textbook-index/src/tree-types.ts` | 修改（additive） | `ChapterAnnotations` 增加 `knowledgePointIds?: KnowledgePointId[]`；**保留** v1 的 `knowledgePoints?` 内嵌字段不动（双写阶段）。`knowledgeType` 不变。 |
| `packages/db/src/schema.ts` | 修改 | 增加 drizzle table 定义：`knowledgePointClusters` / `knowledgePoints` / `knowledgePointSources` / `chapterNodeKnowledgePoints`。 |
| `packages/db/src/repositories/knowledge-point.sqlite.ts` | 新增 | `createKnowledgePointRepository(db)`：CRUD + `findByCanonicalHash` + `attachToChapter` + `listByChapter` + `listBySource`。 |
| `packages/db/src/repositories/knowledge-point-cluster.sqlite.ts` | 新增 | CRUD + `findOrCreateSingletonForKp(kp)`（D1.4 同步建簇用） + `mergeClusters(srcId, dstId)`（跨体系合并）。 |
| `packages/db/src/index.ts` | 修改 | export 上述两个 repository。 |
| `packages/db/src/__tests__/knowledge-point.test.ts` | 新增 | 单测：建表、ULID 唯一、canonicalHash 幂等、FK 级联、attach/detach 叶子。 |

### D.2 PR2（学情接 cluster + 懒回填）

| 文件 | 类型 | 内容 |
|---|---|---|
| `app/app/lib/v2/student-response-store.ts` | 修改 | 1）`TABLE_SQL` 同步增加三新列 + 三新索引（仍 `IF NOT EXISTS`）；2）`StudentResponse` interface 加 `knowledgePointClusterId?: string \| null` / `knowledgePointId?: string \| null` / `curriculumSystem?: string \| null`；3）`recordResponse` 入参增加同三字段；4）`rowToResponse` 同步读出。 |
| `app/app/lib/v2/kp-cluster-mapper.ts` | 新增 | `resolveClusterForObjective(objectiveId): { clusterId, kpId } \| null`——按 `knowledge_points.cluster_id` 直查（若 objectiveId 是 KP id）；fallback 走 `chapter_node_knowledge_points`（若 objectiveId 是叶子 id）。内置 LRU（lru-cache 已是项目依赖之一，否则自写 Map + size 控制）。 |
| `app/app/lib/v2/student-response-store.ts` | 修改 | `listCourseResponses` / `listAtomResponses` 读路径上：发现 `cluster_id` 为 NULL 且 `objective_ids` 非空时，调 `resolveClusterForObjective(objective_ids[0])`，命中后异步 `UPDATE student_responses SET cluster_id=?, kp_id=? WHERE id=?` 回写。回写失败仅 hilog warn，不阻塞。 |

### D.3 PR3（Adaptive/Delivery 切语义）

| 文件 | 类型 | 内容 |
|---|---|---|
| `packages/classroom/src/adaptive/controller.ts` | 修改 | 1）`masteryMap` 注释升级："键空间正式语义 = clusterId"；2）新增公开方法 `setMasteryByCluster(clusterId, value)`（旧 `setMastery` 加 `@deprecated` 注释，行为不变）；3）在 `setMastery` / `extractConceptIds` 中加运行时断言：若开关 `STRICT_CLUSTER_IDS=true`，则 id 必须以 `clst_` 开头，否则 throw + hilog warn。 |
| `packages/classroom/src/adaptive/delivery-adapter.ts` | 修改 | `correctRateByObjective` 改为同时填充 `correctRateByCluster`（新字段），两份数据并存一个 release，便于灰度回退。 |
| `packages/classroom/src/v2/ClassroomV2Client.ts` | 修改 | `objectiveIds` 透传不变；新增 `clusterIds?: string[]` 字段透传（slide/quiz 渲染层填）。 |

---

## E. 懒回填实现细节（D1.5 = C）

### E.1 触发点

只在**读路径**懒回填，不在写路径回填存量：
- `listCourseResponses(courseId)` 末尾：扫描结果中 `clusterId === null` 的行。
- `computeCourseInsights` 在统计前 ensure。

写路径（`recordResponse`）从今往后必填 cluster_id（PR2 起强制；过渡期允许 null）。

### E.2 映射来源

按优先级 fallback：

1. **`knowledge_points.id` 直查**：若 `objective_ids[0]` 看起来像 KP id（`kp_*` 前缀），`SELECT cluster_id FROM knowledge_points WHERE id = ?`。
2. **`chapter_node_knowledge_points` join**：若 objective_id 看起来像 chapter leaf id（含 textbook tree 命名前缀），`SELECT kp.cluster_id, kp.id FROM chapter_node_knowledge_points cnkp JOIN knowledge_points kp ON cnkp.knowledge_point_id = kp.id WHERE cnkp.chapter_node_id = ? LIMIT 1`（多 KP 时取第一个，并记 warn）。
3. **canonicalHash 反查**：若 objective_id 是历史 v1 的 `canonicalKey`（`subject:slug` 风格），重算 canonicalHash 查 `knowledge_points`。
4. 全部失败：返回 null，不阻塞读路径，结果行的 cluster_id 保持 null，仅计入 `kp_cluster_mapper.unresolved` 计数器（hilog 一次 / per courseId / per session）。

### E.3 缓存

- 进程内 LRU，最大 5000 entries，TTL 10 分钟。
- key = `objectiveId`（含前缀），value = `{ clusterId, kpId } | null`（null 也缓存以避免重复 miss）。
- 命中后**异步**回写 DB（`db.prepare(UPDATE ...).run()` 不 await），失败 warn。回写**只更新 NULL 行**：`WHERE id = ? AND knowledge_point_cluster_id IS NULL`，防并发覆盖。

### E.4 失败策略

| 情况 | 策略 |
|---|---|
| `objective_ids` 为空数组 | 直接跳过，cluster_id 永久 null，无 warn。 |
| 映射 query 命中 0 行 | 缓存 null，记一次 warn，跳过。 |
| 多个 KP 候选 | 取 position=0 的那个，记 warn 含候选数。 |
| UPDATE 回写抛异常 | 仅 warn，不让读路径失败。 |

---

## F. 回滚预案

所有动作 additive，回滚总策略 = "不读新字段、不调新方法"。具体：

| 动作 | 不可逆？ | 回滚步骤 |
|---|---|---|
| 新增 4 张表（PR1） | 否 | `DROP TABLE IF EXISTS knowledge_point_sources; ...`（按 FK 反序）。drizzle journal 回退一条 entry。 |
| `student_responses` 加 3 列（PR2） | sqlite 3.35+ 支持 `DROP COLUMN` 可逆 | 兜底：**保留列、止写**——PR2 revert 后 `recordResponse` 不再写新列，旧数据保留无害。 |
| 懒回填 UPDATE 回写（PR2） | 已写入的 cluster_id 不可逆 | 真要回退：`UPDATE student_responses SET knowledge_point_cluster_id = NULL, knowledge_point_id = NULL`，全表一次性清空。 |
| `AdaptiveController` 语义切换（PR3） | 行为变化但无数据改动 | revert PR3 commit；`masteryMap` 数值留存无害（旧逻辑也只是 string key lookup）。 |
| `_journal.json` 补登 0004/0005（PR0 if any） | 修改 journal 不可逆 | git revert 即可，DB 状态不受影响。 |

**计划承诺**：不删任何 v1 字段（`objective_ids` / `ChapterAnnotations.knowledgePoints` 全保留）。回滚 = git revert PR + 选择性清空新列。

---

## G. 实施分阶段（PR1 / PR2 / PR3）

### PR1 · 加表 + 类型契约（≈ 1.5 天）

**包含**：
- migration 0006 / 0007 / 0008 / 0009
- `packages/shared-types/src/knowledge-point.ts` 新建
- `packages/db/src/schema.ts` 4 张新表 drizzle 定义
- 2 个新 repository + 单测
- `tree-types.ts` 加 `knowledgePointIds?` 字段（不消费）
- **PR0 兜底**（如选）：补 0004/0005 到 `_journal.json`

**验收**：
- `pnpm typecheck` 全绿
- `pnpm --filter @maolab/db test` 新增的 knowledge-point.test.ts 通过
- 启动 app 进入任意 v2 课程，**运行时零差异**（4 张新表存在但无消费方）
- sqlite REPL：`.tables` 看到 4 张新表，`.schema knowledge_points` 含 FK

**风险**：低。纯加表 + 未消费。

### PR2 · 学情接 cluster + 懒回填（≈ 2 天）

**包含**：
- migration 0010（student_responses ADD COLUMN × 3 + 索引 × 3）
- `student-response-store.ts` schema / interface / 读写路径更新
- `kp-cluster-mapper.ts` 新建 + LRU
- 在 `recordResponse` 调用方（搜 `recordResponse(` ≈ 3 处）补传 `clusterId` / `kpId`（取自 slide.conceptIds 或 quiz.concepts；找不到则传 null，依靠懒回填）
- 单测：`kp-cluster-mapper.test.ts`（覆盖 4 类 fallback）

**验收**：
- `pnpm typecheck` 全绿
- 写一个新 student_response，立即 `SELECT knowledge_point_cluster_id FROM student_responses WHERE id = ?` 返回非 null
- 旧的 student_response 行（无 cluster_id），调 `listCourseResponses` 后再查 DB，cluster_id 已被懒回填 UPDATE（前提是 KP 表里有匹配数据）
- `pnpm --filter @maolab/classroom test` 不退步

**风险**：中。涉及生产路径写入；要确保 §C.2 的迁移通道决定后再动。

### PR3 · Adaptive/Delivery 切语义（≈ 1 天）

**包含**：
- `controller.ts` 加 `setMasteryByCluster` + 运行时断言开关
- `delivery-adapter.ts` 双写 `correctRateByObjective` + `correctRateByCluster`
- `ClassroomV2Client.ts` 透传 `clusterIds`
- 文档：在 `controller.ts` 头部加注释块说明键空间语义

**验收**：
- 默认关闭 `STRICT_CLUSTER_IDS`，行为 100% 同 PR2 之后；显式打开后，传非 `clst_` 前缀立即 throw
- `pnpm --filter @maolab/classroom test` 全绿
- 真实检查跑一遍课堂：开关关闭→无 warn，开关打开→所有 conceptId 走断言

**风险**：低-中。语义改动但行为兼容，可灰度。

---

## H. 风险清单

### H.1 sqlite ALTER 限制（中）

sqlite 早期版本对 ALTER 限制严：3.25 才支持 RENAME COLUMN，3.35 才支持 DROP COLUMN，FK/CHECK 约束不能后加。
- **缓解**：PR2 只用 `ADD COLUMN`（最古老就支持）+ 索引；不依赖 DROP/RENAME。回滚走"保留列止写"，不强 DROP。
- 验证：`better-sqlite3` 当前 bundle 的 sqlite 版本 ≥ 3.40，DROP COLUMN 也可用。

### H.2 单库迁移期间的写入冲突（高）

`client.ts` 用 `journal_mode = WAL` + 单文件单 connection 模式。但 `student-response-store.ts` 自建另一个 `new Database(path)` connection（line 39）。WAL 模式下两个 connection 并发写正常，但 **migration 期间的 ALTER TABLE 不能与并发写共存**（sqlite 会 SQLITE_BUSY）。
- **缓解**：PR2 在 app 启动早期、`student-response-store` 第一次 `getDb()` 之前跑 migration。具体做法：在 app entry point 显式调一次 `runMigrations()` 并 await，再让任何路由 handler 启动。
- **这是 §0 点名的"最该先拍"决策**：需要用户确认 app 启动顺序（Next.js dev server / Vercel build / 本地 cli 三种入口的 migration 触发点）。

### H.3 旧课程 objective_ids 映射覆盖率未知（中）

懒回填依赖 KP 表里有数据。v1.1 实施前的历史课程，objective_ids 含 v1 时代的"KP id"（实际是 v1 概念字符串），可能跟新 KP 表 id 不匹配。
- **缓解**：
  - PR2 落地后 1 周内统计 `SELECT count(*) FROM student_responses WHERE knowledge_point_cluster_id IS NULL`，估算覆盖率。
  - 若 < 30%，启动 §E.2 fallback#3（canonicalHash 反查）。
  - 若 < 10%，做一次性脚本回填（不在本计划范围）。

### H.4 canonicalHash 跨学段冲突（低）

`hash(curriculumSystem + subject + gradeBand + normalize(canonicalName))` 已含 gradeBand，跨学段同名（如初中"函数"vs 高中"函数"）会得到不同 hash。
- **缓解**：normalize 算法版本前缀 `nv1:` 编入 hash（v1.1 §8 已约束），算法升级时新旧并存一段时间，避免硬伤。
- 真正冲突场景（同 curriculum + 同 subject + 同 grade_band + 同 normalize 后名）= 业务上确实是同一 KP，幂等合并是预期。

### H.5 启动时 migration 失败的回滚（中）

如果 0006–0010 中某一条跑挂（比如 FK 校验失败），后续 SQL 不会执行。drizzle migrator 默认非事务、文件级断点。
- **缓解**：
  - 每个 migration 文件用 `BEGIN; ... COMMIT;` 包一层（drizzle 支持）。
  - app 启动时 catch migration error，记 hilog fatal 并 fail-fast，不允许进入"半迁移"状态。
  - 提供 `pnpm db:rollback-knowledge-ontology` 脚本，按 FK 反序 DROP 4 张新表，回到 PR0 状态。

### H.6 conceptId / clusterId 二义性窗口（中）

PR2 已写入 cluster_id，PR3 才打开断言。PR2 → PR3 之间，`masteryMap` 可能同时含 KP id 和 cluster id。
- **缓解**：
  - PR3 引入 `STRICT_CLUSTER_IDS` 开关，**默认关闭**——即使 PR3 已 merge，运行时也兼容旧 id。
  - 后续 v1.2 在收集到生产 0 报错的证据后再默认打开。

---

## I. 验收脚本

实施完成后跑下列命令（按顺序）：

```bash
# 1. 类型检查全绿
pnpm typecheck

# 2. 包级单测全绿
pnpm --filter @maolab/db test
pnpm --filter @maolab/shared-types test
pnpm --filter @maolab/classroom test
pnpm --filter @maolab/textbook-index test

# 3. SQLite REPL 验证（手工）
sqlite3 ./data/maolab.db <<'SQL'
.tables
.schema knowledge_point_clusters
.schema knowledge_points
.schema knowledge_point_sources
.schema chapter_node_knowledge_points
.schema student_responses
PRAGMA index_list('student_responses');
PRAGMA foreign_key_check;
SQL

# 4. 写一条新 response 验证 cluster_id 落库
pnpm tsx scripts/smoke-record-response.ts
# 该脚本应：
#   - 写入一条 student_response（带 clusterId）
#   - SELECT 出来确认 knowledge_point_cluster_id 非 NULL
#   - 同时确认 knowledge_point_id / curriculum_system 落库

# 5. 懒回填验证
pnpm tsx scripts/smoke-lazy-backfill.ts
# 该脚本应：
#   - 插一条 cluster_id=NULL 但 objective_ids 命中 KP 表的 response
#   - 调 listCourseResponses
#   - 再次 SELECT，确认 cluster_id 已被回写

# 6. 真实检查（按 CLAUDE.md 工作模式）
# 触发 "真检"，双专家走完一个完整 v2 课程
```

---

## J. 未决问题（请用户拍板）

| 编号 | 议题 | 备选 | 推荐 |
|---|---|---|---|
| **J-1** | `cluster.canonical_name_en` 是否强制英文？语文/历史等单成员 cluster 若强制英文会变成"Deng Jiaxian"等 fake-translation。 | A · 强制英文，文化文本忍受 fake-translation；B · 允许 fallback 为 curriculum 原语；C · 把 `canonical_name_en` 改名为 `canonical_name` 并允许任何语言，新增 `canonical_name_en?` 选填。 | **C**。把"英文"从命名上去掉，使其语言中立。需在 PR1 落地前定。 |
| **J-2**（**§0 最优先**） | §C.2 的"两条迁移通道"如何收敛？是只走 drizzle migrator（需补 PR0 登记 0004/0005），还是 α + β 并存（双重 `IF NOT EXISTS`）？ | A · 纯 α；B · α + β 并存（推荐）；C · 全切 β | **B**。零额外风险。但需用户确认是否接受 drizzle journal 与生产路径"事实分叉"长期存在。 |
| **J-3** | 懒回填的回写动作是同步还是异步？同步增加读路径 latency；异步在 Next.js serverless 环境可能丢失。 | A · 同步；B · 异步 fire-and-forget；C · 同步但加 5ms timeout | **A**。better-sqlite3 是同步 API，UPDATE 一条带索引行 < 1ms，不值得复杂化。 |

---

> 本计划完成度自评：DDL 可直接 copy-paste / sqlite 方言已校对 / 不实施代码。预计实施总耗时 4.5 个人日。
