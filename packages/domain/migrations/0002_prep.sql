-- 自 maolab-ai-learning 0007 迁入（S3 重编为 0002）。备课对话（spec 7.1 api 管归属、幂等与记账；8.2 备课排队）。owner = 账号用户名（不是学习者档案 id）。
-- prep_runs.id 就是交给 harness 的 messageId（UUID）；同一会话内 request_id 唯一。claim 是领取版本：每次（重新）领取加一，完成与失败只在版本一致时生效（过期的旧 worker 不能覆盖新领取者）。回复（PrepReply）存在 reply 列，学生原话存 content。
-- 只新建表，不改任何存量表；外键对 account.users 取短时锁，lock_timeout 与 0004–0006 一样 5 秒。
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS "course"."prep_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"title" text NOT NULL,
	"course_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_prep_sessions_owner_updated" ON "course"."prep_sessions" ("owner", "updated_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course"."prep_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"request_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"reply" json,
	"error_code" text,
	"claim" integer DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "prep_runs_status_check" CHECK ("status" IN ('running', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_prep_runs_session_request" ON "course"."prep_runs" ("session_id", "request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_prep_runs_session_created" ON "course"."prep_runs" ("session_id", "created_at");
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('account.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_prep_sessions_owner' AND conrelid = to_regclass('course.prep_sessions')) THEN
      ALTER TABLE "course"."prep_sessions" ADD CONSTRAINT "fk_prep_sessions_owner"
        FOREIGN KEY ("owner") REFERENCES "account"."users"("username") ON DELETE CASCADE;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_prep_runs_session' AND conrelid = to_regclass('course.prep_runs')) THEN
    ALTER TABLE "course"."prep_runs" ADD CONSTRAINT "fk_prep_runs_session"
      FOREIGN KEY ("session_id") REFERENCES "course"."prep_sessions"("id") ON DELETE CASCADE;
  END IF;
END $$;
