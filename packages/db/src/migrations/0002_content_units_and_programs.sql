CREATE TABLE `content_units` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `subkind` text NOT NULL,
  `title` text NOT NULL,
  `content` text NOT NULL,
  `concepts` text DEFAULT '[]' NOT NULL,
  `subject` text DEFAULT '' NOT NULL,
  `grade_level` text,
  `difficulty` text DEFAULT 'medium' NOT NULL,
  `duration_hint` integer DEFAULT 120 NOT NULL,
  `language` text DEFAULT 'zh-CN' NOT NULL,
  `tags` text DEFAULT '[]' NOT NULL,
  `embedding` text,
  `origin` text DEFAULT 'generated' NOT NULL,
  `source_plan_id` text,
  `created_at` integer NOT NULL,
  `usage_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_units_kind_idx` ON `content_units` (`kind`);
--> statement-breakpoint
CREATE INDEX `content_units_subkind_idx` ON `content_units` (`subkind`);
--> statement-breakpoint
CREATE INDEX `content_units_subject_idx` ON `content_units` (`subject`);
--> statement-breakpoint
CREATE INDEX `content_units_grade_idx` ON `content_units` (`grade_level`);
--> statement-breakpoint
CREATE INDEX `content_units_lang_idx` ON `content_units` (`language`);
--> statement-breakpoint
CREATE TABLE `programs` (
  `id` text PRIMARY KEY NOT NULL,
  `plan_id` text NOT NULL,
  `status` text DEFAULT 'generating' NOT NULL,
  `ordered` text DEFAULT '[]' NOT NULL,
  `agents` text DEFAULT '[]' NOT NULL,
  `generated_at` integer,
  `error_message` text
);
--> statement-breakpoint
CREATE INDEX `programs_plan_idx` ON `programs` (`plan_id`);
