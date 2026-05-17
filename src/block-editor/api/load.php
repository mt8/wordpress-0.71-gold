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
 *
 *     Issue #96 adds a "new post" mode: when the request has no usable post id
 *     (no `post` parameter, or `post=new`), this endpoint returns an empty
 *     post shape (id 0, blank title / content, draft status) together with the
 *     category list, so the editor can render its sidebar without loading an
 *     existing row.
 * JA: Issue #65 の実験的試作。WordPress 0.71 の投稿の post_content を生のまま
 *     JSON で返す。カスタムブロックエディタはそれを解析してブロックツリーに
 *     する。使い方: GET load.php?post=ID
 *
 *     Issue #79 では応答に post_status・post_category・カテゴリー一覧を
 *     追加し、エディタの設定サイドバーがステータス操作とカテゴリー
 *     セレクタを提供できるようにする。
 *
 *     Issue #96 で「新規投稿」モードを追加する。リクエストに有効な投稿 ID が
 *     無い場合(`post` パラメータ無し、または `post=new`)、本エンドポイントは
 *     空の投稿の形(id 0・空の title / content・draft ステータス)を
 *     カテゴリー一覧とともに返し、エディタが既存行を読み込まずにサイドバーを
 *     描画できるようにする。
 *
 * @package wordpress-0.71-gold
 */

require_once __DIR__ . '/bootstrap.php';

be_require_login();

// EN: Cast the post id to int -- it is used unquoted in SQL. This is the
//     same hardening applied across the codebase in Issue #31. A missing
//     parameter or a non-positive id (including post=new, which casts to 0)
//     selects the Issue #96 "new post" mode.
// JA: 投稿 ID を整数にキャスト -- SQL でクォート無しで使う。Issue #31 で
//     コードベース全体に適用したのと同じ堅牢化である。パラメータ無し、または
//     正でない ID(0 にキャストされる post=new を含む)は Issue #96 の
//     「新規投稿」モードを選択する。
$post_id = isset( $_GET['post'] ) ? (int) $_GET['post'] : 0;
$is_new  = ( $post_id <= 0 );

// EN: The category list for the settings-sidebar selector. b2categories has
//     just two columns -- cat_ID and cat_name (see wp-install.php). cat_ID 0
//     ("General") is the default bucket, so it is kept in the list. Both the
//     existing-post and the new-post response carry this list.
// JA: 設定サイドバーのセレクタ用カテゴリー一覧。b2categories は cat_ID と
//     cat_name の 2 カラムのみ(wp-install.php 参照)。cat_ID 0("General")は
//     既定の振り分け先なので一覧に残す。既存投稿・新規投稿どちらの応答にも
//     この一覧を載せる。
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

// EN: New-post mode -- return an empty post shape. The editor starts with no
//     blocks and an empty title; the default category is the lowest cat_ID
//     present (b2's seeded "General" category, normally id 1, falling back to
//     0 if the table is somehow empty). The status defaults to draft so a
//     half-written new post is not published before the author intends it.
// JA: 新規投稿モード -- 空の投稿の形を返す。エディタはブロック無し・空の
//     タイトルで始まる。既定カテゴリーは存在する最小の cat_ID(b2 が初期
//     投入する "General" カテゴリー。通常は id 1。テーブルが空の場合は 0 に
//     フォールバック)。ステータスは draft を既定とし、書きかけの新規投稿が
//     作者の意図より前に公開されないようにする。
if ( $is_new ) {
	$default_category = ( ! empty( $categories ) ) ? (int) $categories[0]['id'] : 0;

	be_json(
		200,
		array(
			'id'         => 0,
			'title'      => '',
			'content'    => '',
			'status'     => 'draft',
			'category'   => $default_category,
			'categories' => $categories,
			'isNew'      => true,
		)
	);
}

$post = get_postdata( $post_id );

if ( ! $post ) {
	be_json( 404, array( 'error' => 'post_not_found' ) );
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
		'isNew'      => false,
	)
);
