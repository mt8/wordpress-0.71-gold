<?php
/**
 * PHP 7/8 compatibility shim / PHP 7/8 互換レイヤー
 *
 * EN: WordPress 0.71 uses functions that were removed in PHP 7.0 / 8.0. This
 *     file reimplements them so the legacy code runs unchanged on PHP 8.3.
 *     It is loaded via PHP's auto_prepend_file directive so that it runs before
 *     every script, regardless of each entry point's include order.
 * JA: WordPress 0.71 は PHP 7.0 / 8.0 で廃止された関数を使用する。本ファイルは
 *     それらを再実装し、レガシーコードを無改修のまま PHP 8.3 上で動作させる。
 *     各エントリポイントの include 順に依存しないよう、PHP の auto_prepend_file
 *     指令で全スクリプトの前に読み込む。
 */

if (!function_exists('get_magic_quotes_gpc')) {
	// EN: Magic quotes were disabled by default from PHP 5.4 and the function
	//     was removed in PHP 8.0. From PHP 5.4 on it always reported "off", so
	//     return false; callers then take their "add slashes manually" branch,
	//     exactly as on a magic-quotes-off server.
	// JA: マジッククォートは PHP 5.4 以降は既定で無効となり、関数自体は PHP 8.0
	//     で廃止された。PHP 5.4 以降は常に「無効」を返していたため false を返す。
	//     呼び出し側は「手動でスラッシュを付与する」分岐を通り、マジック
	//     クォート無効のサーバーと完全に同じ挙動になる。
	function get_magic_quotes_gpc() {
		return false;
	}
}

if (!function_exists('ereg')) {
	// EN: The POSIX regex functions (ereg/eregi/ereg_replace/eregi_replace) were
	//     removed in PHP 7.0. They are reimplemented over PCRE below. POSIX ERE
	//     patterns used by WordPress 0.71 are simple enough to run as PCRE.
	// JA: POSIX 正規表現関数(ereg/eregi/ereg_replace/eregi_replace)は PHP 7.0 で
	//     廃止された。以下で PCRE 上に再実装する。WordPress 0.71 が使う POSIX ERE
	//     パターンは十分単純で、そのまま PCRE として動作する。

	/**
	 * EN: Wrap a POSIX ERE pattern as a PCRE pattern. The pattern is delimited
	 *     with "~"; any "~" inside the pattern is escaped first.
	 * JA: POSIX ERE パターンを PCRE パターンとして包む。デリミタは "~" とし、
	 *     パターン中の "~" は先にエスケープする。
	 */
	function _ereg_to_pcre($pattern, $flags = '') {
		return '~' . str_replace('~', '\\~', (string) $pattern) . '~' . $flags;
	}

	function ereg($pattern, $string, &$regs = null) {
		$matched = @preg_match(_ereg_to_pcre($pattern), (string) $string, $m);
		if (func_num_args() > 2) {
			$regs = $m;
		}
		// EN: POSIX ereg() returned the match length (>= 1) or false.
		// JA: POSIX の ereg() は一致長(1 以上)または false を返した。
		return $matched ? (strlen($m[0]) ?: 1) : false;
	}

	function eregi($pattern, $string, &$regs = null) {
		$matched = @preg_match(_ereg_to_pcre($pattern, 'i'), (string) $string, $m);
		if (func_num_args() > 2) {
			$regs = $m;
		}
		return $matched ? (strlen($m[0]) ?: 1) : false;
	}

	function ereg_replace($pattern, $replacement, $string) {
		$result = @preg_replace(_ereg_to_pcre($pattern), $replacement, (string) $string);
		// EN: On a pattern PCRE rejects, preg_replace() returns null; fall back
		//     to the unmodified string so the caller does not get null.
		// JA: PCRE が拒否するパターンでは preg_replace() が null を返す。呼び出し
		//     側に null を渡さないよう、未変更の文字列にフォールバックする。
		return ($result === null) ? (string) $string : $result;
	}

	function eregi_replace($pattern, $replacement, $string) {
		$result = @preg_replace(_ereg_to_pcre($pattern, 'i'), $replacement, (string) $string);
		return ($result === null) ? (string) $string : $result;
	}
}

if (!function_exists('each')) {
	// EN: each() was removed in PHP 8.0. It returned the key/value pair at the
	//     array's internal pointer (as [0/'key', 1/'value']) and advanced the
	//     pointer, or false at the end. Reimplemented with key()/current()/
	//     next(), which still exist.
	// JA: each() は PHP 8.0 で廃止された。配列の内部ポインタ位置のキー/値の組を
	//     ([0/'key', 1/'value'] の形で)返してポインタを進め、末尾では false を
	//     返す関数。現存する key()/current()/next() で再実装する。
	function each(&$array) {
		$key = key($array);
		if ($key === null) {
			return false;
		}
		$value = current($array);
		next($array);
		return array(1 => $value, 'value' => $value, 0 => $key, 'key' => $key);
	}
}
