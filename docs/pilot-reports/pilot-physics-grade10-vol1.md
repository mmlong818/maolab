# Pilot Report — KP 抽取 v0.1.1 全量 dry-run

- **教材**: 高中物理人教版高一必修 第一册
- **tree id**: `12eed579-1883-4b7c-b543-3bac585a4f16`
- **annotator**: KnowledgePointExtractionAnnotator v0.1.1
- **model**: claude-cli:haiku
- **concurrency**: 3
- **生成时间**: 2026-05-24T11:39:46.119Z

## 1. 教材与叶子规模

- 实际叶子数: **22**

## 2. zod 通过率

- 通过 / 总数 = **21 / 22 = 95.5%**
- 失败: 1

## 3. KP 切分分布（直方图，仅通过的叶子）

| KP 数 | 叶子数 |
|---|---|
| 0 | 1 |
| 1 | 15 |
| 2 | 5 |
| 3 | 0 |
| 4+ | 0 |

- 平均每叶子 KP 数: **1.19**
- 中位数: **1**
- 通过的叶子总 KP 数: **25**

## 4. confidence 分布

- KP 级 confidence 均值: **0.889** · 中位数: **0.920**

**最低 leafConfidence 的 5 个叶子：**

| leafId | title | leafConfidence |
|---|---|---|
| `f3c0b769` | 1.实验：探究小车速度随时间变化的规律 | 0.35 |
| `fa9c6166` | 6.超重和失重 | 0.80 |
| `e9c61aab` | 4.力的合成和分解 | 0.85 |
| `d984cca7` | 2.实验：探究加速度与力、质量的关系 | 0.85 |
| `9266dc39` | 5.牛顿运动定律的应用 | 0.85 |

## 5. knowledgeType 分布

| type | count | pct |
|---|---|---|
| factual | 0 | 0.0% |
| conceptual | 19 | 76.0% |
| procedural | 6 | 24.0% |
| metacognitive | 0 | 0.0% |

## 6. difficulty 分布

| range | count |
|---|---|
| 0.0-0.2 | 0 |
| 0.2-0.4 | 3 |
| 0.4-0.6 | 9 |
| 0.6-0.8 | 13 |
| 0.8-1.0 | 0 |

## 7. zod 失败案例

### 学生实验 (`8731fa65`)

- path: 
- 错误: `Expected ',' or '}' after property value in JSON at position 73 (line 4 column 22)`

```text
```json
{
  "knowledgePoints": [],
  "leafConfidence": 0.2,
  "leafReasoning": ""学生实验"是教学活动形式而非具体知识点。此类叶子仅提供实验操作框架，无独立的学习目标、前置依赖或可单独设计的练习体系。实验内容与目的由相关学科知识决定，实验本身仅为验证性活动载体。根据规则4，极短且为活动类叶子输出0个KP。"
}
```
```

## 8. 可疑切分案例（启发式）

| leafId | title | kpCount | reason |
|---|---|---|---|
| `c0056fc7` | 2.时间 位移 | 2 | 极短标题但 leafConfidence=0.90 |
| `ff783133` | 2.匀变速直线运动的速度与时间的关系 | 1 | 标题看起来是复合叶子但只切了 1 KP |
| `4859e5ad` | 3.匀变速直线运动的位移与时间的关系 | 1 | 标题看起来是复合叶子但只切了 1 KP |
| `a4973833` | 1.重力与弹力 | 2 | 极短标题但 leafConfidence=0.92 |
| `8992ada9` | 2.摩擦力 | 1 | 极短标题但 leafConfidence=0.90 |
| `204e7962` | 4.力学单位制 | 1 | 极短标题但 leafConfidence=0.92 |
| `fa9c6166` | 6.超重和失重 | 1 | 标题看起来是复合叶子但只切了 1 KP |
| `fa9c6166` | 6.超重和失重 | 1 | 极短标题但 leafConfidence=0.80 |
| `33c76c84` | 课题研究 | 0 | 切分为 0 KP |
| `33c76c84` | 课题研究 | 0 | 极短标题但 leafConfidence=0.95 |

