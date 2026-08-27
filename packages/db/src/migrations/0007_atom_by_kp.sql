-- 0007_atom_by_kp.sql
-- atom-KP 索引: 每个 atom 关联到哪些 KP, 为按 KP 复用历史 atom 提供查询入口.
-- 一个 atom 可对多 KP -> 多行; recordId 是表自身 PK, 不是 atomId.
-- payload_snapshot 存整个 atom JSON, 复用时直接还原, 不需要回查 courses_v2.

CREATE TABLE IF NOT EXISTS `atom_by_kp` (
  `id`               text PRIMARY KEY NOT NULL,
  `kp_id`            text NOT NULL,
  `atom_id`          text NOT NULL,
  `course_id`        text NOT NULL,
  `atom_type`        text NOT NULL,
  `age_band`         text NOT NULL,
  `subject`          text NOT NULL,
  `generated_at`     integer NOT NULL,
  `payload_snapshot` text NOT NULL,
  FOREIGN KEY (`kp_id`) REFERENCES `knowledge_points`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_atom_by_kp_kp_age`
  ON `atom_by_kp` (`kp_id`, `age_band`, `subject`, `generated_at`);
CREATE INDEX IF NOT EXISTS `idx_atom_by_kp_course`
  ON `atom_by_kp` (`course_id`);
