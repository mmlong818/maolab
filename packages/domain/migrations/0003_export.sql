-- S4：课程包导出（拆分 spec 4、6）。一个"包"对应老师的一个修订族，跨版本同一 package_id；老师撤回后同族再导出得到新包。
-- 版本只追加、不改（触发器拒绝 UPDATE）；包字节存在 course.artifacts（kind 'package'），撤回单也是产物（kind 'recall'）。
-- 渲染任务多一种 export-package。表放在 course schema（与 S3 的 render、prep 同理：单一迁移链、测试按 schema 整体替换）。
SET LOCAL lock_timeout = '5s';
ALTER TABLE "course"."render_jobs" DROP CONSTRAINT IF EXISTS "render_jobs_kind_check";
--> statement-breakpoint
ALTER TABLE "course"."render_jobs" ADD CONSTRAINT "render_jobs_kind_check" CHECK ("kind" IN ('render-page', 'export-pptx', 'export-package'));
--> statement-breakpoint
ALTER TABLE "course"."artifacts" DROP CONSTRAINT IF EXISTS "artifacts_kind_check";
--> statement-breakpoint
ALTER TABLE "course"."artifacts" ADD CONSTRAINT "artifacts_kind_check" CHECK ("kind" IN ('image', 'evidence', 'export', 'package', 'recall'));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course"."package_exports" (
	"package_id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"family_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" bigint NOT NULL,
	"recalled_at" bigint,
	"recall_reason" text,
	"recall_artifact_id" text,
	CONSTRAINT "package_exports_status_check" CHECK ("status" IN ('active', 'recalled')),
	CONSTRAINT "package_exports_id_check" CHECK ("package_id" ~ '^[A-Za-z0-9_-]{8,64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_package_exports_active_family" ON "course"."package_exports" ("owner", "family_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_package_exports_owner_created" ON "course"."package_exports" ("owner", "created_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course"."package_export_versions" (
	"package_id" text NOT NULL,
	"version" integer NOT NULL,
	"source_course_id" text NOT NULL,
	"signature" text NOT NULL,
	"artifact_id" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"page_count" integer NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "package_export_versions_pk" PRIMARY KEY ("package_id", "version"),
	CONSTRAINT "package_export_versions_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "course"."package_export_versions_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'package export versions are immutable';
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "tr_package_export_versions_immutable" ON "course"."package_export_versions";
--> statement-breakpoint
CREATE TRIGGER "tr_package_export_versions_immutable" BEFORE UPDATE ON "course"."package_export_versions"
  FOR EACH ROW EXECUTE FUNCTION "course"."package_export_versions_immutable"();
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('account.users') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_package_exports_owner' AND conrelid = to_regclass('course.package_exports')) THEN
      ALTER TABLE "course"."package_exports" ADD CONSTRAINT "fk_package_exports_owner"
        FOREIGN KEY ("owner") REFERENCES "account"."users"("username") ON DELETE CASCADE;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_package_export_versions_package' AND conrelid = to_regclass('course.package_export_versions')) THEN
    ALTER TABLE "course"."package_export_versions" ADD CONSTRAINT "fk_package_export_versions_package"
      FOREIGN KEY ("package_id") REFERENCES "course"."package_exports"("package_id") ON DELETE CASCADE;
  END IF;
END $$;
