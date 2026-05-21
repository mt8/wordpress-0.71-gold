<?php

/* new and improved ! now with more querystring stuff ! */

if ( ! isset( $querystring_start ) ) {
	$querystring_start     = '?';
	$querystring_equal     = '=';
	$querystring_separator = '&amp;';
}



/* template functions... */


// @@@ These are template tags, you can edit them if you know what you're doing...



/***** About-the-blog tags *****/
/* Note: these tags go anywhere in the template */

function bloginfo( $show = '' ) {
	$info = get_bloginfo( $show );
	$info = convert_bbcode( $info );
	$info = convert_gmcode( $info );
	$info = convert_smilies( $info );
	$info = apply_filters( 'bloginfo', $info );
	echo convert_chars( $info, 'html' );
}

function bloginfo_rss( $show = '' ) {
	$info = strip_tags( get_bloginfo( $show ) );
	echo convert_chars( $info, 'unicode' );
}

function bloginfo_unicode( $show = '' ) {
	$info = get_bloginfo( $show );
	echo convert_chars( $info, 'unicode' );
}

function get_bloginfo( $show = '' ) {
	global $siteurl, $blogfilename, $blogname, $blogdescription, $siteurl, $admin_email;
	switch ( $show ) {
		case 'url':
			$output = $siteurl . '/' . $blogfilename;
			break;
		case 'description':
			$output = $blogdescription;
			break;
		case 'rss2_url':
			$output = $siteurl . '/b2rss2.php';
			break;
		case 'admin_email':
			$output = $admin_email;
			break;
		case 'name':
		default:
			$output = $blogname;
			break;
	}
	return( $output );
}

/*
 * Return the first <img src="..."> URL found in $content, or '' when
 * none is present (Issue #231). Used to populate the og:image meta tag
 * on a single-post page; the OGP block is suppressed when this returns
 * the empty string, so a social card without an image is never emitted.
 *
 * The regex is anchored on `<img` so attributes like `srcset` on other
 * tags are not picked up, and it accepts both single- and double-quoted
 * `src` values -- the block-editor markup stored in post_content uses
 * either form depending on how a block was authored. The match is
 * case-insensitive for the tag name (HTML5 is case-insensitive) and
 * does not interpret HTML entities in the URL -- callers HTML-escape
 * for the attribute value at the point of output.
 *
 * @param string $content Raw post_content (block markup + HTML).
 * @return string The first image URL, or '' when none was found.
 */
function first_image_url( $content ) {
	if ( ! is_string( $content ) || '' === $content ) {
		return '';
	}
	if ( preg_match( '~<img\b[^>]*\bsrc\s*=\s*(["\'])(.*?)\1~i', $content, $m ) ) {
		return $m[2];
	}
	return '';
}

/*
 * Build a clean plain-text excerpt for the og:description meta tag
 * (Issue #231). The post's post_excerpt wins when non-empty; otherwise
 * the helper falls back to post_content stripped down to plain text.
 *
 * Stripping order matters: block-editor markers like
 * `<!-- wp:paragraph -->` are HTML comments that strip_tags() does not
 * remove, so comments are stripped first; then tags; then HTML
 * entities are decoded so the truncated string contains real
 * characters (not `&amp;`); then whitespace is collapsed to single
 * spaces. mb_strlen / mb_substr are used so multibyte content
 * (the 071 blog runs Japanese posts) is counted by character, not
 * byte. The truncated form ends with U+2026 HORIZONTAL ELLIPSIS.
 *
 * Callers HTML-escape for the attribute value at the point of output;
 * this function returns plain text.
 *
 * @param string $excerpt The post's post_excerpt field.
 * @param string $content The post's post_content field.
 * @param int    $max_len Maximum character length (default 200).
 * @return string The description text, or '' when no usable text
 *                was found in either field.
 */
