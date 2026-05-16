<?php
/* <Register> */

require('b2config.php');
require($abspath.$b2inc.'/b2functions.php');

function add_magic_quotes($array) {
	foreach ($array as $k => $v) {
		if (is_array($v)) {
			$array[$k] = add_magic_quotes($v);
		} else {
			$array[$k] = addslashes($v);
		}
	}
	return $array;
} 

$_GET    = add_magic_quotes($_GET);
$_POST   = add_magic_quotes($_POST);
$_COOKIE = add_magic_quotes($_COOKIE);

$b2varstoreset = array('action');
// EN: Issue #37 hardening. Replace the variable-variable ($$b2var)
//     register_globals-style assignment with an explicit $GLOBALS[$b2var]
//     write. The name list is a fixed whitelist and this loop runs at global
//     scope, so the two forms are exactly equivalent; $GLOBALS makes the
//     intent (populate known globals from $_GET/$_POST) explicit.
// JA: Issue #37 の堅牢化。可変変数($$b2var)による register_globals 風の
//     代入を、明示的な $GLOBALS[$b2var] への書き込みに置き換える。名前リスト
//     は固定のホワイトリストで、本ループはグローバルスコープで動くため両者は
//     完全に等価。$GLOBALS により意図(既知のグローバル変数を $_GET/$_POST
//     から設定する)が明確になる。
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

if (!$users_can_register) {
	$action = 'disabled';
}

