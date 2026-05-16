<?php
/* b2 File Upload - original hack by shockingbird.com */

$standalone = '1';
require_once './b2header.php';

if ( 0 == $user_level ) { //Checks to see if user has logged in
	die( "Cheatin' uh ?" );
}

if ( ! $use_fileupload ) { //Checks if file upload is enabled in the config
	die( 'The admin disabled this function' );
}

?><html>
<head>
<title>b2 > upload images/files</title>
<link rel="stylesheet" href="<?php echo $b2inc; ?>/b2.css" type="text/css">
<style type="text/css">
<!--
body {
	background-image: url('
	<?php
	if ( $is_gecko || $is_macIE ) {
		?>
	../b2-img/bgbookmarklet3.gif
		<?php
	} else {
		?>
	../b2-img/bgbookmarklet3.gif
		<?php
	}
	?>
	');
	background-repeat: no-repeat;
	margin: 30px;
}
<?php
if ( ! $is_NS4 ) {
	?>
textarea,input,select {
	background-color: white;
/*<?php if ( $is_gecko || $is_macIE ) { ?>
	background-image: url('../b2-img/bgbookmarklet3.gif');
<?php } elseif ( $is_winIE ) { ?>
	background-color: #cccccc;
	filter: alpha(opacity:80);
<?php } ?>
*/  border-width: 1px;
	border-color: #cccccc;
	border-style: solid;
	padding: 2px;
	margin: 1px;
}
	<?php if ( ! $is_gecko ) { ?>
.checkbox {
	border-width: 0px;
	border-color: transparent;
	border-style: solid;
	padding: 0px;
	margin: 0px;
}
.uploadform {
	background-color: white;
		<?php if ( $is_winIE ) { ?>
	filter: alpha(opacity:100);
<?php } ?>
	border-width: 1px;
	border-color: #333333;
	border-style: solid;
	padding: 2px;
	margin: 1px;
	width: 265px;
	height: 24px;
}
<?php } ?>
	<?php
}
?>
-->
</style>
<script type="text/javascript">
<!-- // idocs.com's popup tutorial rules !
function targetopener(blah, closeme, closeonly) {
	if (! (window.focus && window.opener))return true;
	window.opener.focus();
	if (! closeonly)window.opener.document.post.content.value += blah;
	if (closeme)window.close();
	return false;
}
//-->
</script>
</head>
<body>

<table align="center" width="100%" height="100%" cellpadding="15" cellspacing="0" border="1" style="border-width: 1px; border-color: #cccccc;">
	<tbody>
	<tr>
	<td valign="top" style="background-color: transparent; 
	<?php
	if ( $is_gecko || $is_macIE ) {
		?>
		background-image: url('../b2-img/bgbookmarklet3.gif');
		<?php
	} elseif ( $is_winIE ) {
		?>
		background-color: #cccccc; filter: alpha(opacity:60);<?php } ?>;">
<?php

if ( ! $_POST['submit'] ) {
	$i = explode( ' ', $fileupload_allowedtypes );
	$i = implode( ', ', array_slice( $i, 1, count( $i ) - 2 ) );
	?>
	<p><strong>File upload</strong></p>
	<p>You can upload files of type:<br /><em><?php echo $i; ?></em></p>
	<p>The maximum size of the file should be:<br /><em><?php echo $fileupload_maxk; ?> KB</em></p>
	<form action="b2upload.php" method="post" enctype="multipart/form-data">
	<input type="hidden" name="MAX_FILE_SIZE" value="<?php echo $fileupload_maxk * 1024; ?>" />
	<input type="file" name="img1" size="30" class="uploadform" />
	<br /><br />
	Description:<br />
	<input type="text" name="imgdesc" size="30" class="uploadform" />
	<br /><br />
	<input type="submit" name="submit" value="upload !" class="search" />
	</form>
	</td>
	</tr>
	</tbody>
</table>
</body>
</html>
	<?php
	die();
}



?>



<?php
//Makes sure they choose a file

//print_r($_FILES);
//die();

if ( ! empty( $_POST ) ) { //$img1_name != "") {

	$imgalt = ( isset( $_POST['imgalt'] ) ) ? $_POST['imgalt'] : $imgalt;

	$img1_name = ( strlen( $imgalt ) ) ? $_POST['imgalt'] : $_FILES['img1']['name'];
	$img1_type = ( strlen( $imgalt ) ) ? $_POST['img1_type'] : $_FILES['img1']['type'];
	$imgdesc   = str_replace( '"', '&amp;quot;', $_POST['imgdesc'] );

	// EN: Sanitise the user-supplied file name before it is used in any path.
	//     basename() strips directory components (e.g. "../../etc/passwd"),
	//     then we keep only a safe character set so the saved file can never
	//     escape $fileupload_realpath (path-traversal defence).
	// JA: パスに使う前にユーザー指定のファイル名をサニタイズする。
	//     basename() でディレクトリ部分(例 "../../etc/passwd")を除去し、
	//     安全な文字種のみを残すことで、保存ファイルが $fileupload_realpath
	//     の外へ出られないようにする(パストラバーサル対策)。
	$img1_name = basename( $img1_name );
	$img1_name = preg_replace( '~[^A-Za-z0-9._-]~', '_', $img1_name );
	$img1_name = preg_replace( '~\.+~', '.', $img1_name ); // collapse repeated dots
	$img1_name = trim( $img1_name, '.' );                  // no leading/trailing dot
	if ( '' === $img1_name || null === $img1_name ) {
		die( 'Invalid file name.' );
	}
	// EN: Keep $imgalt (the alternate-name path) in sync with the sanitised
	//     name so the second upload path is hardened the same way.
	// JA: $imgalt(代替名のパス)もサニタイズ後の名前に揃え、2 つ目の
	//     アップロード経路にも同じ対策を適用する。
	if ( strlen( $imgalt ) ) {
		$imgalt = $img1_name;
	}

	// EN: Derive the extension from the *sanitised* name (the final segment
	//     after the last dot) and require an exact, per-extension match
	//     against the configured allow-list. A loose substring preg_match
	//     would let "evil.php.jpg" or "x.phpjpg" through; only the final
	//     extension decides, and a name with no extension is rejected.
	// JA: 拡張子はサニタイズ後の名前(最後のドット以降の最終要素)から取得し、
	//     設定された許可リストと拡張子単位で厳密に一致させる。緩い部分一致の
	//     preg_match では "evil.php.jpg" や "x.phpjpg" を通してしまうため、
	//     判定するのは最終拡張子のみ。拡張子の無い名前は拒否する。
	$imgtype = explode( '.', $img1_name );
	$ext     = ( count( $imgtype ) > 1 ) ? strtolower( end( $imgtype ) ) : '';
	$allowed = array_filter( array_map( 'trim', explode( ' ', strtolower( $fileupload_allowedtypes ) ) ), 'strlen' );
	if ( '' === $ext || ! in_array( $ext, $allowed, true ) ) {
		die( "File $img1_name of type ." . htmlspecialchars( $ext ) . ' is not allowed.' );
	}
	// EN: $imgtype is reused below as the duplicate-rename suffix; keep it as
	//     the validated, space-padded extension the original code expected.
	// JA: $imgtype は以降の重複リネーム用サフィックスとして再利用される。
	//     元のコードが期待する空白で囲まれた検証済み拡張子のまま保持する。
	$imgtype = ' ' . $ext . ' ';

	if ( strlen( $imgalt ) ) {
		$pathtofile = $fileupload_realpath . '/' . $imgalt;
		$img1       = $_POST['img1'];
	} else {
		$pathtofile = $fileupload_realpath . '/' . $img1_name;
		$img1       = $_FILES['img1']['tmp_name'];
	}

	// EN: Defence in depth -- the file name is already sanitised above, but
	//     verify the resolved destination directory is exactly the configured
	//     upload directory before any file is written. If it is not, abort.
	// JA: 多層防御 -- ファイル名は上でサニタイズ済みだが、ファイル書き込み前に
	//     解決後の保存先ディレクトリが設定どおりのアップロードディレクトリと
	//     完全に一致することを確認する。一致しなければ中止する。
	$dest_dir = realpath( dirname( $pathtofile ) );
	$base_dir = realpath( $fileupload_realpath );
	if ( false === $dest_dir || false === $base_dir || $dest_dir !== $base_dir ) {
		die( 'Invalid upload destination.' );
	}

	// makes sure not to upload duplicates, rename duplicates
	$i             = 1;
	$pathtofile2   = $pathtofile;
	$tmppathtofile = $pathtofile2;
	$img2_name     = $img1_name;

	while ( file_exists( $pathtofile2 ) ) {
		$pos              = strpos( $tmppathtofile, '.' . trim( $imgtype ) );
		$pathtofile_start = substr( $tmppathtofile, 0, $pos );
		$pathtofile2      = $pathtofile_start . '_' . zeroise( $i++, 2 ) . '.' . trim( $imgtype );
		$img2_name        = explode( '/', $pathtofile2 );
		$img2_name        = $img2_name[ count( $img2_name ) - 1 ];
	}

	if ( file_exists( $pathtofile ) && ! strlen( $imgalt ) ) {
		$i = explode( ' ', $fileupload_allowedtypes );
		$i = implode( ', ', array_slice( $i, 1, count( $i ) - 2 ) );
		move_uploaded_file( $img1, $pathtofile2 )
		or die( "Couldn't Upload Your File to $pathtofile2." );

		// duplicate-renaming function contributed by Gary Lawrence Murphy
		?>
	<p><strong>Duplicate File?</strong></p>
	<p><b><em>The filename '<?php echo $img1_name; ?>' already exists!</em></b></p>
	<p> filename '<?php echo $img1; ?>' moved to '<?php echo "$pathtofile2 - $img2_name"; ?>'</p>
	<p>Confirm or rename:</p>
	<form action="b2upload.php" method="post" enctype="multipart/form-data">
	<input type="hidden" name="MAX_FILE_SIZE" value="<?php echo $fileupload_maxk * 1024; ?>" />
	<input type="hidden" name="img1_type" value="<?php echo $img1_type; ?>" />
	<input type="hidden" name="img1_name" value="<?php echo $img2_name; ?>" />
	<input type="hidden" name="img1" value="<?php echo $pathtofile2; ?>" />
	Alternate name:<br /><input type="text" name="imgalt" size="30" class="uploadform" value="<?php echo $img2_name; ?>" /><br />
	<br />
	Description:<br /><input type="text" name="imgdesc" size="30" class="uploadform" value="<?php echo $imgdesc; ?>" />
	<br />
	<input type="submit" name="submit" value="confirm !" class="search" />
	</form>
	</td>
	</tr>
	</tbody>
</table>
</body>
</html>
		<?php
		die();

	}

	if ( ! strlen( $imgalt ) ) {
		// EN: The upload directory only needs to be writable by the web server
		//     user (e.g. 0755, or 0775 if the web user is in the group).
		//     chmod 777 is NOT required and should be avoided -- it makes the
		//     directory world-writable.
		// JA: アップロードディレクトリは Web サーバーのユーザーが書き込めれば
		//     よい(例: 0755、Web ユーザーがグループに属するなら 0775)。
		//     chmod 777 は不要であり、避けるべき — 全ユーザー書き込み可に
		//     なってしまう。
		move_uploaded_file( $img1, $pathtofile )
		or die( "Couldn't Upload Your File to $pathtofile." );
	} else {
		rename( $img1, $pathtofile )
		or die( "Couldn't Upload Your File to $pathtofile." );
	}
}


if ( preg_match( '~image/~', $img1_type ) ) {
	$piece_of_code = "&lt;img src=&quot;$fileupload_url/$img1_name&quot; border=&quot;0&quot; alt=&quot;$imgdesc&quot; /&gt;";
} else {
	$piece_of_code = "&lt;a href=&quot;$fileupload_url/$img1_name&quot; title=&quot;$imgdesc&quot; /&gt;$imgdesc&lt;/a&gt;";
}

?>

<p><strong>File uploaded !</strong></p>
<p>Your file <b><?php echo "$img1_name"; ?></b> was uploaded successfully !</p>
<p>Here's the code to display it:</p>
<p><form>
<!--<textarea cols="25" rows="3" wrap="virtual"><?php echo "&lt;img src=&quot;$fileupload_url/$img1_name&quot; border=&quot;0&quot; alt=&quot;&quot; /&gt;"; ?></textarea>-->
<input type="text" name="imgpath" value="<?php echo $piece_of_code; ?>" size="38" style="padding: 5px; margin: 2px;" /><br />
<input type="button" name="close" value="Add the code to your post !" class="search" onClick="targetopener('<?php echo $piece_of_code; ?>')" style="margin: 2px;" />
</form>
</p>
<p><strong>Image Details</strong>: <br />
name: 
<?php echo "$img1_name"; ?>
<br />
size: 
<?php echo round( $img1_size / 1024, 2 ); ?> KB
<br />
type: 
<?php echo "$img1_type"; ?>
</p>
<p align="right">
<form>
<input type="button" name="close" value="Close this window" class="search" onClick="window.close()" />
</form>
</p>
</td>
</tr>
</tbody>
</table>

</body>

</html>