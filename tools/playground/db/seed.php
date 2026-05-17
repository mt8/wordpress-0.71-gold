<?php
// ==================================================================
//  071-now database seed (Issue #108 feasibility spike).
//
//  Builds the WordPress 0.71 schema in a SQLite database and inserts
//  one published post, the admin user, the General category and the
//  b2settings row, so the 0.71 front page has something to render.
//
//  The schema mirrors src/wp-admin/wp-install.php; the DDL is fed
//  through WP071_SqlTranslator so the exact MySQL DDL of 0.71 is what
//  gets translated -- this exercises the translation layer at seed
//  time, the same path the running blog would take.
//
//  This file runs inside php-wasm at boot. It expects WP071_DB_PATH to
//  be defined (the 071-now boot shim defines it) and the 071-now
//  wp-db.php translator to be loadable.
//
//  The seed is conditional (Issue #122): the boot shim requires this
//  file only when no database exists at WP071_DB_PATH. On a returning
//  visit the app has restored the persisted SQLite database to that path
//  before the request runs, so the seed is skipped and the persisted
//  content -- posts and categories created earlier through the admin --
//  is what the blog renders. The seed therefore runs on a first visit,
//  and again after a reset clears the persisted database.
// ==================================================================

if ( ! defined( 'WP071_DB_PATH' ) ) {
	define( 'WP071_DB_PATH', sys_get_temp_dir() . '/071-now.sqlite' );
}

// EN: Reuse the SQL translator so seed-time DDL goes through exactly
//     the same MySQL -> SQLite path as the live blog's runtime queries.
require_once __DIR__ . '/071-now-sql-translator.php';

// EN: Start from an empty file. The boot shim only requires this seed
//     when no database exists at WP071_DB_PATH, so reaching here means a
//     first visit or a post-reset boot; any stale file (a leftover
//     journal) is removed so the schema is built cleanly.
if ( file_exists( WP071_DB_PATH ) ) {
	@unlink( WP071_DB_PATH );
}

$pdo = new PDO( 'sqlite:' . WP071_DB_PATH );
$pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );

// EN: Table names from src/b2config.php.
$tableposts      = 'b2posts';
$tableusers      = 'b2users';
$tablesettings   = 'b2settings';
$tablecategories = 'b2categories';
$tablelinks      = 'b2links';

// EN: WordPress 0.71 schema DDL, verbatim from wp-admin/wp-install.php,
//     translated to SQLite by the 071-now translator.
$ddl = array(
	"CREATE TABLE $tableposts (
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
	)",
	"CREATE TABLE $tablecategories (
	  cat_ID int(4) NOT NULL auto_increment,
	  cat_name varchar(55) NOT NULL default '',
	  PRIMARY KEY  (cat_ID)
	)",
	"CREATE TABLE $tablesettings (
	  ID tinyint(3) NOT NULL default '1',
	  posts_per_page int(4) unsigned NOT NULL default '7',
	  what_to_show varchar(5) NOT NULL default 'days',
	  archive_mode varchar(10) NOT NULL default 'weekly',
	  time_difference tinyint(4) NOT NULL default '0',
	  AutoBR tinyint(1) NOT NULL default '1',
	  time_format varchar(20) NOT NULL default 'H:i:s',
	  date_format varchar(20) NOT NULL default 'd.m.y',
	  PRIMARY KEY  (ID)
	)",
	"CREATE TABLE $tableusers (
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
	)",
	"CREATE TABLE $tablelinks (
	  link_id int(11) NOT NULL auto_increment,
	  link_url varchar(255) NOT NULL default '',
	  link_name varchar(255) NOT NULL default '',
	  link_image varchar(255) NOT NULL default '',
	  link_target varchar(25) NOT NULL default '',
	  link_category int(11) NOT NULL default 0,
	  link_description varchar(255) NOT NULL default '',
	  link_visible enum ('Y','N') NOT NULL default 'Y',
	  link_owner int NOT NULL DEFAULT '1',
	  link_rating int NOT NULL DEFAULT '0',
	  link_updated DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00',
	  link_rel varchar(255) NOT NULL default '',
	  PRIMARY KEY (link_id)
	)",
);

foreach ( $ddl as $statement ) {
	$pdo->exec( WP071_SqlTranslator::translate( $statement ) );
}

// EN: The General category (cat_ID 1) -- 0.71 stores the post category
//     as an integer in b2posts.post_category.
$pdo->exec( "INSERT INTO $tablecategories (cat_ID, cat_name) VALUES (1, 'General')" );

// EN: The b2settings row. what_to_show = 'posts' keeps the front page
//     on the simple "latest N posts" path (blog.header.php), avoiding
//     the date-window path. date_format / time_format are 0.71 defaults.
$pdo->exec(
	"INSERT INTO $tablesettings
	  (ID, posts_per_page, what_to_show, archive_mode, time_difference, AutoBR, time_format, date_format)
	  VALUES (1, 20, 'posts', 'monthly', 0, 1, 'g:i a', 'n/j/Y')"
);

// EN: The admin user (post_author 1 references this row).
$pdo->exec(
	"INSERT INTO $tableusers
	  (ID, user_login, user_pass, user_nickname, user_email, user_level, user_idmode, dateYMDhour, user_ip, user_domain)
	  VALUES (1, 'admin', '" . md5( 'spike' ) . "', 'admin', 'you@example.com', 10, 'nickname', '2003-05-27 00:00:01', '127.0.0.1', '127.0.0.1')"
);

// EN: One seeded published post. The spike's success criterion is this
//     post's title and content appearing on the rendered front page.
$now  = gmdate( 'Y-m-d H:i:s' );
$stmt = $pdo->prepare(
	"INSERT INTO $tableposts
	  (ID, post_author, post_date, post_content, post_title, post_category, post_excerpt, post_status, comment_status, ping_status, post_password)
	  VALUES (1, 1, :d, :c, :t, 1, '', 'publish', 'open', 'open', '')"
);
$stmt->execute(
	array(
		':d' => $now,
		':c' => "Hello from 071-now! This WordPress 0.71 front page is being rendered by PHP compiled to WebAssembly, reading this post from an in-browser SQLite database. No MySQL server is involved.",
		':t' => 'Hello world from 071-now',
	)
);

// EN: Close the seed's SQLite connection. The blog's own wpdb opens its
//     own connection moments later (b2config.php). A lingering write
//     connection here would hold a lock and make the admin's first
//     INSERT fail with "database is locked"; dropping the statement and
//     the handle releases the file before wpdb takes over.
$stmt = null;
$pdo  = null;

// EN: No output here -- this file runs as an auto_prepend before the
//     blog's own output. The seed result is visible in the rendered
//     front page (the post appears) and in WP071_DB_PATH on disk.
