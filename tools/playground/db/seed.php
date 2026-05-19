<?php
// ==================================================================
//  071-now database seed (Issue #108 feasibility spike; Issue #126).
//
//  Builds the WordPress 0.71 schema in a SQLite database and inserts a
//  small demo blog -- the admin user, a handful of published posts
//  across a couple of categories, the b2settings row -- so a fresh
//  playground opens on a presentable WordPress 0.71 blog rather than a
//  single placeholder post (Issue #126).
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

// Reuse the SQL translator so seed-time DDL goes through exactly
//     the same MySQL -> SQLite path as the live blog's runtime queries.
require_once __DIR__ . '/071-now-sql-translator.php';

// Start from an empty file. The boot shim only requires this seed
//     when no database exists at WP071_DB_PATH, so reaching here means a
//     first visit or a post-reset boot; any stale file (a leftover
//     journal) is removed so the schema is built cleanly.
if ( file_exists( WP071_DB_PATH ) ) {
	@unlink( WP071_DB_PATH );
}

$pdo = new PDO( 'sqlite:' . WP071_DB_PATH );
$pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );

// Table names from src/b2config.php.
$tableposts      = 'b2posts';
$tableusers      = 'b2users';
$tablesettings   = 'b2settings';
$tablecategories = 'b2categories';
$tablelinks      = 'b2links';

// WordPress 0.71 schema DDL, verbatim from wp-admin/wp-install.php,
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

// The demo blog's categories. WordPress 0.71 stores a post's
//     category as an integer in b2posts.post_category, and the front
//     page renders each post's category name and a sidebar category
//     list -- so a few categories show 0.71's real category rendering.
//     cat_ID 1 stays 'General' (the 0.71 default) so any post created
//     later through the admin still has a category to land in.
$categories = array(
	1 => 'General',
	2 => 'Announcements',
	3 => 'Notes from 2003',
);
$catStmt = $pdo->prepare(
	"INSERT INTO $tablecategories (cat_ID, cat_name) VALUES (:id, :name)"
);
foreach ( $categories as $catId => $catName ) {
	$catStmt->execute( array( ':id' => $catId, ':name' => $catName ) );
}
$catStmt = null;

// The b2settings row. what_to_show = 'posts' keeps the front page
//     on the simple "latest N posts" path (blog.header.php), avoiding
//     the date-window path. archive_mode = 'postbypost' makes
//     permalink_link() emit the single-post URL index.php?p=<id> rather
//     than the ?m=YYYYMM#<id> month-archive anchor 0.71 defaults to
//     (Issue #212); it stays a b2settings value, so the admin Options
//     page or a blueprint setOption step can still override it.
//     date_format / time_format are 0.71 defaults.
$pdo->exec(
	"INSERT INTO $tablesettings
	  (ID, posts_per_page, what_to_show, archive_mode, time_difference, AutoBR, time_format, date_format)
	  VALUES (1, 20, 'posts', 'postbypost', 0, 1, 'g:i a', 'n/j/Y')"
);

// The admin user (post_author 1 references this row).
$pdo->exec(
	"INSERT INTO $tableusers
	  (ID, user_login, user_pass, user_nickname, user_email, user_level, user_idmode, dateYMDhour, user_ip, user_domain)
	  VALUES (1, 'admin', '" . md5( 'spike' ) . "', 'admin', 'you@example.com', 10, 'nickname', '2003-05-27 00:00:01', '127.0.0.1', '127.0.0.1')"
);

