-- 备课课程与课程季文档（自 maolab-ai-learning 0005 迁入，S3 重编为 0000）。owner = 账号用户名（创作内容挂账号）。
-- payload 用 json 而不是 jsonb：保留写入时的键序与文本，迁入代码按 JSON 文本算的 hash 不受影响（2c/2e 的 jsonb 键序教训）。
-- updated_at 是 CAS 版本号：毫秒时间，同一毫秒内再写 +1，单调递增。只新建 schema 与表，不改任何存量表；
-- 加外键会对 account.users 取短时锁，lock_timeout 与 0004 一样设 5 秒（drizzle 把待跑迁移放在同一事务里执行）。
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS "course";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course"."documents" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"origin" text DEFAULT 'prep' NOT NULL,
	"payload" json NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "documents_kind_check" CHECK ("kind" IN ('course', 'season')),
	CONSTRAINT "documents_origin_check" CHECK ("origin" IN ('prep'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_documents_owner_kind_updated" ON "course"."documents" ("owner", "kind", "updated_at" DESC);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('account.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_owner' AND conrelid = to_regclass('course.documents')
  ) THEN
    ALTER TABLE "course"."documents" ADD CONSTRAINT "fk_documents_owner"
      FOREIGN KEY ("owner") REFERENCES "account"."users"("username") ON DELETE CASCADE;
  END IF;
END $$;
