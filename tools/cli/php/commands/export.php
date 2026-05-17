<?php
/**
 * 071-cli -- `export` command group.
 *
 * EN: Export the running WordPress 0.71 blog to a self-contained static HTML
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
 * JA: 稼働中の WordPress 0.71 ブログを自己完結した静的 HTML サイトへ書き出す。
 *     動詞: run(既定)。
 *     コンセプト -- WordPress 0.71-gold のローカル環境でブログを書き、本
 *     コマンドでサイトを静的 HTML に書き出し、その静的ファイルだけを公開
 *     サーバーから配信する。公開サーバーは PHP も DB も動かさないため、この
 *     2003 年のコードベースを実質的に攻撃面ゼロで公開できる。
 *     稼働中のローカルブログをクロールし、内部リンク(home・?p=・?cat=・
 *     ?m=・フィード・アセット)を辿り、各リンク/アセット参照を自己完結した
 *     静的パスへ書き換え、結果を出力ディレクトリへ書き出す。データベースに
 *     対しては読み取り専用である。
 *
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * Map a blog-relative URL to a static filename.
 *
 * EN: Maps a blog-relative URL (path + query, no host) to a static filename,
 *     or returns null when the URL must not be exported (admin, login,
 *     search).
 * JA: ブログ相対 URL(ホスト無しのパス+クエリ)を静的ファイル名へ対応付ける。
 *     書き出してはいけない URL(管理画面・ログイン・検索)では null を返す。
 *
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
	if ( 'b2rss.php' === $rel ) {
		return 'rss.xml';
	}
	if ( 'b2rss2.php' === $rel ) {
		return 'rss2.xml';
	}
	if ( 'b2rdf.php' === $rel ) {
		return 'rdf.xml';
	}

	// EN: a plain static asset is exported under its own path. parse_url() is
	//     used directly: this command runs standalone and does not bootstrap
	//     WordPress 0.71, so wp_parse_url() is not available.
	// JA: 素の静的アセットは自身のパスのまま書き出す。parse_url() を直接使う:
	//     本コマンドは単独で動作し WordPress 0.71 をブートストラップしないため
	//     wp_parse_url() は使えない。
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
 * EN: Returns [body, contentType] or null on a non-200 response. A User-Agent
 *     is sent so the legacy code does not warn about a missing
 *     $_SERVER['HTTP_USER_AGENT'] -- such a warning would be baked into the
 *     exported HTML.
 * JA: [本文, Content-Type] を返す。200 以外なら null。User-Agent を送るのは、
 *     レガシーコードが $_SERVER['HTTP_USER_AGENT'] の欠落で警告を出すのを
 *     防ぐため(その警告が書き出し HTML に焼き込まれてしまう)。
 *
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
	if ( preg_match_all( '~@import\s+url\(\s*["\']?([^"\')]+)["\']?\s*\)~i', $html, $m ) ) {
		$refs = array_merge( $refs, $m[1] );
	}

	return $refs;
}

/**
 * Normalise a raw reference to a blog-relative URL.
 *
 * EN: Returns null when the reference is external, an anchor/mailto/javascript
 *     link, or otherwise off-site.
 * JA: 外部・アンカー・mailto・javascript など対象外なら null を返す。
 *
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
		return null; // EN: external. JA: 外部。
	}
	// EN: drop the fragment for crawling/mapping; it is kept only in rewriting.
	// JA: クロール/対応付けではフラグメントを除去(書き換え時のみ保持)。
	$ref = preg_replace( '~#.*$~', '', $ref );

	return ltrim( (string) $ref, '/' );
}

/**
 * Rewrite every blog link / asset reference in a document to its static path.
 *
 * EN: Makes the exported file self-contained: the bare blog host is stripped,
 *     query-string permalinks become static filenames, and the feeds are
 *     repointed to their static counterparts.
 * JA: 書き出しファイルを自己完結させる: 素のブログホストを除去し、クエリ文字列
 *     パーマリンクを静的ファイル名に変え、フィードを静的版へ向け直す。
 *
 * @param string $body     The document body.
 * @param string $blog_url The blog base URL.
 * @return string The rewritten body.
 */
