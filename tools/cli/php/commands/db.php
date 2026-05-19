<?php
/**
 * 071-cli -- `db` command group.
 *
 * Run raw SQL against WordPress 0.71's database, and export / import it.
 *     Verbs: query <sql> | tables | export <file> | import <file>.
 *     `query` runs any statement through 0.71's $wpdb: a SELECT is rendered
 *     as a result set, a non-SELECT reports the affected-row count.
 *     `export` writes a SQL dump of every table; `import` runs a SQL dump
 *     back in, split into statements with a quote-aware scanner.
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

		case 'export':
			$file              = cli_require_arg( $args, 0, 'output file path' );
			$wpdb->show_errors = false;
			$dump              = cli_db_dump( $wpdb );
			if ( false === file_put_contents( $file, $dump ) ) {
				cli_fail( "could not write to $file." );
			}
			cli_success( "exported the database to $file." );
			return 0;

		case 'import':
			$file = cli_require_arg( $args, 0, 'input file path' );
			if ( ! is_file( $file ) ) {
				cli_fail( "no such file: $file." );
			}
			$contents = file_get_contents( $file );
			if ( false === $contents ) {
				cli_fail( "could not read $file." );
			}
			$wpdb->show_errors = false;
			$statements        = cli_db_split_statements( $contents );
			foreach ( $statements as $statement ) {
				$wpdb->query( $statement );
				$error = mysqli_error( $wpdb->dbh );
				if ( '' !== $error ) {
					cli_fail( "SQL error: $error" );
				}
			}
			cli_success( count( $statements ) . " statement(s) imported from $file." );
			return 0;

		case '':
		case 'help':
			fwrite( STDOUT, "071 db query <sql> | tables | export <file> | import <file>\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'db $verb'." );
	}

	return 0;
}

/**
 * Build a SQL dump of every WordPress 0.71 table.
 *
 * For each table: a DROP TABLE IF EXISTS, the SHOW CREATE TABLE
 *     statement, and one INSERT per row. Values are escaped through
 *     $wpdb; a NULL column is written as the SQL keyword NULL.
 * @param wpdb $wpdb The database handle.
 * @return string The SQL dump.
 */
function cli_db_dump( wpdb $wpdb ): string {
	$dump  = "-- 071-cli database export\n";
	$dump .= '-- generated ' . gmdate( 'Y-m-d H:i:s' ) . " UTC\n\n";

	$tables     = array();
	$table_rows = $wpdb->get_results( 'SHOW TABLES' );
	if ( is_array( $table_rows ) ) {
		foreach ( $table_rows as $table_row ) {
			$values = array_values( cli_row_to_array( $table_row ) );
			if ( isset( $values[0] ) ) {
				$tables[] = (string) $values[0];
			}
		}
	}

	foreach ( $tables as $table ) {
		$create_rows = $wpdb->get_results( "SHOW CREATE TABLE `$table`" );
		$create      = '';
		if ( is_array( $create_rows ) && isset( $create_rows[0] ) ) {
			$create_values = array_values( cli_row_to_array( $create_rows[0] ) );
			$create        = isset( $create_values[1] ) ? (string) $create_values[1] : '';
		}

		$dump .= "DROP TABLE IF EXISTS `$table`;\n";
		if ( '' !== $create ) {
			$dump .= $create . ";\n";
		}
		$dump .= "\n";

		$data_rows = $wpdb->get_results( "SELECT * FROM `$table`" );
		if ( is_array( $data_rows ) ) {
			foreach ( $data_rows as $data_row ) {
				$row     = cli_row_to_array( $data_row );
				$columns = array();
				$values  = array();
				foreach ( $row as $column => $value ) {
					$columns[] = '`' . $column . '`';
					$values[]  = ( null === $value )
						? 'NULL'
						: "'" . $wpdb->escape( (string) $value ) . "'";
				}
				$dump .= 'INSERT INTO `' . $table . '` ('
					. implode( ', ', $columns ) . ') VALUES ('
					. implode( ', ', $values ) . ");\n";
			}
		}
		$dump .= "\n";
	}

	return $dump;
}

/**
 * Split a SQL dump into individual statements.
 *
 * A semicolon ends a statement only outside a single-quoted string
 *     literal, so a ';' inside post content (or any value) is not
 *     mistaken for a boundary. Both backslash escapes (\') and the
 *     end of a literal are handled. Leading line comments and blank
 *     statements are dropped.
 * @param string $sql The SQL dump text.
 * @return array<int, string> The statements, in order.
 */
function cli_db_split_statements( string $sql ): array {
	$statements = array();
	$current    = '';
	$in_string  = false;
	$length     = strlen( $sql );

	for ( $i = 0; $i < $length; $i++ ) {
		$char = $sql[ $i ];

		if ( $in_string ) {
			$current .= $char;
			if ( '\\' === $char && $i + 1 < $length ) {
				// A backslash escape -- consume the next byte verbatim.
				$current .= $sql[ ++$i ];
			} elseif ( "'" === $char ) {
				$in_string = false;
			}
			continue;
		}

		if ( "'" === $char ) {
			$in_string = true;
			$current  .= $char;
		} elseif ( ';' === $char ) {
			$statements[] = $current;
			$current      = '';
		} else {
			$current .= $char;
		}
	}
	if ( '' !== trim( $current ) ) {
		$statements[] = $current;
	}

	$out = array();
	foreach ( $statements as $statement ) {
		// Drop leading line comments (the dump's header) and surrounding
		//     whitespace; skip a chunk that carried nothing else.
		$statement = (string) preg_replace( '/^(\s*--[^\n]*(\n|$))+/', '', $statement );
		$statement = trim( $statement );
		if ( '' !== $statement ) {
			$out[] = $statement;
		}
	}

	return $out;
}
