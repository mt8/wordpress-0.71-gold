#!/usr/bin/env php
<?php
/**
 * Static-export tool for WordPress 0.71-gold.
 * WordPress 0.71-gold 静的書き出しツール。
 *
 * EN: Concept -- write posts in the local WordPress 0.71-gold environment,
 *     export the site to static HTML with this script, and serve only the
 *     static files from a public server. The public server runs no PHP and no
 *     database, so this 2003-era codebase can be published with essentially no
 *     attack surface.
 *
 *     The script crawls the running local blog, follows the internal links
 *     (home, ?p=, ?cat=, ?m=, the feeds and assets), rewrites every link and
 *     asset reference to a self-contained static path, and writes the result
 *     to the output directory.
 *
 * JA: コンセプト -- WordPress 0.71-gold のローカル環境でブログを書き、本
 *     スクリプトでサイトを静的 HTML に書き出し、その静的ファイルだけを公開
 *     サーバーから配信する。公開サーバーは PHP も DB も動かさないため、この
 *     2003 年のコードベースを実質的に攻撃面ゼロで公開できる。
 *
 *     稼働中のローカルブログをクロールし、内部リンク(home・?p=・?cat=・
 *     ?m=・フィード・アセット)を辿り、各リンク/アセット参照を自己完結した
 *     静的パスへ書き換え、結果を出力ディレクトリへ書き出す。
 *
 * Usage / 使い方:
 *     docker compose up -d            # the local blog must be running / ローカルブログを起動
 *     php bin/static-export.php       # or: composer static-export
 *
 * Environment variables / 環境変数:
 *     EXPORT_BLOG_URL   blog base URL    (default http://localhost:8080)
 *     EXPORT_OUT_DIR    output directory (default ./static-export)
 */

declare(strict_types=1);

$blogUrl = rtrim((string) (getenv('EXPORT_BLOG_URL') ?: 'http://localhost:8080'), '/');
$outDir  = rtrim((string) (getenv('EXPORT_OUT_DIR') ?: dirname(__DIR__) . '/static-export'), '/');

$assetExtensions = ['css', 'js', 'gif', 'png', 'jpg', 'jpeg', 'ico', 'svg'];

/**
 * EN: Map a blog-relative URL (path + query, no host) to a static filename,
 *     or return null when the URL must not be exported (admin, login, search).
 * JA: ブログ相対 URL(ホスト無しのパス+クエリ)を静的ファイル名へ対応付ける。
 *     書き出してはいけない URL(管理画面・ログイン・検索)では null を返す。
 */
function static_name(string $rel, array $assetExtensions): ?string
{
    $rel = ltrim($rel, '/');

    if ($rel === '' || $rel === 'index.php') {
        return 'index.html';
    }
    if (preg_match('~^(?:index\.php)?\?p=(\d+)$~', $rel, $m)) {
        return 'p-' . $m[1] . '.html';
    }
    if (preg_match('~^(?:index\.php)?\?cat=(\d+)$~', $rel, $m)) {
        return 'cat-' . $m[1] . '.html';
    }
    if (preg_match('~^(?:index\.php)?\?m=(\d+)$~', $rel, $m)) {
        return 'm-' . $m[1] . '.html';
    }
    if ($rel === 'b2rss.php') {
        return 'rss.xml';
    }
    if ($rel === 'b2rss2.php') {
        return 'rss2.xml';
    }
    if ($rel === 'b2rdf.php') {
        return 'rdf.xml';
    }

    // EN: a plain static asset is exported under its own path.
    // JA: 素の静的アセットは自身のパスのまま書き出す。
    $ext = strtolower(pathinfo(parse_url($rel, PHP_URL_PATH) ?? $rel, PATHINFO_EXTENSION));
    if (in_array($ext, $assetExtensions, true) && !str_contains($rel, '?')) {
        return $rel;
    }

    return null;
}

/**
 * EN: true when the static target is a crawlable page (links are extracted).
 * JA: 静的ターゲットがクロール対象のページ(リンク抽出する)なら true。
 */
function is_page(string $target): bool
{
    return str_ends_with($target, '.html') || str_ends_with($target, '.xml');
}

