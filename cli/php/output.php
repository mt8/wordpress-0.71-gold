<?php
/**
 * 071-cli -- output formatting.
 *
 * EN: Renders command results in the formats described in
 *     docs/071-tooling.md section 3.4: table (default), json, csv, count, ids.
 *     The --fields flag restricts which columns are shown.
 * JA: docs/071-tooling.md セクション 3.4 に記載の形式 -- table(既定)・json・
 *     csv・count・ids -- でコマンド結果を描画する。--fields フラグは表示する
 *     カラムを限定する。
 *
 * @package 071-cli
 */

declare(strict_types=1);

/**
 * Resolve the requested output format from the global flags.
 *
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return string One of: table, json, csv, count, ids.
 */
function cli_format( array $flags ): string {
	$format = isset( $flags['format'] ) && is_string( $flags['format'] )
		? strtolower( $flags['format'] )
		: 'table';

	$valid = array( 'table', 'json', 'csv', 'count', 'ids' );
	if ( ! in_array( $format, $valid, true ) ) {
		cli_fail( "unknown --format '$format'. Valid: " . implode( ', ', $valid ) . '.' );
	}

	return $format;
}

/**
 * Resolve the requested field list from the global flags.
 *
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return array<int, string>|null Field names, or null when --fields is absent.
 */
function cli_fields( array $flags ): ?array {
	if ( ! isset( $flags['fields'] ) || ! is_string( $flags['fields'] ) || '' === $flags['fields'] ) {
		return null;
	}

	$fields = array_map( 'trim', explode( ',', $flags['fields'] ) );

	return array_values( array_filter( $fields, static fn ( $f ) => '' !== $f ) );
}

/**
 * Convert a database row (object or array) to an associative array.
 *
 * @param object|array<string, mixed> $row Row from $wpdb.
 * @return array<string, mixed>
 */
function cli_row_to_array( $row ): array {
	if ( is_object( $row ) ) {
		return get_object_vars( $row );
	}

	return $row;
}

/**
 * Render a list of rows in the requested format and return an exit code.
 *
 * EN: This is the single rendering path for every list-style command.
 * JA: すべての一覧系コマンドの単一の描画経路である。
 *
 * @param array<int, object|array<string, mixed>> $rows  Result rows.
 * @param array<string, string|bool>              $flags Parsed global flags.
 * @param array<int, string>|null                 $idKeyHint Field name to use
 *                                                          for the `ids`
 *                                                          format; null means
 *                                                          use the first column.
 * @return int Always 0.
 */
