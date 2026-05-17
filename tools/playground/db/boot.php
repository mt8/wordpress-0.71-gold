<?php
// ==================================================================
//  071-now boot prepend (Issue #108 feasibility spike; Issue #120).
//
//  Registered as php-wasm's auto_prepend_file, so it runs before every
//  request's main script (index.php and friends). It:
//
//    1. defines WP071_DB_PATH -- the SQLite file inside the php-wasm
//       virtual filesystem, read by the 071-now wp-db.php and seed;
//    2. seeds that database when none exists yet, so the very first
//       front-page request already has a post to render;
//    3. auto-logs-in the seeded admin user, so the admin (wp-admin/) is
//       reachable without a manual login -- the single-user browser
//       playground model WordPress Playground uses (Issue #120).
//
//  Seeding is gated on the database file's existence: WordPress 0.71's
//  b2config.php has no install check, so this prepend is where the
//  in-browser blog gets its data. The app persists the database in the
//  browser (OPFS / IndexedDB, Issue #122) and restores it to
//  WP071_DB_PATH before the request runs, so on a returning visit the
//  file already exists and the seed is skipped -- the persisted content
//  is what the blog serves. A first visit, or a boot after a reset,
//  finds no file and seeds afresh. Subsequent requests in the same
//  php-wasm instance also see the file and skip re-seeding.
// ==================================================================

if ( ! defined( 'WP071_DB_PATH' ) ) {
	// A writable location in the php-wasm virtual filesystem.
	define( 'WP071_DB_PATH', '/tmp/071-now.sqlite' );
}

// WordPress 0.71's b2config.php builds its include path from
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

// Set the working directory to the requested script's directory.
//     WordPress 0.71's admin pages include their dependencies with bare
//     relative paths -- b2edit.php does require './b2header.php', and
//     b2header.php does require '../b2config.php'. PHP resolves such a
//     path against the current working directory, and the php-wasm
//     request handler leaves the CWD at the document root, so the admin
//     pages (which live in wp-admin/) fail to find their includes. A
//     real web server runs each script with the CWD at its own
//     directory; reproduce that here. The front page (index.php at the
//     document root) already includes via __DIR__, so it is unaffected.
if ( ! empty( $_SERVER['SCRIPT_FILENAME'] ) ) {
	$wp071_script_dir = dirname( $_SERVER['SCRIPT_FILENAME'] );
	if ( is_dir( $wp071_script_dir ) ) {
		chdir( $wp071_script_dir );
	}
	unset( $wp071_script_dir );
}

if ( ! file_exists( WP071_DB_PATH ) ) {
	// seed.php builds the schema and inserts the seeded post. It is
	//     overlaid into b2-include/ as 071-now-seed.php by the overlay
	//     builder, so __DIR__ here is that b2-include directory.
	require __DIR__ . '/071-now-seed.php';
}

// Ensure the image-upload directory exists (Issue #124). WordPress
//     0.71's wp-admin/b2upload.php writes uploaded images to
//     $fileupload_realpath and, before writing, calls
//     realpath( $fileupload_realpath ) to verify the destination -- a
//     check that returns false when the directory is absent, aborting the
//     upload. The app rewrites $fileupload_realpath in the in-VFS
//     b2config.php to wp-content/uploads under the document root; create
//     that directory here so the upload page can write into it. This boot
//     shim runs before every request, so the directory is in place even
//     on a fresh php-wasm instance whose virtual filesystem starts empty.
$wp071_uploads_dir = dirname( __DIR__ ) . '/wp-content/uploads';
if ( ! is_dir( $wp071_uploads_dir ) ) {
	@mkdir( $wp071_uploads_dir, 0755, true );
}
unset( $wp071_uploads_dir );

// The mysqli compat helpers (wp071_db_query / wp071_db_fetch_* /
//     wp071_db_error). A few 0.71 functions call mysqli_*( $wpdb->dbh,
//     ... ) directly; the overlay builder rewrites those sites to these
//     helpers (see scripts/build-overlay.mjs). Declaring the functions
//     here -- before any blog script runs -- makes them available to
//     every rewritten admin page. WP071_DbResult, which the helpers
//     reference, is defined later in wp-db.php; only the call-time
//     instanceof touches it, so the early declaration is safe.
require_once __DIR__ . '/071-now-mysqli-compat.php';

// Auto-login. 071-now is a single-user browser playground -- there
//     is one seeded admin user and no one else to log in as -- so the
//     admin is made reachable without a manual login, the model
//     WordPress Playground follows.
//
//     WordPress 0.71's cookie auth (b2verifauth.php veriflog(),
//     b2login.php checklogin()) reads two cookies: wordpressuser (the
//     login name) and wordpresspass (md5() of the stored user_pass).
//     Rather than drive the login form, the auth cookies are injected
//     straight into $_COOKIE here, before any blog script runs, so
//     every request -- front page and admin alike -- is already
//     authenticated as the seeded admin. The stored user_pass is read
//     from the seeded database so the cookie matches whatever the seed
//     stored, and the CSRF token (b2functions.php b2_csrf_token(), which
//     is seeded from the wordpresspass cookie) stays consistent.
if ( ! function_exists( 'wp071_seeded_admin' ) ) {

	/**
	 * Read the seeded admin user from the SQLite database.
	 *
	 * Runs in its own function scope so the temporary PDO connection is
	 * the function's local and is released the moment the function
	 * returns -- the blog's own wpdb opens a connection seconds later,
	 * and a lingering one here would hold a SQLite lock.
	 *
	 * @return object|false The admin row (user_login, user_pass), or
	 *                       false when there is none / on error.
	 */
	function wp071_seeded_admin() {
		try {
			$pdo  = new PDO( 'sqlite:' . WP071_DB_PATH );
			$stmt = $pdo->query(
				'SELECT user_login, user_pass FROM b2users ORDER BY user_level DESC, ID ASC LIMIT 1'
			);
			$row = $stmt ? $stmt->fetch( PDO::FETCH_OBJ ) : false;
			$stmt = null;
			$pdo  = null;
			return $row;
		} catch ( Exception $e ) {
			// Auth is best-effort at boot; on error the visitor is
			//     just left logged out, which the blog already handles.
			return false;
		}
	}
}

if ( empty( $_COOKIE['wordpressuser'] ) && file_exists( WP071_DB_PATH ) ) {
	$wp071_admin = wp071_seeded_admin();
	if ( $wp071_admin ) {
		$_COOKIE['wordpressuser']   = $wp071_admin->user_login;
		$_COOKIE['wordpresspass']   = md5( $wp071_admin->user_pass );
		$_COOKIE['wordpressblogid'] = 1;
	}
	unset( $wp071_admin );
}
