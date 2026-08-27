ALTER TABLE `learner_profiles` ADD `learner_type` text DEFAULT 'individual' NOT NULL;
--> statement-breakpoint
ALTER TABLE `learner_profiles` ADD `nickname` text;
--> statement-breakpoint
ALTER TABLE `learner_profiles` ADD `age` integer;
--> statement-breakpoint
ALTER TABLE `learner_profiles` ADD `gender` text;
--> statement-breakpoint
ALTER TABLE `learner_profiles` ADD `grade_level` text;
--> statement-breakpoint
ALTER TABLE `teaching_plans` ADD `grade_level` text;