## 9. canonicalNameEn 抽样（随机 10 个）

| canonicalName (zh) | canonicalNameEn |
|---|---|
| 共点力的平衡 | Equilibrium of Concurrent Forces |
| 小车速度随时间变化规律的实验探究 | Experimental Investigation of Velocity Change with Time for an Accelerating Trolley |
| 自由落体运动 | Free Fall Motion |
| 匀变速直线运动的速度与时间的关系 | Linear relationship between velocity and time in uniformly accelerated motion |
| 加速度与力的关系的实验探究 | Experimental Investigation of Relationship between Acceleration and Force |
| 加速度与质量的关系的实验探究 | Experimental Investigation of Relationship between Acceleration and Mass |
| 牛顿第一定律 | Newton's First Law |
| 质点 | Point Mass |
| 匀变速直线运动的位移与时间关系 | Displacement-Time Relationship in Uniformly Accelerated Linear Motion |
| 牛顿第三定律 | Newton's Third Law |

## 10. 耗时

- 总耗时: **259.8s** (4.33 min)
- 平均每叶子: **11.8s**

## 11. 进入 PR2 实施的准入判断

- zod 通过率 ≥ 95%: **YES** (实际 95.5%)
- 严重切分错误 ≤ 3: **YES** (实际 1)

### 决策: **GO** — 进入 PR2 实施

## 附录 A — 全叶子结果一览

| # | leafId | title | zod | kpCount | leafConf | elapsed(s) |
|---|---|---|---|---|---|---|
| 1 | `630d7ed4` | 序言 物理学：研究物质及其运动规律的科学 | OK | 1 | 0.88 | 25.8 |
| 2 | `7a9ebc82` | 1.质点 参考系 | OK | 2 | 0.91 | 25.5 |
| 3 | `c0056fc7` | 2.时间 位移 | OK | 2 | 0.90 | 29.6 |
| 4 | `5ca89ff3` | 3.位置变化快慢的描述——速度 | OK | 1 | 0.90 | 24.8 |
| 5 | `79966a7c` | 4.速度变化快慢的描述——加速度 | OK | 1 | 0.92 | 19.1 |
| 6 | `f3c0b769` | 1.实验：探究小车速度随时间变化的规律 | OK | 1 | 0.35 | 43.9 |
| 7 | `ff783133` | 2.匀变速直线运动的速度与时间的关系 | OK | 1 | 0.95 | 32.9 |
| 8 | `4859e5ad` | 3.匀变速直线运动的位移与时间的关系 | OK | 1 | 0.95 | 38.4 |
| 9 | `5f07e265` | 4.自由落体运动 | OK | 1 | 0.92 | 40.9 |
| 10 | `a4973833` | 1.重力与弹力 | OK | 2 | 0.92 | 29.1 |
| 11 | `8992ada9` | 2.摩擦力 | OK | 1 | 0.90 | 38.2 |
| 12 | `10c06505` | 3.牛顿第三定律 | OK | 1 | 0.95 | 23.9 |
| 13 | `e9c61aab` | 4.力的合成和分解 | OK | 2 | 0.85 | 27.7 |
| 14 | `340a5325` | 5.共点力的平衡 | OK | 1 | 0.95 | 50.6 |
| 15 | `8c4ed767` | 1.牛顿第一定律 | OK | 1 | 0.95 | 23.5 |
| 16 | `d984cca7` | 2.实验：探究加速度与力、质量的关系 | OK | 2 | 0.85 | 75.1 |
| 17 | `3e01b2f7` | 3.牛顿第二定律 | OK | 1 | 0.95 | 25.5 |
| 18 | `204e7962` | 4.力学单位制 | OK | 1 | 0.92 | 37.2 |
| 19 | `9266dc39` | 5.牛顿运动定律的应用 | OK | 1 | 0.85 | 37.4 |
| 20 | `fa9c6166` | 6.超重和失重 | OK | 1 | 0.80 | 45.1 |
| 21 | `33c76c84` | 课题研究 | OK | 0 | 0.95 | 21.8 |
| 22 | `8731fa65` | 学生实验 | FAIL | 0 | - | 19.0 |
