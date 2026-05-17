<?php
/**
 * 071-cli -- shared helpers for the command modules.
 *
 * EN: Small utilities used by more than one command group: argument lookup,
 *     id validation, and the assoc-data extraction used by create / update.
 * JA: 複数のコマンドグループで使う小さなユーティリティ群: 引数の取得、id の
 *     検証、create / update が使う連想データの抽出。
 *
 * @package 071-cli
 */

declare(strict_types=1);

/**
 * Require a positional argument, failing with a clear message when absent.
 *
 * @param array<int, string> $args  Positional arguments after `<group> <verb>`.
 * @param int                $index Zero-based index into $args.
 * @param string             $label Human label for the missing argument.
 * @return string
 */
function cli_require_arg( array $args, int $index, string $label ): string {
	if ( ! isset( $args[ $index ] ) || '' === $args[ $index ] ) {
		cli_fail( "missing required argument: $label." );
	}

	return $args[ $index ];
}

/**
 * Require a positive integer id argument.
 *
 * @param array<int, string> $args  Positional arguments.
 * @param int                $index Zero-based index into $args.
 * @return int
 */
function cli_require_id( array $args, int $index = 0 ): int {
	$raw = cli_require_arg( $args, $index, 'id' );

	if ( ! preg_match( '/^[0-9]+$/', $raw ) || (int) $raw <= 0 ) {
		cli_fail( "invalid id '$raw' -- expected a positive integer." );
	}

	return (int) $raw;
}

/**
 * Collect the field=value pairs supplied as flags for create / update.
 *
 * EN: Global flags (format, fields, path, db*) and --help are excluded; every
 *     other --key=value flag is treated as a column assignment.
 * JA: グローバルフラグ(format・fields・path・db*)と --help は除外し、それ以外の
 *     --key=value フラグはカラム代入として扱う。
 *
 * @param array<string, string|bool> $flags    Parsed global flags.
 * @param array<int, string>         $allowed  Column names accepted for the
 *                                             target table.
 * @return array<string, string> Column => value pairs.
 */
function cli_data_from_flags( array $flags, array $allowed ): array {
	$reserved = array( 'format', 'fields', 'path', 'help', 'dbhost', 'dbname', 'dbuser', 'dbpass' );
	$data     = array();

	foreach ( $flags as $key => $value ) {
		if ( in_array( $key, $reserved, true ) ) {
			continue;
		}
		if ( ! in_array( $key, $allowed, true ) ) {
			cli_fail( "unknown field '--$key'. Accepted: " . implode( ', ', $allowed ) . '.' );
		}
		// EN: A bare boolean flag (no =value) is treated as an empty string.
		// JA: 値の無い素の真偽値フラグは空文字列として扱う。
		$data[ $key ] = is_string( $value ) ? $value : '';
	}

	return $data;
}

/**
 * Build an escaped `col = 'value'` SET clause for an UPDATE statement.
 *
 * @param wpdb                   $wpdb The database handle.
 * @param array<string, string>  $data Column => value pairs.
 * @return string The SET clause body (no leading "SET").
 */
function cli_build_set( wpdb $wpdb, array $data ): string {
	$parts = array();
	foreach ( $data as $col => $value ) {
		$parts[] = $col . " = '" . $wpdb->escape( $value ) . "'";
	}

	return implode( ', ', $parts );
}

/**
 * Build escaped column-list / value-list fragments for an INSERT statement.
 *
 * @param wpdb                  $wpdb The database handle.
 * @param array<string, string> $data Column => value pairs.
 * @return array{0: string, 1: string} [columns, values] fragments.
 */
function cli_build_insert( wpdb $wpdb, array $data ): array {
	$cols   = array();
	$values = array();
	foreach ( $data as $col => $value ) {
		$cols[]   = $col;
		$values[] = "'" . $wpdb->escape( $value ) . "'";
	}

	return array( implode( ', ', $cols ), implode( ', ', $values ) );
}
