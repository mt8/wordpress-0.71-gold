<?php
/**
 * Block-editor prototype -- UPLOAD an image.
 *
 * EN: Issue #93 experimental prototype. A JSON sibling of load.php / save.php
 *     that lets the block editor's Image block upload a file. It accepts a
 *     multipart/form-data POST with one image field ("file"), stores the file
 *     under WordPress 0.71's configured upload directory ($fileupload_realpath,
 *     set to src/images/ -- which Docker serves and bin/static-export.php
 *     captures), and responds { id, url, alt }.
 *
 *     WordPress 0.71 has no REST API and no media table, so Gutenberg's
 *     standard wp/v2/media path cannot be used. Instead this endpoint reuses:
 *       - bootstrap.php's be_require_login() cookie auth (same trust source as
 *         load.php / save.php), and
 *       - wp-admin/b2upload.php's audited file-name hardening verbatim
 *         (basename() + [^A-Za-z0-9._-] allow-list, repeated-dot collapse,
 *         exact final-extension allow-list match, realpath() destination
 *         check). That code already passed the security audit (Issues
 *         #31-#37); it is not re-derived here.
 *
 *     Usage: POST upload.php with Content-Type multipart/form-data and a
 *     "file" field.
 * JA: Issue #93 の実験的試作。load.php / save.php と並ぶ JSON エンドポイントで、
 *     ブロックエディタの画像ブロックがファイルをアップロードできるようにする。
 *     画像フィールド("file")を 1 つ持つ multipart/form-data の POST を受け取り、
 *     WordPress 0.71 の設定済みアップロードディレクトリ($fileupload_realpath、
 *     src/images/ に設定 -- Docker が配信し bin/static-export.php が取り込む)
 *     配下にファイルを保存し、{ id, url, alt } を返す。
 *
 *     WordPress 0.71 には REST API もメディアテーブルも無いため、Gutenberg
 *     標準の wp/v2/media 経路は使えない。代わりに本エンドポイントは次を再利用
 *     する:
 *       - bootstrap.php の be_require_login() のクッキー認証(load.php /
 *         save.php と同じ信頼源)、および
 *       - wp-admin/b2upload.php の監査済みファイル名堅牢化をそのまま
 *         (basename() + [^A-Za-z0-9._-] 許可リスト、連続ドット圧縮、
 *         最終拡張子の厳密な許可リスト一致、realpath() による保存先確認)。
 *         このコードは既にセキュリティ監査(Issue #31-#37)を通過しており、
 *         ここで再考案はしない。
 *
 *     使い方: Content-Type multipart/form-data と "file" フィールドを持つ
 *     POST を upload.php へ送る。
 *
 * @package wordpress-0.71-gold
 */

require_once __DIR__ . '/bootstrap.php';

$current_user = be_require_login();

if ( 'POST' !== ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '' ) ) {
	be_json( 405, array( 'error' => 'method_not_allowed' ) );
}

// EN: Honour b2config.php's $use_fileupload switch -- the same guard the
//     classic b2upload.php applies. The block editor does not invent its own
//     enablement flag; it reuses the one the administrator already set.
// JA: b2config.php の $use_fileupload スイッチに従う -- 古典的な b2upload.php と
//     同じガード。ブロックエディタは独自の有効化フラグを設けず、管理者が既に
//     設定したものを再利用する。
if ( empty( $use_fileupload ) ) {
	be_json( 403, array( 'error' => 'fileupload_disabled' ) );
}

// EN: One image field, named "file" (the editor's mediaUpload posts it under
//     that name). PHP populates $_FILES from the multipart body.
// JA: 画像フィールドは 1 つ、名前は "file"(エディタの mediaUpload はこの名前で
//     POST する)。PHP は multipart ボディから $_FILES を埋める。
if ( ! isset( $_FILES['file'] ) || ! is_array( $_FILES['file'] ) ) {
	be_json( 400, array( 'error' => 'no_file' ) );
}

$file = $_FILES['file'];

// EN: A successful upload reports UPLOAD_ERR_OK; anything else (size limit,
//     partial upload, no temp dir, ...) is a failure.
// JA: アップロード成功時は UPLOAD_ERR_OK を報告する。それ以外(サイズ上限・
//     部分アップロード・一時ディレクトリ無しなど)は失敗である。
if ( ! isset( $file['error'] ) || UPLOAD_ERR_OK !== (int) $file['error'] ) {
	be_json( 400, array( 'error' => 'upload_failed' ) );
}

// EN: Confirm the temp path really is a PHP upload (not an attacker-supplied
//     path). is_uploaded_file() is the canonical guard before any file move.
// JA: 一時パスが本当に PHP のアップロードであること(攻撃者が指定したパスで
//     ないこと)を確認する。is_uploaded_file() はファイル移動前の標準的ガード。
$tmp_name = isset( $file['tmp_name'] ) ? (string) $file['tmp_name'] : '';

if ( '' === $tmp_name || ! is_uploaded_file( $tmp_name ) ) {
	be_json( 400, array( 'error' => 'upload_failed' ) );
}

// EN: Enforce b2config.php's size limit ($fileupload_maxk, in KB) server-side.
// JA: b2config.php のサイズ上限($fileupload_maxk、KB 単位)をサーバー側で強制する。
$size_bytes = isset( $file['size'] ) ? (int) $file['size'] : 0;
$max_bytes  = (int) $fileupload_maxk * 1024;

if ( $size_bytes <= 0 || $size_bytes > $max_bytes ) {
	be_json( 413, array( 'error' => 'file_too_large' ) );
}

