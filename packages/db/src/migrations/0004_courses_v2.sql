-- Sprint 0: v2 课程聚合表
-- 与旧 teaching_plans + stages 并存。dual-read 由 MAOLAB_V2 env 开关控制。

CREATE TABLE IF NOT EXISTS `courses_v2` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `origin` text NOT NULL,
  `status` text NOT NULL,
  `data` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_courses_v2_status` ON `courses_v2` (`status`);
CREATE INDEX IF NOT EXISTS `idx_courses_v2_updated_at` ON `courses_v2` (`updated_at`);