// The demo blog's posts. A fresh playground shows a small,
//     meaningful WordPress 0.71 blog -- several published posts across
//     the categories above -- so a visitor sees 0.71's real post,
//     category and author rendering rather than a single placeholder
//     (Issue #126).
//
//     The front page lists posts newest-first and groups them under a
//     date heading, so each post is given a distinct post_date a day
//     apart. The newest post keeps the title and body the headless
//     verifier and the spike's success criterion expect ('Hello world
//     from 071-now' / 'in-browser SQLite database'), and is in the
//     General category (cat_ID 1) so the verifier's front-page-to-post
//     -to-category click-through stays on known content.
//
//     post_date is built backwards from one hour before "now": the
//     newest post is an hour old and each later one is a day older.
//     WordPress 0.71's front page only lists posts whose post_date is at
//     or before the current time (blog.header.php: post_date <= now), so
//     dating the newest post slightly in the past keeps it on the front
//     page whatever the hour the playground is opened, while still
//     reading as a few days of recent posts.
$baseTime = time() - 3600;
$posts    = array(
	array(
		'title'    => 'Hello world from 071-now',
		'category' => 1,
		'content'  => "Hello from 071-now! This WordPress 0.71 front page is being "
			. "rendered by PHP compiled to WebAssembly, reading this post from "
			. "an in-browser SQLite database. No MySQL server is involved -- "
			. "the whole blog runs inside your browser tab.\n\n"
			. "Everything below is a live WordPress 0.71 install from 2003. "
			. "Click a post title to open it, or a category to filter the "
			. "front page. The admin is one URL away at wp-admin/.",
	),
	array(
		'title'    => 'A quick tour of the playground',
		'category' => 2,
		'content'  => "This is the 071-now playground -- WordPress 0.71 served "
			. "entirely in the browser, the way wp-now and WordPress "
			. "Playground serve modern WordPress.\n\n"
			. "The toolbar above the blog has a Reset button: it clears the "
			. "in-browser database and uploaded images and returns the blog "
			. "to this fresh seeded state. Posts and images you create "
			. "through the admin are saved in the browser and survive a "
			. "reload until you reset.",
	),
	array(
		'title'    => 'Writing posts in the classic admin',
		'category' => 2,
		'content'  => "WordPress 0.71's admin lives under wp-admin/. The "
			. "playground opens it already logged in, so you can write a "
			. "post, edit one, or add a category straight away.\n\n"
			. "The post editor here is the 2003-era b2/cafelog interface "
			. "WordPress grew out of -- a plain title field, a textarea for "
			. "the body, and a category dropdown. No blocks, no widgets, no "
			. "JavaScript editor.",
	),
	array(
		'title'    => 'How the database works without MySQL',
		'category' => 3,
		'content'  => "WordPress 0.71 was written for MySQL, and there is no "
			. "MySQL server in a browser. 071-now keeps the blog's data in "
			. "an in-browser SQLite database instead.\n\n"
			. "A small MySQL-to-SQLite translation layer rewrites 0.71's "
			. "queries on the way through, and a SQLite-backed wpdb keeps "
			. "the exact public surface 0.71 expects -- so the 2003 code "
			. "runs unchanged against a database it was never written for.",
	),
	array(
		'title'    => 'WordPress 0.71, twenty years on',
		'category' => 3,
		'content'  => "WordPress 0.71 shipped in 2003. It is tiny by modern "
			. "standards -- a handful of PHP files, five database tables, "
			. "and no plugins, themes or REST API.\n\n"
			. "Seeing it run in a browser tab, on PHP 8.3 compiled to "
			. "WebAssembly, is a small reminder of how far the project has "
			. "come -- and of how much of WordPress was already recognisable "
			. "at version 0.71.",
	),
);

$postStmt = $pdo->prepare(
	"INSERT INTO $tableposts
	  (ID, post_author, post_date, post_content, post_title, post_category, post_excerpt, post_status, comment_status, ping_status, post_password)
	  VALUES (:id, 1, :d, :c, :t, :cat, '', 'publish', 'open', 'open', '')"
);
foreach ( $posts as $index => $post ) {
	// The newest post (index 0) is an hour old; each later entry is
	//     a further day older, so the front page lists them newest-first.
	$postDate = gmdate( 'Y-m-d H:i:s', $baseTime - ( $index * 86400 ) );
	$postStmt->execute(
		array(
			':id'  => count( $posts ) - $index,
			':d'   => $postDate,
			':c'   => $post['content'],
			':t'   => $post['title'],
			':cat' => $post['category'],
		)
	);
}
$postStmt = null;

// A demo link for the front page's Links sidebar. WordPress 0.71's
//     index.php renders a "Links:" sidebar with get_links(), and that
//     query selects DATE_FORMAT(link_updated, '%d/%m/%Y %h:%i') -- so a
//     seeded link both gives the sidebar visible content and exercises
//     the translator's DATE_FORMAT -> strftime() rewrite at render time.
//     link_updated is dated a few days back so the formatted timestamp is
//     a real date, not the 0000-00-00 default.
$pdo->exec(
	"INSERT INTO $tablelinks
	  (link_id, link_url, link_name, link_image, link_target, link_category, link_description, link_visible, link_owner, link_rating, link_updated, link_rel)
	  VALUES (1, 'https://wordpress.org/', 'WordPress', '', '', 0, 'The project WordPress 0.71 grew into.', 'Y', 1, 0, '"
	. gmdate( 'Y-m-d H:i:s', $baseTime - ( 3 * 86400 ) )
	. "', '')"
);

// Close the seed's SQLite connection. The blog's own wpdb opens its
//     own connection moments later (b2config.php). A lingering write
//     connection here would hold a lock and make the admin's first
//     INSERT fail with "database is locked"; dropping the prepared
//     statements above and the handle here releases the file before
//     wpdb takes over.
$pdo = null;

// No output here -- this file runs as an auto_prepend before the
//     blog's own output. The seed result is visible in the rendered
//     front page (the demo posts appear) and in WP071_DB_PATH on disk.