function cli_render( array $rows, array $flags, ?array $idKeyHint = null ): int {
	$format = cli_format( $flags );
	$fields = cli_fields( $flags );

	$normalised = array_map( 'cli_row_to_array', $rows );

	// EN: Determine the column set: explicit --fields, else the keys of the
	//     first row.
	// JA: カラム集合を決める: 明示的な --fields、無ければ最初の行のキー。
	if ( null !== $fields ) {
		$columns = $fields;
	} elseif ( count( $normalised ) > 0 ) {
		$columns = array_keys( $normalised[0] );
	} else {
		$columns = array();
	}

	$projected = array();
	foreach ( $normalised as $row ) {
		$out = array();
		foreach ( $columns as $col ) {
			$out[ $col ] = array_key_exists( $col, $row ) ? $row[ $col ] : '';
		}
		$projected[] = $out;
	}

	switch ( $format ) {
		case 'count':
			fwrite( STDOUT, count( $projected ) . "\n" );
			break;

		case 'ids':
			$idKey = ( null !== $idKeyHint && isset( $idKeyHint[0] ) ) ? $idKeyHint[0] : null;
			if ( null === $idKey && count( $columns ) > 0 ) {
				$idKey = $columns[0];
			}
			$ids = array();
			foreach ( $normalised as $row ) {
				if ( null !== $idKey && array_key_exists( $idKey, $row ) ) {
					$ids[] = (string) $row[ $idKey ];
				}
			}
			fwrite( STDOUT, implode( ' ', $ids ) . "\n" );
			break;

		case 'json':
			fwrite( STDOUT, json_encode( $projected, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . "\n" );
			break;

		case 'csv':
			cli_render_csv( $columns, $projected );
			break;

		case 'table':
		default:
			cli_render_table( $columns, $projected );
			break;
	}

	return 0;
}

/**
 * Render a single row (e.g. `get`) in the requested format.
 *
 * EN: For table format a single row is shown as a two-column field/value grid;
 *     other formats reuse cli_render with the row wrapped in a one-item list.
 * JA: table 形式では単一行を field/value の 2 カラムグリッドで表示する。
 *     他の形式は行を 1 件のリストに包んで cli_render を再利用する。
 *
 * @param object|array<string, mixed> $row   Single result row.
 * @param array<string, string|bool>  $flags Parsed global flags.
 * @return int Always 0.
 */
function cli_render_one( $row, array $flags ): int {
	$format = cli_format( $flags );

	if ( 'table' !== $format ) {
		return cli_render( array( $row ), $flags );
	}

	$assoc  = cli_row_to_array( $row );
	$fields = cli_fields( $flags );

	if ( null !== $fields ) {
		$filtered = array();
		foreach ( $fields as $f ) {
			$filtered[ $f ] = array_key_exists( $f, $assoc ) ? $assoc[ $f ] : '';
		}
		$assoc = $filtered;
	}

	$pairs = array();
	foreach ( $assoc as $key => $value ) {
		$pairs[] = array(
			'field' => (string) $key,
			'value' => cli_scalar( $value ),
		);
	}

	cli_render_table( array( 'field', 'value' ), $pairs );

	return 0;
}

/**
 * Coerce a cell value to a printable string.
 *
 * @param mixed $value Cell value.
 * @return string
 */
function cli_scalar( $value ): string {
	if ( null === $value ) {
		return '';
	}
	if ( is_bool( $value ) ) {
		return $value ? '1' : '0';
	}

	return (string) $value;
}

/**
 * Render an ASCII box table.
 *
 * @param array<int, string>                  $columns Column names.
 * @param array<int, array<string, mixed>>    $rows    Projected rows.
 * @return void
 */
function cli_render_table( array $columns, array $rows ): void {
	if ( count( $columns ) === 0 ) {
		fwrite( STDOUT, "(no results)\n" );
		return;
	}

	$widths = array();
	foreach ( $columns as $col ) {
		$widths[ $col ] = cli_display_width( $col );
	}
	foreach ( $rows as $row ) {
		foreach ( $columns as $col ) {
			$cell           = cli_scalar( $row[ $col ] ?? '' );
			$widths[ $col ] = max( $widths[ $col ], cli_display_width( $cell ) );
		}
	}

	$border = '+';
	foreach ( $columns as $col ) {
		$border .= str_repeat( '-', $widths[ $col ] + 2 ) . '+';
	}

	$out = $border . "\n" . cli_table_row( $columns, $columns, $widths ) . "\n" . $border . "\n";

	foreach ( $rows as $row ) {
		$cells = array();
		foreach ( $columns as $col ) {
			$cells[] = cli_scalar( $row[ $col ] ?? '' );
		}
		$out .= cli_table_row( $columns, $cells, $widths ) . "\n";
	}

	$out .= $border . "\n";

	fwrite( STDOUT, $out );
}

/**
 * Format one table row with padded cells.
 *
 * @param array<int, string> $columns Column names (for ordering).
 * @param array<int, string> $cells   Cell values, indexed like $columns.
 * @param array<string, int> $widths  Column display widths.
 * @return string
 */
function cli_table_row( array $columns, array $cells, array $widths ): string {
	$line = '|';
	foreach ( $columns as $i => $col ) {
		$cell = isset( $cells[ $i ] ) ? cli_scalar( $cells[ $i ] ) : '';
		// EN: Collapse newlines so a multiline cell does not break the grid.
		// JA: 複数行セルがグリッドを崩さないよう改行を折り畳む。
		$cell  = str_replace( array( "\r\n", "\n", "\r" ), ' ', $cell );
		$pad   = $widths[ $col ] - cli_display_width( $cell );
		$line .= ' ' . $cell . str_repeat( ' ', max( 0, $pad ) ) . ' |';
	}

	return $line;
}

/**
 * Display width of a string, counting wide (CJK) characters as two columns.
 *
 * @param string $text Text to measure.
 * @return int
 */
function cli_display_width( string $text ): int {
	$width = 0;
	$len   = mb_strlen( $text, 'UTF-8' );
	for ( $i = 0; $i < $len; $i++ ) {
		$char = mb_substr( $text, $i, 1, 'UTF-8' );
		$code = mb_ord( $char, 'UTF-8' );
		if ( false !== $code && cli_is_wide( $code ) ) {
			$width += 2;
		} else {
			++$width;
		}
	}

	return $width;
}

/**
 * Whether a Unicode codepoint occupies two terminal columns.
 *
 * @param int $code Unicode codepoint.
 * @return bool
 */
function cli_is_wide( int $code ): bool {
	return ( $code >= 0x1100 && $code <= 0x115F )
		|| ( $code >= 0x2E80 && $code <= 0x303E )
		|| ( $code >= 0x3041 && $code <= 0x33FF )
		|| ( $code >= 0x3400 && $code <= 0x4DBF )
		|| ( $code >= 0x4E00 && $code <= 0x9FFF )
		|| ( $code >= 0xA000 && $code <= 0xA4CF )
		|| ( $code >= 0xAC00 && $code <= 0xD7A3 )
		|| ( $code >= 0xF900 && $code <= 0xFAFF )
		|| ( $code >= 0xFE30 && $code <= 0xFE4F )
		|| ( $code >= 0xFF00 && $code <= 0xFF60 )
		|| ( $code >= 0xFFE0 && $code <= 0xFFE6 )
		|| ( $code >= 0x20000 && $code <= 0x3FFFD );
}

/**
 * Render rows as CSV (RFC 4180-style quoting).
 *
 * @param array<int, string>               $columns Column names.
 * @param array<int, array<string, mixed>> $rows    Projected rows.
 * @return void
 */
function cli_render_csv( array $columns, array $rows ): void {
	$out = cli_csv_line( $columns );
	foreach ( $rows as $row ) {
		$cells = array();
		foreach ( $columns as $col ) {
			$cells[] = cli_scalar( $row[ $col ] ?? '' );
		}
		$out .= cli_csv_line( $cells );
	}

	fwrite( STDOUT, $out );
}

/**
 * Format one CSV line, quoting fields that need it.
 *
 * @param array<int, string> $cells Cell values.
 * @return string CSV line, with trailing newline.
 */
function cli_csv_line( array $cells ): string {
	$escaped = array();
	foreach ( $cells as $cell ) {
		$value = cli_scalar( $cell );
		if ( preg_match( '/[",\r\n]/', $value ) ) {
			$value = '"' . str_replace( '"', '""', $value ) . '"';
		}
		$escaped[] = $value;
	}

	return implode( ',', $escaped ) . "\n";
}

/**
 * Print a success message to stdout.
 *
 * @param string $message Message text.
 * @return void
 */
function cli_success( string $message ): void {
	fwrite( STDOUT, "Success: $message\n" );
}
