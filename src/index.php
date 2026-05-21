<?php /* Don't remove this line, it calls the b2 function files ! */ $blog = 1;
require_once 'blog.header.php';
require $abspath . 'wp-links/links.php';
?>
<!DOCTYPE html>
<html lang="<?php echo $rss_language; ?>">

<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title><?php bloginfo( 'name' ); ?><?php single_post_title( ' :: ' ); ?><?php single_cat_title( ' :: ' ); ?><?php single_month_title( ' :: ' ); ?></title>

	<meta name="generator" content="WordPress 0.71-gold" /> <!-- Issue #37 dropped the version for a live install; this site is published statically (no running PHP or database), so the 0.71-gold edition is named deliberately (Issue #218). -->

	<?php /* Single-post head metadata (Issues #231, #239, #241): SEO meta description, LCP image preload, and OGP for social cards. All three need the post body, so get_postdata() is called once and the derived values are shared. The meta description is gated on having usable text; the preload and OGP are gated on having an image -- the homepage and category / month archive views list many posts, so none of these emit there. */ ?>
<?php
$ogp_p = isset( $p ) ? intval( $p ) : 0;
if ( $ogp_p > 0 ) {
	$ogp_post = get_postdata( $ogp_p );
	if ( is_array( $ogp_post ) && ! empty( $ogp_post['Content'] ) ) {
		$ogp_image = first_image_url( $ogp_post['Content'] );
		$ogp_desc  = post_excerpt_for_ogp(
			isset( $ogp_post['Excerpt'] ) ? (string) $ogp_post['Excerpt'] : '',
			(string) $ogp_post['Content']
		);
		if ( '' !== $ogp_desc ) {
			?>
	<meta name="description" content="<?php echo htmlspecialchars( $ogp_desc, ENT_QUOTES, 'UTF-8' ); ?>" />
			<?php
		}
		if ( '' !== $ogp_image ) {
			$ogp_title = strip_tags( stripslashes( (string) $ogp_post['Title'] ) );
			?>
			<?php /* Preload the LCP candidate (Issue #239) -- same URL the og:image meta uses. The preload scanner kicks off the fetch from <head>, in parallel with the stylesheets, instead of waiting for the parser to reach the body <img>. */ ?>
	<link rel="preload" as="image" href="<?php echo htmlspecialchars( $ogp_image, ENT_QUOTES, 'UTF-8' ); ?>" />
	<meta property="og:title" content="<?php echo htmlspecialchars( $ogp_title, ENT_QUOTES, 'UTF-8' ); ?>" />
	<meta property="og:type" content="article" />
			<?php if ( '' !== $ogp_desc ) : ?>
	<meta property="og:description" content="<?php echo htmlspecialchars( $ogp_desc, ENT_QUOTES, 'UTF-8' ); ?>" />
			<?php endif; ?>
	<meta property="og:image" content="<?php echo htmlspecialchars( $ogp_image, ENT_QUOTES, 'UTF-8' ); ?>" />
			<?php
		}
	}
}
?>

	<?php /* layout2b.css is the main theme stylesheet (Issue #233 dropped the original <style>@import</style> wrapper -- the @import inside an inline <style> hides the URL behind an extra parse step and costs an extra round trip before render). */ ?>
	<link rel="stylesheet" type="text/css" media="screen" href="<?php echo $siteurl; ?>/layout2b.css" />

	<?php /* Block-library front-end CSS (Issue #94) so layout blocks (columns, group, ...) stored in post_content render consistently with the block editor. */ ?>
	<link rel="stylesheet" type="text/css" media="screen" href="<?php echo $siteurl; ?>/block-editor/assets/block-library.css" />

	<?php /* Preset colour CSS (Issue #181) -- the has-*-color classes and --wp--preset--color--* properties -- so a preset colour picked in the block editor renders on the front end, not only as a custom inline colour. */ ?>
	<link rel="stylesheet" type="text/css" media="screen" href="<?php echo $siteurl; ?>/block-editor/assets/block-presets.css" />

	<link rel="stylesheet" type="text/css" media="print" href="<?php echo $siteurl; ?>/print.css" />
	<link rel="alternate" type="text/xml" title="RSS" href="<?php bloginfo( 'rss2_url' ); ?>" />