// ---------------------------------------------------------------------------
// EN: File-name hardening -- reused verbatim from wp-admin/b2upload.php (the
//     code audited in Issues #31-#37). Sanitise the user-supplied file name
//     before it is used in any path. basename() strips directory components
//     (e.g. "../../etc/passwd"), then we keep only a safe character set so the
//     saved file can never escape $fileupload_realpath (path-traversal
//     defence).
// JA: ファイル名の堅牢化 -- wp-admin/b2upload.php(Issue #31-#37 で監査済みの
//     コード)からそのまま再利用する。パスに使う前にユーザー指定のファイル名を
//     サニタイズする。basename() でディレクトリ部分(例 "../../etc/passwd")を
//     除去し、安全な文字種のみを残すことで、保存ファイルが $fileupload_realpath
//     の外へ出られないようにする(パストラバーサル対策)。
// ---------------------------------------------------------------------------
$img1_name = isset( $file['name'] ) ? (string) $file['name'] : '';
$img1_name = basename( $img1_name );
$img1_name = preg_replace( '~[^A-Za-z0-9._-]~', '_', $img1_name );
$img1_name = preg_replace( '~\.+~', '.', $img1_name ); // collapse repeated dots
$img1_name = trim( $img1_name, '.' );                  // no leading/trailing dot
if ( '' === $img1_name || null === $img1_name ) {
	be_json( 400, array( 'error' => 'invalid_file_name' ) );
}

// EN: Derive the extension from the *sanitised* name (the final segment after
//     the last dot) and require an exact, per-extension match against the
//     configured allow-list. A loose substring preg_match would let
//     "evil.php.jpg" or "x.phpjpg" through; only the final extension decides,
//     and a name with no extension is rejected.
// JA: 拡張子はサニタイズ後の名前(最後のドット以降の最終要素)から取得し、
//     設定された許可リストと拡張子単位で厳密に一致させる。緩い部分一致の
//     preg_match では "evil.php.jpg" や "x.phpjpg" を通してしまうため、判定
//     するのは最終拡張子のみ。拡張子の無い名前は拒否する。
$imgtype = explode( '.', $img1_name );
$ext     = ( count( $imgtype ) > 1 ) ? strtolower( end( $imgtype ) ) : '';
$allowed = array_filter( array_map( 'trim', explode( ' ', strtolower( $fileupload_allowedtypes ) ) ), 'strlen' );
if ( '' === $ext || ! in_array( $ext, $allowed, true ) ) {
	be_json( 400, array( 'error' => 'disallowed_type' ) );
}

$pathtofile = $fileupload_realpath . '/' . $img1_name;

// EN: Defence in depth -- the file name is already sanitised above, but verify
//     the resolved destination directory is exactly the configured upload
//     directory before any file is written. If it is not, abort.
// JA: 多層防御 -- ファイル名は上でサニタイズ済みだが、ファイル書き込み前に
//     解決後の保存先ディレクトリが設定どおりのアップロードディレクトリと完全に
//     一致することを確認する。一致しなければ中止する。
$dest_dir = realpath( dirname( $pathtofile ) );
$base_dir = realpath( $fileupload_realpath );
if ( false === $dest_dir || false === $base_dir || $dest_dir !== $base_dir ) {
	be_json( 500, array( 'error' => 'invalid_destination' ) );
}

// EN: Avoid overwriting an existing file -- rename duplicates with a numeric
//     suffix, the same behaviour as b2upload.php.
// JA: 既存ファイルの上書きを避ける -- b2upload.php と同じく、重複は数字
//     サフィックスでリネームする。
$final_name = $img1_name;
$pathtofile = $fileupload_realpath . '/' . $final_name;
$stem       = ( '' !== $ext ) ? substr( $img1_name, 0, strlen( $img1_name ) - strlen( $ext ) - 1 ) : $img1_name;
$counter    = 1;
while ( file_exists( $pathtofile ) ) {
	$final_name = $stem . '_' . zeroise( $counter, 2 ) . '.' . $ext;
	$pathtofile = $fileupload_realpath . '/' . $final_name;
	++$counter;
}

// EN: move_uploaded_file() is the canonical, safe move for a PHP upload; it
//     also re-checks that $tmp_name is a genuine uploaded file.
// JA: move_uploaded_file() は PHP アップロードの標準的で安全な移動手段であり、
//     $tmp_name が本物のアップロードファイルであることも再確認する。
if ( ! move_uploaded_file( $tmp_name, $pathtofile ) ) {
	be_json( 500, array( 'error' => 'move_failed' ) );
}

// EN: The upload directory only needs to be readable by the web server so the
//     file is served; 0644 on the file is sufficient. chmod 777 is NOT needed.
// JA: アップロードディレクトリはファイルが配信されるよう Web サーバーが読めれば
//     よく、ファイルは 0644 で十分。chmod 777 は不要。
@chmod( $pathtofile, 0644 );

// EN: WordPress 0.71 has no media table, so there is no real attachment id.
//     Return a synthetic, stable-per-name id derived from the final file name
//     (crc32) so the Image block has a non-zero numeric id to key on.
// JA: WordPress 0.71 にはメディアテーブルが無いため実体の添付 ID は存在しない。
//     最終ファイル名から導出した合成 ID(crc32、名前ごとに安定)を返し、画像
//     ブロックが鍵にできる非ゼロの数値 ID を持てるようにする。
$synthetic_id = crc32( $final_name );

be_json(
	200,
	array(
		'id'  => $synthetic_id,
		'url' => $fileupload_url . '/' . $final_name,
		'alt' => '',
	)
);
