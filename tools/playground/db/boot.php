<?php
// ==================================================================
//  071-now boot prepend (Issue #108 feasibility spike).
//
//  Registered as php-wasm's auto_prepend_file, so it runs before every
//  request's main script (index.php and friends). It:
//
//    1. defines WP071_DB_PATH -- the SQLite file inside the php-wasm
//       virtual filesystem, read by the 071-now wp-db.php and seed;
//    2. seeds that database once per php-wasm instance, so the very
//       first front-page request already has a post to render.
//
//  Seeding is gated on the database file's existence: WordPress 0.71's
//  b2config.php has no install check, so this prepend is where the
//  in-browser blog gets its data. Subsequent requests in the same
//  php-wasm instance see the file and skip re-seeding.
// ==================================================================

if ( ! defined( 'WP071_DB_PATH' ) ) {
	// EN: A writable location in the php-wasm virtual filesystem.
	define( 'WP071_DB_PATH', '/tmp/071-now.sqlite' );
}

// EN: WordPress 0.71's b2config.php builds its include path from
//     getenv('DOCUMENT_ROOT') (line 376: $abspath = getenv('DOCUMENT_ROOT')
//     . $relpath . '/'). php-wasm does not populate DOCUMENT_ROOT in the
//     process environment, so getenv() returns false and the path
//     collapses to '//'. Derive the document root from this boot file's
//     own location -- it is overlaid at <docroot>/b2-include/071-now-boot.php
//     -- and publish it both as an env var (for getenv) and in $_SERVER.
if ( ! getenv( 'DOCUMENT_ROOT' ) ) {
	$wp071_docroot = dirname( __DIR__ );
	putenv( 'DOCUMENT_ROOT=' . $wp071_docroot );
	$_SERVER['DOCUMENT_ROOT'] = $wp071_docroot;
	unset( $wp071_docroot );
}

if ( ! file_exists( WP071_DB_PATH ) ) {
	// EN: seed.php builds the schema and inserts the seeded post. It is
	//     overlaid into b2-include/ as 071-now-seed.php by the overlay
	//     builder, so __DIR__ here is that b2-include directory.
	require __DIR__ . '/071-now-seed.php';
}

// EN: The mysqli compat helpers (wp071_db_query / wp071_db_fetch_* /
//     wp071_db_error). A few 0.71 functions call mysqli_*( $wpdb->dbh,
//     ... ) directly; the overlay builder rewrites those sites to these
//     helpers (see scripts/build-overlay.mjs). Declaring the functions
//     here -- before any blog script runs -- makes them available to
//     every rewritten admin page. WP071_DbResult, which the helpers
//     reference, is defined later in wp-db.php; only the call-time
//     instanceof touches it, so the early declaration is safe.
require_once __DIR__ . '/071-now-mysqli-compat.php';
