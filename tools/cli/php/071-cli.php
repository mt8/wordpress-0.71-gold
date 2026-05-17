<?php
/**
 * 071-cli -- PHP CLI entry point for WordPress 0.71.
 *
 * EN: wp-cli-style command-line interface for WordPress 0.71 (b2/cafelog).
 *     Parses argv, routes `<group> <verb> [args] [--flags]` to the command
 *     modules under commands/, and renders their results. See
 *     docs/071-tooling.md sections 3.2-3.4.
 * JA: WordPress 0.71 (b2/cafelog) 向けの wp-cli 風コマンドラインインター
 *     フェース。argv を解析し、`<group> <verb> [args] [--flags]` を
 *     commands/ 配下のコマンドモジュールへルーティングし、その結果を描画
 *     する。docs/071-tooling.md セクション 3.2-3.4 を参照。
 *
 * @package 071-cli
 */

declare(strict_types=1);

// EN: WordPress 0.71's 2003-era code legitimately triggers E_WARNING /
//     E_NOTICE under PHP 8 (e.g. wpdb::get_var indexing an empty result set).
//     On a CLI those must not bleed into stdout and corrupt table / JSON
//     output. Errors are kept logged to stderr; fatal errors still surface.
// JA: WordPress 0.71 の 2003 年当時のコードは PHP 8 で E_WARNING / E_NOTICE を
//     正当に発生させる(例: 空の結果セットを添字参照する wpdb::get_var)。
//     CLI ではこれらが stdout に漏れて table / JSON 出力を壊してはならない。
//     エラーは stderr へのログとして残し、致命的エラーは引き続き表面化する。
ini_set( 'display_errors', 'stderr' );
error_reporting( E_ALL & ~E_WARNING & ~E_NOTICE & ~E_DEPRECATED );

require_once __DIR__ . '/output.php';
require_once __DIR__ . '/bootstrap.php';

/**
 * Print a message to stderr and exit with a failure status.
 *
 * @param string $message Error message (no trailing newline needed).
 * @return never
 */
function cli_fail( string $message ) {
	fwrite( STDERR, "Error: $message\n" );
	exit( 1 );
}

/**
 * Parse the raw argv into positional arguments and flags.
 *
 * EN: Recognises `--flag` (boolean true) and `--flag=value`. Everything else
 *     is a positional argument, in order.
 * JA: `--flag`(真偽値 true)と `--flag=value` を認識する。それ以外は順序を
 *     保った位置引数となる。
 *
 * @param array<int, string> $argv Raw argv, excluding the script name.
 * @return array{0: array<int, string>, 1: array<string, string|bool>}
 */
function cli_parse_args( array $argv ): array {
	$positional = array();
	$flags      = array();

	foreach ( $argv as $arg ) {
		if ( str_starts_with( $arg, '--' ) ) {
			$body = substr( $arg, 2 );
			$eq   = strpos( $body, '=' );
			if ( false === $eq ) {
				$flags[ $body ] = true;
			} else {
				$flags[ substr( $body, 0, $eq ) ] = substr( $body, $eq + 1 );
			}
		} else {
			$positional[] = $arg;
		}
	}

	return array( $positional, $flags );
}

/**
 * Print the top-level usage text.
 *
 * @return void
 */
function cli_print_usage(): void {
	$lines = array(
		'071-cli -- a wp-cli-style CLI for WordPress 0.71',
		'',
		'Usage: 071 <group> <verb> [args] [--flags]',
		'',
		'Groups and verbs:',
		'  post      list | get <id> | create | update <id> | delete <id>',
		'  user      list | get <id> | create | update <id> | delete <id>',
		'  category  list | get <id> | create | delete <id>',
		'  comment   list | get <id> | delete <id>',
		'  link      list | get <id> | create | delete <id>',
		'  option    list | get <name> | set <name> <value>',
		'  db        query <sql> | tables',
		'',
		'Global flags:',
		'  --format=table|json|csv|count|ids   output format (default: table)',
		'  --fields=<a,b,c>                    restrict columns shown',
		'  --path=<dir>                        WordPress 0.71 install path',
		'  --dbhost / --dbname / --dbuser / --dbpass   database overrides',
		'  --help                              show help for a group or verb',
		'',
		'Examples:',
		'  071 post list --fields=ID,post_title,post_status',
		'  071 post get 1 --format=json',
		'  071 option get posts_per_page',
		'  071 db query "SELECT COUNT(*) FROM b2posts"',
	);

	fwrite( STDOUT, implode( "\n", $lines ) . "\n" );
}

/**
 * Application entry point.
 *
 * @param array<int, string> $argv Raw argv including the script name.
 * @return int Process exit code.
 */
function cli_main( array $argv ): int {
	$args = array_slice( $argv, 1 );

	list( $positional, $flags ) = cli_parse_args( $args );

	$group = $positional[0] ?? '';
	$verb  = $positional[1] ?? '';

	// EN: `071`, `071 --help` and `071 help` all show top-level usage.
	// JA: `071`・`071 --help`・`071 help` はすべてトップレベルの使い方を表示。
	if ( '' === $group || 'help' === $group || ( isset( $flags['help'] ) && '' === $group ) ) {
		cli_print_usage();
		return 0;
	}

	$groups = array( 'post', 'user', 'category', 'comment', 'link', 'option', 'db' );

	if ( ! in_array( $group, $groups, true ) ) {
		fwrite( STDERR, "Error: unknown command group '$group'.\n\n" );
		cli_print_usage();
		return 1;
	}

	$module = __DIR__ . '/commands/' . $group . '.php';
	if ( ! is_file( $module ) ) {
		cli_fail( "command module for '$group' not found." );
	}
	require_once $module;

	$handler = 'cli_cmd_' . $group;
	if ( ! function_exists( $handler ) ) {
		cli_fail( "command handler '$handler' not defined." );
	}

	// EN: db / option commands take a name or SQL string, not numeric ids;
	//     every group receives the remaining positionals after <group> <verb>.
	// JA: db / option コマンドは数値 id ではなく名前や SQL 文字列を取る。
	//     各グループは <group> <verb> 以降の残りの位置引数を受け取る。
	$rest = array_slice( $positional, 2 );

	return (int) $handler( $verb, $rest, $flags );
}

exit( cli_main( $argv ) );
