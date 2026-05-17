-- EN: WordPress 0.71 schema + deterministic fixtures for the 071-cli Behat
--     suite. The DDL mirrors src/wp-admin/wp-install.php (the b2comments table,
--     which wp-install.php no longer creates after Issue #44, is recreated here
--     because the `comment` command group still operates on it where present).
--     Every table is dropped and recreated, then seeded with a fixed, minimal
--     data set. The FeatureContext runs this file before each scenario so every
--     scenario starts from an identical, known database state.
-- JA: 071-cli の Behat スイート向けの WordPress 0.71 スキーマと決定的な
--     フィクスチャ。DDL は src/wp-admin/wp-install.php に倣う(Issue #44 以降
--     wp-install.php が作成しなくなった b2comments テーブルは、`comment`
--     コマンドグループが存在時にそれを操作するため、ここで再作成する)。
--     各テーブルをドロップして再作成し、固定の最小データセットを投入する。
--     FeatureContext は各シナリオの前にこのファイルを実行するため、すべての
--     シナリオは同一の既知のデータベース状態から開始する。

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS b2posts;
DROP TABLE IF EXISTS b2categories;
DROP TABLE IF EXISTS b2settings;
DROP TABLE IF EXISTS b2users;
DROP TABLE IF EXISTS b2comments;
DROP TABLE IF EXISTS b2links;
DROP TABLE IF EXISTS b2linkcategories;

-- EN: b2posts -- blog posts. DDL from wp-install.php step 2.
-- JA: b2posts -- ブログ投稿。DDL は wp-install.php のステップ 2 より。
CREATE TABLE b2posts (
  ID int(10) unsigned NOT NULL auto_increment,
  post_author int(4) NOT NULL default '0',
  post_date datetime NOT NULL default '0000-00-00 00:00:00',
  post_content text NOT NULL,
  post_title text NOT NULL,
  post_category int(4) NOT NULL default '0',
  post_excerpt text NOT NULL,
  post_status enum('publish','draft','private') NOT NULL default 'publish',
  comment_status enum('open','closed') NOT NULL default 'open',
  ping_status enum('open','closed') NOT NULL default 'open',
  post_password varchar(20) NOT NULL default '',
  PRIMARY KEY  (ID),
  KEY post_status (post_status)
);

-- EN: b2categories -- the single flat post category list.
-- JA: b2categories -- 単一のフラットな投稿カテゴリー一覧。
CREATE TABLE b2categories (
  cat_ID int(4) NOT NULL auto_increment,
  cat_name varchar(55) NOT NULL default '',
  PRIMARY KEY  (cat_ID)
);

-- EN: b2settings -- the single settings row (ID = 1).
-- JA: b2settings -- 単一の設定行(ID = 1)。
CREATE TABLE b2settings (
  ID tinyint(3) NOT NULL default '1',
  posts_per_page int(4) unsigned NOT NULL default '7',
  what_to_show varchar(5) NOT NULL default 'days',
  archive_mode varchar(10) NOT NULL default 'weekly',
  time_difference tinyint(4) NOT NULL default '0',
  AutoBR tinyint(1) NOT NULL default '1',
  time_format varchar(20) NOT NULL default 'H:i:s',
  date_format varchar(20) NOT NULL default 'd.m.y',
  PRIMARY KEY  (ID)
);

-- EN: b2users -- blog users.
-- JA: b2users -- ブログのユーザー。
CREATE TABLE b2users (
  ID int(10) unsigned NOT NULL auto_increment,
  user_login varchar(20) NOT NULL default '',
  user_pass varchar(255) NOT NULL default '',
  user_firstname varchar(50) NOT NULL default '',
  user_lastname varchar(50) NOT NULL default '',
  user_nickname varchar(50) NOT NULL default '',
  user_icq int(10) unsigned NOT NULL default '0',
  user_email varchar(100) NOT NULL default '',
  user_url varchar(100) NOT NULL default '',
  user_ip varchar(15) NOT NULL default '',
  user_domain varchar(200) NOT NULL default '',
  user_browser varchar(200) NOT NULL default '',
  dateYMDhour datetime NOT NULL default '0000-00-00 00:00:00',
  user_level int(2) unsigned NOT NULL default '0',
  user_aim varchar(50) NOT NULL default '',
  user_msn varchar(100) NOT NULL default '',
  user_yim varchar(50) NOT NULL default '',
  user_idmode varchar(20) NOT NULL default '',
  PRIMARY KEY  (ID),
  UNIQUE KEY (user_login)
);

