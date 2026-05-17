<?php
/**
 * 071-cli -- `db` command group.
 *
 * Run raw SQL against WordPress 0.71's database.
 *     Verbs: query <sql> | tables.
 *     `query` runs any statement through 0.71's $wpdb: a SELECT is rendered
 *     as a result set, a non-SELECT reports the affected-row count.
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Route a `db` verb to its implementation.
 *
 * @param string                     $verb  The verb.
 * @param array<int, string>         $args  Positional arguments after the verb.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_cmd_db( string $verb, array $args, array $flags ): int {
	$wpdb = cli_bootstrap( $flags );

	switch ( $verb ) {
		case 'query':
			$sql = cli_require_arg( $args, 0, 'SQL statement' );
			// Surface SQL errors as a CLI failure rather than HTML output.
			$wpdb->show_errors = false;
			$result            = $wpdb->query( $sql );

			$error = mysqli_error( $wpdb->dbh );
			if ( '' !== $error ) {
				cli_fail( "SQL error: $error" );
			}

			if ( is_array( $wpdb->last_result ) && count( $wpdb->last_result ) > 0 ) {
				return cli_render( $wpdb->last_result, $flags );
			}

			// A SELECT that matched nothing returns an empty result; a
			//     non-SELECT reports its affected-row count.
			if ( preg_match( '/^\s*select\b/i', $sql ) ) {
				return cli_render( array(), $flags );
			}

			$affected = (int) $wpdb->rows_affected;
			cli_success( "query OK, $affected row(s) affected." );
			return 0;

		case 'tables':
			$rows  = $wpdb->get_results( 'SHOW TABLES' );
			$names = array();
			if ( is_array( $rows ) ) {
				foreach ( $rows as $row ) {
					$values  = array_values( cli_row_to_array( $row ) );
					$names[] = array( 'table' => isset( $values[0] ) ? (string) $values[0] : '' );
				}
			}
			return cli_render( $names, $flags, array( 'table' ) );

		case '':
		case 'help':
			fwrite( STDOUT, "071 db query <sql> | tables\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'db $verb'." );
	}

	return 0;
}