function post_excerpt_for_ogp( $excerpt, $content, $max_len = 200 ) {
	$source = stripslashes( (string) $excerpt );
	if ( '' === trim( $source ) ) {
		$source = stripslashes( (string) $content );
	}
	$source = preg_replace( '/<!--.*?-->/s', '', $source );
	$source = strip_tags( (string) $source );
	$source = html_entity_decode( $source, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	$source = trim( (string) preg_replace( '/\s+/', ' ', $source ) );
	if ( '' === $source ) {
		return '';
	}
	if ( mb_strlen( $source, 'UTF-8' ) > $max_len ) {
		$source = rtrim( mb_substr( $source, 0, $max_len - 1, 'UTF-8' ) ) . "\u{2026}";
	}
	return $source;
}

function single_post_title( $prefix = '', $display = true ) {
	global $p;
	if ( intval( $p ) ) {
		$post_data = get_postdata( $p );
		$title     = $post_data['Title'];
		$title     = apply_filters( 'single_post_title', $title );
		if ( $display ) {
			echo $prefix . strip_tags( stripslashes( $title ) );
		} else {
			return strip_tags( stripslashes( $title ) );
		}
	}
}

function single_cat_title( $prefix = '', $display = true ) {
	global $cat;
	if ( ! empty( $cat ) && ! ( strtoupper( $cat ) == 'ALL' ) ) {
		$my_cat_name = get_the_category_by_ID( $cat );
		if ( ! empty( $my_cat_name ) ) {
			if ( $display ) {
				echo $prefix . strip_tags( stripslashes( $my_cat_name ) );
			} else {
				return strip_tags( stripslashes( $my_cat_name ) );
			}
		}
	}
}

function single_month_title( $prefix = '', $display = true ) {
	global $m, $month;
	if ( ! empty( $m ) ) {
		$my_year = substr( $m, 0, 4 );
		// a year-only archive ($m = 'YYYY') has no month part, so
		// substr() yields '' and $month[''] misses; default to ''.
		$my_month = $month[ substr( $m, 4, 2 ) ] ?? '';
		if ( $display ) {
			echo $prefix . $my_month . $prefix . $my_year;
		} else {
			return $m;
		}
	}
}

function get_archives( $type = '', $limit = '' ) {
	global $querycount;
	global $tableposts, $dateformat, $time_difference, $siteurl, $blogfilename;
	global $querystring_start, $querystring_equal, $querystring_separator, $month, $wpdb, $start_of_week;

	if ( '' == $type ) {
		$type = get_settings( 'archive_mode' );
	}

	if ( '' != $limit ) {
		$limit = (int) $limit;
		$limit = " LIMIT $limit";
	}
	// this is what will separate dates on weekly archive links
	$archive_week_separator = '&#8211;';

	// archive link url
	$archive_link_m = $siteurl . '/' . $blogfilename . $querystring_start . 'm' . $querystring_equal; # monthly archive;
	$archive_link_w = $siteurl . '/' . $blogfilename . $querystring_start . 'w' . $querystring_equal; # weekly archive;
	$archive_link_p = $siteurl . '/' . $blogfilename . $querystring_start . 'p' . $querystring_equal; # post-by-post archive;

	// over-ride general date format ? 0 = no: use the date format set in Options, 1 = yes: over-ride
	$archive_date_format_over_ride = 0;

	// options for daily archive (only if you over-ride the general date format)
	$archive_day_date_format = 'Y/m/d';

	// options for weekly archive (only if you over-ride the general date format)
	$archive_week_start_date_format = 'Y/m/d';
	$archive_week_end_date_format   = 'Y/m/d';

	if ( ! $archive_date_format_over_ride ) {
		$archive_day_date_format        = $dateformat;
		$archive_week_start_date_format = $dateformat;
		$archive_week_end_date_format   = $dateformat;
	}

	$now = date( 'Y-m-d H:i:s', ( time() + ( $time_difference * 3600 ) ) );

	if ( 'monthly' == $type ) {
		++$querycount;
		$arcresults = $wpdb->get_results( "SELECT DISTINCT YEAR(post_date) AS `year`, MONTH(post_date) AS `month` FROM $tableposts WHERE post_date < '$now' AND post_category > 0 AND post_status = 'publish' ORDER BY post_date DESC" . $limit );
		foreach ( $arcresults as $arcresult ) {
			echo "<li><a href=\"$archive_link_m$arcresult->year" . zeroise( $arcresult->month, 2 ) . '">';
			echo $month[ zeroise( $arcresult->month, 2 ) ] . ' ' . $arcresult->year;
			echo "</a></li>\n";
		}
	} elseif ( 'daily' == $type ) {
		++$querycount;
		$arcresults = $wpdb->get_results( "SELECT DISTINCT YEAR(post_date) AS `year`, MONTH(post_date) AS `month`, DAYOFMONTH(post_date) AS `dayofmonth` FROM $tableposts WHERE post_date < '$now' AND post_category > 0 AND post_status = 'publish' ORDER BY post_date DESC" . $limit );
		foreach ( $arcresults as $arcresult ) {
			echo "<li><a href=\"$archive_link_m$arcresult->year" . zeroise( $arcresult->month, 2 ) . zeroise( $arcresult->dayofmonth, 2 ) . '">';
			echo mysql2date( $archive_day_date_format, $arcresult->year . '-' . zeroise( $arcresult->month, 2 ) . '-' . zeroise( $arcresult->dayofmonth, 2 ) . ' 00:00:00' );
			echo "</a></li>\n";
		}
	} elseif ( 'weekly' == $type ) {
		if ( ! isset( $start_of_week ) ) {
			$start_of_week = 1;
		}
		++$querycount;
		$arcresults = $wpdb->get_results( "SELECT DISTINCT WEEK(post_date) AS `week`, YEAR(post_date) AS yr, DATE_FORMAT(post_date, '%Y-%m-%d') AS yyyymmdd FROM $tableposts WHERE post_date < '$now' AND post_category > 0 AND post_status = 'publish' ORDER BY post_date DESC" . $limit );
		$arc_w_last = '';
		foreach ( $arcresults as $arcresult ) {
			if ( $arcresult->week != $arc_w_last ) {
				$arc_year       = $arcresult->yr;
				$arc_w_last     = $arcresult->week;
				$arc_week       = get_weekstartend( $arcresult->yyyymmdd, $start_of_week );
				$arc_week_start = date_i18n( $archive_week_start_date_format, $arc_week['start'] );
				$arc_week_end   = date_i18n( $archive_week_end_date_format, $arc_week['end'] );
				echo "<li><a href='$siteurl/$blogfilename$querystring_start" . "m$querystring_equal$arc_year$querystring_separator" . "w$querystring_equal$arcresult->week'>";
				echo $arc_week_start . $archive_week_separator . $arc_week_end;
				echo "</a></li>\n";
			}
		}
	} elseif ( 'postbypost' == $type ) {
		++$querycount;
		$arcresults = $wpdb->get_results( "SELECT ID, post_date, post_title FROM $tableposts WHERE post_date < '$now' AND post_category > 0 AND post_status = 'publish' ORDER BY post_date DESC" . $limit );
		foreach ( $arcresults as $arcresult ) {
			if ( '0000-00-00 00:00:00' != $arcresult->post_date ) {
				echo "<li><a href=\"$archive_link_p" . $arcresult->ID . '">';
				$arc_title = stripslashes( $arcresult->post_title );
				if ( $arc_title ) {
					echo strip_tags( $arc_title );
				} else {
					echo $arcresult->ID;
				}
				echo "</a></li>\n";
			}
		}
	}
}
/***** // About-the-blog tags *****/




/***** Date/Time tags *****/

function the_date( $d = '', $before = '', $after = '', $echo = true ) {
	global $id, $post, $day, $previousday, $dateformat, $newday;
	$the_date = '';
	if ( $day != $previousday ) {
		$the_date .= $before;
		if ( '' == $d ) {
			$the_date .= mysql2date( $dateformat, $post->post_date );
		} else {
			$the_date .= mysql2date( $d, $post->post_date );
		}
		$the_date   .= $after;
		$previousday = $day;
	}
	$the_date = apply_filters( 'the_date', $the_date );
	if ( $echo ) {
		echo $the_date;
	} else {
		return $the_date;
	}
}

function the_time( $d = '', $echo = true ) {
	global $id, $post, $timeformat;
	if ( '' == $d ) {
		$the_time = mysql2date( $timeformat, $post->post_date );
	} else {
		$the_time = mysql2date( $d, $post->post_date );
	}
	$the_time = apply_filters( 'the_time', $the_time );
	if ( $echo ) {
		echo $the_time;
	} else {
		return $the_time;
	}
}

function the_weekday() {
	global $weekday, $id, $post;
	$the_weekday = $weekday[ mysql2date( 'w', $post->post_date ) ];
	$the_weekday = apply_filters( 'the_weekday', $the_weekday );
	echo $the_weekday;
}

function the_weekday_date( $before = '', $after = '' ) {
	global $weekday, $id, $post, $day, $previousweekday;
	$the_weekday_date = '';
	if ( $day != $previousweekday ) {
		$the_weekday_date .= $before;
		$the_weekday_date .= $weekday[ mysql2date( 'w', $post->post_date ) ];
		$the_weekday_date .= $after;
		$previousweekday   = $day;
	}
	$the_weekday_date = apply_filters( 'the_weekday_date', $the_weekday_date );
	echo $the_weekday_date;
}

/***** // Date/Time tags *****/




/***** Author tags *****/

function the_author() {
	global $id, $authordata;
	$i = $authordata->user_idmode;
	if ( 'nickname' == $i ) {
		echo $authordata->user_nickname;
	}
	if ( 'login' == $i ) {
		echo $authordata->user_login;
	}
	if ( 'firstname' == $i ) {
		echo $authordata->user_firstname;
	}
	if ( 'lastname' == $i ) {
		echo $authordata->user_lastname;
	}
	if ( 'namefl' == $i ) {
		echo $authordata->user_firstname . ' ' . $authordata->user_lastname;
	}
	if ( 'namelf' == $i ) {
		echo $authordata->user_lastname . ' ' . $authordata->user_firstname;
	}
	if ( ! $i ) {
		echo $authordata->user_nickname;
	}
}

function the_author_login() {
	global $id, $authordata;
	echo $authordata->user_login;
}

function the_author_firstname() {
	global $id, $authordata;
	echo $authordata->user_firstname;
}

function the_author_lastname() {
	global $id, $authordata;
	echo $authordata->user_lastname;
}

function the_author_nickname() {
	global $id, $authordata;
	echo $authordata->user_nickname;
}

function the_author_ID() {
	global $id, $authordata;
	echo $authordata->ID;
}

function the_author_email() {
	global $id, $authordata;
	echo antispambot( $authordata->user_email );
}

function the_author_url() {
	global $id, $authordata;
	echo $authordata->user_url;
}

function the_author_icq() {
	global $id, $authordata;
	echo $authordata->user_icq;
}

function the_author_aim() {
	global $id, $authordata;
	echo str_replace( ' ', '+', $authordata->user_aim );
}

function the_author_yim() {
	global $id, $authordata;
	echo $authordata->user_yim;
}

function the_author_msn() {
	global $id, $authordata;
	echo $authordata->user_msn;
}

function the_author_posts() {
	// $post is needed for $post->post_author but was missing from globals.
	global $id, $postdata, $post;
	$posts = get_usernumposts( $post->post_author );
	echo $posts;
}

/***** // Author tags *****/




/***** Post tags *****/

function the_ID() {
	global $id;
	echo $id;
}

function the_title( $before = '', $after = '' ) {
	$title = get_the_title();
	$title = convert_bbcode( $title );
	$title = convert_gmcode( $title );
	$title = convert_smilies( $title );
	$title = apply_filters( 'the_title', $title );
	if ( $title ) {
		echo convert_chars( $before . $title . $after, 'html' );
	}
}
function the_title_rss() {
	$title = get_the_title();
	$title = convert_bbcode( $title );
	$title = convert_gmcode( $title );
	$title = strip_tags( $title );
	if ( trim( $title ) ) {
		echo convert_chars( $title, 'unicode' );
	}
}
function the_title_unicode( $before = '', $after = '' ) {
	$title = get_the_title();
	$title = convert_bbcode( $title );
	$title = convert_gmcode( $title );
	$title = apply_filters( 'the_title_unicode', $title );
	if ( trim( $title ) ) {
		echo convert_chars( $before . $title . $after, 'unicode' );
	}
}
function get_the_title() {
	global $id, $post;
	$output = stripslashes( $post->post_title );
	$output = apply_filters( 'the_title', $output );
	return( $output );
}

function the_content( $more_link_text = '(more...)', $stripteaser = 0, $more_file = '' ) {
	$content = get_the_content( $more_link_text, $stripteaser, $more_file );
	$content = convert_bbcode( $content );
	$content = convert_gmcode( $content );
	$content = convert_smilies( $content );
	$content = convert_chars( $content, 'html' );
	$content = apply_filters( 'the_content', $content );
	echo $content;
}
function the_content_rss( $more_link_text = '(more...)', $stripteaser = 0, $more_file = '', $cut = 0, $encode_html = 0 ) {
	$content = get_the_content( $more_link_text, $stripteaser, $more_file );
	$content = convert_bbcode( $content );
	$content = convert_gmcode( $content );
	$content = convert_chars( $content, 'unicode' );
	if ( $cut && ! $encode_html ) {
		$encode_html = 2;
	}
	if ( 1 == $encode_html ) {
		$content = htmlspecialchars( $content );
		$cut     = 0;
	} elseif ( 0 == $encode_html ) {
		$content = make_url_footnote( $content );
	} elseif ( 2 == $encode_html ) {
		$content = strip_tags( $content );
	}
	if ( $cut ) {
		$blah = explode( ' ', $content );
		if ( count( $blah ) > $cut ) {
			$k             = $cut;
			$use_dotdotdot = 1;
		} else {
			$k             = count( $blah );
			$use_dotdotdot = 0;
		}
		$excerpt = '';
		for ( $i = 0; $i < $k; $i++ ) {
			$excerpt .= $blah[ $i ] . ' ';
		}
		$excerpt .= ( $use_dotdotdot ) ? '...' : '';
		$content  = $excerpt;
	}
	echo $content;
}

function the_content_unicode( $more_link_text = '(more...)', $stripteaser = 0, $more_file = '' ) {
	$content = get_the_content( $more_link_text, $stripteaser, $more_file );
	$content = convert_bbcode( $content );
	$content = convert_gmcode( $content );
	$content = convert_smilies( $content );
	$content = convert_chars( $content, 'unicode' );
	$content = apply_filters( 'the_content_unicode', $content );
	echo $content;
}

/**
 * Strip the block editor's delimiter comments from post content.
 *
 * The block editor (tools/block-editor/) stores a post's content with the
 * `<!-- wp:* -->` and `<!-- /wp:* -->` HTML comments that delimit each
 * block. WordPress 0.71 has no block system and renders post_content as
 * plain HTML, so without this those comments survive into the rendered
 * page. The markup between a block's delimiters is already plain HTML, so
 * dropping the delimiter comments is all the front end needs; the raw
 * post_content in the database keeps them, so the editor can still parse
 * the post back into blocks.
 *
 * @param string $content The raw post content.
 * @return string The content with the block delimiter comments removed.
 */
/*
 * Inject HTML width / height attributes on every <img> that lacks them
 * (Issue #235). The block-editor Image block saves only
 * `style="aspect-ratio:...;width:600px"`, no HTML attributes, so the
 * parser cannot reserve the layout box before the stylesheet loads --
 * which is exactly the early-paint CLS PageSpeed's "Image elements do
 * not have explicit width and height" audit penalises.
 *
 * For each <img> the helper resolves the `src` URL against $siteurl,
 * looks the file up on disk at $abspath . <rel>, and calls
 * getimagesize() for the actual pixel dimensions. A per-request static
 * cache keys on the resolved path so the same image used twice in a
 * post is read once. A tag that already carries both HTML `width=` and
 * `height=` attributes is left alone (a manually authored
 * `<img width="320" height="200">` is preserved). A remote src
 * (`http(s)://` to a non-$siteurl host) or an unreadable file leaves
 * the tag untouched -- the helper is best-effort, never fatal, and
 * never invents dimensions. The width / height check looks for
 * `width=` / `height=` (the HTML attribute form) to avoid being fooled
 * by `style="width:..."` (the CSS form, which uses `:`, not `=`).
 *
 * @param string $content The post content (already stripped of block
 *                        delimiter comments).
 * @return string The content with width / height attributes injected
 *                where they were missing.
 */
function add_image_dimensions( $content ) {
	global $siteurl, $abspath;
	if ( ! is_string( $content ) || false === stripos( $content, '<img' ) ) {
		return (string) $content;
	}
	$site  = isset( $siteurl ) ? (string) $siteurl : '';
	$root  = isset( $abspath ) ? rtrim( (string) $abspath, '/' ) . '/' : '';
	$cache = array();
	return (string) preg_replace_callback(
		'~<img\b[^>]*>~i',
		static function ( array $m ) use ( $site, $root, &$cache ) {
			$tag = $m[0];
			// HTML attributes: `width="..."` uses `=`; CSS in style="..."
			//     uses `:`. So `\bwidth\s*=\s*["\']\d` matches the HTML
			//     attribute form, not `style="width:600px"`.
			if (
				preg_match( '~\bwidth\s*=\s*["\']\d~i', $tag )
				&& preg_match( '~\bheight\s*=\s*["\']\d~i', $tag )
			) {
				return $tag;
			}
			if ( ! preg_match( '~\bsrc\s*=\s*(["\'])(.*?)\1~i', $tag, $src ) ) {
				return $tag;
			}
			$url = $src[2];
			$rel = $url;
			if ( '' !== $site && str_starts_with( $url, $site ) ) {
				$rel = substr( $url, strlen( $site ) );
			} elseif ( preg_match( '~^https?://~i', $url ) ) {
				// remote -- cannot read the file from disk.
				return $tag;
			}
			$rel = ltrim( (string) $rel, '/' );
			if ( '' === $root || '' === $rel ) {
				return $tag;
			}
			$abs = $root . $rel;
			if ( ! array_key_exists( $abs, $cache ) ) {
				$cache[ $abs ] = @getimagesize( $abs );
			}
			$dim = $cache[ $abs ];
			if ( ! is_array( $dim ) || ! isset( $dim[0], $dim[1] ) ) {
				return $tag;
			}
			$inject = ' width="' . (int) $dim[0] . '" height="' . (int) $dim[1] . '"';
			// Inject immediately before the closing `/>` or `>`.
			return (string) preg_replace( '~\s*/?>$~', $inject . '$0', $tag, 1 );
		},
		$content
	);
}

/*
 * Add browser loading hints to every <img> in $content (Issue #237).
 *
 * The first <img> is the most likely LCP candidate, so it gets only
 * `decoding="async"` -- `loading="lazy"` on the LCP image pushes LCP
 * later. Every other <img> gets both `loading="lazy"` and
 * `decoding="async"` so the browser defers the fetch and decode until
 * the image scrolls into view, which is exactly the gain PageSpeed's
 * "Defer offscreen images" audit measures. `decoding="async"` is safe
 * on every tag (it only asks for off-main-thread decode and does not
 * delay the fetch), so adding it on the first image too is a net win.
 *
 * Each attribute is only added when missing -- a manually authored
 * `loading="eager"` or `decoding="auto"` is preserved verbatim.
 *
 * @param string $content The post content.
 * @return string The content with loading / decoding hints injected.
 */
function add_image_loading_hints( $content ) {
	if ( ! is_string( $content ) || false === stripos( $content, '<img' ) ) {
		return (string) $content;
	}
	$is_first = true;
	return (string) preg_replace_callback(
		'~<img\b[^>]*>~i',
		static function ( array $m ) use ( &$is_first ) {
			$tag        = $m[0];
			$first      = $is_first;
			$is_first   = false;
			$needs_lazy = ! $first && ! preg_match( '~\bloading\s*=~i', $tag );
			$needs_dec  = ! preg_match( '~\bdecoding\s*=~i', $tag );
			if ( ! $needs_lazy && ! $needs_dec ) {
				return $tag;
			}
			$inject = '';
			if ( $needs_lazy ) {
				$inject .= ' loading="lazy"';
			}
			if ( $needs_dec ) {
				$inject .= ' decoding="async"';
			}
			return (string) preg_replace( '~\s*/?>$~', $inject . '$0', $tag, 1 );
		},
		$content
	);
}

/*
 * Wrap every <img> whose on-disk source has a .webp sibling in a
 * <picture><source srcset="..webp" type="image/webp">...</picture>
 * (Issue #245). A WebP-supporting browser fetches the smaller variant
 * via <source>; older browsers fall back to the original <img> -- the
 * <picture> element makes the fallback automatic, so the wrap is safe
 * even when the user agent lacks WebP support.
 *
 * The wrap is skipped when the <img>:
 *   - has no `src`,
 *   - points at an SVG / GIF (WebP cannot improve them; GIFs may be
 *     animated and the static <picture> path would drop the animation),
 *   - is already a .webp,
 *   - points at a remote host (cannot check disk),
 *   - has no .webp sibling on disk yet (the CLI backfill creates these).
 *
 * The check uses a per-request static cache keyed on the on-disk
 * sibling path so the same image used twice in a post hits the
 * filesystem once.
 *
 * The webp URL is the original src with ".webp" appended -- i.e.
 * "img.png" pairs with "img.png.webp". Matches the file-naming the
 * encoder (generate_webp_sibling) writes, so the wrap and the encoder
 * stay in sync without an extra mapping.
 *
 * @param string $content The post content.
 * @return string The content with <picture> wrappers around images
 *                whose .webp sibling exists on disk.
 */
function wrap_img_with_webp_picture( $content ) {
	global $siteurl, $abspath;
	if ( ! is_string( $content ) || false === stripos( $content, '<img' ) ) {
		return (string) $content;
	}
	$site  = isset( $siteurl ) ? (string) $siteurl : '';
	$root  = isset( $abspath ) ? rtrim( (string) $abspath, '/' ) . '/' : '';
	$cache = array();
	return (string) preg_replace_callback(
		'~<img\b[^>]*>~i',
		static function ( array $m ) use ( $site, $root, &$cache ) {
			$tag = $m[0];
			if ( ! preg_match( '~\bsrc\s*=\s*(["\'])(.*?)\1~i', $tag, $src ) ) {
				return $tag;
			}
			$url = $src[2];
			// path-only portion of the URL -- a possible query string on
			//     the src (e.g. an asset_url cache-bust) must not leak
			//     into the on-disk path or the .webp filename.
			$path = parse_url( $url, PHP_URL_PATH );
			if ( ! is_string( $path ) || '' === $path ) {
				return $tag;
			}
			$ext = strtolower( (string) pathinfo( $path, PATHINFO_EXTENSION ) );
			// WebP cannot improve SVG / WebP; GIF may be animated and a
			//     static <picture> path would drop the animation -- skip all
			//     three.
			if ( 'svg' === $ext || 'gif' === $ext || 'webp' === $ext ) {
				return $tag;
			}
			if ( preg_match( '~^https?://~i', $url ) ) {
				if ( '' === $site || ! str_starts_with( $url, $site ) ) {
					// remote -- cannot check disk for a sibling.
					return $tag;
				}
			}
			$rel = ltrim( $path, '/' );
			if ( '' === $root || '' === $rel ) {
				return $tag;
			}
			$abs_webp = $root . $rel . '.webp';
			if ( ! array_key_exists( $abs_webp, $cache ) ) {
				$cache[ $abs_webp ] = is_file( $abs_webp );
			}
			if ( ! $cache[ $abs_webp ] ) {
				return $tag;
			}
			// build the WebP URL on the path portion so a `?v=` cache-bust
			//     on the src does not become part of the filename.
			$prefix   = preg_match( '~^https?://~i', $url )
				? substr( $url, 0, strlen( (string) $site ) )
				: '';
			$webp_url = htmlspecialchars( $prefix . $path . '.webp', ENT_QUOTES, 'UTF-8' );
			return '<picture><source srcset="' . $webp_url . '" type="image/webp" />' . $tag . '</picture>';
		},
		$content
	);
}

function b2_strip_block_delimiters( $content ) {
	// An opening or void block delimiter -- `<!-- wp:name ... -->` or
	//     `<!-- wp:name ... /-->` -- and the newline that ends its line.
	//     Each delimiter sits alone on its line, so the line's newline is
	//     dropped with it; otherwise wpautop() would turn the leftover
	//     newline into a stray <br /> or </p>.
	$content = (string) preg_replace(
		'#<!--\s*wp:.*?-->[ \t]*\r?\n?#s',
		'',
		(string) $content
	);
	// A closing block delimiter -- `<!-- /wp:name -->` -- and the newline
	//     that begins its line. The blank line between two blocks is left
	//     intact, so wpautop() still renders them as separate paragraphs.
	return (string) preg_replace(
		'#\r?\n?[ \t]*<!--\s*/wp:.*?-->#s',
		'',
		$content
	);
}

function get_the_content( $more_link_text = '(more...)', $stripteaser = 0, $more_file = '' ) {
	global $id, $post, $more, $c, $withcomments, $page, $pages, $multipage, $numpages;
	global $_SERVER, $preview;
	global $querystring_start, $querystring_equal, $querystring_separator;
	global $pagenow;
	$output = '';
	if ( '' != $more_file ) {
		$file = $more_file;
	} else {
		$file = $pagenow; //$_SERVER['PHP_SELF'];
	}
	$content = $pages[ $page - 1 ];
	$content = explode( '<!--more-->', $content );
	if ( ( preg_match( '/<!--noteaser-->/', $post->post_content ) && ( ( ! $multipage ) || ( 1 == $page ) ) ) ) {
		$stripteaser = 1;
	}
	$teaser = $content[0];
	if ( ( $more ) && ( $stripteaser ) ) {
		$teaser = '';
	}
	$output .= $teaser;
	if ( count( $content ) > 1 ) {
		if ( $more ) {
			$output .= '<a name="more' . $id . '"></a>' . $content[1];
		} else {
			$output .= ' <a href="' . $file . $querystring_start . 'p' . $querystring_equal . $id . $querystring_separator . 'more' . $querystring_equal . '1#more' . $id . '">' . $more_link_text . '</a>';
		}
	}
	if ( $preview ) { // preview fix for javascript bug with foreign languages
		$output = preg_replace_callback(
			'/\%u([0-9A-F]{4,4})/',
			function ( $m ) {
				return '&#' . base_convert( $m[1], 16, 10 ) . ';';
			},
			$output
		);
	}
	// Drop the block editor's `<!-- wp:* -->` delimiter comments so they do
	//     not survive into the rendered page. get_the_content() is the one
	//     getter behind the_content() / the_content_rss() /
	//     the_content_unicode() and the faked excerpt, so this covers them
	//     all (Issue #215).
	$output = b2_strip_block_delimiters( $output );
	// Inject width / height HTML attributes on every <img> that lacks them
	//     so the parser can reserve the correct layout box before the CSS
	//     loads (Issue #235). PageSpeed's "Image elements do not have
	//     explicit width and height" audit measures exactly that early-paint
	//     CLS, and the block editor saves only style="aspect-ratio:...".
	$output = add_image_dimensions( $output );
	// Add browser loading hints to every <img>: decoding="async" on every
	//     tag, loading="lazy" on every tag except the first (the most
	//     likely LCP candidate; lazy on LCP pushes LCP later). Targets
	//     PageSpeed's "Defer offscreen images" audit -- Issue #237.
	$output = add_image_loading_hints( $output );
	// Wrap every <img> whose on-disk source has a .webp sibling in a
	//     <picture> so WebP-supporting browsers fetch the smaller variant
	//     (Issue #245). Older browsers fall back to the original <img>
	//     automatically through the <picture> element.
	$output = wrap_img_with_webp_picture( $output );
	return( $output );
}

function the_excerpt() {
	$excerpt = get_the_excerpt();
	$excerpt = convert_bbcode( $excerpt );
	$excerpt = convert_gmcode( $excerpt );
	$excerpt = convert_smilies( $excerpt );
	$excerpt = convert_chars( $excerpt, 'html' );
	$excerpt = apply_filters( 'the_excerpt', $excerpt );
	echo $excerpt;
}

function the_excerpt_rss( $cut = 0, $encode_html = 0 ) {
	$output = get_the_excerpt( true );
	$output = convert_bbcode( $output );
	$output = convert_gmcode( $output );
	$output = convert_chars( $output, 'unicode' );
	if ( $cut && ! $encode_html ) {
		$encode_html = 2;
	}
	if ( 1 == $encode_html ) {
		$output = htmlspecialchars( $output );
		$cut    = 0;
	} elseif ( 0 == $encode_html ) {
		$output = make_url_footnote( $output );
	} elseif ( 2 == $encode_html ) {
		$output = strip_tags( $output );
	}
	if ( $cut ) {
		$blah = explode( ' ', $output );
		if ( count( $blah ) > $cut ) {
			$k             = $cut;
			$use_dotdotdot = 1;
		} else {
			$k             = count( $blah );
			$use_dotdotdot = 0;
		}
		$excerpt = '';
		for ( $i = 0; $i < $k; $i++ ) {
			$excerpt .= $blah[ $i ] . ' ';
		}
		$excerpt .= ( $use_dotdotdot ) ? '...' : '';
		$output   = $excerpt;
	}
	echo $output;
}

function the_excerpt_unicode() {
	$excerpt = get_the_excerpt();
	$excerpt = convert_bbcode( $excerpt );
	$excerpt = convert_gmcode( $excerpt );
	$excerpt = convert_smilies( $excerpt );
	$excerpt = convert_chars( $excerpt, 'unicode' );
	$excerpt = apply_filters( 'the_excerpt_unicode', $excerpt );
	echo $excerpt;
}

function get_the_excerpt( $fakeit = false ) {
	global $id, $post;
	global $_SERVER, $preview;
	$output = '';
	$output = $post->post_excerpt;
	//if we haven't got an excerpt, make one in the style of the rss ones
	if ( ( '' == $output ) && $fakeit ) {
		$output         = get_the_content();
		$output         = strip_tags( $output );
		$blah           = explode( ' ', $output );
		$excerpt_length = 120;
		if ( count( $blah ) > $excerpt_length ) {
			$k             = $excerpt_length;
			$use_dotdotdot = 1;
		} else {
			$k             = count( $blah );
			$use_dotdotdot = 0;
		}
		$excerpt = '';
		for ( $i = 0; $i < $k; $i++ ) {
			$excerpt .= $blah[ $i ] . ' ';
		}
		$excerpt .= ( $use_dotdotdot ) ? '...' : '';
		$output   = $excerpt;
	} // end if no excerpt
	if ( $preview ) { // preview fix for javascript bug with foreign languages
		$output = preg_replace_callback(
			'/\%u([0-9A-F]{4,4})/',
			function ( $m ) {
				return '&#' . base_convert( $m[1], 16, 10 ) . ';';
			},
			$output
		);
	}
	return $output;
}


function link_pages( $before = '<br />', $after = '<br />', $next_or_number = 'number', $nextpagelink = 'next page', $previouspagelink = 'previous page', $pagelink = '%', $more_file = '' ) {
	global $id, $page, $numpages, $multipage, $more;
	global $pagenow;
	global $querystring_start, $querystring_equal, $querystring_separator;
	if ( '' != $more_file ) {
		$file = $more_file;
	} else {
		$file = $pagenow;
	}
	if ( ( $multipage ) ) { // && ($more)) {
		if ( 'number' == $next_or_number ) {
			echo $before;
			for ( $i = 1; $i < ( $numpages + 1 ); $i = $i + 1 ) {
				$j = str_replace( '%', "$i", $pagelink );
				echo ' ';
				if ( ( $i != $page ) || ( ( ! $more ) && ( 1 == $page ) ) ) {
					echo '<a href="' . $file . $querystring_start . 'p' . $querystring_equal . $id .
					$querystring_separator . 'more' . $querystring_equal . '1' .
					$querystring_separator . 'page' . $querystring_equal . $i . '">';
				}
				echo $j;
				if ( ( $i != $page ) || ( ( ! $more ) && ( 1 == $page ) ) ) {
					echo '</a>';
				}
			}
			echo $after;
		} else {
			if ( $more ) {
				echo $before;
				$i = $page - 1;
				if ( $i && $more ) {
					echo ' <a href="' . $file . $querystring_start . 'p' . $querystring_equal . $id .
					$querystring_separator . 'more' . $querystring_equal . '1' .
					$querystring_separator . 'page' . $querystring_equal . $i . '">' .
					$previouspagelink . '</a>';
				}
				$i = $page + 1;
				if ( $i <= $numpages && $more ) {
					echo ' <a href="' . $file . $querystring_start . 'p' . $querystring_equal . $id .
					$querystring_separator . 'more' . $querystring_equal . '1' .
					$querystring_separator . 'page' . $querystring_equal . $i . '">' .
					$nextpagelink . '</a>';
				}
				echo $after;
			}
		}
	}
}


function previous_post( $format = '%', $previous = 'previous post: ', $title = 'yes', $in_same_cat = 'no', $limitprev = 1, $excluded_categories = '' ) {
	global $tableposts, $id, $post, $siteurl, $blogfilename, $querycount, $wpdb;
	global $p, $posts, $posts_per_page, $s;
	global $querystring_start, $querystring_equal, $querystring_separator;

	if ( ( $p ) || ( 1 == $posts_per_page ) ) {

		$current_post_date = $post->post_date;
		$current_category  = $post->post_category;

		$sqlcat = '';
		if ( 'no' != $in_same_cat ) {
			$sqlcat = " AND post_category = '$current_category' ";
		}

		$sql_exclude_cats = '';
		if ( ! empty( $excluded_categories ) ) {
			$blah = explode( 'and', $excluded_categories );
			foreach ( $blah as $category ) {
				$category          = intval( $category );
				$sql_exclude_cats .= " AND post_category != $category";
			}
		}

		--$limitprev;
		$lastpost = @$wpdb->get_row( "SELECT ID, post_title FROM $tableposts WHERE post_date < '$current_post_date' AND post_category > 0 $sqlcat $sql_exclude_cats ORDER BY post_date DESC LIMIT $limitprev, 1" );
		++$querycount;
		if ( $lastpost ) {
			$string  = '<a href="' . $blogfilename . $querystring_start . 'p' . $querystring_equal . $lastpost->ID . $querystring_separator . 'more' . $querystring_equal . '1' . $querystring_separator . 'c' . $querystring_equal . '1">' . $previous;
			$string .= wptexturize( stripslashes( $lastpost->post_title ) );
			$string .= '</a>';
			$format  = str_replace( '%', $string, $format );
			echo $format;
		}
	}
}

function next_post( $format = '%', $next = 'next post: ', $title = 'yes', $in_same_cat = 'no', $limitnext = 1, $excluded_categories = '' ) {
	global $wpdb;
	global $tableposts, $p, $posts, $id, $post, $siteurl, $blogfilename, $querycount;
	global $time_difference;
	global $querystring_start, $querystring_equal, $querystring_separator;
	if ( ( $p ) || ( 1 == $posts ) ) {

		$current_post_date = $post->post_date;
		$current_category  = $post->post_category;

		$sqlcat = '';
		if ( 'no' != $in_same_cat ) {
			$sqlcat = " AND post_category='$current_category' ";
		}

		$sql_exclude_cats = '';
		if ( ! empty( $excluded_categories ) ) {
			$blah = explode( 'and', $excluded_categories );
			foreach ( $blah as $category ) {
				$category          = intval( $category );
				$sql_exclude_cats .= " AND post_category != $category";
			}
		}

		$now = date( 'Y-m-d H:i:s', ( time() + ( $time_difference * 3600 ) ) );

		--$limitnext;

		$nextpost = @$wpdb->get_row( "SELECT ID,post_title FROM $tableposts WHERE post_date > '$current_post_date' AND post_date < '$now' AND post_category > 0 $sqlcat $sql_exclude_cats ORDER BY post_date ASC LIMIT $limitnext,1" );
		++$querycount;
		if ( $nextpost ) {
			$string = '<a href="' . $blogfilename . $querystring_start . 'p' . $querystring_equal . $nextpost->ID . $querystring_separator . 'more' . $querystring_equal . '1' . $querystring_separator . 'c' . $querystring_equal . '1">' . $next;
			if ( 'yes' == $title ) {
				$string .= wptexturize( stripslashes( $nextpost->post_title ) );
			}
			$string .= '</a>';
			$format  = str_replace( '%', $string, $format );
			echo $format;
		}
	}
}





function next_posts( $max_page = 0 ) {
	// original by cfactor at cooltux.org
	global $_SERVER, $siteurl, $blogfilename, $p, $paged, $what_to_show, $pagenow;
	global $querystring_start, $querystring_equal, $querystring_separator;
	if ( empty( $p ) && ( 'paged' == $what_to_show ) ) {
		$qstr = $_SERVER['QUERY_STRING'];
		if ( ! empty( $qstr ) ) {
			$qstr = preg_replace( '/&paged=\d{0,}/', '', $qstr );
			$qstr = preg_replace( '/paged=\d{0,}/', '', $qstr );
		} elseif ( stristr( $_SERVER['REQUEST_URI'], $_SERVER['SCRIPT_NAME'] ) ) {
			$qstr = str_replace(
				$_SERVER['SCRIPT_NAME'],
				'',
				$_SERVER['REQUEST_URI']
			);
			if ( '' != $qstr ) {
				$qstr = preg_replace( '/^\//', '', $qstr );
				$qstr = preg_replace( '/paged\/\d{0,}\//', '', $qstr );
				$qstr = preg_replace( '/paged\/\d{0,}/', '', $qstr );
				$qstr = preg_replace( '/\/$/', '', $qstr );
			}
		}
		if ( ! $paged ) {
			$paged = 1;
		}
		$nextpage = intval( $paged ) + 1;
		if ( ! $max_page || $max_page >= $nextpage ) {
			echo $pagenow . $querystring_start .
				( '' == $qstr ? '' : $qstr . $querystring_separator ) .
				'paged' . $querystring_equal . $nextpage;
		}
	}
}

function next_posts_link( $label = 'Next Page >>', $max_page = 0 ) {
	global $wpdb;
	global $p, $paged, $result, $request, $posts_per_page, $what_to_show;
	if ( 'paged' == $what_to_show ) {
		if ( ! $max_page ) {
			$nxt_request = $request;
			$pos         = strpos( strtoupper( $request ), 'LIMIT' );
			if ( $pos ) {
				$nxt_request = substr( $request, 0, $pos );
			}
			$nxt_result = mysqli_query( $wpdb->dbh, $nxt_request );
			$numposts   = mysqli_num_rows( $nxt_result );
			$max_page   = ceil( $numposts / $posts_per_page );
		}
		if ( ! $paged ) {
			$paged = 1;
		}
		$nextpage = intval( $paged ) + 1;
		if ( empty( $p ) && ( empty( $paged ) || $nextpage <= $max_page ) ) {
			echo '<a href="';
			echo next_posts( $max_page );
			echo '">' . htmlspecialchars( $label ) . '</a>';
		}
	}
}


function previous_posts() {
	// original by cfactor at cooltux.org
	global $_SERVER, $siteurl, $blogfilename, $p, $paged, $what_to_show, $pagenow;
	global $querystring_start, $querystring_equal, $querystring_separator;
	if ( empty( $p ) && ( 'paged' == $what_to_show ) ) {
		$qstr = $_SERVER['QUERY_STRING'];
		if ( ! empty( $qstr ) ) {
			$qstr = preg_replace( '/&paged=\d{0,}/', '', $qstr );
			$qstr = preg_replace( '/paged=\d{0,}/', '', $qstr );
		} elseif ( stristr( $_SERVER['REQUEST_URI'], $_SERVER['SCRIPT_NAME'] ) ) {
			$qstr = str_replace(
				$_SERVER['SCRIPT_NAME'],
				'',
				$_SERVER['REQUEST_URI']
			);
			if ( '' != $qstr ) {
				$qstr = preg_replace( '/^\//', '', $qstr );
				$qstr = preg_replace( '/paged\/\d{0,}\//', '', $qstr );
				$qstr = preg_replace( '/paged\/\d{0,}/', '', $qstr );
				$qstr = preg_replace( '/\/$/', '', $qstr );
			}
		}
		$nextpage = intval( $paged ) - 1;
		if ( $nextpage < 1 ) {
			$nextpage = 1;
		}
		echo $pagenow . $querystring_start .
			( '' == $qstr ? '' : $qstr . $querystring_separator ) .
			'paged' . $querystring_equal . $nextpage;
	}
}

function previous_posts_link( $label = '<< Previous Page' ) {
	global $p, $paged, $what_to_show;
	if ( empty( $p ) && ( $paged > 1 ) && ( 'paged' == $what_to_show ) ) {
		echo '<a href="';
		echo previous_posts();
		echo '">' . htmlspecialchars( $label ) . '</a>';
	}
}

function posts_nav_link( $sep = ' :: ', $prelabel = '<< Previous Page', $nxtlabel = 'Next Page >>' ) {
	global $wpdb;
	global $p, $what_to_show, $request, $posts_per_page;
	if ( empty( $p ) && ( 'paged' == $what_to_show ) ) {
		$nxt_request = $request;
		$pos         = strpos( strtoupper( $request ), 'LIMIT' );
		if ( $pos ) {
			$nxt_request = substr( $request, 0, $pos );
		}
		$nxt_result = mysqli_query( $wpdb->dbh, $nxt_request );
		$numposts   = mysqli_num_rows( $nxt_result );
		$max_page   = ceil( $numposts / $posts_per_page );
		if ( $max_page > 1 ) {
			previous_posts_link( $prelabel );
			echo htmlspecialchars( $sep );
			next_posts_link( $nxtlabel, $max_page );
		}
	}
}

/***** // Post tags *****/




/***** Category tags *****/

function the_category() {
	$category = get_the_category();
	$category = apply_filters( 'the_category', $category );
	echo convert_chars( $category, 'html' );
}
function the_category_rss() {
	echo convert_chars( strip_tags( get_the_category() ), 'xml' );
}
function the_category_unicode() {
	$category = get_the_category();
	$category = apply_filters( 'the_category_unicode', $category );
	echo convert_chars( $category, 'unicode' );
}

function get_the_category() {
	global $post, $tablecategories, $querycount, $cache_categories, $use_cache, $wpdb;
	$cat_ID = $post->post_category;
	if ( ( empty( $cache_categories[ $cat_ID ] ) ) or ( ! $use_cache ) ) {
		$cat_name = $wpdb->get_var( "SELECT cat_name FROM $tablecategories WHERE cat_ID = '$cat_ID'" );
		++$querycount;
		$cache_categories[ $cat_ID ] = &$cat_name;
	} else {
		$cat_name = $cache_categories[ $cat_ID ];
	}
	return( stripslashes( $cat_name ) );
}

function get_the_category_by_ID( $cat_ID ) {
	global $tablecategories, $querycount, $cache_categories, $use_cache, $wpdb;
	// use empty() so an uninitialised $cache_categories cache does not
	// warn (matches the sibling get_the_category()).
	if ( ( empty( $cache_categories[ $cat_ID ] ) ) or ( ! $use_cache ) ) {
		$cat_name = $wpdb->get_var( "SELECT cat_name FROM $tablecategories WHERE cat_ID = '$cat_ID'" );
		++$querycount;
		$cache_categories[ $cat_ID ] = &$cat_name;
	} else {
		$cat_name = $cache_categories[ $cat_ID ];
	}
	return( stripslashes( $cat_name ) );
}

function the_category_ID() {
	global $post;
	echo $post->post_category;
}

function the_category_head( $before = '', $after = '' ) {
	global $post, $currentcat, $previouscat, $dateformat, $newday;
	$currentcat = $post->post_category;
	if ( $currentcat != $previouscat ) {
		echo $before;
		echo get_the_category_by_ID( $currentcat );
		echo $after;
		$previouscat = $currentcat;
	}
}

// out of the b2 loop
function dropdown_cats( $optionall = 1, $all = 'All' ) {
	global $cat, $tablecategories, $querycount, $wpdb;
	$categories = $wpdb->get_results( "SELECT cat_ID, cat_name FROM $tablecategories" );
	++$querycount;
	echo "<select name='cat' class='postform'>\n";
	if ( intval( $optionall ) == 1 ) {
		echo "\t<option value='all'>$all</option>\n";
	}
	foreach ( $categories as $category ) {
		echo "\t<option value=\"" . $category->cat_ID . '"';
		if ( $category->cat_ID == $cat ) {
			echo ' selected="selected"';
		}
		echo '>' . stripslashes( $category->cat_name ) . "</option>\n";
	}
	echo "</select>\n";
}

// out of the b2 loop
function list_cats( $optionall = 1, $all = 'All', $sort_column = 'ID', $sort_order = 'asc', $file = 'blah', $list = true ) {
	global $tablecategories, $querycount, $wpdb;
	global $pagenow;
	global $querystring_start, $querystring_equal, $querystring_separator;
	$file        = ( 'blah' == $file ) ? $pagenow : $file;
	$sort_column = 'cat_' . $sort_column;
	$categories  = $wpdb->get_results( "SELECT * FROM $tablecategories WHERE cat_ID > 0 ORDER BY $sort_column $sort_order" );
	++$querycount;
	if ( intval( $optionall ) == 1 ) {
		$all = apply_filters( 'list_cats', $all );
		if ( $list ) {
			echo "\n\t<li><a href=\"" . $file . $querystring_start . 'cat' . $querystring_equal . 'all">' . $all . '</a></li>';
		} else {
			echo "\t<a href=\"" . $file . $querystring_start . 'cat' . $querystring_equal . 'all">' . $all . "</a><br />\n";
		}
	}
	foreach ( $categories as $category ) {
		$cat_name = apply_filters( 'list_cats', $category->cat_name );
		if ( $list ) {
			echo "\n\t<li><a href=\"" . $file . $querystring_start . 'cat' . $querystring_equal . $category->cat_ID . '">';
			echo stripslashes( $cat_name ) . '</a></li>';
		} else {
			echo "\t<a href=\"" . $file . $querystring_start . 'cat' . $querystring_equal . $category->cat_ID . '">';
			echo stripslashes( $cat_name ) . "</a><br />\n";
		}
	}
}

/***** // Category tags *****/




/***** <Link> tags *****/



/***** // <Link> tags *****/



/***** Permalink tags *****/

function permalink_anchor( $mode = 'id' ) {
	global $id, $post;
	switch ( strtolower( $mode ) ) {
		case 'title':
			$title = preg_replace( '/[^a-zA-Z0-9_\.-]/', '_', $post->post_title );
			echo '<a name="' . $title . '"></a>';
			break;
		case 'id':
		default:
			echo '<a name="' . $id . '"></a>';
			break;
	}
}

function permalink_link( $file = '', $mode = 'id' ) {
	global $id, $post, $pagenow, $cacheweekly, $wpdb, $querycount;
	global $querystring_start, $querystring_equal, $querystring_separator;
	$file = ( '' == $file ) ? $pagenow : $file;
	switch ( strtolower( $mode ) ) {
		case 'title':
			$title  = preg_replace( '/[^a-zA-Z0-9_\.-]/', '_', $post->post_title );
			$anchor = $title;
			break;
		case 'id':
		default:
			$anchor = $id;
			break;
	}
	$archive_mode = get_settings( 'archive_mode' );
	switch ( $archive_mode ) {
		case 'daily':
			echo $file . $querystring_start . 'm' . $querystring_equal . substr( $post->post_date, 0, 4 ) . substr( $post->post_date, 5, 2 ) . substr( $post->post_date, 8, 2 ) . '#' . $anchor;
			break;
		case 'monthly':
			echo $file . $querystring_start . 'm' . $querystring_equal . substr( $post->post_date, 0, 4 ) . substr( $post->post_date, 5, 2 ) . '#' . $anchor;
			break;
		case 'weekly':
			if ( ( ! isset( $cacheweekly ) ) || ( empty( $cacheweekly[ $post->post_date ] ) ) ) {
				$cacheweekly[ $post->post_date ] = $wpdb->get_var( "SELECT WEEK('$post->post_date')" );
				++$querycount;
			}
			echo $file . $querystring_start . 'm' . $querystring_equal . substr( $post->post_date, 0, 4 ) . $querystring_separator . 'w' . $querystring_equal . $cacheweekly[ $post->post_date ] . '#' . $anchor;
			break;
		case 'postbypost':
			echo $file . $querystring_start . 'p' . $querystring_equal . $id;
			break;
	}
}

function permalink_single( $file = '' ) {
	global $id, $pagenow;
	global $querystring_start, $querystring_equal, $querystring_separator;
	if ( '' == $file ) {
		$file = $pagenow;
	}
	echo $file . $querystring_start . 'p' . $querystring_equal . $id . $querystring_separator . 'more' . $querystring_equal . '1' . $querystring_separator . 'c' . $querystring_equal . '1';
}

function permalink_single_rss() {
	global $id, $pagenow, $siteurl, $blogfilename;
	global $querystring_start, $querystring_equal, $querystring_separator;
		echo $siteurl . '/' . $blogfilename . $querystring_start . 'p' . $querystring_equal . $id . $querystring_separator . 'c' . $querystring_equal . '1';
}

/***** // Permalink tags *****/




// @@@ These aren't template tags, do not edit them

function start_b2() {
	global $post, $id, $postdata, $authordata, $day, $preview, $page, $pages, $multipage, $more, $numpages;
	global $preview_userid, $preview_date, $preview_content, $preview_title, $preview_category, $preview_notify, $preview_make_clickable, $preview_autobr;
	global $pagenow;
	global $_GET;
	if ( ! $preview ) {
		$id = $post->ID;
	} else {
		$id       = 0;
		$postdata = array(
			'ID'        => 0,
			'Author_ID' => $_GET['preview_userid'],
			'Date'      => $_GET['preview_date'],
			'Content'   => $_GET['preview_content'],
			'Excerpt'   => $_GET['preview_excerpt'],
			'Title'     => $_GET['preview_title'],
			'Category'  => $_GET['preview_category'],
			'Notify'    => 1,
		);
	}
	$authordata   = get_userdata( $post->post_author );
	$day          = mysql2date( 'd.m.y', $post->post_date );
	$currentmonth = mysql2date( 'm', $post->post_date );
	$numpages     = 1;
	if ( ! $page ) {
		$page = 1;
	}
	if ( isset( $p ) ) {
		$more = 1;
	}
	$content = $post->post_content;
	if ( preg_match( '/<!--nextpage-->/', $post->post_content ) ) {
		if ( $page > 1 ) {
			$more = 1;
		}
		$multipage = 1;
		$content   = stripslashes( $post->post_content );
		$content   = str_replace( "\n<!--nextpage-->\n", '<!--nextpage-->', $content );
		$content   = str_replace( "\n<!--nextpage-->", '<!--nextpage-->', $content );
		$content   = str_replace( "<!--nextpage-->\n", '<!--nextpage-->', $content );
		$pages     = explode( '<!--nextpage-->', $content );
		$numpages  = count( $pages );
	} else {
		$pages[0]  = stripslashes( $post->post_content );
		$multipage = 0;
	}
	return true;
}

function is_new_day() {
	global $day, $previousday;
	if ( $day != $previousday ) {
		return( 1 );
	} else {
		return( 0 );
	}
}

function apply_filters( $tag, $string ) {
	global $b2_filter;
	if ( isset( $b2_filter['all'] ) ) {
		$b2_filter['all'] = ( is_string( $b2_filter['all'] ) ) ? array( $b2_filter['all'] ) : $b2_filter['all'];
		// $b2_filter[$tag] may be unset/null; PHP 8's array_merge() rejects
		// a non-array argument with a TypeError, so coerce it to an array.
		$b2_filter[ $tag ] = array_merge( $b2_filter['all'], (array) ( $b2_filter[ $tag ] ?? array() ) );
		$b2_filter[ $tag ] = array_unique( $b2_filter[ $tag ] );
	}
	if ( isset( $b2_filter[ $tag ] ) ) {
		$b2_filter[ $tag ] = ( is_string( $b2_filter[ $tag ] ) ) ? array( $b2_filter[ $tag ] ) : $b2_filter[ $tag ];
		$functions         = $b2_filter[ $tag ];
		foreach ( $functions as $function ) {
			$string = $function( $string );
		}
	}
	return $string;
}

function add_filter( $tag, $function_to_add ) {
	global $b2_filter;
	if ( isset( $b2_filter[ $tag ] ) ) {
		$functions = $b2_filter[ $tag ];
		if ( is_array( $functions ) ) {
			foreach ( $functions as $function ) {
				$new_functions[] = $function;
			}
		} elseif ( is_string( $functions ) ) {
			$new_functions[] = $functions;
		}
		/* this is commented out because it just makes PHP die silently
		for no apparent reason
		if (is_array($function_to_add)) {
			foreach($function_to_add as $function) {
				if (!in_array($function, $b2_filter[$tag])) {
					$new_functions[] = $function;
				}
			}
		} else */if ( is_string( $function_to_add ) ) {
			if ( ! @in_array( $function_to_add, $b2_filter[ $tag ] ) ) {
				$new_functions[] = $function_to_add;
			}
}
		$b2_filter[ $tag ] = $new_functions;
	} else {
		$b2_filter[ $tag ] = array( $function_to_add );
	}
	return true;
}
