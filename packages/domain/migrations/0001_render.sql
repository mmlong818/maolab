-- 自 maolab-ai-learning 0006 迁入（S3 重编为 0001）。产物存储与渲染任务队列（spec 4.1 render-worker、4.2"api 到 render-worker 经队列"）。
-- 用户裁决 D4 缺省：SDP 对象存储确认前，产物字节存在 course.artifacts.content（bytea，storage = 'pg'）；换对象存储时只换端口实现，
-- 元数据不变（storage = 'object'、content 为空）。产物 id 由 owner、kind 与内容 sha256 决定：同一 owner 的同一内容只存一份，重试不重复写。
-- 渲染任务由 workers/render 用 FOR UPDATE SKIP LOCKED 领取；租约过期可被别的 worker 回收；完成与失败按 (lease_holder, attempts) 栅栏写入。
-- 只新建表，不改任何存量表；外键对 account.users 与 course.documents 取短时锁，lock_timeout 与 0004、0005 一样 5 秒。
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS "course"."artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"sha256" text NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage" text DEFAULT 'pg' NOT NULL,
	"content" bytea,
	"course_id" text,
	"created_at" bigint NOT NULL,
	"expires_at" bigint,
	CONSTRAINT "artifacts_kind_check" CHECK ("kind" IN ('image', 'evidence', 'export')),
	CONSTRAINT "artifacts_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "artifacts_storage_check" CHECK (("storage" = 'pg' AND "content" IS NOT NULL AND octet_length("content") = "byte_size") OR ("storage" = 'object' AND "content" IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_artifacts_owner_course" ON "course"."artifacts" ("owner", "course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_artifacts_expires" ON "course"."artifacts" ("expires_at") WHERE "expires_at" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course"."render_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"course_id" text NOT NULL,
	"kind" text NOT NULL,
	"request_key" text NOT NULL,
	"payload" json NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" bigint NOT NULL,
	"lease_holder" text,
	"lease_expires_at" bigint,
	"result" json,
	"error" json,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"finished_at" bigint,
	CONSTRAINT "render_jobs_kind_check" CHECK ("kind" IN ('render-page', 'export-pptx')),
	CONSTRAINT "render_jobs_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "render_jobs_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_render_jobs_owner_request" ON "course"."render_jobs" ("owner", "request_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_render_jobs_claim" ON "course"."render_jobs" ("status", "available_at") WHERE "status" IN ('queued', 'running');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_render_jobs_owner_course" ON "course"."render_jobs" ("owner", "course_id", "created_at" DESC);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_render_jobs_course' AND conrelid = to_regclass('course.render_jobs')) THEN
    ALTER TABLE "course"."render_jobs" ADD CONSTRAINT "fk_render_jobs_course"
      FOREIGN KEY ("course_id") REFERENCES "course"."documents"("id") ON DELETE CASCADE;
  END IF;
  IF to_regclass('account.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_artifacts_owner' AND conrelid = to_regclass('course.artifacts')) THEN
      ALTER TABLE "course"."artifacts" ADD CONSTRAINT "fk_artifacts_owner"
        FOREIGN KEY ("owner") REFERENCES "account"."users"("username") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_render_jobs_owner' AND conrelid = to_regclass('course.render_jobs')) THEN
      ALTER TABLE "course"."render_jobs" ADD CONSTRAINT "fk_render_jobs_owner"
        FOREIGN KEY ("owner") REFERENCES "account"."users"("username") ON DELETE CASCADE;
    END IF;
  END IF;
END $$;
