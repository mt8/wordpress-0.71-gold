<?php
/**
 * 071-cli -- `post` command group.
 *
 * EN: Manage WordPress 0.71 posts in the b2posts table.
 *     Verbs: list | get <id> | create | update <id> | delete <id>.
 * JA: WordPress 0.71 の投稿(b2posts テーブル)を管理する。
 *     動詞: list | get <id> | create | update <id> | delete <id>。
 *
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Columns of the b2posts table that may be set on create / update.
 *
 * @return array<int, string>
 */
function cli_post_columns(): array {
	return array(
		'post_author',
		'post_date',
		'post_content',
		'post_title',
		'post_category',
		'post_excerpt',
		'post_status',
		'comment_status',
		'ping_status',
		'post_password',
	);
}

/**
 * Route a `post` verb to its implementation.
 *
 * @param string                     $verb  The verb (list/get/create/...).
 * @param array<int, string>         $args  Positional arguments after the verb.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_cmd_post( string $verb, array $args, array $flags ): int {
	$wpdb = cli_bootstrap( $flags );
	global $tableposts;

	switch ( $verb ) {
		case 'list':
			$rows = $wpdb->get_results( "SELECT * FROM $tableposts ORDER BY ID DESC" );
			return cli_render( is_array( $rows ) ? $rows : array(), $flags, array( 'ID' ) );

		case 'get':
			$id  = cli_require_id( $args );
			$row = $wpdb->get_row( "SELECT * FROM $tableposts WHERE ID = $id" );
			if ( ! $row ) {
				cli_fail( "post $id not found." );
			}
			return cli_render_one( $row, $flags );

		case 'create':
			$data = cli_data_from_flags( $flags, cli_post_columns() );
			if ( ! isset( $data['post_date'] ) || '' === $data['post_date'] ) {
				$data['post_date'] = date( 'Y-m-d H:i:s' );
			}
			if ( ! isset( $data['post_author'] ) || '' === $data['post_author'] ) {
				$data['post_author'] = '1';
			}
			list( $cols, $vals ) = cli_build_insert( $wpdb, $data );
			$wpdb->query( "INSERT INTO $tableposts ($cols) VALUES ($vals)" );
			$new = (int) $wpdb->insert_id;
			if ( $new <= 0 ) {
				cli_fail( 'failed to create post.' );
			}
			cli_success( "created post $new." );
			return 0;

		case 'update':
			$id   = cli_require_id( $args );
			$data = cli_data_from_flags( $flags, cli_post_columns() );
			if ( count( $data ) === 0 ) {
				cli_fail( 'nothing to update -- pass at least one --field=value.' );
			}
			$exists = $wpdb->get_var( "SELECT ID FROM $tableposts WHERE ID = $id" );
			if ( null === $exists ) {
				cli_fail( "post $id not found." );
			}
			$set = cli_build_set( $wpdb, $data );
			$wpdb->query( "UPDATE $tableposts SET $set WHERE ID = $id" );
			cli_success( "updated post $id." );
			return 0;

		case 'delete':
			$id     = cli_require_id( $args );
			$exists = $wpdb->get_var( "SELECT ID FROM $tableposts WHERE ID = $id" );
			if ( null === $exists ) {
				cli_fail( "post $id not found." );
			}
			$wpdb->query( "DELETE FROM $tableposts WHERE ID = $id" );
			cli_success( "deleted post $id." );
			return 0;

		case '':
		case 'help':
			fwrite( STDOUT, "071 post list | get <id> | create | update <id> | delete <id>\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'post $verb'." );
	}

	return 0;
}