/**
 * EN: Fetch a URL; returns [body, contentType] or null on a non-200 response.
 *     A User-Agent is sent so the legacy code does not warn about a missing
 *     $_SERVER['HTTP_USER_AGENT'] -- such a warning would be baked into the
 *     exported HTML.
 * JA: URL を取得し [本文, Content-Type] を返す。200 以外なら null。User-Agent
 *     を送るのは、レガシーコードが $_SERVER['HTTP_USER_AGENT'] の欠落で警告を
 *     出すのを防ぐため(その警告が書き出し HTML に焼き込まれてしまう)。
 */
function fetch(string $url): ?array
{
    $ctx = stream_context_create(['http' => [
        'ignore_errors' => true,
        'timeout'       => 20,
        'user_agent'    => 'wp071-static-export',
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) {
        return null;
    }
    $status = 0;
    $type   = '';
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('~^HTTP/\S+\s+(\d+)~', $h, $m)) {
            $status = (int) $m[1];
        }
        if (stripos($h, 'Content-Type:') === 0) {
            $type = trim(substr($h, 13));
        }
    }
    return $status === 200 ? [$body, $type] : null;
}

/**
 * EN: Extract internal href/src/@import references from an HTML/XML document.
 * JA: HTML/XML から内部の href/src/@import 参照を抽出する。
 */
function extract_refs(string $html): array
{
    $refs = [];
    if (preg_match_all('~(?:href|src)\s*=\s*["\']([^"\']+)["\']~i', $html, $m)) {
        $refs = array_merge($refs, $m[1]);
    }
    if (preg_match_all('~@import\s+url\(\s*["\']?([^"\')]+)["\']?\s*\)~i', $html, $m)) {
        $refs = array_merge($refs, $m[1]);
    }
    return $refs;
}

/**
 * EN: Normalise a raw reference to a blog-relative URL, or null when it is
 *     external, an anchor/mailto/javascript link, or otherwise off-site.
 * JA: 生の参照をブログ相対 URL へ正規化する。外部・アンカー・mailto・
 *     javascript など対象外なら null。
 */
function to_relative(string $ref, string $blogUrl): ?string
{
    $ref = trim($ref);
    if ($ref === '' || $ref[0] === '#'
        || preg_match('~^(mailto:|javascript:|data:|tel:)~i', $ref)) {
        return null;
    }
    if (str_starts_with($ref, $blogUrl)) {
        $ref = substr($ref, strlen($blogUrl));
    } elseif (preg_match('~^https?://~i', $ref)) {
        return null; // external
    }
    // EN: drop the fragment for crawling/mapping; it is kept only in rewriting.
    // JA: クロール/対応付けではフラグメントを除去(書き換え時のみ保持)。
    $ref = preg_replace('~#.*$~', '', $ref);
    return ltrim((string) $ref, '/');
}

/**
 * EN: Rewrite every blog link / asset reference in a document to its static
 *     path so the exported file is self-contained.
 * JA: 文書中のブログリンク/アセット参照をすべて静的パスへ書き換え、書き出し
 *     ファイルが自己完結するようにする。
 */
function rewrite(string $body, string $blogUrl): string
{
    // EN: the bare blog URL is the home link.
    // JA: 素のブログ URL はトップページへのリンク。
    $body = str_replace(['"' . $blogUrl . '/"', '"' . $blogUrl . '"'], '"index.html"', $body);
    // EN: strip the blog host from every remaining absolute URL.
    // JA: 残りの絶対 URL からブログホストを除去する。
    $body = str_replace([$blogUrl . '/', $blogUrl], '', $body);

    // EN: feeds.  JA: フィード。
    $body = str_replace(['b2rss2.php', 'b2rdf.php', 'b2rss.php'], ['rss2.xml', 'rdf.xml', 'rss.xml'], $body);

    // EN: query-string permalinks -> static filenames (with or without index.php).
    // JA: クエリ文字列パーマリンク -> 静的ファイル名(index.php 有無の双方)。
    $body = preg_replace('~index\.php\?p=(\d+)~', 'p-$1.html', $body);
    $body = preg_replace('~index\.php\?cat=(\d+)~', 'cat-$1.html', $body);
    $body = preg_replace('~index\.php\?m=(\d+)~', 'm-$1.html', $body);
    $body = preg_replace('~\?p=(\d+)~', 'p-$1.html', $body);
    $body = preg_replace('~\?cat=(\d+)~', 'cat-$1.html', $body);
    $body = preg_replace('~\?m=(\d+)~', 'm-$1.html', $body);

    // EN: a bare index.php (e.g. a search form action) -> the home page.
    // JA: 素の index.php(検索フォームの action 等)-> トップページ。
    return str_replace('index.php', 'index.html', (string) $body);
}

