<?php
/**
 * 071-cli -- `user` command group.
 *
 * Manage WordPress 0.71 users in the b2users table.
 *     Verbs: list | get <id> | create | update <id> | delete <id>.
 *     The `user_pass` column stores the password as plain text in 0.71; the
 *     CLI sets it verbatim, matching the 2003-era behaviour.
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Columns of the b2users table that may be set on create / update.
 *
 * @return array<int, string>
 */
function cli_user_columns(): array {
	return array(
		'user_login',
		'user_pass',
		'user_firstname',
		'user_lastname',
		'user_nickname',
		'user_icq',
		'user_email',
		'user_url',
		'user_ip',
		'user_domain',
		'user_browser',
		'dateYMDhour',
		'user_level',
		'user_aim',
		'user_msn',
		'user_yim',
		'user_idmode',
	);
}

/**
 * Route a `user` verb to its implementation.
 *
 * @param string                     $verb  The verb.
 * @param array<int, string>         $args  Positional arguments after the verb.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_cmd_user( string $verb, array $args, array $flags ): int {
	$wpdb = cli_bootstrap( $flags );
	global $tableusers;

	switch ( $verb ) {
		case 'list':
			$rows = $wpdb->get_results( "SELECT * FROM $tableusers ORDER BY ID ASC" );
			return cli_render( is_array( $rows ) ? $rows : array(), $flags, array( 'ID' ) );

		case 'get':
			$id  = cli_require_id( $args );
			$row = $wpdb->get_row( "SELECT * FROM $tableusers WHERE ID = $id" );
			if ( ! $row ) {
				cli_fail( "user $id not found." );
			}
			return cli_render_one( $row, $flags );

		case 'create':
			$data = cli_data_from_flags( $flags, cli_user_columns() );
			if ( ! isset( $data['user_login'] ) || '' === $data['user_login'] ) {
				cli_fail( 'missing required field --user_login.' );
			}
			$dupe = $wpdb->get_var(
				"SELECT ID FROM $tableusers WHERE user_login = '" . $wpdb->escape( $data['user_login'] ) . "'"
			);
			if ( null !== $dupe ) {
				cli_fail( "a user with login '{$data['user_login']}' already exists (ID $dupe)." );
			}
			if ( ! isset( $data['dateYMDhour'] ) || '' === $data['dateYMDhour'] ) {
				$data['dateYMDhour'] = date( 'Y-m-d H:i:s' );
			}
			if ( ! isset( $data['user_nickname'] ) || '' === $data['user_nickname'] ) {
				$data['user_nickname'] = $data['user_login'];
			}
			list( $cols, $vals ) = cli_build_insert( $wpdb, $data );
			$wpdb->query( "INSERT INTO $tableusers ($cols) VALUES ($vals)" );
			$new = (int) $wpdb->insert_id;
			if ( $new <= 0 ) {
				cli_fail( 'failed to create user.' );
			}
			cli_success( "created user $new." );
			return 0;

		case 'update':
			$id   = cli_require_id( $args );
			$data = cli_data_from_flags( $flags, cli_user_columns() );
			if ( count( $data ) === 0 ) {
				cli_fail( 'nothing to update -- pass at least one --field=value.' );
			}
			$exists = $wpdb->get_var( "SELECT ID FROM $tableusers WHERE ID = $id" );
			if ( null === $exists ) {
				cli_fail( "user $id not found." );
			}
			$set = cli_build_set( $wpdb, $data );
			$wpdb->query( "UPDATE $tableusers SET $set WHERE ID = $id" );
			cli_success( "updated user $id." );
			return 0;

		case 'delete':
			$id     = cli_require_id( $args );
			$exists = $wpdb->get_var( "SELECT ID FROM $tableusers WHERE ID = $id" );
			if ( null === $exists ) {
				cli_fail( "user $id not found." );
			}
			$wpdb->query( "DELETE FROM $tableusers WHERE ID = $id" );
			cli_success( "deleted user $id." );
			return 0;

		case '':
		case 'help':
			fwrite( STDOUT, "071 user list | get <id> | create | update <id> | delete <id>\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'user $verb'." );
	}

	return 0;
}
