CREATE TABLE IF NOT EXISTS `kp_relations` (
  `id` text PRIMARY KEY NOT NULL,
  `from_kp_id` text NOT NULL,
  `to_kp_id` text NOT NULL,
  `relation_type` text NOT NULL,
  `weight` real NOT NULL DEFAULT 0.5,
  `source` text NOT NULL,
  `source_evidence` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`from_kp_id`) REFERENCES `knowledge_points`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`to_kp_id`) REFERENCES `knowledge_points`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_kp_rel_from_type`
  ON `kp_relations` (`from_kp_id`, `relation_type`);

CREATE INDEX IF NOT EXISTS `idx_kp_rel_to_type`
  ON `kp_relations` (`to_kp_id`, `relation_type`);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_kp_rel_unique`
  ON `kp_relations` (`from_kp_id`, `to_kp_id`, `relation_type`, `source`);