switch($action) {

case "register":

	function filter($value)	{
		return preg_match('~^[a-zA-Z0-9\_-\|]+$~',$value);
	}

	$user_login = $_POST["user_login"];
	$pass1 = $_POST["pass1"];
	$pass2 = $_POST["pass2"];
	$user_email = $_POST["user_email"];
	$user_login = $_POST["user_login"];

	/* declaring global fonctions */
#	global $user_login,$pass1,$pass2,$user_firstname,$user_nickname,$user_icq,$user_email,$user_url;
		
	/* checking login has been typed */
	if ($user_login=='') {
		die ("<b>ERROR</b>: please enter a Login");
	}

	/* checking the password has been typed twice */
	if ($pass1=='' ||$pass2=='') {
		die ("<b>ERROR</b>: please enter your password twice");
	}

	/* checking the password has been typed twice the same */
	if ($pass1!=$pass2)	{
		die ("<b>ERROR</b>: please type the same password in the two password fields");
	}
	$user_nickname=$user_login;

	/* checking e-mail address */
	if ($user_email=="") {
		die ("<b>ERROR</b>: please type your e-mail address");
	} else if (!is_email($user_email)) {
		die ("<b>ERROR</b>: the email address isn't correct");
	}

	$id = mysqli_connect($server,$loginsql,$passsql);
	if ($id==false)	{
		die ("<b>OOPS</b>: can't connect to the server !".mysqli_connect_error());
	}

	mysqli_select_db($id, "$base") or die ("<b>OOPS</b>: can't select the database $base : ".mysqli_error($id));

	/* checking the login isn't already used by another user */
	$request =  " SELECT user_login FROM $tableusers WHERE user_login = '$user_login'";
	$result = mysqli_query($id, $request) or die ("<b>OOPS</b>: can't check the login...");
	$lines = mysqli_num_rows($result);
	mysqli_free_result($result);
	if ($lines>=1) {
		die ("<b>ERROR</b>: this login is already registered, please choose another one");
	}

	$user_ip = $_SERVER['REMOTE_ADDR'] ;
	$user_domain = gethostbyaddr($_SERVER['REMOTE_ADDR'] );
	$user_browser = $_SERVER['HTTP_USER_AGENT'];

	// EN: Issue #34 -- store a bcrypt hash of the password, never the plaintext.
	//     password_hash() output is ASCII-safe, so addslashes() is applied for
	//     SQL safety just like the other fields.
	// JA: Issue #34 -- パスワードは平文ではなく bcrypt ハッシュで保存する。
	//     password_hash() の出力は ASCII セーフなので、他のフィールドと同様に
	//     SQL 対策として addslashes() を適用する。
	$user_pass_hash = password_hash($pass1, PASSWORD_DEFAULT);

	$user_login=addslashes($user_login);
	$user_pass_hash=addslashes($user_pass_hash);
	$user_nickname=addslashes($user_nickname);

	$query = "INSERT INTO $tableusers (user_login, user_pass, user_nickname, user_email, user_ip, user_domain, user_browser, dateYMDhour, user_level, user_idmode) VALUES ('$user_login','$user_pass_hash','$user_nickname','$user_email','$user_ip','$user_domain','$user_browser',NOW(),'$new_users_can_blog','nickname')";
	$result = mysqli_query($id, $query);
	if ($result==false) {
		die ("<b>ERROR</b>: couldn't register you... please contact the <a href=\"mailto:$admin_email\">webmaster</a> !".mysqli_error($id));
	}

	$stars="";
	for ($i = 0; $i < strlen($pass1); $i = $i + 1) {
		$stars .= "*";
	}

	$message  = "new user registration on your blog $blogname:\r\n\r\n";
	$message .= "login: $user_login\r\n\r\ne-mail: $user_email";

	@mail($admin_email,"new user registration on your blog $blogname",$message);

	?><html>
<head>
<title>b2 > Registration complete</title>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<link rel="stylesheet" href="<?php echo $siteurl; ?>/wp-admin/b2.css" type="text/css">
<style type="text/css">
<!--
<?php
if (!preg_match("/Nav/",$HTTP_USER_AGENT)) {
?>
textarea,input,select {
	background-color: #f0f0f0;
	border-width: 1px;
	border-color: #cccccc;
	border-style: solid;
	padding: 2px;
	margin: 1px;
}
<?php
}
?>
-->
</style>
</head>
<body bgcolor="#ffffff" text="#000000" link="#cccccc" vlink="#cccccc" alink="#ff0000">

<table width="100%" height="100%">
<td align="center" valign="middle">

<table width="200" height="200" style="border: 1px solid #cccccc;" cellpadding="0" cellspacing="0">

<tr height="50">
<td height="50" width="50">
<a href="http://wordpress.org" target="_blank"><img src="http://wordpress.org/images/wp-small.png" style="border:0" /></a>
</td>
<td class="b2menutop" align="center">
registration<br />complete
</td>
</tr>

<tr height="250"><td align="right" valign="bottom" height="150" colspan="2">

<table width="280">
<tr><td align="right" colspan="2">login: <b><?php echo $user_login ?>&nbsp;</b></td></tr>
<tr><td align="right" colspan="2">password: <b><?php echo $stars ?>&nbsp;</b></td></tr>
<tr><td align="right" colspan="2">e-mail: <b><?php echo $user_email ?>&nbsp;</b></td></tr>
<tr><td width="90">&nbsp;</td>
<td><form name="login" action="b2login.php" method="post">
<input type="hidden" name="log" value="<?php echo $user_login ?>" />
<input type="submit" class="search" value="Login" name="submit" /></form></td></tr>
</table>
</td>
</tr>
</table>

</td>
</tr>
</table>

</div>
</body>
</html>

	<?php
break;

case "disabled":

	?><html>
<head>
<title>b2 > Registration Currently Disabled</title>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<link rel="stylesheet" href="<?php echo $siteurl; ?>/wp-admin/b2.css" type="text/css">
<style type="text/css">
<!--
<?php
if (!preg_match("/Nav/",$HTTP_USER_AGENT)) {
?>
textarea,input,select {
	background-color: #f0f0f0;
	border-width: 1px;
	border-color: #cccccc;
	border-style: solid;
	padding: 2px;
	margin: 1px;
}
<?php
}
?>
-->
</style>
</head>
<body bgcolor="#ffffff" text="#000000" link="#cccccc" vlink="#cccccc" alink="#ff0000">

<table width="100%" height="100%">
<td align="center" valign="middle">

<table width="200" height="200" style="border: 1px solid #cccccc;" cellpadding="0" cellspacing="0">

<tr height="50">
<td height="50" width="50">
<a href="http://wordpress.org" target="_blank"><img src="http://wordpress.org/images/wp-small.png" /></a>
</td>
<td class="b2menutop" align="center">
registration disabled<br />
</td>
</tr>

<tr height="150">
<td align="center" valign="center" height="150" colspan="2">
<table width="80%" height="100%">
<tr><td class="b2menutop">
User registration is currently not allowed.<br />
<a href="<?php echo $siteurl.'/'.$blogfilename; ?>" >Home</a>
</td></tr></table>
</td>
</tr>
</table>

</td>
</tr>
</table>

</body>
</html>

	<?php
break;

default:

	?><html>
<head>
<title>b2 > Register form</title>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<link rel="stylesheet" href="<?php echo $siteurl; ?>/wp-admin/b2.css" type="text/css">
<style type="text/css">
<!--
<?php
if (!preg_match("/Nav/",$HTTP_USER_AGENT)) {
?>
textarea,input,select {
	background-color: #f0f0f0;
	border-width: 1px;
	border-color: #cccccc;
	border-style: solid;
	padding: 2px;
	margin: 1px;
}
<?php
}
?>
-->
</style>
</head>
<body bgcolor="#ffffff" text="#000000" link="#cccccc" vlink="#cccccc" alink="#ff0000">

<table width="100%" height="100%">
<td align="center" valign="middle">

<table width="250" height="250" style="border: 1px solid #cccccc;" cellpadding="0" cellspacing="0">

<tr>
<td>
<a href="http://wordpress.org"  title="visit WordPress dot org"  target="_blank"><img src="http://wordpress.org/images/wp-small.png" alt="visit WordPress dot org" style="border:0;" /></a>
</td>
<td class="b2menutop" align="center">
registration<br />
</td>
</tr>

<tr height="150"><td align="right" valign="bottom" height="150" colspan="2">

<form method="post" action="b2register.php">
<input type="hidden" name="action" value="register" />
<table border="0" width="180" class="menutop" style="background-color: #ffffff">
<tr> 
<td width="150" align="right">login</td>
<td>
<input type="text" name="user_login" size="8" maxlength="20" />
</td>
</tr>
<tr> 
<td align="right">password<br />(twice)</td>
<td> 
<input type="password" name="pass1" size="8" maxlength="100" />
<br />
<input type="password" name="pass2" size="8" maxlength="100" />
</td>
</tr>
<tr> 
<td align="right">e-mail</td>
<td>
<input type="text" name="user_email" size="8" maxlength="100" />
</td>
</tr>
<tr> 
<td>&nbsp;</td>
<td><input type="submit" value="OK" class="search" name="submit">
</td>
</tr>
</table>

</form>

</td>
</tr>
</table>

</td>
</tr>
</table>

</body>
</html>
	<?php

break;
}