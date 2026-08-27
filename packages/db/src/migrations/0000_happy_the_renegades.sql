CREATE TABLE `adaptive_states` (
	`id` text PRIMARY KEY NOT NULL,
	`weak_concepts` text DEFAULT '[]' NOT NULL,
	`recommended_next` text DEFAULT '[]' NOT NULL,
	`last_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `concept_mastery` (
	`concept_id` text PRIMARY KEY NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`last_reviewed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `course_history` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`stage_id` text NOT NULL,
	`completion_rate` real DEFAULT 0 NOT NULL,
	`last_accessed_at` integer,
	`total_duration` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'generating' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learner_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`preferred_language` text DEFAULT 'zh-CN' NOT NULL,
	`preferred_style` text DEFAULT 'lecture' NOT NULL,
	`preferred_difficulty` text DEFAULT 'intermediate' NOT NULL,
	`preferred_agent_count` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stages` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'generating' NOT NULL,
	`scenes` text DEFAULT '[]' NOT NULL,
	`agents` text DEFAULT '[]' NOT NULL,
	`generated_at` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `teaching_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`teaching_method` text NOT NULL,
	`style` text NOT NULL,
	`language` text NOT NULL,
	`difficulty` text NOT NULL,
	`outline` text NOT NULL,
	`agents` text NOT NULL,
	`emphasized_concepts` text DEFAULT '[]' NOT NULL,
	`source_documents` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
