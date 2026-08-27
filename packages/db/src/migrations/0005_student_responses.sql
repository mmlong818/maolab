-- P0-2: 学情数据 — 学生作答记录

CREATE TABLE IF NOT EXISTS `student_responses` (
  `id` text PRIMARY KEY NOT NULL,
  `course_id` text NOT NULL,
  `atom_id` text NOT NULL,
  `student_id` text NOT NULL DEFAULT 'self',
  `objective_ids` text NOT NULL DEFAULT '[]',
  `atom_type` text NOT NULL,
  `response` text NOT NULL,
  `correct` integer,
  `time_spent_ms` integer,
  `difficulty_level` text NOT NULL DEFAULT 'standard',
  `submitted_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_sr_course` ON `student_responses` (`course_id`);
CREATE INDEX IF NOT EXISTS `idx_sr_course_atom` ON `student_responses` (`course_id`, `atom_id`);
CREATE INDEX IF NOT EXISTS `idx_sr_student` ON `student_responses` (`student_id`);
CREATE INDEX IF NOT EXISTS `idx_sr_submitted` ON `student_responses` (`submitted_at`);