// --------------------------------------------------------------------------

fwrite(STDOUT, "Static export / 静的書き出し\n");
fwrite(STDOUT, "  blog   : {$blogUrl}\n");
fwrite(STDOUT, "  output : {$outDir}\n\n");

// EN: confirm the blog is reachable before doing anything.
// JA: 何かする前にブログへ到達できることを確認する。
if (fetch($blogUrl . '/') === null) {
    fwrite(STDERR, "ERROR: cannot reach the blog at {$blogUrl} -- is `docker compose up` running?\n");
    fwrite(STDERR, "エラー: {$blogUrl} のブログに到達できません。`docker compose up` は起動していますか？\n");
    exit(1);
}

// EN: crawl. $done / $pages / $assets are keyed by the static target filename,
//     so a page reached via several URL forms (?p=5 and index.php?p=5) is
//     fetched and written exactly once.
// JA: クロール。$done / $pages / $assets は静的ターゲット名をキーにするため、
//     複数の URL 形式(?p=5 と index.php?p=5)で到達するページも取得・書き出し
//     はちょうど 1 回になる。
$queue   = ['index.php', 'b2rss.php', 'b2rss2.php', 'b2rdf.php'];
$done    = [];   // target  => true
$pages   = [];   // target  => body
$assets  = [];   // target  => body
$skipped = [];   // rel     => true  (internal refs deliberately not exported)

while ($queue !== []) {
    $rel    = array_shift($queue);
    $target = static_name($rel, $assetExtensions);
    if ($target === null) {
        $skipped[$rel] = true;
        continue;
    }
    if (isset($done[$target])) {
        continue;
    }
    $done[$target] = true;

    $result = fetch($blogUrl . '/' . $rel);
    if ($result === null) {
        fwrite(STDERR, "  WARN: skipped (fetch failed): {$rel}\n");
        continue;
    }
    [$body] = $result;

    if (is_page($target)) {
        $pages[$target] = $body;
        // EN: if the blog emitted a PHP notice/error it is now baked into the
        //     fetched page; warn so the operator fixes the blog and re-runs.
        // JA: ブログが PHP の notice/error を出していると取得ページに焼き込まれ
        //     ている。ブログを直して再実行できるよう警告する。
        if (preg_match('~<b>(Warning|Notice|Deprecated|Fatal error|Parse error)</b>~', $body)) {
            fwrite(STDERR, "  WARN: the blog emitted a PHP notice on '{$rel}' -- it is baked into\n"
                         . "        the export; fix the blog and re-run for a clean static file.\n");
        }
        foreach (extract_refs($body) as $ref) {
            $normal = to_relative($ref, $blogUrl);
            if ($normal === null) {
                continue;
            }
            $refTarget = static_name($normal, $assetExtensions);
            if ($refTarget === null) {
                $skipped[$normal] = true;
            } elseif (!isset($done[$refTarget])) {
                $queue[] = $normal;
            }
        }
    } else {
        $assets[$target] = $body;
    }
}

// --------------------------------------------------------------------------
// EN: write the export tree.  JA: 書き出しツリーを生成する。

if (!is_dir($outDir) && !mkdir($outDir, 0o755, true) && !is_dir($outDir)) {
    fwrite(STDERR, "ERROR: cannot create output directory {$outDir}\n");
    exit(1);
}

$writeFile = static function (string $outDir, string $target, string $body): void {
    $dest = $outDir . '/' . $target;
    $dir  = dirname($dest);
    if (!is_dir($dir)) {
        mkdir($dir, 0o755, true);
    }
    file_put_contents($dest, $body);
};

foreach ($pages as $target => $body) {
    $writeFile($outDir, $target, rewrite($body, $blogUrl));
}
foreach ($assets as $target => $body) {
    $writeFile($outDir, $target, $body);
}

fwrite(STDOUT, "  pages  : " . count($pages) . "\n");
fwrite(STDOUT, "  assets : " . count($assets) . "\n");
fwrite(STDOUT, "  skipped: " . count($skipped) . " distinct link(s) -- admin / login / search / external\n");
fwrite(STDOUT, "\nDone. Serve the `" . basename($outDir) . "` directory as static files.\n");
fwrite(STDOUT, "完了。`" . basename($outDir) . "` ディレクトリを静的ファイルとして配信してください。\n");