-- EN: b2comments -- post comments. wp-install.php no longer creates this
--     (Issue #44), but the `comment` command group reads it where present, so
--     the test fixture provides it. DDL from the original b2/cafelog schema.
-- JA: b2comments -- 投稿へのコメント。wp-install.php はこれを作成しなくなった
--     (Issue #44)が、`comment` コマンドグループは存在時にこれを読むため、
--     テストフィクスチャで用意する。DDL はオリジナルの b2/cafelog スキーマより。
CREATE TABLE b2comments (
  comment_ID int(11) unsigned NOT NULL auto_increment,
  comment_post_ID int(11) NOT NULL default '0',
  comment_author tinytext NOT NULL,
  comment_author_email varchar(100) NOT NULL default '',
  comment_author_url varchar(200) NOT NULL default '',
  comment_author_IP varchar(100) NOT NULL default '',
  comment_date datetime NOT NULL default '0000-00-00 00:00:00',
  comment_content text NOT NULL,
  comment_karma int(11) NOT NULL default '0',
  user_id int(11) NOT NULL default '0',
  PRIMARY KEY  (comment_ID)
);

-- EN: b2links / b2linkcategories -- the blogroll. DDL from wp-install.php
--     step 1.
-- JA: b2links / b2linkcategories -- ブログロール。DDL は wp-install.php の
--     ステップ 1 より。
CREATE TABLE b2linkcategories (
  cat_id int(11) NOT NULL auto_increment,
  cat_name tinytext NOT NULL,
  auto_toggle enum('Y','N') NOT NULL default 'N',
  PRIMARY KEY  (cat_id)
);

CREATE TABLE b2links (
  link_id int(11) NOT NULL auto_increment,
  link_url varchar(255) NOT NULL default '',
  link_name varchar(255) NOT NULL default '',
  link_image varchar(255) NOT NULL default '',
  link_target varchar(25) NOT NULL default '',
  link_category int(11) NOT NULL default 0,
  link_description varchar(255) NOT NULL default '',
  link_visible enum('Y','N') NOT NULL default 'Y',
  link_owner int NOT NULL DEFAULT '1',
  link_rating int NOT NULL DEFAULT '0',
  link_updated DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
  link_rel varchar(255) NOT NULL default '',
  PRIMARY KEY (link_id)
);

SET FOREIGN_KEY_CHECKS = 1;

-- EN: Fixtures -- a fixed, minimal data set. IDs are deterministic so the
--     feature scenarios can assert against known values.
-- JA: フィクスチャ -- 固定の最小データセット。id は決定的であり、feature の
--     シナリオは既知の値に対してアサートできる。

-- EN: Categories: General (1) and News (2).
-- JA: カテゴリー: General (1)、News (2)。
INSERT INTO b2categories (cat_ID, cat_name) VALUES
  (1, 'General'),
  (2, 'News');

-- EN: Users: admin (1) and editor (2).
-- JA: ユーザー: admin (1)、editor (2)。
INSERT INTO b2users (ID, user_login, user_pass, user_nickname, user_email, user_level, dateYMDhour, user_idmode) VALUES
  (1, 'admin', 'adminpass', 'Administrator', 'admin@example.com', 10, '2003-05-27 12:00:00', 'nickname'),
  (2, 'editor', 'editorpass', 'Editor', 'editor@example.com', 5, '2003-05-28 09:30:00', 'nickname');

-- EN: Posts: a published "Hello world!" post (1) and a draft (2).
-- JA: 投稿: 公開された "Hello world!" の投稿 (1) と下書き (2)。
INSERT INTO b2posts (ID, post_author, post_date, post_content, post_title, post_category, post_excerpt, post_status) VALUES
  (1, 1, '2003-05-27 12:34:56', 'Welcome to WordPress. This is the first post.', 'Hello world!', 1, '', 'publish'),
  (2, 2, '2003-05-28 10:00:00', 'A second post, still being written.', 'Second Post', 2, '', 'draft');

-- EN: Settings: the single b2settings row.
-- JA: 設定: 単一の b2settings 行。
INSERT INTO b2settings (ID, posts_per_page, what_to_show, archive_mode, time_difference, AutoBR, time_format, date_format) VALUES
  (1, 7, 'posts', 'monthly', 0, 1, 'g:i a', 'n/j/Y');

-- EN: Comments: one comment on the first post.
-- JA: コメント: 最初の投稿への 1 件のコメント。
INSERT INTO b2comments (comment_ID, comment_post_ID, comment_author, comment_author_email, comment_date, comment_content) VALUES
  (1, 1, 'A Visitor', 'visitor@example.com', '2003-05-27 14:00:00', 'Nice first post!');

-- EN: Link categories and links.
-- JA: リンクカテゴリーとリンク。
INSERT INTO b2linkcategories (cat_id, cat_name) VALUES
  (1, 'General');

INSERT INTO b2links (link_id, link_url, link_name, link_category, link_updated) VALUES
  (1, 'http://wordpress.org', 'WordPress', 1, '2003-05-27 12:00:00'),
  (2, 'http://cafelog.com', 'b2', 1, '2003-05-27 12:00:00');
