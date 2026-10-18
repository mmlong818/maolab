# S6 真实模型走查：备课室备课 → 课程包 → 自习室上课（2026-10-18）

拆分 spec §7 S6：两个产品各自跑真实模型，课程经课程包从备课室到自习室，知识点用真实 k12 id。

## 怎么跑的

| 段 | 命令 | 产物 |
|---|---|---|
| 备课 | maolab `corepack pnpm -C apps/prep-harness realmodel:prep --key-env <.env> --k12-dir <k12 数据集> --kp-ids 7085c609…,6dc7c761… --out prep --package-out package` | `prep/summary.json`、`prep/turns.json`、`package/lesson-v1.zip`（不入库）、`package/public.pem` |
| 上课 | 自习室 `corepack pnpm -C apps/api exec tsx scripts/lesson-realmodel.ts --turns 4 --from <package> --k12-dir <k12 数据集> --key-env <.env> --out lesson/summary.json` | `lesson/summary.json` |

- 模型 glm-5.3（云一网关），备课与上课都是真实调用。
- 知识点：k12-knowledge-points 里两个高中语文知识点（《芣苢》），备课前只把这两个导入测试 schema。
- 代码：maolab `split-s6`（698688d）；自习室 `platform/k12-knowledge`（3632785）。

## 结果

### 备课（第二次跑，completed，约 10.5 分钟，9 回合）

| 回合 | 结果 |
|---|---|
| plan / approve | 定计划，生成 13 页（中间挡 1 页、修 5 次） |
| render | 13 页截图成功 |
| audit | 第一次整课审查拦下 1 页的真实问题 → repair_page、重渲染 → 第二次审查通过 |
| accept | 13 页逐页验收 + 整课验收 |
| export / rehearse | PPT 导出、试讲成功 |
| 课程包 | 导出任务 succeeded：v1，13 页，8.6 MB，签名；manifest 的 `kpIds` 是两个 k12 id，`knowledgeDataset` 记了 k12 数据集版本 |

密钥扫描：host 日志 0 命中。

### 第一次跑卡死（已修）

第一次跑在整课审查卡住（stalled，15 分钟）：glm-5.3 把问题类别写成 `answer-mismatch`、`answer-consistency`，不在枚举里，事实核查输出校验失败，13 页全部"未核实"，审查连续 15 次被拦，修复也解不开。修法（698688d）：类别整词认不出时按词逐个认。见 core ISSUES 33。

### 上课（completed，4 回合全部 live）

| 指标 | S6 | 4b 基线（10-15） |
|---|---|---|
| 课程包导入（验签）并上课 | 是 | （4b 是直接发布，没有包） |
| 回合 | 4/4 done，live | 4/4 |
| 大纲页标题在回复里出现 | 0 / 13 | 0 / 17 |
| cite_resource 引用课程 | 否（0 次） | 否（0 次） |
| 检查题 ask / resolve | 2 / 0 | 2 / 1 |
| 撤回后下一回合被拒（409） | 是 | 是 |
| 密钥扫描 | 0 | 0 |

## 结论

- 链路通：备课室真实备课 → 签名课程包 → 自习室验签导入 → 真实上课 → 运营撤回生效，知识点从头到尾是同一个 k12 id。
- 导师不按大纲推进、不主动引用课程，与 4b 基线一致，是导师提示与模型行为的问题，不是拆分引入的；检查题 resolve 0 是因为脚本里学生的固定台词（"AABB 式"等）不一定回应到检查题。这两点留给以后的导师调优，不阻塞拆分。
- 自习室侧的推荐准确度下降（资源按知识点名匹配）见 ISSUES 30，用户已接受。
