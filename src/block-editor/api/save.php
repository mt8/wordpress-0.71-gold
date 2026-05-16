<?php
/**
 * Block-editor prototype -- SAVE a post's content.
 *
 * EN: Issue #65 experimental prototype. Accepts a JSON body
 *     { "post": ID, "content": "<!-- wp:* --> ...", "title": "..." } and
 *     writes the block markup into WordPress 0.71's existing post_content
 *     column. Because the `<!-- wp:* -->` delimiters are HTML comments, the
 *     0.71 front end keeps rendering the post normally. Usage: POST save.php
 *
 *     Issue #79 also accepts "status" (publish / draft / private) and
 *     "category" (a single cat_ID), persisting them to post_status and
 *     post_category so the editor's settings sidebar round-trips.
 * JA: Issue #65 の実験的試作。JSON ボディ
 *     { "post": ID, "content": "<!-- wp:* --> ...", "title": "..." } を受け取り、
 *     ブロックマークアップを WordPress 0.71 の既存 post_content カラムへ
 *     書き込む。`<!-- wp:* -->` 区切りは HTML コメントなので、0.71 の
 *     フロントエンドは投稿を通常どおり描画し続ける。使い方: POST save.php
 *
 *     Issue #79 では "status"(publish / draft / private)と "category"
 *     (単一の cat_ID)も受け取り、post_status / post_category へ保存して
 *     エディタの設定サイドバーが往復できるようにする。
 *
 * @package wordpress-0.71-gold
 */

require_once __DIR__ . '/bootstrap.php';

$current_user = be_require_login();

if ( 'POST' !== ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '' ) ) {
	be_json( 405, array( 'error' => 'method_not_allowed' ) );
}

// EN: The editor sends a JSON request body, not a classic form POST.
// JA: エディタは古典的なフォーム POST ではなく JSON のリクエストボディを送る。
$raw  = file_get_contents( 'php://input' );
$data = json_decode( $raw, true );

if ( ! is_array( $data ) ) {
	be_json( 400, array( 'error' => 'invalid_json' ) );
}

// EN: Cast the post id / category to int -- they are used unquoted in SQL
//     (Issue #31 style). The category is a single cat_ID: WordPress 0.71
//     posts belong to exactly one category (b2posts.post_category).
// JA: 投稿 ID / カテゴリーを整数にキャスト -- SQL でクォート無しで使う
//     (Issue #31 流)。カテゴリーは単一の cat_ID。WordPress 0.71 の投稿は
//     ちょうど 1 つのカテゴリーに属する(b2posts.post_category)。
$post_id  = isset( $data['post'] ) ? (int) $data['post'] : 0;
$content  = isset( $data['content'] ) ? (string) $data['content'] : '';
$title    = isset( $data['title'] ) ? (string) $data['title'] : '';
$category = isset( $data['category'] ) ? (int) $data['category'] : 0;

// EN: post_status is a fixed enumeration in 0.71's post editor (b2edit.form.php
//     offers exactly publish / draft / private). Reject anything else rather
//     than write an unknown value into the column.
// JA: post_status は 0.71 の投稿エディタでは固定の列挙値(b2edit.form.php は
//     publish / draft / private のみ提供)。未知の値をカラムへ書かず拒否する。
$allowed_statuses = array( 'publish', 'draft', 'private' );
$status           = isset( $data['status'] ) ? (string) $data['status'] : 'publish';

if ( ! in_array( $status, $allowed_statuses, true ) ) {
	be_json( 400, array( 'error' => 'invalid_status' ) );
}

if ( $post_id <= 0 ) {
	be_json( 400, array( 'error' => 'invalid_post_id' ) );
}

$post = get_postdata( $post_id );

if ( ! $post ) {
	be_json( 404, array( 'error' => 'post_not_found' ) );
}

// EN: Ownership check -- mirrors b2edit.php's 'editpost' rule: a user may
//     edit a post only if they are its author, or their level is strictly
//     higher than the author's. The author comes from the stored post row.
// JA: 所有者チェック -- b2edit.php の 'editpost' の規則に倣う。投稿を編集
//     できるのはその投稿の作者本人、または作者よりレベルが厳密に高い
//     ユーザーのみ。作者は保存済み投稿行から取得する。
$author = get_userdata( (int) $post['Author_ID'] );

if ( (int) $post['Author_ID'] !== (int) $current_user->ID
	&& (int) $current_user->user_level <= (int) $author->user_level ) {
	be_json( 403, array( 'error' => 'forbidden' ) );
}

// EN: The chosen category must exist in b2categories. cat_ID is cast to int,
//     so the lookup is safe; rejecting an unknown id keeps post_category
//     referentially sane.
// JA: 選ばれたカテゴリーは b2categories に存在しなければならない。cat_ID は
//     整数にキャスト済みで照合は安全。未知の ID を拒否し post_category の
//     参照整合性を保つ。
$category_exists = $wpdb->get_var( "SELECT cat_ID FROM $tablecategories WHERE cat_ID = $category" );

if ( null === $category_exists ) {
	be_json( 400, array( 'error' => 'invalid_category' ) );
}

// EN: Escape for SQL the same way 0.71 does -- wpdb::escape() wraps
//     mysqli_real_escape_string(). No autobr / format_to_post() here: block
//     markup must be stored verbatim, byte-for-byte, or parse() breaks.
//     status is from a validated whitelist and category is (int)-cast.
// JA: 0.71 と同じ方法で SQL 用にエスケープ -- wpdb::escape() は
//     mysqli_real_escape_string() をラップする。ここでは autobr /
//     format_to_post() を使わない。ブロックマークアップはバイト単位で
//     そのまま保存しないと parse() が壊れるためである。status は検証済み
//     ホワイトリスト由来、category は (int) キャスト済み。
$escaped_content = $wpdb->escape( $content );
$escaped_title   = $wpdb->escape( $title );
$escaped_status  = $wpdb->escape( $status );

$query = "UPDATE $tableposts SET post_content = '$escaped_content', post_title = '$escaped_title', post_status = '$escaped_status', post_category = $category WHERE ID = $post_id";

$result = $wpdb->query( $query );

if ( false === $result ) {
	be_json( 500, array( 'error' => 'db_error' ) );
}

be_json(
	200,
	array(
		'ok'       => true,
		'id'       => $post_id,
		'content'  => $content,
		'title'    => $title,
		'status'   => $status,
		'category' => $category,
	)
);
