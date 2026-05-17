<?php
/**
 * 071-cli -- headless bootstrap of WordPress 0.71's database layer.
 *
 * Loads WordPress 0.71's b2config.php (which ends by requiring wp-db.php
 *     and exposing the global $wpdb) without the web context: no $_GET /
 *     $_COOKIE handling and no header() output. This mirrors
 *     src/block-editor/api/bootstrap.php, which already does the same for the
 *     block editor's JSON endpoints. See docs/071-tooling.md section 3.3.
 * @package 071-cli
 */

declare(strict_types=1);

/**
 * Resolve the WordPress 0.71 install path.
 *
 * Resolution order, per docs/071-tooling.md section 3.3:
 *       1. a --path=<dir> flag on the command line,
 *       2. the B2_PATH environment variable,
 *       3. a default of ./src relative to the current working directory.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return string Absolute path to the 0.71 install directory.
 */
function cli_resolve_path( array $flags ): string {
	$candidate = '';

	if ( isset( $flags['path'] ) && is_string( $flags['path'] ) && '' !== $flags['path'] ) {
		$candidate = $flags['path'];
	} elseif ( false !== getenv( 'B2_PATH' ) && '' !== getenv( 'B2_PATH' ) ) {
		$candidate = (string) getenv( 'B2_PATH' );
	} else {
		$candidate = getcwd() . '/src';
	}

	$resolved = realpath( $candidate );

	if ( false === $resolved ) {
		cli_fail( "WordPress 0.71 install path not found: $candidate" );
	}

	return $resolved;
}

/**
 * Pre-define the database constants from CLI flags or environment overrides.
 *
 * b2config.php guards each define() with `if ( ! defined( ... ) )`, so
 *     defining these here first lets the CLI talk to a database other than the
 *     container's -- e.g. when run on a host with a local PHP binary. Flags
 *     win over environment variables; absent both, b2config.php's own defaults
 *     apply unchanged.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return void
 */
function cli_predefine_db( array $flags ): void {
	$map = array(
		'DB_NAME'     => array( 'dbname', 'B2_DB_NAME' ),
		'DB_USER'     => array( 'dbuser', 'B2_DB_USER' ),
		'DB_PASSWORD' => array( 'dbpass', 'B2_DB_PASSWORD' ),
		'DB_HOST'     => array( 'dbhost', 'B2_DB_HOST' ),
	);

	foreach ( $map as $constant => $sources ) {
		list( $flag, $env ) = $sources;
		$value              = null;

		if ( isset( $flags[ $flag ] ) && is_string( $flags[ $flag ] ) && '' !== $flags[ $flag ] ) {
			$value = $flags[ $flag ];
		} elseif ( false !== getenv( $env ) && '' !== getenv( $env ) ) {
			$value = (string) getenv( $env );
		}

		if ( null !== $value && ! defined( $constant ) ) {
			define( $constant, $value );
		}
	}
}

/**
 * Bootstrap WordPress 0.71's database layer and return the $wpdb handle.
 *
 * Loads b2config.php in a clean context. wp-db.php prints HTML on a
 *     connection failure and does not return a status, so connection errors
 *     are surfaced afterwards by probing the live mysqli handle.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return wpdb The connected WordPress 0.71 database handle.
 */
function cli_bootstrap( array $flags ): wpdb {
	cli_predefine_db( $flags );

	$abspath = cli_resolve_path( $flags );

	$config = $abspath . '/b2config.php';
	if ( ! is_file( $config ) ) {
		cli_fail( "b2config.php not found in $abspath -- is this a WordPress 0.71 install?" );
	}

	// b2config.php derives $abspath from getenv('DOCUMENT_ROOT'); there is
	//     no document root on the CLI, so point it at the resolved install
	//     directory before the config recomputes it.
	putenv( 'DOCUMENT_ROOT=' . $abspath );
	$_SERVER['DOCUMENT_ROOT'] = $abspath;

	// b2config.php and the wp-db.php it requires assign $wpdb and the
	//     $table* names at file scope. require'd from inside a function, those
	//     assignments would land in this function's local scope; declaring the
	//     names global first makes them land in the global scope, where the
	//     command modules read them with `global $table...;`.
	global $wpdb, $tableposts, $tableusers, $tablesettings, $tablecategories;
	global $tablecomments, $tablelinks, $tablelinkcategories;

	// wp-db.php prints an HTML error block on a bad connection. Buffer it
	//     so a CLI failure stays plain text.
	ob_start();
	require_once $config;
	$noise = ob_get_clean();

	if ( ! isset( $wpdb ) || ! ( $wpdb instanceof wpdb ) ) {
		cli_fail( 'failed to initialise the WordPress 0.71 database layer.' );
	}

	if ( ! ( $wpdb->dbh instanceof mysqli ) ) {
		$detail = '' !== trim( (string) $noise ) ? ' ' . wp_strip_all_html( $noise ) : '';
		cli_fail( 'could not connect to the database.' . $detail );
	}

	// Errors must not print HTML to stdout; the command layer reports them.
	$wpdb->hide_errors();

	return $wpdb;
}

/**
 * Reduce an HTML fragment to readable single-line text.
 *
 * @param string $html HTML fragment.
 * @return string Plain-text rendering.
 */
function wp_strip_all_html( string $html ): string {
	$text = preg_replace( '/<[^>]*>/', ' ', $html );
	$text = preg_replace( '/\s+/', ' ', (string) $text );

	return trim( (string) $text );
}
