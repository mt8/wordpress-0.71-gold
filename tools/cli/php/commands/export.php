<?php
/**
 * 071-cli -- `export` command group.
 *
 * Export the running WordPress 0.71 blog to a self-contained static HTML
 *     site. Verb: run (the default).
 *     Concept -- write posts in the local WordPress 0.71-gold environment,
 *     export the site to static HTML with this command, and serve only the
 *     static files from a public server. The public server runs no PHP and no
 *     database, so this 2003-era codebase can be published with essentially no
 *     attack surface.
 *     The command crawls the running local blog, follows the internal links
 *     (home, ?p=, ?cat=, ?m=, the feeds and assets), rewrites every link and
 *     asset reference to a self-contained static path, and writes the result
 *     to the output directory. It is read-only with respect to the database.
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Map a blog-relative URL to a static filename.
 *
 * Maps a blog-relative URL (path + query, no host) to a static filename,
 *     or returns null when the URL must not be exported (admin, login,
 *     search).
 * @param string             $rel             Blog-relative URL.
 * @param array<int, string> $asset_extensions Recognised static asset extensions.
 * @return string|null The static filename, or null when not exportable.
 */
function cli_export_static_name( string $rel, array $asset_extensions ): ?string {
	$rel = ltrim( $rel, '/' );

	if ( '' === $rel || 'index.php' === $rel ) {
		return 'index.html';
	}
	if ( preg_match( '~^(?:index\.php)?\?p=(\d+)$~', $rel, $m ) ) {
		return 'p-' . $m[1] . '.html';
	}
	if ( preg_match( '~^(?:index\.php)?\?cat=(\d+)$~', $rel, $m ) ) {
		return 'cat-' . $m[1] . '.html';
	}
	if ( preg_match( '~^(?:index\.php)?\?m=(\d+)$~', $rel, $m ) ) {
		return 'm-' . $m[1] . '.html';
	}
	if ( 'b2rss2.php' === $rel ) {
		return 'rss2.xml';
	}

	// a plain static asset is exported under its own path. parse_url() is
	//     used directly: this command runs standalone and does not bootstrap
	//     WordPress 0.71, so wp_parse_url() is not available.
	$path = parse_url( $rel, PHP_URL_PATH ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url
	$ext  = strtolower( pathinfo( ( is_string( $path ) && '' !== $path ) ? $path : $rel, PATHINFO_EXTENSION ) );
	if ( in_array( $ext, $asset_extensions, true ) && ! str_contains( $rel, '?' ) ) {
		return $rel;
	}

	return null;
}

/**
 * Whether a static target is a crawlable page (links are extracted from it).
 *
 * @param string $target Static target filename.
 * @return bool True when the target is an HTML or XML page.
 */
function cli_export_is_page( string $target ): bool {
	return str_ends_with( $target, '.html' ) || str_ends_with( $target, '.xml' );
}

/**
 * Fetch a URL over HTTP.
 *
 * Returns [body, contentType] or null on a non-200 response. A User-Agent
 *     is sent so the legacy code does not warn about a missing
 *     $_SERVER['HTTP_USER_AGENT'] -- such a warning would be baked into the
 *     exported HTML.
 * @param string $url Absolute URL to fetch.
 * @return array{0: string, 1: string}|null [body, content-type], or null.
 */
function cli_export_fetch( string $url ): ?array {
	$ctx = stream_context_create(
		array(
			'http' => array(
				'ignore_errors' => true,
				'timeout'       => 20,
				'user_agent'    => 'wp071-static-export',
			),
		)
	);

	$body = @file_get_contents( $url, false, $ctx );
	if ( false === $body ) {
		return null;
	}

	$status  = 0;
	$type    = '';
	$headers = isset( $http_response_header ) ? $http_response_header : array();
	foreach ( $headers as $header ) {
		if ( preg_match( '~^HTTP/\S+\s+(\d+)~', $header, $m ) ) {
			$status = (int) $m[1];
		}
		if ( 0 === stripos( $header, 'Content-Type:' ) ) {
			$type = trim( substr( $header, 13 ) );
		}
	}

	return 200 === $status ? array( $body, $type ) : null;
}

/**
 * Extract internal href/src/@import references from an HTML/XML document.
 *
 * @param string $html The document body.
 * @return array<int, string> The raw references found.
 */
function cli_export_extract_refs( string $html ): array {
	$refs = array();
	if ( preg_match_all( '~(?:href|src)\s*=\s*["\']([^"\']+)["\']~i', $html, $m ) ) {
		$refs = array_merge( $refs, $m[1] );
	}
	// srcset attributes carry one or more comma-separated URLs, each
	//     optionally followed by a descriptor (` 300w`, ` 2x`). The
	//     <picture><source srcset=".webp"> wrap added by Issue #245 uses
	//     the single-URL form; the descriptor strip below keeps the
	//     parser future-proof for a multi-width srcset.
	if ( preg_match_all( '~srcset\s*=\s*["\']([^"\']+)["\']~i', $html, $m ) ) {
		foreach ( $m[1] as $srcset ) {
			foreach ( explode( ',', $srcset ) as $candidate ) {
				$url = (string) preg_replace( '~\s+\S+$~', '', trim( $candidate ) );
				if ( '' !== $url ) {
					$refs[] = $url;
				}
			}
		}
	}
	if ( preg_match_all( '~@import\s+url\(\s*["\']?([^"\')]+)["\']?\s*\)~i', $html, $m ) ) {
		$refs = array_merge( $refs, $m[1] );
	}

	return $refs;
}

/**
 * Normalise a raw reference to a blog-relative URL.
 *
 * Returns null when the reference is external, an anchor/mailto/javascript
 *     link, or otherwise off-site.
 * @param string $ref      The raw reference.
 * @param string $blog_url The blog base URL.
 * @return string|null The blog-relative URL, or null.
 */
function cli_export_to_relative( string $ref, string $blog_url ): ?string {
	$ref = trim( $ref );
	if ( '' === $ref || '#' === $ref[0]
		|| preg_match( '~^(mailto:|javascript:|data:|tel:)~i', $ref ) ) {
		return null;
	}
	if ( str_starts_with( $ref, $blog_url ) ) {
		$ref = substr( $ref, strlen( $blog_url ) );
	} elseif ( preg_match( '~^https?://~i', $ref ) ) {
		return null; // external.
	}
	// drop the fragment for crawling/mapping; it is kept only in rewriting.
	$ref = preg_replace( '~#.*$~', '', $ref );

	return ltrim( (string) $ref, '/' );
}

/**
 * Rewrite every blog link / asset reference in a document to its static path.
 *
 * Makes the exported file self-contained: the bare blog host is stripped,
 *     query-string permalinks become static filenames, and the feeds are
 *     repointed to their static counterparts.
 * @param string $body     The document body.
 * @param string $blog_url The blog base URL.
 * @return string The rewritten body.
 */
function cli_export_rewrite( string $body, string $blog_url ): string {
	// the bare blog URL is the home link.
	$body = str_replace(
		array( '"' . $blog_url . '/"', '"' . $blog_url . '"' ),
		'"index.html"',
		$body
	);
	// strip the blog host from every remaining absolute URL.
	$body = str_replace( array( $blog_url . '/', $blog_url ), '', $body );

	// feed.
	$body = str_replace( 'b2rss2.php', 'rss2.xml', $body );

	// query-string permalinks -> static filenames (with or without index.php).
	$body = preg_replace( '~index\.php\?p=(\d+)~', 'p-$1.html', $body );
	$body = preg_replace( '~index\.php\?cat=(\d+)~', 'cat-$1.html', $body );
	$body = preg_replace( '~index\.php\?m=(\d+)~', 'm-$1.html', $body );
	$body = preg_replace( '~\?p=(\d+)~', 'p-$1.html', $body );
	$body = preg_replace( '~\?cat=(\d+)~', 'cat-$1.html', $body );
	$body = preg_replace( '~\?m=(\d+)~', 'm-$1.html', $body );

	// a bare index.php (e.g. a search form action) -> the home page.
	return str_replace( 'index.php', 'index.html', (string) $body );
}

/**
 * Absolutify the og:image URL in a page body against the publish URL.
 *
 * cli_export_rewrite() strips the blog URL prefix from every absolute
 *     URL in the body, so an og:image emitted as
 *     "http://localhost:8080/wp-content/.../img.png" by the front-end
 *     ends up as the bare "wp-content/.../img.png". OGP scrapers
 *     (Facebook, Twitter, Slack) expect a full URL there, so this step
 *     re-prepends the public publish URL when one is supplied via
 *     --publish (Issue #231). A no-op when $publish_url is '' (the
 *     pre-flag behaviour) or when the og:image value is already
 *     absolute (http(s)://...) or protocol-relative (//host/...).
 * @param string $body        The rewritten page body.
 * @param string $publish_url The publish base URL, without a trailing
 *                            slash (e.g. "https://071.mt8.biz"), or ''.
 * @return string The body with og:image absolutified, when applicable.
 */
function cli_export_absolutify_ogp( string $body, string $publish_url ): string {
	if ( '' === $publish_url ) {
		return $body;
	}
	$base = rtrim( $publish_url, '/' );
	return (string) preg_replace_callback(
		'~(<meta\s+property="og:image"\s+content=")([^"]*)("\s*/?>)~i',
		static function ( array $m ) use ( $base ): string {
			$url = $m[2];
			// already a full URL (http/https) or protocol-relative -- leave alone.
			if ( '' === $url || preg_match( '~^(?:https?:)?//~i', $url ) ) {
				return $m[0];
			}
			return $m[1] . $base . '/' . ltrim( $url, '/' ) . $m[3];
		},
		$body
	);
}

/**
 * Collect every `wp-block-NAME` class referenced in HTML (Issue #249).
 *
 * Scans `class="..."` attributes across the export tree and pulls out the
 *     bare block-name suffix after `wp-block-` so the purge step below can
 *     compare against block-library.css selectors. Returns a sorted, deduped
 *     list -- order is irrelevant to the purge but makes the unit tests
 *     stable.
 * @param string $html Concatenated HTML to scan.
 * @return array<int, string> Sorted list of block names actually used.
 */
function cli_export_collect_used_blocks( string $html ): array {
	$used = array();
	if ( preg_match_all( '~class\s*=\s*["\']([^"\']+)["\']~i', $html, $m ) ) {
		foreach ( $m[1] as $classes ) {
			if ( preg_match_all( '~\bwp-block-([\w-]+)~', $classes, $names ) ) {
				foreach ( $names[1] as $name ) {
					$used[ $name ] = true;
				}
			}
		}
	}
	$keys = array_keys( $used );
	sort( $keys );
	return $keys;
}

/**
 * Decide whether a CSS rule whose selector list is $selectors is alive
 * (Issue #249).
 *
 * The selector list is split on commas; each comma-separated selector is
 *     examined independently. A selector with no `.wp-block-*` reference is
 *     treated as general styling and forces the rule to be kept. A selector
 *     that references at least one used block forces a keep too. Only when
 *     every selector references some `.wp-block-*` AND every referenced
 *     block is unused is the rule dropped.
 * @param string             $selectors  Raw selector list (everything before
 *                                       the rule's opening `{`).
 * @param array<int, string> $used_blocks Block names actually used.
 * @return bool True when the rule should be kept.
 */
function cli_export_rule_is_alive( string $selectors, array $used_blocks ): bool {
	$used_set = array_flip( $used_blocks );
	foreach ( explode( ',', $selectors ) as $sel ) {
		if ( ! preg_match_all( '~\.wp-block-([\w-]+)~', $sel, $m ) ) {
			// no .wp-block-* in this selector -- general styling, keep the rule.
			return true;
		}
		foreach ( $m[1] as $block ) {
			if ( isset( $used_set[ $block ] ) ) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Purge unused rules from block-library.css (Issue #249).
 *
 * The CSS has a predictable shape -- top-level rules and @media / @keyframes
 *     / @supports blocks. A small brace-tracking parser walks the file,
 *     splits it into rule blocks, and applies the keep / drop decision per
 *     block (see cli_export_rule_is_alive). At-rules with inner blocks are
 *     recursed into so a media query containing only dead rules disappears
 *     completely; @keyframes blocks are kept verbatim because their inner
 *     "0% { ... }" "steps" do not carry `.wp-block-*` selectors and would
 *     otherwise be wrongly dropped.
 * @param string             $css         The block-library.css body.
 * @param array<int, string> $used_blocks Block names actually used.
 * @return string The purged CSS body.
 */
function cli_export_purge_block_library_css( string $css, array $used_blocks ): string {
	$len = strlen( $css );
	$out = '';
	$i   = 0;
	while ( $i < $len ) {
		$ch = $css[ $i ];
		// Comments are kept as-is.
		if ( '/' === $ch && $i + 1 < $len && '*' === $css[ $i + 1 ] ) {
			$end = strpos( $css, '*/', $i + 2 );
			if ( false === $end ) {
				$out .= substr( $css, $i );
				break;
			}
			$out .= substr( $css, $i, $end - $i + 2 );
			$i    = $end + 2;
			continue;
		}
		// Whitespace passes through.
		if ( ctype_space( $ch ) ) {
			$out .= $ch;
			++$i;
			continue;
		}
		// @-rule.
		if ( '@' === $ch ) {
			$semi  = strpos( $css, ';', $i );
			$brace = strpos( $css, '{', $i );
			if ( false === $brace || ( false !== $semi && $semi < $brace ) ) {
				// statement at-rule (e.g. @import, @charset).
				$end  = ( false === $semi ) ? $len - 1 : $semi;
				$out .= substr( $css, $i, $end - $i + 1 );
				$i    = $end + 1;
				continue;
			}
			$prelude = substr( $css, $i, $brace - $i );
			$close   = cli_export_find_matching_brace( $css, $brace );
			$inner   = substr( $css, $brace + 1, $close - $brace - 1 );
			$lead    = strtolower( ltrim( $prelude ) );
			if ( str_starts_with( $lead, '@keyframes' ) || str_starts_with( $lead, '@font-face' ) ) {
				// keep verbatim -- inner does not carry .wp-block-* selectors.
				$out .= substr( $css, $i, $close - $i + 1 );
			} else {
				$purged_inner = cli_export_purge_block_library_css( $inner, $used_blocks );
				if ( '' !== trim( $purged_inner ) ) {
					$out .= $prelude . '{' . $purged_inner . '}';
				}
			}
			$i = $close + 1;
			continue;
		}
		// Regular rule -- selector list { declarations }.
		$brace = strpos( $css, '{', $i );
		if ( false === $brace ) {
			$out .= substr( $css, $i );
			break;
		}
		$selectors = substr( $css, $i, $brace - $i );
		$close     = cli_export_find_matching_brace( $css, $brace );
		if ( cli_export_rule_is_alive( $selectors, $used_blocks ) ) {
			$out .= substr( $css, $i, $close - $i + 1 );
		}
		$i = $close + 1;
	}
	return $out;
}

/**
 * Find the matching `}` for an opening `{` at $start, ignoring nested
 * braces inside strings and comments (Issue #249).
 *
 * @param string $css   The CSS body.
 * @param int    $start Index of the `{` to match.
 * @return int Index of the matching `}` (or strlen-1 on a malformed input,
 *             so the caller still terminates).
 */
function cli_export_find_matching_brace( string $css, int $start ): int {
	$len   = strlen( $css );
	$depth = 1;
	$i     = $start + 1;
	while ( $i < $len && $depth > 0 ) {
		$ch = $css[ $i ];
		if ( '/' === $ch && $i + 1 < $len && '*' === $css[ $i + 1 ] ) {
			$end = strpos( $css, '*/', $i + 2 );
			$i   = ( false === $end ) ? $len : $end + 2;
			continue;
		}
		if ( '"' === $ch || "'" === $ch ) {
			$quote = $ch;
			++$i;
			while ( $i < $len && $css[ $i ] !== $quote ) {
				if ( '\\' === $css[ $i ] && $i + 1 < $len ) {
					++$i;
				}
				++$i;
			}
			++$i;
			continue;
		}
		if ( '{' === $ch ) {
			++$depth;
		} elseif ( '}' === $ch ) {
			--$depth;
			if ( 0 === $depth ) {
				return $i;
			}
		}
		++$i;
	}
	return $len - 1;
}

/**
 * Write a single exported file, creating any missing parent directories.
 *
 * @param string $out_dir The export output directory.
 * @param string $target  The static target filename, relative to $out_dir.
 * @param string $body    The file body.
 * @return void
 */
function cli_export_write_file( string $out_dir, string $target, string $body ): void {
	$dest = $out_dir . '/' . $target;
	$dir  = dirname( $dest );
	if ( ! is_dir( $dir ) ) {
		mkdir( $dir, 0755, true );
	}
	file_put_contents( $dest, $body );
}

/**
 * Resolve the blog base URL from the flags or the environment.
 *
 * The --blog-url flag wins; otherwise the EXPORT_BLOG_URL environment
 *     variable; otherwise http://localhost:8080.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return string The blog base URL, without a trailing slash.
 */
function cli_export_blog_url( array $flags ): string {
	if ( isset( $flags['blog-url'] ) && is_string( $flags['blog-url'] ) && '' !== $flags['blog-url'] ) {
		return rtrim( $flags['blog-url'], '/' );
	}

	$env = getenv( 'EXPORT_BLOG_URL' );
	if ( false !== $env && '' !== $env ) {
		return rtrim( $env, '/' );
	}

	return 'http://localhost:8080';
}

/**
 * Resolve the public URL the export will be published under (Issue #231).
 *
 * Used to absolutify a small set of meta tags whose value MUST be a full
 *     URL for off-site consumers -- og:image in particular: a social-card
 *     scraper that resolves a relative og:image against the page URL is
 *     not guaranteed across networks, so the safe form is the absolute
 *     URL on the published site. The --publish flag wins; otherwise the
 *     EXPORT_PUBLISH_URL environment variable; otherwise '' (no
 *     absolutification, the static export keeps the relative URLs the
 *     rewriter produced -- the pre-Issue-231 behaviour).
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return string The publish base URL, without a trailing slash, or ''.
 */
function cli_export_publish_url( array $flags ): string {
	if ( isset( $flags['publish'] ) && is_string( $flags['publish'] ) && '' !== $flags['publish'] ) {
		return rtrim( $flags['publish'], '/' );
	}

	$env = getenv( 'EXPORT_PUBLISH_URL' );
	if ( false !== $env && '' !== $env ) {
		return rtrim( $env, '/' );
	}

	return '';
}

/**
 * Resolve the export output directory from the flags or the environment.
 *
 * The --out-dir flag wins; otherwise the EXPORT_OUT_DIR environment
 *     variable; otherwise ./static-export relative to the current working
 *     directory.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return string The output directory, without a trailing slash.
 */
function cli_export_out_dir( array $flags ): string {
	if ( isset( $flags['out-dir'] ) && is_string( $flags['out-dir'] ) && '' !== $flags['out-dir'] ) {
		return rtrim( $flags['out-dir'], '/' );
	}

	$env = getenv( 'EXPORT_OUT_DIR' );
	if ( false !== $env && '' !== $env ) {
		return rtrim( $env, '/' );
	}

	return rtrim( (string) getcwd(), '/' ) . '/static-export';
}

/**
 * Run the static export.
 *
 * Crawls the running blog and writes the self-contained static site to the
 *     output directory. Returns 0 on success, 1 when the blog is unreachable or
 *     the output directory cannot be created.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_export_run( array $flags ): int {
	$blog_url    = cli_export_blog_url( $flags );
	$out_dir     = cli_export_out_dir( $flags );
	$publish_url = cli_export_publish_url( $flags );

	$asset_extensions = array( 'css', 'js', 'gif', 'png', 'jpg', 'jpeg', 'ico', 'svg', 'webp' );

	fwrite( STDOUT, "Static export / 静的書き出し\n" );
	fwrite( STDOUT, "  blog   : $blog_url\n" );
	fwrite( STDOUT, "  output : $out_dir\n" );
	if ( '' !== $publish_url ) {
		fwrite( STDOUT, "  publish: $publish_url (og:image absolutified)\n" );
	}
	fwrite( STDOUT, "\n" );

	// confirm the blog is reachable before doing anything.
	if ( null === cli_export_fetch( $blog_url . '/' ) ) {
		cli_fail(
			"cannot reach the blog at $blog_url -- is the local environment running? "
			. '(start it with `071-env start`)'
		);
	}

	// crawl. $done / $pages / $assets are keyed by the static target
	//     filename, so a page reached via several URL forms (?p=5 and
	//     index.php?p=5) is fetched and written exactly once.
	$queue   = array( 'index.php', 'b2rss2.php' );
	$done    = array();
	$pages   = array();
	$assets  = array();
	$skipped = array();

	while ( array() !== $queue ) {
		$rel    = array_shift( $queue );
		$target = cli_export_static_name( $rel, $asset_extensions );
		if ( null === $target ) {
			$skipped[ $rel ] = true;
			continue;
		}
		if ( isset( $done[ $target ] ) ) {
			continue;
		}
		$done[ $target ] = true;

		$result = cli_export_fetch( $blog_url . '/' . $rel );
		if ( null === $result ) {
			fwrite( STDERR, "  WARN: skipped (fetch failed): $rel\n" );
			continue;
		}
		$body = $result[0];

		if ( cli_export_is_page( $target ) ) {
			$pages[ $target ] = $body;
			// if the blog emitted a PHP notice/error it is now baked into
			//     the fetched page; warn so the operator fixes the blog and
			//     re-runs.
			if ( preg_match( '~<b>(Warning|Notice|Deprecated|Fatal error|Parse error)</b>~', $body ) ) {
				fwrite(
					STDERR,
					"  WARN: the blog emitted a PHP notice on '$rel' -- it is baked into\n"
					. "        the export; fix the blog and re-run for a clean static file.\n"
				);
			}
			foreach ( cli_export_extract_refs( $body ) as $ref ) {
				$normal = cli_export_to_relative( $ref, $blog_url );
				if ( null === $normal ) {
					continue;
				}
				$ref_target = cli_export_static_name( $normal, $asset_extensions );
				if ( null === $ref_target ) {
					$skipped[ $normal ] = true;
				} elseif ( ! isset( $done[ $ref_target ] ) ) {
					$queue[] = $normal;
				}
			}
		} else {
			$assets[ $target ] = $body;
		}
	}

	// write the export tree.
	if ( ! is_dir( $out_dir ) && ! mkdir( $out_dir, 0755, true ) && ! is_dir( $out_dir ) ) {
		cli_fail( "cannot create output directory $out_dir" );
	}

	$rewritten_pages = array();
	foreach ( $pages as $target => $body ) {
		$rewritten                  = cli_export_rewrite( $body, $blog_url );
		$rewritten                  = cli_export_absolutify_ogp( $rewritten, $publish_url );
		$rewritten_pages[ $target ] = $rewritten;
		cli_export_write_file( $out_dir, (string) $target, $rewritten );
	}
	foreach ( $assets as $target => $body ) {
		cli_export_write_file( $out_dir, (string) $target, $body );
	}

	// Trim block-library.css to only the rules the exported HTML actually
	//     uses (Issue #249). Same operator-visible step as the
	//     absolutify-ogp / write-asset passes above; reports the before /
	//     after byte size when the file is present, no-op when it is not.
	$block_lib_rel = 'block-editor/assets/block-library.css';
	$block_lib_abs = $out_dir . '/' . $block_lib_rel;
	if ( is_file( $block_lib_abs ) ) {
		$used   = cli_export_collect_used_blocks( implode( "\n", $rewritten_pages ) );
		$css    = (string) file_get_contents( $block_lib_abs );
		$pruned = cli_export_purge_block_library_css( $css, $used );
		file_put_contents( $block_lib_abs, $pruned );
		fwrite(
			STDOUT,
			sprintf(
				"  trimmed: %s (%d -> %d bytes, %d used block class%s)\n",
				$block_lib_rel,
				strlen( $css ),
				strlen( $pruned ),
				count( $used ),
				1 === count( $used ) ? '' : 'es'
			)
		);
	}

	fwrite( STDOUT, '  pages  : ' . count( $pages ) . "\n" );
	fwrite( STDOUT, '  assets : ' . count( $assets ) . "\n" );
	fwrite(
		STDOUT,
		'  skipped: ' . count( $skipped )
		. " distinct link(s) -- admin / login / search / external\n"
	);
	fwrite( STDOUT, "\n" );
	cli_success(
		'static export written. Serve the `' . basename( $out_dir ) . '` directory as static files.'
	);

	return 0;
}

/**
 * Route an `export` verb to its implementation.
 *
 * `export` has a single action -- running the export -- so `071 export`
 *     with no verb (and `071 export run`) both run it; `help` prints usage.
 * @param string                     $verb  The verb.
 * @param array<int, string>         $args  Positional arguments after the verb.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_cmd_export( string $verb, array $args, array $flags ): int {
	switch ( $verb ) {
		case '':
		case 'run':
			return cli_export_run( $flags );

		case 'help':
			fwrite( STDOUT, "071 export [run]\n" );
			fwrite( STDOUT, "  Export the running blog to a static HTML site under static-export/.\n" );
			fwrite( STDOUT, "  Flags: --blog-url=<url> (default http://localhost:8080)\n" );
			fwrite( STDOUT, "         --out-dir=<dir>  (default ./static-export)\n" );
			fwrite( STDOUT, "         --publish=<url>  (absolutify og:image against this URL,\n" );
			fwrite( STDOUT, "                           e.g. https://071.mt8.biz)\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'export $verb'." );
	}

	return 0;
}
