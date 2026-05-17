<?php

$use_cache           = 1;
$use_gzipcompression = 1;

/* Including config and functions files */
$curpath = __DIR__ . '/';

require_once $curpath . '/b2config.php';
require_once $curpath . $b2inc . '/b2template.functions.php';
require_once $curpath . $b2inc . '/b2vars.php';
require_once $curpath . $b2inc . '/b2functions.php';

$b2varstoreset = array( 'm', 'p', 'posts', 'w', 'c', 'cat', 'withcomments', 's', 'search', 'exact', 'sentence', 'poststart', 'postend', 'preview', 'debug', 'calendar', 'page', 'paged', 'more', 'tb', 'pb', 'author', 'order', 'orderby' );

	// Issue #37 hardening. The original loop used the variable-variable
	// form ($$b2var = ...), a register_globals-style construct. The name
	// list ($b2varstoreset) is a fixed whitelist, so this was never
	// arbitrary variable injection, but $$var is fragile and obscures the
	// intent. This loop runs at global scope, so assigning through
	// $GLOBALS[$b2var] is exactly equivalent and makes it explicit that
	// the script populates a known set of globals from $_GET/$_POST.
for ( $i = 0; $i < count( $b2varstoreset ); $i += 1 ) {
	$b2var = $b2varstoreset[ $i ];
	if ( ! isset( $GLOBALS[ $b2var ] ) ) {
		if ( empty( $_POST[ $b2var ] ) ) {
			if ( empty( $_GET[ $b2var ] ) ) {
				$GLOBALS[ $b2var ] = '';
			} else {
				$GLOBALS[ $b2var ] = $_GET[ $b2var ];
			}
		} else {
			$GLOBALS[ $b2var ] = $_POST[ $b2var ];
		}
	}
}


/* Sending HTTP headers */
// It is presumptious to think that WP is the only thing that might change on the page.
@header( 'Expires: Mon, 26 Jul 1997 05:00:00 GMT' );              // Date in the past
@header( 'Last-Modified: ' . gmdate( 'D, d M Y H:i:s' ) . ' GMT' ); // always modified
@header( 'Cache-Control: no-store, no-cache, must-revalidate' );  // HTTP/1.1
@header( 'Cache-Control: post-check=0, pre-check=0', false );
@header( 'Pragma: no-cache' );                                    // HTTP/1.0

/* Getting settings from db */
// $querycount is a global counter incremented by the query helpers below;
// initialize it so the first ++$querycount does not hit an undefined var.
$querycount      = 0;
$posts_per_page  = get_settings( 'posts_per_page' );
$what_to_show    = get_settings( 'what_to_show' );
$archive_mode    = get_settings( 'archive_mode' );
$dateformat      = stripslashes( get_settings( 'date_format' ) );
$timeformat      = stripslashes( get_settings( 'time_format' ) );
$time_difference = get_settings( 'time_difference' );

/* First let's clear some variables */
$whichcat    = '';
$whichauthor = '';
$result      = '';
$where       = '';
$limits      = '';
$distinct    = '';

if ( 'b2edit.php' != $pagenow ) {
	timer_start(); }

if ( ! empty( $showposts ) ) {
	$showposts      = (int) $showposts;
	$posts_per_page = $showposts;
}
// if a month is specified in the querystring, load that month
if ( '' != $m ) {
	$m      = '' . intval( $m );
	$where .= ' AND YEAR(post_date)=' . substr( $m, 0, 4 );
	if ( strlen( $m ) > 5 ) {
		$where .= ' AND MONTH(post_date)=' . substr( $m, 4, 2 );
	}
	if ( strlen( $m ) > 7 ) {
		$where .= ' AND DAYOFMONTH(post_date)=' . substr( $m, 6, 2 );
	}
	if ( strlen( $m ) > 9 ) {
		$where .= ' AND HOUR(post_date)=' . substr( $m, 8, 2 );
	}
	if ( strlen( $m ) > 11 ) {
		$where .= ' AND MINUTE(post_date)=' . substr( $m, 10, 2 );
	}
	if ( strlen( $m ) > 13 ) {
		$where .= ' AND SECOND(post_date)=' . substr( $m, 12, 2 );
	}
}

if ( '' != $w ) {
	$w      = '' . intval( $w );
	$where .= ' AND WEEK(post_date,1)=' . $w;
}

// if a post number is specified, load that post
if ( ( '' != $p ) && ( 'all' != $p ) ) {
	$p     = intval( $p );
	$where = ' AND ID = ' . $p;
}

