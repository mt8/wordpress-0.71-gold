<?php
/**
 * 071-cli -- `link` command group.
 *
 * Manage WordPress 0.71 blogroll links in the b2links table.
 *     Verbs: list | get <id> | create | delete <id> (per
 *     docs/071-tooling.md section 3.4).
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Columns of the b2links table that may be set on create.
 *
 * @return array<int, string>
 */
function cli_link_columns(): array {
	return array(
		'link_url',
		'link_name',
		'link_image',
		'link_target',
		'link_category',
		'link_description',
		'link_visible',
		'link_owner',
		'link_rating',
		'link_updated',
		'link_rel',
	);
}

/**
 * Route a `link` verb to its implementation.
 *
 * @param string                     $verb  The verb.
 * @param array<int, string>         $args  Positional arguments after the verb.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_cmd_link( string $verb, array $args, array $flags ): int {
	$wpdb = cli_bootstrap( $flags );
	global $tablelinks;

	switch ( $verb ) {
		case 'list':
			$rows = $wpdb->get_results( "SELECT * FROM $tablelinks ORDER BY link_id ASC" );
			return cli_render( is_array( $rows ) ? $rows : array(), $flags, array( 'link_id' ) );

		case 'get':
			$id  = cli_require_id( $args );
			$row = $wpdb->get_row( "SELECT * FROM $tablelinks WHERE link_id = $id" );
			if ( ! $row ) {
				cli_fail( "link $id not found." );
			}
			return cli_render_one( $row, $flags );

		case 'create':
			$data = cli_data_from_flags( $flags, cli_link_columns() );
			if ( ! isset( $data['link_url'] ) || '' === $data['link_url'] ) {
				cli_fail( 'missing required field --link_url.' );
			}
			if ( ! isset( $data['link_name'] ) || '' === $data['link_name'] ) {
				cli_fail( 'missing required field --link_name.' );
			}
			if ( ! isset( $data['link_updated'] ) || '' === $data['link_updated'] ) {
				$data['link_updated'] = date( 'Y-m-d H:i:s' );
			}
			list( $cols, $vals ) = cli_build_insert( $wpdb, $data );
			$wpdb->query( "INSERT INTO $tablelinks ($cols) VALUES ($vals)" );
			$new = (int) $wpdb->insert_id;
			if ( $new <= 0 ) {
				cli_fail( 'failed to create link.' );
			}
			cli_success( "created link $new." );
			return 0;

		case 'delete':
			$id     = cli_require_id( $args );
			$exists = $wpdb->get_var( "SELECT link_id FROM $tablelinks WHERE link_id = $id" );
			if ( null === $exists ) {
				cli_fail( "link $id not found." );
			}
			$wpdb->query( "DELETE FROM $tablelinks WHERE link_id = $id" );
			cli_success( "deleted link $id." );
			return 0;

		case '':
		case 'help':
			fwrite( STDOUT, "071 link list | get <id> | create | delete <id>\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'link $verb'." );
	}

	return 0;
}
