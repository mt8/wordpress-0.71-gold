<?php
/**
 * 071-cli -- `option` command group.
 *
 * Read and write WordPress 0.71's blog settings in the b2settings table.
 *     Verbs: list | get <name> | set <name> <value>.
 *     0.71 stores settings not as key/value rows but as the columns of a
 *     single b2settings row (ID = 1): posts_per_page, what_to_show,
 *     archive_mode, time_difference, AutoBR, time_format, date_format. Each
 *     such column is an "option" name here.
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Read the single b2settings row.
 *
 * @param wpdb $wpdb The database handle.
 * @return array<string, mixed> The settings row as an associative array.
 */
function cli_option_row( wpdb $wpdb ): array {
	global $tablesettings;

	$row = $wpdb->get_row( "SELECT * FROM $tablesettings WHERE ID = 1" );
	if ( ! $row ) {
		cli_fail( 'no settings row found in b2settings (ID = 1).' );
	}

	return cli_row_to_array( $row );
}

/**
 * Route an `option` verb to its implementation.
 *
 * @param string                     $verb  The verb.
 * @param array<int, string>         $args  Positional arguments after the verb.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_cmd_option( string $verb, array $args, array $flags ): int {
	$wpdb = cli_bootstrap( $flags );
	global $tablesettings;

	switch ( $verb ) {
		case 'list':
			$row  = cli_option_row( $wpdb );
			$rows = array();
			foreach ( $row as $name => $value ) {
				$rows[] = array(
					'option_name'  => (string) $name,
					'option_value' => cli_scalar( $value ),
				);
			}
			return cli_render( $rows, $flags, array( 'option_name' ) );

		case 'get':
			$name = cli_require_arg( $args, 0, 'option name' );
			$row  = cli_option_row( $wpdb );
			if ( ! array_key_exists( $name, $row ) ) {
				cli_fail( "unknown option '$name'. Run `071 option list` to see the available names." );
			}
			fwrite( STDOUT, cli_scalar( $row[ $name ] ) . "\n" );
			return 0;

		case 'set':
			$name  = cli_require_arg( $args, 0, 'option name' );
			$value = cli_require_arg( $args, 1, 'option value' );
			$row   = cli_option_row( $wpdb );
			if ( ! array_key_exists( $name, $row ) ) {
				cli_fail( "unknown option '$name'. Run `071 option list` to see the available names." );
			}
			if ( 'ID' === $name ) {
				cli_fail( 'the ID column is the settings-row primary key and cannot be set.' );
			}
			$escaped = $wpdb->escape( $value );
			$wpdb->query( "UPDATE $tablesettings SET $name = '$escaped' WHERE ID = 1" );
			cli_success( "updated option '$name'." );
			return 0;

		case '':
		case 'help':
			fwrite( STDOUT, "071 option list | get <name> | set <name> <value>\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'option $verb'." );
	}

	return 0;
}
