<?php
/**
 * 071-cli -- `comment` command group.
 *
 * Manage WordPress 0.71 comments in the b2comments table.
 *     Verbs: list | get <id> | delete <id> (per docs/071-tooling.md
 *     section 3.4).
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Route a `comment` verb to its implementation.
 *
 * @param string                     $verb  The verb.
 * @param array<int, string>         $args  Positional arguments after the verb.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_cmd_comment( string $verb, array $args, array $flags ): int {
	$wpdb = cli_bootstrap( $flags );
	global $tablecomments;

	switch ( $verb ) {
		case 'list':
			$rows = $wpdb->get_results( "SELECT * FROM $tablecomments ORDER BY comment_ID DESC" );
			return cli_render( is_array( $rows ) ? $rows : array(), $flags, array( 'comment_ID' ) );

		case 'get':
			$id  = cli_require_id( $args );
			$row = $wpdb->get_row( "SELECT * FROM $tablecomments WHERE comment_ID = $id" );
			if ( ! $row ) {
				cli_fail( "comment $id not found." );
			}
			return cli_render_one( $row, $flags );

		case 'delete':
			$id     = cli_require_id( $args );
			$exists = $wpdb->get_var( "SELECT comment_ID FROM $tablecomments WHERE comment_ID = $id" );
			if ( null === $exists ) {
				cli_fail( "comment $id not found." );
			}
			$wpdb->query( "DELETE FROM $tablecomments WHERE comment_ID = $id" );
			cli_success( "deleted comment $id." );
			return 0;

		case '':
		case 'help':
			fwrite( STDOUT, "071 comment list | get <id> | delete <id>\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'comment $verb'." );
	}

	return 0;
}
