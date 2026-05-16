<?php

require('../b2config.php');
require_once($abspath.$b2inc.'/b2template.functions.php');
require_once($abspath.'/wp-admin/b2verifauth.php');
require_once($abspath.$b2inc.'/b2vars.php');
require_once($abspath.$b2inc.'/b2functions.php');

if (!isset($use_cache))	$use_cache=1;
if (!isset($blogID))	$blog_ID=1;
if (!isset($debug))		$debug=0;
timer_start();

get_currentuserinfo();

$request = "SELECT * FROM $tablesettings";
$result = mysqli_query($wpdb->dbh, $request);
$querycount++;
while($row = mysqli_fetch_object($result)) {
	$posts_per_page=$row->posts_per_page;
	$what_to_show=$row->what_to_show;
	$archive_mode=$row->archive_mode;
	$time_difference=$row->time_difference;
	$date_format=stripslashes($row->date_format);
	$time_format=stripslashes($row->time_format);
}

// let's deactivate quicktags on IE Mac and Lynx, because they don't work there.
if (($is_macIE) || ($is_lynx))
	$use_quicktags = 0;

$b2varstoreset = array('profile','standalone','redirect','redirect_url','a','popuptitle','popupurl','text', 'trackback', 'pingback');
// EN: Issue #37 hardening. Replace the variable-variable ($$b2var)
//     register_globals-style assignment with an explicit $GLOBALS[$b2var]
//     write. b2header.php is include()d by the admin scripts at global scope,
//     so $GLOBALS[$b2var] is exactly equivalent to $$b2var here; it makes the
//     intent (populate known globals from $_GET/$_POST) explicit.
// JA: Issue #37 の堅牢化。可変変数($$b2var)による register_globals 風の
//     代入を、明示的な $GLOBALS[$b2var] への書き込みに置き換える。
//     b2header.php は管理スクリプトからグローバルスコープで include() される
//     ため、ここでは $GLOBALS[$b2var] は $$b2var と完全に等価。意図(既知の
//     グローバル変数を $_GET/$_POST から設定する)を明確にする。
for ($i=0; $i<count($b2varstoreset); $i += 1) {
	$b2var = $b2varstoreset[$i];
	if (!isset($GLOBALS[$b2var])) {
		if (empty($_POST["$b2var"])) {
			if (empty($_GET["$b2var"])) {
				$GLOBALS[$b2var] = '';
			} else {
				$GLOBALS[$b2var] = $_GET["$b2var"];
			}
		} else {
			$GLOBALS[$b2var] = $_POST["$b2var"];
		}
	}
}

if ($standalone == 0) {

?><!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>WordPress > <?php echo $title; ?></title>
<link rel="stylesheet" href="b2.css" type="text/css" />
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />

<?php
if ($redirect==1) {
?>
<script language="javascript" type="text/javascript">
<!--
function redirect() {
  window.location = "<?php echo $redirect_url; ?>";
}
setTimeout("redirect();", 600);
//-->
</script>
<?php
} // redirect
?>

<script language="javascript" type="text/javascript">
<!-- hiding from old terrible browsers

	function profile(userID) {
		window.open ("b2profile.php?action=viewprofile&user="+userID, "Profile", "width=500, height=450, location=0, menubar=0, resizable=0, scrollbars=1, status=1, titlebar=0, toolbar=0, screenX=60, left=60, screenY=60, top=60");
	}

	function launchupload() {
		window.open ("b2upload.php", "b2upload", "width=380,height=360,location=0,menubar=0,resizable=1,scrollbars=yes,status=1,toolbar=0");
	}

//  End -->
</script>
</head>
<body>

<?php
if ($profile==0) {
	include('b2menutop.php');
}
?>

<?php
}
?>
