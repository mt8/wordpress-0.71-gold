<?php
/**
 * Block-editor prototype -- UPLOAD an image.
 *
 * Issue #93 experimental prototype. A JSON sibling of load.php / save.php
 * that lets the block editor's Image block upload a file. It accepts a
 * multipart/form-data POST with one image field ("file"), stores the file
 * under a modern-WordPress-style wp-content/uploads/YYYY/MM/ tree (rooted
 * at $fileupload_realpath -- which Docker serves and bin/static-export.php
 * captures), and responds { id, url, alt }.
 *
 * WordPress 0.71 has no REST API and no media table, so Gutenberg's
 * standard wp/v2/media path cannot be used. Instead this endpoint reuses:
 *   - bootstrap.php's be_require_login() cookie auth (same trust source as
 *     load.php / save.php), and
 *   - wp-admin/b2upload.php's audited file-name hardening verbatim
 *     (basename() + [^A-Za-z0-9._-] allow-list, repeated-dot collapse,
 *     exact final-extension allow-list match, realpath() destination
 *     check). That code already passed the security audit (Issues
 *     #31-#37); it is not re-derived here.
 *
 * Usage: POST upload.php with Content-Type multipart/form-data and a
 * "file" field.
 *
 * @package wordpress-0.71-gold
 */

require_once __DIR__ . '/bootstrap.php';

$current_user = be_require_login();

if ( 'POST' !== ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '' ) ) {
	be_json( 405, array( 'error' => 'method_not_allowed' ) );
}

// Honour b2config.php's $use_fileupload switch -- the same guard the
// classic b2upload.php applies. The block editor does not invent its own
// enablement flag; it reuses the one the administrator already set.
if ( empty( $use_fileupload ) ) {
	be_json( 403, array( 'error' => 'fileupload_disabled' ) );
}

// One image field, named "file" (the editor's mediaUpload posts it under
// that name). PHP populates $_FILES from the multipart body.
if ( ! isset( $_FILES['file'] ) || ! is_array( $_FILES['file'] ) ) {
	be_json( 400, array( 'error' => 'no_file' ) );
}

$file = $_FILES['file'];

// A successful upload reports UPLOAD_ERR_OK; anything else (size limit,
// partial upload, no temp dir, ...) is a failure.
if ( ! isset( $file['error'] ) || UPLOAD_ERR_OK !== (int) $file['error'] ) {
	be_json( 400, array( 'error' => 'upload_failed' ) );
}

// Confirm the temp path really is a PHP upload (not an attacker-supplied
// path). is_uploaded_file() is the canonical guard before any file move.
$tmp_name = isset( $file['tmp_name'] ) ? (string) $file['tmp_name'] : '';

if ( '' === $tmp_name || ! is_uploaded_file( $tmp_name ) ) {
	be_json( 400, array( 'error' => 'upload_failed' ) );
}

// Enforce b2config.php's size limit ($fileupload_maxk, in KB) server-side.
$size_bytes = isset( $file['size'] ) ? (int) $file['size'] : 0;
$max_bytes  = (int) $fileupload_maxk * 1024;

if ( $size_bytes <= 0 || $size_bytes > $max_bytes ) {
	be_json( 413, array( 'error' => 'file_too_large' ) );
}

// ---------------------------------------------------------------------------
// File-name hardening -- reused verbatim from wp-admin/b2upload.php (the
// code audited in Issues #31-#37). Sanitise the user-supplied file name
// before it is used in any path. basename() strips directory components
// (e.g. "../../etc/passwd"), then we keep only a safe character set so the
// saved file can never escape $fileupload_realpath (path-traversal
// defence).
$img1_name = isset( $file['name'] ) ? (string) $file['name'] : '';
$img1_name = basename( $img1_name );
$img1_name = preg_replace( '~[^A-Za-z0-9._-]~', '_', $img1_name );
$img1_name = preg_replace( '~\.+~', '.', $img1_name ); // collapse repeated dots
$img1_name = trim( $img1_name, '.' );                  // no leading/trailing dot
if ( '' === $img1_name || null === $img1_name ) {
	be_json( 400, array( 'error' => 'invalid_file_name' ) );
}

// Derive the extension from the *sanitised* name (the final segment after
// the last dot) and require an exact, per-extension match against the
// configured allow-list. A loose substring preg_match would let
// "evil.php.jpg" or "x.phpjpg" through; only the final extension decides,
// and a name with no extension is rejected.
$imgtype = explode( '.', $img1_name );
$ext     = ( count( $imgtype ) > 1 ) ? strtolower( end( $imgtype ) ) : '';
$allowed = array_filter( array_map( 'trim', explode( ' ', strtolower( $fileupload_allowedtypes ) ) ), 'strlen' );
if ( '' === $ext || ! in_array( $ext, $allowed, true ) ) {
	be_json( 400, array( 'error' => 'disallowed_type' ) );
}

// Modern-WordPress-style upload layout -- wp-content/uploads/YYYY/MM/.
// $year and $month come from date(), never from the request, so the
// subdirectory cannot be steered by an attacker; it is created on demand.
$year     = date( 'Y' );
$month    = date( 'm' );
$dest_rel = $year . '/' . $month;
$dest_dir = $fileupload_realpath . '/' . $dest_rel;

if ( ! is_dir( $dest_dir ) ) {
	@mkdir( $dest_dir, 0755, true );
}

// Defence in depth -- the file name is sanitised above and the YYYY/MM
// segments are date()-derived, but still verify the resolved destination
// directory lies inside the configured upload base before any file write.
$base_dir  = realpath( $fileupload_realpath );
$dest_real = realpath( $dest_dir );
if ( false === $base_dir || false === $dest_real
	|| 0 !== strpos( $dest_real, $base_dir . DIRECTORY_SEPARATOR ) ) {
	be_json( 500, array( 'error' => 'invalid_destination' ) );
}

// Avoid overwriting an existing file -- rename duplicates with a numeric
// suffix, the same behaviour as b2upload.php.
$final_name = $img1_name;
$pathtofile = $dest_dir . '/' . $final_name;
$stem       = ( '' !== $ext ) ? substr( $img1_name, 0, strlen( $img1_name ) - strlen( $ext ) - 1 ) : $img1_name;
$counter    = 1;
while ( file_exists( $pathtofile ) ) {
	$final_name = $stem . '_' . zeroise( $counter, 2 ) . '.' . $ext;
	$pathtofile = $dest_dir . '/' . $final_name;
	++$counter;
}

// move_uploaded_file() is the canonical, safe move for a PHP upload; it
// also re-checks that $tmp_name is a genuine uploaded file.
if ( ! move_uploaded_file( $tmp_name, $pathtofile ) ) {
	be_json( 500, array( 'error' => 'move_failed' ) );
}

// The upload directory only needs to be readable by the web server so the
// file is served; 0644 on the file is sufficient. chmod 777 is NOT needed.
@chmod( $pathtofile, 0644 );

// WordPress 0.71 has no media table, so there is no real attachment id.
// Return a synthetic, stable-per-name id derived from the final file name
// (crc32) so the Image block has a non-zero numeric id to key on.
$synthetic_id = crc32( $final_name );

be_json(
	200,
	array(
		'id'  => $synthetic_id,
		'url' => $fileupload_url . '/' . $dest_rel . '/' . $final_name,
		'alt' => '',
	)
);
