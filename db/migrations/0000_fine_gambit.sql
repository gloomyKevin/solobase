CREATE TABLE `content_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text NOT NULL,
	`body` text NOT NULL,
	`author_name` text NOT NULL,
	`author_id` text,
	`author_bio` text,
	`likes_count` integer DEFAULT 0,
	`comments_count` integer DEFAULT 0,
	`shares_count` integer DEFAULT 0,
	`top_comments` text,
	`media_raw` text,
	`external_links` text,
	`published_at` integer,
	`crawled_at` integer NOT NULL,
	`source_extra` text,
	`content_type` text,
	`confidence` real,
	`is_indie_maker` integer,
	`inferred_product_name` text,
	`inferred_product_url` text,
	`inferred_product_one_liner` text,
	`inferred_product_stage` text,
	`inferred_maker_name` text,
	`key_metrics` text,
	`topics` text,
	`content_depth` text,
	`has_personal_story` integer,
	`has_specific_numbers` integer,
	`has_genuine_insight` integer,
	`editorial_rec` text,
	`rec_reason` text,
	`editorial_summary` text,
	`collection_angle` text,
	`concerns` text,
	`media` text,
	`media_source` text,
	`current_inference_run_id` text,
	`llm_processed_at` integer,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`publish_status` text DEFAULT 'unpublished' NOT NULL,
	`entity_status` text DEFAULT 'active' NOT NULL,
	`trust_level` text DEFAULT 'scraped' NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	`published_at_editorial` integer,
	`editor_notes` text,
	`editor_tags` text,
	`override_reason` text,
	`archive_reason` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ci_source` ON `content_items` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_ci_review` ON `content_items` (`review_status`);--> statement-breakpoint
CREATE INDEX `idx_ci_publish` ON `content_items` (`publish_status`);--> statement-breakpoint
CREATE INDEX `idx_ci_llm` ON `content_items` (`llm_processed_at`);--> statement-breakpoint
CREATE INDEX `idx_ci_pub_at` ON `content_items` (`published_at`);--> statement-breakpoint
CREATE TABLE `content_maker_links` (
	`content_item_id` text NOT NULL,
	`maker_id` text NOT NULL,
	`link_type` text NOT NULL,
	`is_primary` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`maker_id`) REFERENCES `makers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_cm` ON `content_maker_links` (`content_item_id`,`maker_id`);--> statement-breakpoint
CREATE TABLE `content_project_links` (
	`content_item_id` text NOT NULL,
	`project_id` text NOT NULL,
	`link_type` text NOT NULL,
	`confidence` real,
	`is_primary` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_cp` ON `content_project_links` (`content_item_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `dedup_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`item_a_id` text NOT NULL,
	`item_b_id` text NOT NULL,
	`detection_method` text NOT NULL,
	`similarity` real,
	`suggested_action` text,
	`llm_reasoning` text,
	`status` text DEFAULT 'pending',
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_dd_pair` ON `dedup_candidates` (`item_a_id`,`item_b_id`);--> statement-breakpoint
CREATE TABLE `editorial_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`prev_state` text,
	`new_state` text,
	`actor` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `embeddings` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`embedding` blob NOT NULL,
	`model` text NOT NULL,
	`input_text` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_emb` ON `embeddings` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `inference_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`content_item_id` text NOT NULL,
	`prompt_version` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`raw_output` text,
	`parsed_ok` integer NOT NULL,
	`parse_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ir_item` ON `inference_runs` (`content_item_id`);--> statement-breakpoint
CREATE TABLE `maker_auth` (
	`id` text PRIMARY KEY NOT NULL,
	`maker_id` text NOT NULL,
	`email` text NOT NULL,
	`magic_link_token` text,
	`magic_link_expiry` integer,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`maker_id`) REFERENCES `makers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maker_auth_email_unique` ON `maker_auth` (`email`);--> statement-breakpoint
CREATE TABLE `makers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`bio` text,
	`avatar` text,
	`jike_handle` text,
	`twitter_handle` text,
	`github_handle` text,
	`wechat_verified` integer DEFAULT false,
	`website` text,
	`verified` integer DEFAULT false,
	`claimed` integer DEFAULT false,
	`entity_status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `makers_slug_unique` ON `makers` (`slug`);--> statement-breakpoint
CREATE TABLE `media_cache` (
	`url` text PRIMARY KEY NOT NULL,
	`og_image` text,
	`og_title` text,
	`og_description` text,
	`fetched_at` integer NOT NULL,
	`valid` integer NOT NULL,
	`error_reason` text
);
--> statement-breakpoint
CREATE TABLE `product_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`maker_id` text,
	`update_type` text NOT NULL,
	`body` text NOT NULL,
	`metrics` text,
	`publish_status` text DEFAULT 'published' NOT NULL,
	`published_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`maker_id`) REFERENCES `makers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_maker_links` (
	`project_id` text NOT NULL,
	`maker_id` text NOT NULL,
	`role` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`maker_id`) REFERENCES `makers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_pm` ON `project_maker_links` (`project_id`,`maker_id`);--> statement-breakpoint
CREATE TABLE `project_sources` (
	`project_id` text NOT NULL,
	`content_item_id` text NOT NULL,
	`source_type` text NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pk_ps` ON `project_sources` (`project_id`,`content_item_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tagline` text,
	`description` text,
	`url` text NOT NULL,
	`url_normalized` text,
	`screenshot` text,
	`stage` text,
	`topics` text,
	`trust_level` text DEFAULT 'scraped' NOT NULL,
	`entity_status` text DEFAULT 'active' NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`publish_status` text DEFAULT 'unpublished' NOT NULL,
	`published_at_editorial` integer,
	`is_editors_pick` integer DEFAULT false,
	`featured_insight` text,
	`vibes` text,
	`editor_notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_proj_url` ON `projects` (`url`);--> statement-breakpoint
CREATE INDEX `idx_proj_url_norm` ON `projects` (`url_normalized`);--> statement-breakpoint
CREATE INDEX `idx_proj_publish` ON `projects` (`publish_status`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`claim_path` text,
	`submitter_email` text,
	`submitter_name` text,
	`maker_id` text,
	`raw_input` text,
	`ai_extracted` text,
	`maker_overrides` text,
	`target_project_id` text,
	`target_content_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`reject_reason` text,
	`claim_invite_token` text,
	`claim_invite_expiry` integer,
	`claim_verified_at` integer,
	`claim_verified_note` text,
	`verify_method` text,
	`verify_token` text,
	`verify_checked_at` integer,
	`verify_passed` integer,
	`auto_check_passed` integer,
	`auto_check_notes` text,
	`submitted_at` integer,
	`published_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`maker_id`) REFERENCES `makers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_content_id`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sub_status` ON `submissions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sub_maker` ON `submissions` (`maker_id`);--> statement-breakpoint
CREATE INDEX `idx_sub_token` ON `submissions` (`claim_invite_token`);--> statement-breakpoint
CREATE INDEX `idx_sub_verify` ON `submissions` (`verify_token`);