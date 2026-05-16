<?php
/**
 * ext/mysql -> mysqli compatibility shim / ext/mysql -> mysqli 互換レイヤー
 *
 * EN: WordPress 0.71 uses the ext/mysql API (mysql_*), which was removed in
 *     PHP 7.0. This file reimplements the mysql_* functions actually used by
 *     the codebase as thin wrappers over mysqli, so the legacy call sites keep
 *     working unchanged on PHP 8.3.
 * JA: WordPress 0.71 は PHP 7.0 で廃止された ext/mysql API (mysql_*) を使用する。
 *     本ファイルはコードベースが実際に使用する mysql_* 関数を mysqli の薄い
 *     ラッパーとして再実装し、レガシーの呼び出し箇所を無改修のまま PHP 8.3 上で
 *     動作させる。
 */

if (!function_exists('mysql_connect')) {

	// EN: PHP 8.1+ makes mysqli throw exceptions on error by default. The
	//     legacy "... or die()" pattern expects a false return instead, so
	//     turn reporting off to restore that behavior.
	// JA: PHP 8.1 以降 mysqli は既定でエラー時に例外を送出する。レガシーの
	//     "... or die()" は false 返却を前提とするため、レポートを無効化して
	//     従来の挙動に戻す。
	if (function_exists('mysqli_report')) {
		mysqli_report(MYSQLI_REPORT_OFF);
	}

	/**
	 * EN: Store / retrieve the most recently opened link. ext/mysql let callers
	 *     omit the link argument and reused the last opened connection; mysqli
	 *     has no such implicit link, so the shim keeps it here.
	 * JA: 直近に開いた接続を保存・取得する。ext/mysql はリンク引数の省略を許し
	 *     最後に開いた接続を再利用したが、mysqli に暗黙のリンクは無いため、
	 *     シムがここで保持する。
	 */
	function _mysql_shim_link($link = null) {
		static $default = null;
		if ($link instanceof mysqli) {
			$default = $link;
		}
		return $default;
	}

	/**
	 * EN: Resolve the link to use: an explicit mysqli link if one was passed,
	 *     otherwise the stored default connection.
	 * JA: 使用するリンクを解決する。明示リンクが渡されていればそれを、無ければ
	 *     保存済みのデフォルト接続を返す。
	 */
	function _mysql_shim_resolve($link) {
		return ($link instanceof mysqli) ? $link : _mysql_shim_link();
	}

	function mysql_connect($hostname = null, $username = null, $password = null) {
		$link = @mysqli_connect($hostname, $username, $password);
		if ($link instanceof mysqli) {
			// EN: WordPress 0.71-era SQL (zero-date defaults, '' inserted into
			//     integer columns, ...) relies on the permissive behavior of
			//     2003-era MySQL. MySQL 8 defaults to a STRICT sql_mode that
			//     rejects it, so reset the session sql_mode to empty.
			// JA: WordPress 0.71 当時の SQL(ゼロ日付のデフォルト値、整数列への
			//     '' の挿入 等)は 2003 年頃の MySQL の寛容な挙動に依存する。
			//     MySQL 8 は既定で STRICT な sql_mode のためこれを拒否する。
			//     互換性のためセッションの sql_mode を空にリセットする。
			@mysqli_query($link, "SET SESSION sql_mode=''");
			_mysql_shim_link($link);
			return $link;
		}
		return false;
	}

	function mysql_select_db($database, $link = null) {
		$link = _mysql_shim_resolve($link);
		return ($link instanceof mysqli) ? mysqli_select_db($link, $database) : false;
	}

	function mysql_query($query, $link = null) {
		$link = _mysql_shim_resolve($link);
		return ($link instanceof mysqli) ? mysqli_query($link, $query) : false;
	}

	function mysql_error($link = null) {
		$link = _mysql_shim_resolve($link);
		return ($link instanceof mysqli) ? mysqli_error($link) : (string) mysqli_connect_error();
	}

	function mysql_errno($link = null) {
		$link = _mysql_shim_resolve($link);
		return ($link instanceof mysqli) ? mysqli_errno($link) : (int) mysqli_connect_errno();
	}

	function mysql_escape_string($string) {
		// EN: ext/mysql's mysql_escape_string took no link; use the default one.
		// JA: ext/mysql の mysql_escape_string はリンク不要。デフォルト接続を使う。
		$link = _mysql_shim_link();
		return ($link instanceof mysqli)
			? mysqli_real_escape_string($link, (string) $string)
			: addslashes((string) $string);
	}

	function mysql_affected_rows($link = null) {
		$link = _mysql_shim_resolve($link);
		return ($link instanceof mysqli) ? mysqli_affected_rows($link) : -1;
	}

	function mysql_insert_id($link = null) {
		$link = _mysql_shim_resolve($link);
		return ($link instanceof mysqli) ? mysqli_insert_id($link) : 0;
	}

	// EN: The result-set helpers below tolerate a non-result argument (false /
	//     null) and return false, because ext/mysql was lenient there whereas
	//     mysqli_* raises a TypeError on a bad argument under PHP 8.
	// JA: 以下の結果セット系は、結果以外(false / null)が渡されても false を返す。
	//     ext/mysql は寛容だったが、PHP 8 の mysqli_* は不正な引数で TypeError に
	//     なるため。
	function mysql_num_rows($result) {
		return ($result instanceof mysqli_result) ? mysqli_num_rows($result) : false;
	}

	function mysql_num_fields($result) {
		return ($result instanceof mysqli_result) ? mysqli_num_fields($result) : false;
	}

	function mysql_fetch_field($result) {
		return ($result instanceof mysqli_result) ? mysqli_fetch_field($result) : false;
	}

	function mysql_fetch_object($result) {
		return ($result instanceof mysqli_result) ? mysqli_fetch_object($result) : false;
	}

	function mysql_fetch_row($result) {
		return ($result instanceof mysqli_result) ? mysqli_fetch_row($result) : false;
	}

	function mysql_fetch_array($result) {
		return ($result instanceof mysqli_result) ? mysqli_fetch_array($result) : false;
	}

	function mysql_free_result($result) {
		if ($result instanceof mysqli_result) {
			mysqli_free_result($result);
			return true;
		}
		return false;
	}

	function mysql_list_tables($database, $link = null) {
		// EN: ext/mysql's mysql_list_tables has no mysqli equivalent; emulate it
		//     with "SHOW TABLES FROM", whose result mysql_fetch_row() can read.
		// JA: ext/mysql の mysql_list_tables に mysqli の同等関数は無い。
		//     "SHOW TABLES FROM" で代替し、結果は mysql_fetch_row() で読める。
		$link = _mysql_shim_resolve($link);
		if (!($link instanceof mysqli)) {
			return false;
		}
		$escaped = str_replace('`', '``', (string) $database);
		return mysqli_query($link, 'SHOW TABLES FROM `' . $escaped . '`');
	}

}
