# Porting Gutenberg to WordPress 0.71 / Gutenberg を WordPress 0.71 へ移植する

EN: An evidence-based feasibility investigation (Issue #61) into whether the
Gutenberg block editor could be ported to / made to run on WordPress
0.71-gold. The same kind of investigation as the wp-env one (Issue #55,
documented in `docs/docker-environment.md`).

JA: Gutenberg(ブロックエディタ)を WordPress 0.71-gold へ移植できる/動かせる
かを、根拠に基づいて調査したもの(Issue #61)。wp-env の調査(Issue #55、
`docs/docker-environment.md` に記録)と同種の調査である。

## Conclusion / 結論

EN: **Not feasible.** Gutenberg is not a self-contained drop-in package: it is
the *front end* of a modern WordPress platform and depends on an entire stack
that did not exist in 2003. WordPress 0.71-gold provides effectively none of
the four pillars Gutenberg requires (REST API, the `@wordpress/*` JavaScript /
build stack, server-side block registration, the modern `wp-includes/`
bootstrap and Plugin API). "Porting" Gutenberg to 0.71 would mean first
rebuilding ~13 years of WordPress core (4.4 → 4.7 → 5.0 and beyond) inside the
2003 codebase — at which point nothing of 0.71 would remain. It is therefore
not a porting task but a from-scratch reimplementation of modern WordPress.

JA: **実現不可能。** Gutenberg は単独で組み込める独立パッケージではない。
モダンな WordPress プラットフォームの *フロントエンド* であり、2003 年には
存在しなかったスタック全体に依存している。WordPress 0.71-gold は Gutenberg が
必要とする 4 本柱(REST API、`@wordpress/*` の JavaScript / ビルドスタック、
サーバー側のブロック登録、モダンな `wp-includes/` ブートストラップと Plugin
API)を事実上いずれも備えていない。Gutenberg を 0.71 へ「移植」するには、
まず約 13 年分の WordPress コア(4.4 → 4.7 → 5.0 以降)を 2003 年のコード
ベース内に再構築する必要があり、その時点で 0.71 のものは何も残らない。よって
これは移植作業ではなく、モダン WordPress のゼロからの再実装である。

## What Gutenberg actually is / Gutenberg の実体

EN: Gutenberg is developed as an independent project: a **monorepo of 80+
packages published to npm under the `@wordpress/*` scope**, managed with npm
workspaces and (historically) lerna. It is *not* a single installable file —
it is a software stack. The block editor that ships in WordPress core is the
stabilised output of that project. Its building blocks include `@wordpress/
blocks`, `@wordpress/block-editor`, `@wordpress/components`, `@wordpress/data`
(a Redux-based state layer), `@wordpress/element` (a thin wrapper over React),
and `@wordpress/api-fetch`.

JA: Gutenberg は独立したプロジェクトとして開発されている。**`@wordpress/*`
スコープで npm に公開された 80 以上のパッケージのモノレポ**で、npm workspaces
と(歴史的には)lerna で管理される。単一のインストール可能なファイルでは
*なく*、ソフトウェアスタックである。WordPress コアに同梱されるブロック
エディタは、そのプロジェクトの安定版の成果物にすぎない。構成要素には
`@wordpress/blocks`・`@wordpress/block-editor`・`@wordpress/components`・
`@wordpress/data`(Redux ベースの状態管理層)・`@wordpress/element`(React の
薄いラッパー)・`@wordpress/api-fetch` などが含まれる。

## The four pillars Gutenberg depends on / Gutenberg が依存する 4 本柱

### 1. The WordPress REST API / WordPress REST API

EN: The block editor is **dependent on the WordPress REST API**: it loads,
saves and autosaves posts entirely through `/wp-json/` endpoints, and only
post types registered with `'show_in_rest' => true` are editable in it. The
REST API *infrastructure* landed in WordPress 4.4 (Dec 2015) and the actual
content *endpoints* (`/wp-json/wp/v2/posts`, …) only in **WordPress 4.7**
(Dec 2016).

JA: ブロックエディタは **WordPress REST API に依存する**。投稿の読み込み・
保存・自動保存はすべて `/wp-json/` エンドポイント経由で行い、編集できるのは
`'show_in_rest' => true` で登録された投稿タイプだけである。REST API の
*基盤*は WordPress 4.4(2015 年 12 月)、実際のコンテンツ *エンドポイント*
(`/wp-json/wp/v2/posts` ほか)は **WordPress 4.7**(2016 年 12 月)で
ようやく入った。

**0.71 provides / 0.71 が提供するもの:** EN: Nothing. There is no REST API,
no JSON output, no routing layer. A grep of `src/` for `rest_api`,
`register_rest_route` and `wp-json` returns zero matches. The only
machine-readable outputs are the RSS/RDF feeds (`b2rss.php`, `b2rss2.php`,
`b2rdf.php`), which are read-only XML, not a read/write JSON API. Posts are
saved by a classic HTML `<form>` POST to `b2edit.php`. /
JA: 何もない。REST API も JSON 出力もルーティング層も無い。`src/` を
`rest_api`・`register_rest_route`・`wp-json` で grep しても 0 件。機械可読の
出力は RSS/RDF フィード(`b2rss.php`・`b2rss2.php`・`b2rdf.php`)のみで、
これは読み取り専用の XML であり読み書き可能な JSON API ではない。投稿は
`b2edit.php` への古典的な HTML `<form>` の POST で保存される。

### 2. The `@wordpress/*` JavaScript and build stack / `@wordpress/*` の JS・ビルドスタック

EN: Gutenberg is a **React single-page application**. Its source is
JSX/TypeScript that must be transpiled and bundled before a browser can run
it (historically webpack + Babel; from late 2025 the esbuild-based
`@wordpress/build`). It is then delivered to the browser as dozens of
registered scripts (`wp-element`, `wp-blocks`, `wp-data`, …) wired together
through `wp_enqueue_script` dependency declarations. It also needs a Node.js /
npm toolchain to build at all.

JA: Gutenberg は **React のシングルページアプリケーション**である。ソースは
JSX/TypeScript で、ブラウザが実行する前にトランスパイルとバンドルが必要
(歴史的には webpack + Babel、2025 年後半からは esbuild ベースの
`@wordpress/build`)。その後、`wp_enqueue_script` の依存宣言で結線された
数十の登録済みスクリプト(`wp-element`・`wp-blocks`・`wp-data` ほか)として
ブラウザへ配信される。そもそもビルドには Node.js / npm のツールチェーンも
必要である。

**0.71 provides / 0.71 が提供するもの:** EN: Almost no JavaScript at all. The
entire `src/` tree contains exactly **one** `.js` file —
`wp-admin/b2quicktags.js`, a ~handful of plain functions that insert HTML
tags into a `<textarea>`. There is no React, no build step, no `wp_enqueue_
script`, no module/dependency system, and no package manager. The post editor
in `wp-admin/b2edit.form.php` is a single plain `<textarea name="content">` —
posts are stored and edited as raw HTML text, not as the parsed block tree
(HTML-comment-delimited `<!-- wp:* -->` markup) that Gutenberg requires. /
JA: JavaScript はほぼ皆無。`src/` ツリー全体に `.js` ファイルは **1 個**
だけ — `wp-admin/b2quicktags.js` で、`<textarea>` に HTML タグを挿入する
数個の素の関数にすぎない。React もビルド工程も `wp_enqueue_script` も
モジュール/依存システムもパッケージマネージャも無い。`wp-admin/b2edit.form.php`
の投稿エディタは単一の素の `<textarea name="content">` で、投稿は生の HTML
テキストとして保存・編集される。Gutenberg が要求する、解析済みのブロック
ツリー(HTML コメント区切りの `<!-- wp:* -->` マークアップ)ではない。

### 3. Server-side block registration / サーバー側のブロック登録

EN: Blocks are registered on the server with `register_block_type()`, which
reads a `block.json` metadata file, runs on the `init` action hook, and
exposes the block through the REST API. Dynamic blocks render via a PHP
`render_callback` / `render.php`. This whole mechanism is built on top of the
**Plugin API (actions and filters)**, which itself was only introduced in
**WordPress 1.2 (2004)**. The block editor in core requires **PHP 7.4 or
higher**.

JA: ブロックはサーバー側で `register_block_type()` により登録される。これは
`block.json` メタデータファイルを読み、`init` アクションフックで実行され、
REST API 経由でブロックを公開する。動的ブロックは PHP の `render_callback` /
`render.php` でレンダリングされる。この仕組み全体は **Plugin API
(アクションとフィルター)** の上に成り立っており、その Plugin API 自体も
**WordPress 1.2(2004 年)** でようやく導入された。コアのブロックエディタは
**PHP 7.4 以上**を必要とする。

**0.71 provides / 0.71 が提供するもの:** EN: No block concept at all, and only
a *primitive precursor* of the Plugin API. WordPress 0.71 (2003) predates
WordPress 1.2, so it has **no `add_action` / `do_action`** — there are no
action hooks. It has only an early `add_filter` / `apply_filters` pair, in
`b2-include/b2template.functions.php`. That early implementation is far weaker
than the modern one: filters are stored by name only, callbacks receive a
**single string argument** (`$string = $function($string);`), and there is
**no priority and no accepted-args** support. `register_block_type` therefore
cannot exist, and even if it were added it would have no `init` hook to run on
and no REST API to register into. /
JA: ブロックの概念は皆無で、Plugin API も *原始的な前身*しかない。WordPress
0.71(2003 年)は WordPress 1.2 より前なので、**`add_action` / `do_action` は
存在しない** — アクションフックが無い。`b2-include/b2template.functions.php`
に初期版の `add_filter` / `apply_filters` の対だけがある。その初期実装は
モダン版よりはるかに貧弱で、フィルターは名前のみで保持され、コールバックは
**単一の文字列引数**を受け取り(`$string = $function($string);`)、
**優先度も accepted-args もない**。したがって `register_block_type` は
存在し得ず、仮に追加しても実行する `init` フックも、登録先の REST API も
ない。

### 4. The modern `wp-includes/` bootstrap / モダンな `wp-includes/` ブートストラップ

EN: Gutenberg in core relies on the modern WordPress bootstrap: `wp-load.php`
/ `wp-settings.php`, the `wp-includes/` directory, `WP_Query`, the options /
user / capability APIs, `wp_enqueue_script` / `wp_enqueue_style`, the script
modules API, and the `wp-admin` block-editor page (`edit-form-blocks.php`,
reached via `post-new.php`). The exact same dependency was what defeated
wp-env in Issue #55.

JA: コアの Gutenberg はモダンな WordPress ブートストラップに依存する。
`wp-load.php` / `wp-settings.php`、`wp-includes/` ディレクトリ、`WP_Query`、
オプション / ユーザー / 権限 API、`wp_enqueue_script` / `wp_enqueue_style`、
スクリプトモジュール API、そして `wp-admin` のブロックエディタページ
(`post-new.php` から到達する `edit-form-blocks.php`)。Issue #55 で wp-env を
打ち負かしたのと、まったく同じ依存である。

**0.71 provides / 0.71 が提供するもの:** EN: A 2003 b2/cafelog layout. As
already established for the wp-env investigation, there is **no `wp-includes/`
directory** (0.71 uses `b2-include/`), no `wp-load.php` / `wp-settings.php`,
no `WP_Query`. The bootstrap is `blog.header.php`, included directly by each
page. There is **no `wp_enqueue_script`** — the admin pages emit `<script>`
tags by hand. The editor screen is `wp-admin/b2edit.php`, a server-rendered
HTML form, with no concept of a JS-driven block editor page. /
JA: 2003 年の b2/cafelog 構成である。wp-env 調査で既に確認したとおり、
**`wp-includes/` ディレクトリは無く**(0.71 は `b2-include/` を使う)、
`wp-load.php` / `wp-settings.php` も `WP_Query` も無い。ブートストラップは
各ページが直接 include する `blog.header.php` である。**`wp_enqueue_script`
も無く**、管理ページは `<script>` タグを手書きで出力する。エディタ画面は
`wp-admin/b2edit.php` というサーバーレンダリングの HTML フォームで、
JS 駆動のブロックエディタページという概念は無い。

## Summary table / まとめ表

| Gutenberg requires / Gutenberg の要件 | First in WP / WP 初出 | WordPress 0.71-gold (2003) |
|---|---|---|
| REST API endpoints (`/wp-json/wp/v2`) | 4.7 (2016) | None — RSS/RDF read-only XML only / 無し — RSS/RDF の読み取り専用 XML のみ |
| `@wordpress/*` JS packages, React SPA | 5.0 (2018) | One `.js` file (`b2quicktags.js`); no React / `.js` は 1 個のみ、React 無し |
| npm / webpack / esbuild build tooling | 5.0 (2018) | None — no Node.js toolchain / 無し — Node.js ツールチェーン無し |
| Block model (`<!-- wp:* -->` markup) | 5.0 (2018) | Posts are raw HTML in a `<textarea>` / 投稿は `<textarea>` 内の生 HTML |
| `register_block_type()` / `block.json` | 5.0 (2018) | No block concept / ブロックの概念無し |
| Action hooks (`add_action` / `do_action`) | 1.2 (2004) | None — only primitive `add_filter` / 無し — 原始的な `add_filter` のみ |
| `wp-includes/` + `wp-load.php` bootstrap | modern WP / モダン WP | `b2-include/` + `blog.header.php` |
| `wp_enqueue_script` / script modules | 2.6+ (2008) | None — hand-written `<script>` tags / 無し — `<script>` タグ手書き |
| Minimum PHP / 最低 PHP | 7.4+ | Written for PHP 4 (this repo runs it on 8.3) / PHP 4 向け(本リポジトリは 8.3 で動かす) |

## Why this is not a "port" / これが「移植」でない理由

EN: A port moves working software onto a platform that already offers the
interfaces it needs. Gutenberg needs four platform-level subsystems — a
read/write REST API, a JavaScript module/build/enqueue system, a server-side
block registry built on action hooks, and the modern core bootstrap — and
WordPress 0.71 offers none of them. Supplying them means re-creating the
WordPress 1.2 → 4.7 → 5.0 evolution (the Plugin API, `WP_Query`, the options/
user APIs, `wp_enqueue_script`, the REST API, the block infrastructure)
*before* a single block could load. The result would be modern WordPress with
a 2003 commit history, not WordPress 0.71. The honest engineering conclusion,
identical in spirit to the wp-env finding in Issue #55, is that Gutenberg is
fundamentally tied to modern WordPress and cannot be ported to the 2003
b2/cafelog codebase.

JA: 移植とは、必要なインターフェースを既に備えたプラットフォームへ、動作する
ソフトウェアを移すことである。Gutenberg はプラットフォーム水準の 4 つの
サブシステム — 読み書き可能な REST API、JavaScript のモジュール/ビルド/
エンキュー機構、アクションフックの上に構築されたサーバー側のブロック
レジストリ、モダンなコアのブートストラップ — を必要とするが、WordPress
0.71 はそのいずれも提供しない。それらを用意するとは、ブロックを 1 つ読み込む
*前に* WordPress 1.2 → 4.7 → 5.0 の進化(Plugin API、`WP_Query`、オプション/
ユーザー API、`wp_enqueue_script`、REST API、ブロック基盤)を再現することを
意味する。その結果は 2003 年のコミット履歴を持つモダン WordPress であって、
WordPress 0.71 ではない。Issue #55 の wp-env の結論と精神的に同じく、誠実な
工学的結論は、Gutenberg は本質的にモダン WordPress に強く結びついており、
2003 年の b2/cafelog コードベースへは移植できない、というものである。

## Sources / 出典

- [Block API Reference — Block Editor Handbook](https://developer.wordpress.org/block-editor/reference-guides/block-api/) — "the block editor is dependent on the WordPress REST API".
- [Block API Versions — Block Editor Handbook](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-api-versions/)
- [register_block_type() — Function Reference](https://developer.wordpress.org/reference/functions/register_block_type/)
- [Metadata in block.json — Block Editor Handbook](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/) — block registration hooked on `init`; PHP 7.4+.
- [packages/README.md — WordPress/gutenberg](https://github.com/WordPress/gutenberg/blob/trunk/packages/README.md) — 80+ npm packages, monorepo, npm workspaces + lerna.
- [@wordpress/build, the next generation of WordPress plugin build tooling — WordPress Developer Blog](https://developer.wordpress.org/news/2026/04/wordpress-build-the-next-generation-of-wordpress-plugin-build-tooling/) — esbuild-based build tooling.
- [@wordpress/data — Block Editor Handbook](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-data/) — Redux-based state layer.
- [REST API Changelog — REST API Handbook](https://developer.wordpress.org/rest-api/changelog/) — REST API infrastructure in 4.4, endpoints in 4.7.
- [WP_Hook: Next Generation Actions and Filters — Make WordPress Core](https://make.wordpress.org/core/2016/09/08/wp_hook-next-generation-actions-and-filters/) — Plugin API (actions/filters) introduced in WordPress 1.2 (2004).
- `docs/docker-environment.md` (this repo, Issue #55) — the parallel wp-env feasibility finding.
- `src/` (this repo) — WordPress 0.71-gold source: `b2-include/` (no `wp-includes/`), `b2edit.form.php` plain `<textarea>` editor, `b2template.functions.php` primitive `add_filter`/`apply_filters`, single `wp-admin/b2quicktags.js`.
