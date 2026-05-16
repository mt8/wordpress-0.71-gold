<?php
/**
 * Block-editor prototype -- shared backend bootstrap.
 *
 * EN: Issue #65 experimental prototype. This file is the shared bootstrap for
 *     the two JSON endpoints (load.php / save.php) used by the custom block
 *     editor built on @wordpress/block-editor. It is intentionally NOT part
 *     of the 2003 b2/cafelog code path: it is a thin, modern, JSON-only
 *     backend layered on top of WordPress 0.71's existing database.
 * JA: Issue #65 の実験的試作。本ファイルは @wordpress/block-editor で作った
 *     カスタムブロックエディタが使う 2 つの JSON エンドポイント
 *     (load.php / save.php)の共通ブートストラップである。2003 年の
 *     b2/cafelog のコードパスには意図的に含めない。WordPress 0.71 の既存
 *     データベースの上に載せた、薄くモダンな JSON 専用バックエンドである。
 *
 * @package wordpress-0.71-gold
 */

// EN: This whole directory is an experimental prototype (Issue #65); it is
//     deliberately excluded from phpcs / phpstan in the project config.
// JA: このディレクトリ全体が実験的試作(Issue #65)であり、プロジェクト設定で
//     phpcs / phpstan の対象から意図的に除外している。

/**
 * Send a JSON response and stop.
 *
 * @param int   $status HTTP status code.
 * @param array $body   Response payload.
 */
function be_json( $status, $body ) {
	header( 'Content-Type: application/json; charset=utf-8' );
	http_response_code( $status );
	echo json_encode( $body );
	exit;
}

// EN: WordPress 0.71's config + database layer. b2config.php ends by
//     require_once-ing wp-db.php, which connects and exposes $wpdb. The
//     prototype reuses exactly that connection -- no new DB credentials.
// JA: WordPress 0.71 の設定 + データベース層。b2config.php は最後に
//     wp-db.php を require_once し、接続して $wpdb を公開する。試作は
//     その接続をそのまま再利用する -- 新しい DB 認証情報は持たない。
require_once __DIR__ . '/../b2config.php';
require_once $abspath . $b2inc . '/b2template.functions.php';
require_once $abspath . $b2inc . '/b2functions.php';

/**
 * Verify that the request comes from a logged-in WordPress 0.71 user.
 *
 * EN: Reuses 0.71's own cookie auth (the 'wordpressuser' / 'wordpresspass'
 *     cookies and the b2users table). This is the same trust source as
 *     b2verifauth.php; here a failure returns JSON 401 instead of an HTML
 *     redirect, because the caller is a fetch() from the editor.
 * JA: 0.71 自身のクッキー認証('wordpressuser' / 'wordpresspass' クッキーと
 *     b2users テーブル)を再利用する。b2verifauth.php と同じ信頼源だが、
 *     呼び出し元がエディタからの fetch() であるため、失敗時は HTML
 *     リダイレクトではなく JSON 401 を返す。
 *
 * @return object The authenticated user row from b2users.
 */
function be_require_login() {
	global $wpdb, $tableusers;

	$cookie_user = isset( $_COOKIE['wordpressuser'] ) ? (string) $_COOKIE['wordpressuser'] : '';
	$cookie_pass = isset( $_COOKIE['wordpresspass'] ) ? (string) $_COOKIE['wordpresspass'] : '';

	if ( '' === $cookie_user || '' === $cookie_pass ) {
		be_json( 401, array( 'error' => 'not_logged_in' ) );
	}

	$escaped = $wpdb->escape( $cookie_user );
	$user    = $wpdb->get_row( "SELECT * FROM $tableusers WHERE user_login = '$escaped'" );

	if ( ! $user || md5( $user->user_pass ) !== $cookie_pass ) {
		be_json( 401, array( 'error' => 'not_logged_in' ) );
	}

	return $user;
}
