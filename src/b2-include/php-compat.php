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
