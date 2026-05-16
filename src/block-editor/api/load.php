<?php
/**
 * Block-editor prototype -- GET a post's content.
 *
 * EN: Issue #65 experimental prototype. Returns the raw post_content of a
 *     WordPress 0.71 post as JSON, so the custom block editor can parse it
 *     into a block tree. Usage: GET load.php?post=ID
 *
 *     Issue #79 extends the response with post_status, post_category and the
 *     full list of categories, so the editor's settings sidebar can offer a
 *     status control and a category selector.
 * JA: Issue #65 の実験的試作。WordPress 0.71 の投稿の post_content を生のまま
 *     JSON で返す。カスタムブロックエディタはそれを解析してブロックツリーに
 *     する。使い方: GET load.php?post=ID
 *
 *     Issue #79 では応答に post_status・post_category・カテゴリー一覧を
 *     追加し、エディタの設定サイドバーがステータス操作とカテゴリー
 *     セレクタを提供できるようにする。
 *
 * @package wordpress-0.71-gold
 */

require_once __DIR__ . '/bootstrap.php';

be_require_login();

// EN: Cast the post id to int -- it is used unquoted in SQL. This is the
//     same hardening applied across the codebase in Issue #31.
// JA: 投稿 ID を整数にキャスト -- SQL でクォート無しで使う。Issue #31 で
//     コードベース全体に適用したのと同じ堅牢化である。
$post_id = isset( $_GET['post'] ) ? (int) $_GET['post'] : 0;

if ( $post_id <= 0 ) {
	be_json( 400, array( 'error' => 'invalid_post_id' ) );
}

$post = get_postdata( $post_id );

if ( ! $post ) {
	be_json( 404, array( 'error' => 'post_not_found' ) );
}

// EN: The category list for the settings-sidebar selector. b2categories has
//     just two columns -- cat_ID and cat_name (see wp-install.php). cat_ID 0
//     ("General") is the default bucket, so it is kept in the list.
// JA: 設定サイドバーのセレクタ用カテゴリー一覧。b2categories は cat_ID と
//     cat_name の 2 カラムのみ(wp-install.php 参照)。cat_ID 0("General")は
//     既定の振り分け先なので一覧に残す。
$category_rows = $wpdb->get_results( "SELECT cat_ID, cat_name FROM $tablecategories ORDER BY cat_ID ASC" );

$categories = array();
if ( is_array( $category_rows ) ) {
	foreach ( $category_rows as $row ) {
		$categories[] = array(
			'id'   => (int) $row->cat_ID,
			'name' => stripslashes( (string) $row->cat_name ),
		);
	}
}

// EN: post_content / post_title are stored slash-escaped by 0.71's
//     format_to_post(); strip the slashes so the editor receives clean text.
//     status / category are the post's single post_status and post_category.
// JA: post_content / post_title は 0.71 の format_to_post() によりスラッシュ
//     付きで保存される。エディタへ綺麗なテキストを渡すためスラッシュを除去。
//     status / category は投稿の単一の post_status と post_category である。
be_json(
	200,
	array(
		'id'         => (int) $post['ID'],
		'title'      => stripslashes( (string) $post['Title'] ),
		'content'    => stripslashes( (string) $post['Content'] ),
		'status'     => (string) $post['post_status'],
		'category'   => (int) $post['Category'],
		'categories' => $categories,
	)
);
