/**
 * Knowledge Ontology v1.1 — β 通道启动建表 helper
 *
 * 与 migrations/0006_knowledge_points.sql 内容**完全同步**（一份 DDL，两条通道）。
 * 本文件**只**提供 `ensureKnowledgePointTables(db)` 骨架，不实现任何 CRUD —
 * CRUD 留给 PR2。
 *
 * 不要让 runtime 代码自动调用 —— PR2 时再接到启动路径。
 */
import type Database from 'better-sqlite3'

export const KP_DDL = `
CREATE TABLE IF NOT EXISTS \`knowledge_point_clusters\` (
  \`id\`                    text PRIMARY KEY NOT NULL,
  \`canonical_name_en\`     text NOT NULL,
  \`subject\`               text NOT NULL,
  \`grade_band_hint\`       text,
  \`aliases\`               text NOT NULL DEFAULT '[]',
  \`cross_system_notes\`    text,
  \`common_misconceptions\` text,
  \`assessability\`         text,
  \`created_by\`            text NOT NULL DEFAULT 'auto-singleton',
  \`verified\`              integer NOT NULL DEFAULT 0,
  \`annotator_version\`     text,
  \`created_at\`            integer NOT NULL,
  \`curated_at\`            integer,
  \`updated_at\`            integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_kpc_canon_subject\`
  ON \`knowledge_point_clusters\` (\`canonical_name_en\`, \`subject\`);
CREATE INDEX IF NOT EXISTS \`idx_kpc_subject\`
  ON \`knowledge_point_clusters\` (\`subject\`);
CREATE INDEX IF NOT EXISTS \`idx_kpc_updated_at\`
  ON \`knowledge_point_clusters\` (\`updated_at\`);

CREATE TABLE IF NOT EXISTS \`knowledge_points\` (
  \`id\`                  text PRIMARY KEY NOT NULL,
  \`cluster_id\`          text NOT NULL,
  \`curriculum_system\`   text NOT NULL,
  \`canonical_name\`      text NOT NULL,
  \`aliases\`             text NOT NULL DEFAULT '[]',
  \`canonical_hash\`      text NOT NULL,
  \`subject\`             text NOT NULL,
  \`grade_band\`          text NOT NULL DEFAULT '',
  \`title\`               text NOT NULL DEFAULT '',
  \`summary\`             text NOT NULL DEFAULT '',
  \`annotations\`         text NOT NULL DEFAULT '{}',
  \`confidence\`          real,
  \`verified\`            integer NOT NULL DEFAULT 0,
  \`annotator_version\`   text NOT NULL DEFAULT '',
  \`labeled_at\`          integer NOT NULL,
  \`curated_at\`          integer,
  \`updated_at\`          integer NOT NULL,
  FOREIGN KEY (\`cluster_id\`) REFERENCES \`knowledge_point_clusters\`(\`id\`) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_kp_canonical_hash\`
  ON \`knowledge_points\` (\`canonical_hash\`);
CREATE INDEX IF NOT EXISTS \`idx_kp_cluster\`
  ON \`knowledge_points\` (\`cluster_id\`);
CREATE INDEX IF NOT EXISTS \`idx_kp_subject_grade\`
  ON \`knowledge_points\` (\`subject\`, \`grade_band\`);
CREATE INDEX IF NOT EXISTS \`idx_kp_curriculum\`
  ON \`knowledge_points\` (\`curriculum_system\`);

CREATE TABLE IF NOT EXISTS \`knowledge_point_sources\` (
  \`id\`                  text PRIMARY KEY NOT NULL,
  \`knowledge_point_id\`  text NOT NULL,
  \`source\`              text NOT NULL,
  \`external_id\`         text,
  \`evidence_snippet\`    text,
  \`confidence\`          real,
  \`ingested_at\`         integer NOT NULL,
  FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_points\`(\`id\`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_kps_unique\`
  ON \`knowledge_point_sources\` (\`knowledge_point_id\`, \`source\`, \`external_id\`);
CREATE INDEX IF NOT EXISTS \`idx_kps_kp\`
  ON \`knowledge_point_sources\` (\`knowledge_point_id\`);
CREATE INDEX IF NOT EXISTS \`idx_kps_source\`
  ON \`knowledge_point_sources\` (\`source\`);

CREATE TABLE IF NOT EXISTS \`chapter_node_knowledge_points\` (
  \`chapter_node_id\`     text NOT NULL,
  \`knowledge_point_id\`  text NOT NULL,
  \`position\`            integer NOT NULL DEFAULT 0,
  \`created_at\`          integer NOT NULL,
  PRIMARY KEY (\`chapter_node_id\`, \`knowledge_point_id\`),
  FOREIGN KEY (\`knowledge_point_id\`) REFERENCES \`knowledge_points\`(\`id\`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS \`idx_cnkp_kp\`
  ON \`chapter_node_knowledge_points\` (\`knowledge_point_id\`);
CREATE INDEX IF NOT EXISTS \`idx_cnkp_chapter\`
  ON \`chapter_node_knowledge_points\` (\`chapter_node_id\`);

CREATE TABLE IF NOT EXISTS \`atom_by_kp\` (
  \`id\`               text PRIMARY KEY NOT NULL,
  \`kp_id\`            text NOT NULL,
  \`atom_id\`          text NOT NULL,
  \`course_id\`        text NOT NULL,
  \`atom_type\`        text NOT NULL,
  \`age_band\`         text NOT NULL,
  \`subject\`          text NOT NULL,
  \`generated_at\`     integer NOT NULL,
  \`payload_snapshot\` text NOT NULL,
  FOREIGN KEY (\`kp_id\`) REFERENCES \`knowledge_points\`(\`id\`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS \`idx_atom_by_kp_kp_age\`
  ON \`atom_by_kp\` (\`kp_id\`, \`age_band\`, \`subject\`, \`generated_at\`);
CREATE INDEX IF NOT EXISTS \`idx_atom_by_kp_course\`
  ON \`atom_by_kp\` (\`course_id\`);

CREATE TABLE IF NOT EXISTS \`kp_relations\` (
  \`id\`              text PRIMARY KEY NOT NULL,
  \`from_kp_id\`      text NOT NULL,
  \`to_kp_id\`        text NOT NULL,
  \`relation_type\`   text NOT NULL,
  \`weight\`          real NOT NULL DEFAULT 0.5,
  \`source\`          text NOT NULL,
  \`source_evidence\` text,
  \`created_at\`      integer NOT NULL,
  FOREIGN KEY (\`from_kp_id\`) REFERENCES \`knowledge_points\`(\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`to_kp_id\`)   REFERENCES \`knowledge_points\`(\`id\`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS \`idx_kp_rel_from_type\`
  ON \`kp_relations\` (\`from_kp_id\`, \`relation_type\`);
CREATE INDEX IF NOT EXISTS \`idx_kp_rel_to_type\`
  ON \`kp_relations\` (\`to_kp_id\`, \`relation_type\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_kp_rel_unique\`
  ON \`kp_relations\` (\`from_kp_id\`, \`to_kp_id\`, \`relation_type\`, \`source\`);
`

export type BetterSqliteDb = Database.Database

/**
 * 启动建表兜底（β 通道）。幂等。
 * 不在 runtime 自动调用 —— PR2 时接入启动路径。
 */
export function ensureKnowledgePointTables(db: BetterSqliteDb): void {
  db.exec(KP_DDL)
}