function cli_export_rewrite( string $body, string $blog_url ): string {
	// EN: the bare blog URL is the home link.
	// JA: 素のブログ URL はトップページへのリンク。
	$body = str_replace(
		array( '"' . $blog_url . '/"', '"' . $blog_url . '"' ),
		'"index.html"',
		$body
	);
	// EN: strip the blog host from every remaining absolute URL.
	// JA: 残りの絶対 URL からブログホストを除去する。
	$body = str_replace( array( $blog_url . '/', $blog_url ), '', $body );

	// EN: feeds.  JA: フィード。
	$body = str_replace(
		array( 'b2rss2.php', 'b2rdf.php', 'b2rss.php' ),
		array( 'rss2.xml', 'rdf.xml', 'rss.xml' ),
		$body
	);

	// EN: query-string permalinks -> static filenames (with or without index.php).
	// JA: クエリ文字列パーマリンク -> 静的ファイル名(index.php 有無の双方)。
	$body = preg_replace( '~index\.php\?p=(\d+)~', 'p-$1.html', $body );
	$body = preg_replace( '~index\.php\?cat=(\d+)~', 'cat-$1.html', $body );
	$body = preg_replace( '~index\.php\?m=(\d+)~', 'm-$1.html', $body );
	$body = preg_replace( '~\?p=(\d+)~', 'p-$1.html', $body );
	$body = preg_replace( '~\?cat=(\d+)~', 'cat-$1.html', $body );
	$body = preg_replace( '~\?m=(\d+)~', 'm-$1.html', $body );

	// EN: a bare index.php (e.g. a search form action) -> the home page.
	// JA: 素の index.php(検索フォームの action 等)-> トップページ。
	return str_replace( 'index.php', 'index.html', (string) $body );
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
 * EN: The --blog-url flag wins; otherwise the EXPORT_BLOG_URL environment
 *     variable; otherwise http://localhost:8080.
 * JA: --blog-url フラグが優先。無ければ EXPORT_BLOG_URL 環境変数、それも無ければ
 *     http://localhost:8080。
 *
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
 * Resolve the export output directory from the flags or the environment.
 *
 * EN: The --out-dir flag wins; otherwise the EXPORT_OUT_DIR environment
 *     variable; otherwise ./static-export relative to the current working
 *     directory.
 * JA: --out-dir フラグが優先。無ければ EXPORT_OUT_DIR 環境変数、それも無ければ
 *     カレント作業ディレクトリ基準の ./static-export。
 *
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
 * EN: Crawls the running blog and writes the self-contained static site to the
 *     output directory. Returns 0 on success, 1 when the blog is unreachable or
 *     the output directory cannot be created.
 * JA: 稼働中のブログをクロールし、自己完結した静的サイトを出力ディレクトリへ
 *     書き出す。成功時 0、ブログに到達できないか出力ディレクトリを作成できない
 *     ときは 1 を返す。
 *
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_export_run( array $flags ): int {
	$blog_url = cli_export_blog_url( $flags );
	$out_dir  = cli_export_out_dir( $flags );

	$asset_extensions = array( 'css', 'js', 'gif', 'png', 'jpg', 'jpeg', 'ico', 'svg' );

	fwrite( STDOUT, "Static export / 静的書き出し\n" );
	fwrite( STDOUT, "  blog   : $blog_url\n" );
	fwrite( STDOUT, "  output : $out_dir\n\n" );

	// EN: confirm the blog is reachable before doing anything.
	// JA: 何かする前にブログへ到達できることを確認する。
	if ( null === cli_export_fetch( $blog_url . '/' ) ) {
		cli_fail(
			"cannot reach the blog at $blog_url -- is the local environment running? "
			. '(start it with `071-env start`)'
		);
	}

	// EN: crawl. $done / $pages / $assets are keyed by the static target
	//     filename, so a page reached via several URL forms (?p=5 and
	//     index.php?p=5) is fetched and written exactly once.
	// JA: クロール。$done / $pages / $assets は静的ターゲット名をキーにするため、
	//     複数の URL 形式(?p=5 と index.php?p=5)で到達するページも取得・書き出し
	//     はちょうど 1 回になる。
	$queue   = array( 'index.php', 'b2rss.php', 'b2rss2.php', 'b2rdf.php' );
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
			// EN: if the blog emitted a PHP notice/error it is now baked into
			//     the fetched page; warn so the operator fixes the blog and
			//     re-runs.
			// JA: ブログが PHP の notice/error を出していると取得ページに
			//     焼き込まれている。ブログを直して再実行できるよう警告する。
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

	// EN: write the export tree.  JA: 書き出しツリーを生成する。
	if ( ! is_dir( $out_dir ) && ! mkdir( $out_dir, 0755, true ) && ! is_dir( $out_dir ) ) {
		cli_fail( "cannot create output directory $out_dir" );
	}

	foreach ( $pages as $target => $body ) {
		cli_export_write_file( $out_dir, (string) $target, cli_export_rewrite( $body, $blog_url ) );
	}
	foreach ( $assets as $target => $body ) {
		cli_export_write_file( $out_dir, (string) $target, $body );
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
 * EN: `export` has a single action -- running the export -- so `071 export`
 *     with no verb (and `071 export run`) both run it; `help` prints usage.
 * JA: `export` のアクションは書き出しの実行ひとつだけなので、動詞なしの
 *     `071 export`(および `071 export run`)はどちらも書き出しを実行する。
 *     `help` は使い方を表示する。
 *
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
			fwrite( STDOUT, "         --out-dir=<dir> (default ./static-export)\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'export $verb'." );
	}

	return 0;
}
