-- 0006_knowledge_points.sql
-- Knowledge Ontology v1.1 — 引入 KnowledgePoint + Cluster + Provenance + 教材关联
-- 决策: D1.1=ULID（过渡期 UUID v4） / D1.2=优先级表(manual>pep-cn>llm>external-kg) / D1.3=单成员先行 /
--      D1.4=Pilot 同步建 cluster / D1.5=学情懒回填
-- α+β 并存: 既走 drizzle/手写 migration, 也允许 store 启动时 CREATE IF NOT EXISTS 兜底
-- 纯 additive: 不动任何现有表
--
-- 注意：本 migration 未登记到 meta/_journal.json（α 通道事实分叉，0004/0005 同样未登记，
--       靠 β 兜底机制让 sqlite 启动时建表）。修复 journal 的工作留 v1.2。

-- ============================================================
-- A.1 knowledge_point_clusters
-- ============================================================
CREATE TABLE IF NOT EXISTS `knowledge_point_clusters` (
  `id`                    text PRIMARY KEY NOT NULL,
  `canonical_name_en`     text NOT NULL,
  `subject`               text NOT NULL,
  `grade_band_hint`       text,
  `aliases`               text NOT NULL DEFAULT '[]',
  `cross_system_notes`    text,
  `common_misconceptions` text,
  `assessability`         text,
  `created_by`            text NOT NULL DEFAULT 'auto-singleton',
  `verified`              integer NOT NULL DEFAULT 0,
  `annotator_version`     text,
  `created_at`            integer NOT NULL,
  `curated_at`            integer,
  `updated_at`            integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_kpc_canon_subject`
  ON `knowledge_point_clusters` (`canonical_name_en`, `subject`);
CREATE INDEX IF NOT EXISTS `idx_kpc_subject`
  ON `knowledge_point_clusters` (`subject`);
CREATE INDEX IF NOT EXISTS `idx_kpc_updated_at`
  ON `knowledge_point_clusters` (`updated_at`);

-- ============================================================
-- A.2 knowledge_points
-- ============================================================
CREATE TABLE IF NOT EXISTS `knowledge_points` (
  `id`                  text PRIMARY KEY NOT NULL,
  `cluster_id`          text NOT NULL,
  `curriculum_system`   text NOT NULL,
  `canonical_name`      text NOT NULL,
  `aliases`             text NOT NULL DEFAULT '[]',
  `canonical_hash`      text NOT NULL,
  `subject`             text NOT NULL,
  `grade_band`          text NOT NULL DEFAULT '',
  `title`               text NOT NULL DEFAULT '',
  `summary`             text NOT NULL DEFAULT '',
  `annotations`         text NOT NULL DEFAULT '{}',
  `confidence`          real,
  `verified`            integer NOT NULL DEFAULT 0,
  `annotator_version`   text NOT NULL DEFAULT '',
  `labeled_at`          integer NOT NULL,
  `curated_at`          integer,
  `updated_at`          integer NOT NULL,
  FOREIGN KEY (`cluster_id`) REFERENCES `knowledge_point_clusters`(`id`) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_kp_canonical_hash`
  ON `knowledge_points` (`canonical_hash`);
CREATE INDEX IF NOT EXISTS `idx_kp_cluster`
  ON `knowledge_points` (`cluster_id`);
CREATE INDEX IF NOT EXISTS `idx_kp_subject_grade`
  ON `knowledge_points` (`subject`, `grade_band`);
CREATE INDEX IF NOT EXISTS `idx_kp_curriculum`
  ON `knowledge_points` (`curriculum_system`);

-- ============================================================
-- A.3 knowledge_point_sources (provenance.sourceRefs 拆表)
-- ============================================================
CREATE TABLE IF NOT EXISTS `knowledge_point_sources` (
  `id`                  text PRIMARY KEY NOT NULL,
  `knowledge_point_id`  text NOT NULL,
  `source`              text NOT NULL,
  `external_id`         text,
  `evidence_snippet`    text,
  `confidence`          real,
  `ingested_at`         integer NOT NULL,
  FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_kps_unique`
  ON `knowledge_point_sources` (`knowledge_point_id`, `source`, `external_id`);
CREATE INDEX IF NOT EXISTS `idx_kps_kp`
  ON `knowledge_point_sources` (`knowledge_point_id`);
CREATE INDEX IF NOT EXISTS `idx_kps_source`
  ON `knowledge_point_sources` (`source`);

-- ============================================================
-- A.4 chapter_node_knowledge_points (叶子 ↔ KP 多对多)
-- ============================================================
CREATE TABLE IF NOT EXISTS `chapter_node_knowledge_points` (
  `chapter_node_id`     text NOT NULL,
  `knowledge_point_id`  text NOT NULL,
  `position`            integer NOT NULL DEFAULT 0,
  `created_at`          integer NOT NULL,
  PRIMARY KEY (`chapter_node_id`, `knowledge_point_id`),
  FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_cnkp_kp`
  ON `chapter_node_knowledge_points` (`knowledge_point_id`);
CREATE INDEX IF NOT EXISTS `idx_cnkp_chapter`
  ON `chapter_node_knowledge_points` (`chapter_node_id`);