// if a search pattern is specified, load the posts that match
if ( ! empty( $s ) ) {
	$s      = addslashes_gpc( $s );
	$search = ' AND (';
	// puts spaces instead of commas
	$s = preg_replace( '/, +/', '', $s );
	$s = str_replace( ',', ' ', $s );
	$s = str_replace( '"', ' ', $s );
	$s = trim( $s );
	if ( $exact ) {
		$n = '';
	} else {
		$n = '%';
	}
	if ( ! $sentence ) {
		$s_array = explode( ' ', $s );
		$search .= '(post_title LIKE \'' . $n . $s_array[0] . $n . '\') OR (post_content LIKE \'' . $s_array[0] . '\')';
		for ( $i = 1; $i < count( $s_array ); $i = $i + 1 ) {
			$search .= ' OR (post_title LIKE \'' . $n . $s_array[ $i ] . $n . '\') OR (post_content LIKE \'' . $n . $s_array[ $i ] . $n . '\')';
		}
		$search .= ' OR (post_title LIKE \'' . $n . $s . $n . '\') OR (post_content LIKE \'' . $n . $s . $n . '\')';
		$search .= ')';
	} else {
		$search = ' AND ((post_title LIKE \'' . $n . $s . $n . '\') OR (post_content LIKE \'' . $n . $s . $n . '\'))';
	}
}

// category stuff
if ( ( empty( $cat ) ) || ( 'all' == $cat ) || ( '0' == $cat ) ) {
	$whichcat = '';
} else {
	$cat = '' . urldecode( $cat ) . '';
	$cat = addslashes_gpc( $cat );
	if ( stristr( $cat, '-' ) ) {
		$eq    = '!=';
		$andor = 'AND';
		$cat   = explode( '-', $cat );
		$cat   = $cat[1];
	} else {
		$eq    = '=';
		$andor = 'OR';
	}
	$cat_array = explode( ' ', $cat );
	$whichcat .= ' AND (post_category ' . $eq . ' ' . $cat_array[0];
	for ( $i = 1; $i < ( count( $cat_array ) ); $i = $i + 1 ) {
		$whichcat .= ' ' . $andor . ' post_category ' . $eq . ' ' . $cat_array[ $i ];
	}
	$whichcat .= ')';
}
// author stuff
if ( ( empty( $author ) ) || ( 'all' == $author ) || ( '0' == $cat ) ) {
	$whichauthor = '';
} elseif ( intval( $author ) ) {
	$author = intval( $author );
	if ( stristr( $author, '-' ) ) {
		$eq     = '!=';
		$andor  = 'AND';
		$author = explode( '-', $author );
		$author = $author[1];
	} else {
		$eq    = '=';
		$andor = 'OR';
	}
	$author_array = explode( ' ', $author );
	$whichauthor .= ' AND post_author ' . $eq . ' ' . $author_array[0];
	for ( $i = 1; $i < ( count( $author_array ) ); $i = $i + 1 ) {
		$whichauthor .= ' ' . $andor . ' post_author ' . $eq . ' ' . $author_array[ $i ];
	}
}

$where .= $search . $whichcat . $whichauthor;

if ( ( empty( $order ) ) || ( ( strtoupper( $order ) != 'ASC' ) && ( strtoupper( $order ) != 'DESC' ) ) ) {
	$order = 'DESC';
}

// order by stuff
if ( empty( $orderby ) ) {
	$orderby = 'date ' . $order;
} else {
	$orderby       = urldecode( $orderby );
	$orderby       = addslashes_gpc( $orderby );
	$orderby_array = explode( ' ', $orderby );
	$orderby       = $orderby_array[0] . ' ' . $order;
	if ( count( $orderby_array ) > 1 ) {
		for ( $i = 1; $i < ( count( $orderby_array ) ); $i = $i + 1 ) {
			$orderby .= ',post_' . $orderby_array[ $i ] . ' ' . $order;
		}
	}
}

if ( ( ! $whichcat ) && ( ! $m ) && ( ! $p ) && ( ! $w ) && ( ! $s ) && empty( $poststart ) && empty( $postend ) ) {
	if ( 'posts' == $what_to_show ) {
		$limits = ' LIMIT ' . $posts_per_page;
	} elseif ( 'days' == $what_to_show ) {
		$lastpostdate = get_lastpostdate();
		$lastpostdate = mysql2date( 'Y-m-d 00:00:00', $lastpostdate );
		$lastpostdate = mysql2date( 'U', $lastpostdate );
		$otherdate    = date( 'Y-m-d H:i:s', ( $lastpostdate - ( ( $posts_per_page - 1 ) * 86400 ) ) );
		$where       .= ' AND post_date > \'' . $otherdate . '\'';
	}
}