</head>

<body>
<h1 id="header"><a href="<?php echo $siteurl; ?>" title="<?php bloginfo( 'name' ); ?>"><?php bloginfo( 'name' ); ?></a></h1>

<div id="content">

<?php
if ( $posts ) {
	foreach ( $posts as $post ) {
		start_b2();
		?>
			<?php the_date( '', '<h2>', '</h2>' ); ?>

<h3 class="storytitle">
	<a href="<?php permalink_link(); ?>" rel="bookmark"><?php the_title(); ?></a> 
	<span class="meta"><a href="?cat=<?php the_category_ID(); ?>" title="Category: <?php the_category(); ?>">[<?php the_category(); ?>]</a> &#8212; <?php the_author(); ?> @ <?php the_time(); ?>
	</span>
</h3>

<div class="storycontent">
			<?php the_content(); ?>
</div>

<div class="feedback">
			<?php link_pages( '<br />Pages: ', '<br />', 'number' ); ?>
</div>

		<?php
	}
} // end foreach, end if any posts
?>

</div>

<p class="credit"><?php timer_stop( 1 ); ?> <cite>Powered by <a href="http://wordpress.org"><strong>WordPress</strong></a></cite></p>


<div id="menu">

<?php /* Native <details> disclosure (Issue #226) -- on desktop the summary toggle is hidden by CSS and the menu shows as before; on a phone the summary becomes the tappable header and the menu collapses. The HTML defaults to <details open> so the menu degrades cleanly without JavaScript. See src/layout2b.css and the inline script below for the per-viewport behaviour. */ ?>
<details id="menu-toggle" open>
<summary>Menu</summary>

<ul>
<li>Links:
	<ul>
		<?php get_links( -1, '<li>', '</li>', '', 0, '_updated', 0, 0, -1, -1 ); ?>
	</ul>
</li>
<li>Categories:
	<ul>
	<?php list_cats( 0, 'All', 'name' ); ?>
	</ul>
</li>
<li>Archives:
	<ul>
	<?php get_archives( 'monthly' ); ?>
	</ul>
</li>
<li>Other:
	<ul>
		<li><a href="b2login.php">login</a></li>
	</ul>
</li>
<li>Meta:
	<ul>
		<li><a href="b2rss2.php">RSS 2.0</a></li>
		<li><a href="http://validator.w3.org/check/referer" title="This page validates as XHTML 1.0 Transitional">Valid <abbr title="eXtensible HyperText Markup Language">XHTML</abbr></a></li>
		<li><a href="http://wordpress.org" title="Powered by WordPress, personal publishing platform">WP</a></li>
	</ul>
</li>
</ul>

</details>

</div>

<script>
// Sync the menu disclosure's [open] state to the viewport (Issue #226).
// On desktop the summary toggle is hidden by CSS and the menu always
// shows; on a phone the menu starts collapsed so the post text gets
// the full viewport. Setting [open] from JS keeps the underlying state
// consistent with what is rendered, so a screen reader announces the
// disclosure correctly. The matchMedia 'change' listener re-syncs on a
// real breakpoint crossing, not on every resize, so a user's manual
// toggle within one breakpoint is respected. Without JS the page
// degrades cleanly: <details open> in the HTML keeps the menu expanded
// everywhere.
( function () {
	var menu = document.getElementById( 'menu-toggle' );
	if ( ! menu || ! window.matchMedia ) {
		return;
	}
	var phone = window.matchMedia( '(max-width: 782px)' );
	function sync() {
		menu.open = ! phone.matches;
	}
	sync();
	if ( phone.addEventListener ) {
		phone.addEventListener( 'change', sync );
	} else if ( phone.addListener ) {
		// Safari <14 still needs the legacy addListener API.
		phone.addListener( sync );
	}
} )();
</script>


</body>
</html>
