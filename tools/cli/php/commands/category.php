<?php
/**
 * 071-cli -- `category` command group.
 *
 * Manage WordPress 0.71 post categories in the b2categories table.
 *     Verbs: list | get <id> | create | delete <id>.
 *     0.71 has a single flat post category list -- no hierarchy, no
 *     taxonomies -- so there is no `update` verb in the design.
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Route a `category` verb to its implementation.
 *
 * @param string                     $verb  The verb.
 * @param array<int, string>         $args  Positional arguments after the verb.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_cmd_category( string $verb, array $args, array $flags ): int {
	$wpdb = cli_bootstrap( $flags );
	global $tablecategories;

	switch ( $verb ) {
		case 'list':
			$rows = $wpdb->get_results( "SELECT * FROM $tablecategories ORDER BY cat_ID ASC" );
			return cli_render( is_array( $rows ) ? $rows : array(), $flags, array( 'cat_ID' ) );

		case 'get':
			$id  = cli_require_id( $args );
			$row = $wpdb->get_row( "SELECT * FROM $tablecategories WHERE cat_ID = $id" );
			if ( ! $row ) {
				cli_fail( "category $id not found." );
			}
			return cli_render_one( $row, $flags );

		case 'create':
			$data = cli_data_from_flags( $flags, array( 'cat_name' ) );
			if ( ! isset( $data['cat_name'] ) || '' === $data['cat_name'] ) {
				cli_fail( 'missing required field --cat_name.' );
			}
			$name = $wpdb->escape( $data['cat_name'] );
			$wpdb->query( "INSERT INTO $tablecategories (cat_name) VALUES ('$name')" );
			$new = (int) $wpdb->insert_id;
			if ( $new <= 0 ) {
				cli_fail( 'failed to create category.' );
			}
			cli_success( "created category $new." );
			return 0;

		case 'delete':
			$id     = cli_require_id( $args );
			$exists = $wpdb->get_var( "SELECT cat_ID FROM $tablecategories WHERE cat_ID = $id" );
			if ( null === $exists ) {
				cli_fail( "category $id not found." );
			}
			$wpdb->query( "DELETE FROM $tablecategories WHERE cat_ID = $id" );
			cli_success( "deleted category $id." );
			return 0;

		case '':
		case 'help':
			fwrite( STDOUT, "071 category list | get <id> | create | delete <id>\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'category $verb'." );
	}

	return 0;
}