if ( ! empty( $postend ) && ( $postend > $poststart ) && ( ! $m ) && ( ! $w ) && ( ! $whichcat ) && ( ! $s ) && ( ! $p ) ) {
	if ( 'posts' == $what_to_show || ( 'paged' == $what_to_show && ( ! $paged ) ) ) {
		$poststart = intval( $poststart );
		$postend   = intval( $postend );
		$limposts  = $postend - $poststart;
		$limits    = ' LIMIT ' . $poststart . ',' . $limposts;
	} elseif ( 'days' == $what_to_show ) {
		$poststart    = intval( $poststart );
		$postend      = intval( $postend );
		$limposts     = $postend - $poststart;
		$lastpostdate = get_lastpostdate();
		$lastpostdate = mysql2date( 'Y-m-d 00:00:00', $lastpostdate );
		$lastpostdate = mysql2date( 'U', $lastpostdate );
		$startdate    = date( 'Y-m-d H:i:s', ( $lastpostdate - ( ( $poststart - 1 ) * 86400 ) ) );
		$otherdate    = date( 'Y-m-d H:i:s', ( $lastpostdate - ( ( $postend - 1 ) * 86400 ) ) );
		$where       .= ' AND post_date > \'' . $otherdate . '\' AND post_date < \'' . $startdate . '\'';
	}
} else {
	if ( ( 'paged' == $what_to_show ) && ( ! $p ) && ( ! $more ) ) {
		if ( 'b2edit.php' != $pagenow ) {
			$pgstrt = '';
			if ( $paged ) {
				$pgstrt = ( intval( $paged ) - 1 ) * $posts_per_page . ', ';
			}
			$limits = 'LIMIT ' . $pgstrt . $posts_per_page;
		} else {
			if ( ( $m ) || ( $p ) || ( $w ) || ( $s ) || ( $whichcat ) ) {
				$limits = '';
			} else {
				$pgstrt = '';
				if ( $paged ) {
					$pgstrt = ( intval( $paged ) - 1 ) * $posts_per_page . ', ';
				}
				$limits = 'LIMIT ' . $pgstrt . $posts_per_page;
			}
		}
	} elseif ( ( $m ) || ( $p ) || ( $w ) || ( $s ) || ( $whichcat ) || ( $author ) ) {
		$limits = '';
	}
}

if ( 'all' == $p ) {
	$where = '';
}

$now = date( 'Y-m-d H:i:s', ( time() + ( $time_difference * 3600 ) ) );

if ( 'b2edit.php' != $pagenow ) {
	if ( ( empty( $poststart ) ) || ( empty( $postend ) ) || ! ( $postend > $poststart ) ) {
		$where .= ' AND post_date <= \'' . $now . '\'';
	}
	$where   .= ' AND post_category > 0';
	$distinct = 'DISTINCT';
	if ( $use_gzipcompression ) {
		// gzipping the output of the script
		gzip_compression();
	}
}
$where .= ' AND (post_status = "publish"';

// Get private posts
// Test the integer directly. PHP 8 changed string<->number comparison, so
// "'' != intval($user_ID)" is now true when $user_ID is unset (intval 0),
// which built an invalid SQL fragment. intval($user_ID) is truthy only for
// a real (non-zero) user id, matching the original intent on PHP 7 and 8.
if ( intval( $user_ID ?? 0 ) ) {
	$where .= " OR post_author = $user_ID AND post_status != 'draft')";
} else {
	$where .= ')';
}
$request = " SELECT $distinct * FROM $tableposts WHERE 1=1" . $where . " ORDER BY post_$orderby $limits";


if ( $preview ) {
	$request = 'SELECT 1-1'; // dummy mysql query for the preview
	// little funky fix for IEwin, rawk on that code
	$is_winIE = ( ( preg_match( '/MSIE/', $HTTP_USER_AGENT ) ) && ( preg_match( '/Win/', $HTTP_USER_AGENT ) ) );
	if ( ( $is_winIE ) && ( ! isset( $IEWin_bookmarklet_fix ) ) ) {
		$preview_content = preg_replace_callback(
			'/\%u([0-9A-F]{4,4})/',
			function ( $m ) {
				return '&#' . base_convert( $m[1], 16, 10 ) . ';';
			},
			$preview_content
		);
	}
}

//error_log("$request");
//echo $request;
$posts = $wpdb->get_results( $request );
