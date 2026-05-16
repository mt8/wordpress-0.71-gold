<?php

require_once('../b2config.php');

/* checking login & pass in the database */
function veriflog() {
	global $_COOKIE;
	global $tableusers, $wpdb;

	if (!empty($_COOKIE["wordpressuser"])) {
		$user_login = $_COOKIE["wordpressuser"];
		$user_pass_md5 = $_COOKIE["wordpresspass"];
	} else {
		return false;
	}

	if (!($user_login != ''))
		return false;
	if (!$user_pass_md5)
		return false;

	$login = $wpdb->get_row("SELECT user_login, user_pass FROM $tableusers WHERE user_login = '$user_login'");

	if (!$login) {
		return false;
	} else {
		if ($login->user_login == $user_login && md5($login->user_pass) == $user_pass_md5) {
			return true;
		} else {
			return false;
		}
	}
}
//if ( $user_login!="" && $user_pass!="" && $id_session!="" && $adresse_ip==$REMOTE_ADDR) {
//	if ( !(veriflog()) AND !(verifcookielog()) ) {
	if (!(veriflog())) {
		header('Expires: Wed, 11 Jan 1984 05:00:00 GMT');
		header('Last-Modified: ' . gmdate('D, d M Y H:i:s') . ' GMT');
		header('Cache-Control: no-cache, must-revalidate');
		header('Pragma: no-cache');
		if (!empty($_COOKIE["wordpressuser"])) {
			$error="<strong>Error</strong>: wrong login or password";
		}
		header("Location: $path/b2login.php");
		exit();
	}
//}
?>