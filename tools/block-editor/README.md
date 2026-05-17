# Block Editor Prototype (Issue #65)

An experimental proof-of-concept that brings a **modern block editor** to
WordPress 0.71-gold (2003) by embedding the `@wordpress/block-editor` package
as a *library* behind a thin WordPress-0.71 JSON backend. This is "policy B"
from the Gutenberg feasibility investigation
(`docs/gutenberg-investigation.md`, Issue #61 / PR #63): porting *Gutenberg
the application* to 0.71 is not feasible, but a *custom* block editor on the
`@wordpress/block-editor` library **is**.

> **This is a clearly-labelled experimental prototype, not a finished
> feature.** It does not replace `wp-admin/b2edit.php`.

## What it is

Two cooperating parts.

### 1. The React app (this directory)

A small, self-contained React app with its **own `package.json`** (it does
not touch the repository root's npm setup). It uses:

- `@wordpress/block-editor` — the block-editing UI (`BlockEditorProvider`,
  `BlockList`, `BlockTools`, `BlockToolbar`, `BlockInspector`,
  `BlockBreadcrumb` and the list view).
- `@wordpress/block-library` — the core *static* blocks. They register
  themselves **client-side** via `registerCoreBlocks()`; no server-side
  `register_block_type()` is needed, which is exactly why this works on 0.71.
- `@wordpress/blocks` — `parse()` (block markup → block tree) and
  `serialize()` (block tree → block markup).
- `@wordpress/components`, `@wordpress/element`, `@wordpress/keyboard-shortcuts`
  — supporting UI and the React wrapper.

Vite bundles React **and** every `@wordpress/*` package **into** a single
standalone module, so the boot page needs no separate WordPress JavaScript
runtime. The build output is written to `src/block-editor/assets/` so the
Docker blog can serve it.

### 2. The WordPress 0.71 backend (`src/block-editor/api/`)

Three small PHP files, served by the existing Docker blog:

- `bootstrap.php` — shared bootstrap. Reuses `b2config.php` and its `$wpdb`
  connection, and reuses 0.71's own cookie auth (`wordpressuser` /
  `wordpresspass`, the `b2users` table) — the same trust source as
  `b2verifauth.php`.
- `load.php` — `GET load.php?post=ID` → JSON
  `{ id, title, content, status, category, categories }`. `category` is the
  post's single `b2posts.post_category` cat_ID; `categories` is the full
  `b2categories` list (`{ id, name }`) for the sidebar selector.
- `save.php` — `POST save.php` with a JSON body
  `{ post, title, content, status, category }` → writes the block markup into
  `b2posts.post_content` and persists `post_status` / `post_category`.
  `status` is whitelisted (`publish` / `draft` / `private`) and `category` is
  verified to exist in `b2categories`.
- `editor.php` — the boot page. `editor.php?post=ID` serves an HTML shell that
  loads the bundle and mounts the editor for that post.

Post ids are cast with `(int)` and strings escaped with `wpdb::escape()`, the
same SQL hardening the project applied in Issue #31. `save.php` enforces the
same ownership rule as `b2edit.php`'s `editpost` handler.

## How it works

```
  Browser (editor.php?post=N)
        |
        |  GET  block-editor/api/load.php?post=N      ── JSON ──▶  b2posts.post_content
        |                                                              |
        |  React app:  parse(content) → block tree → BlockEditor       |
        |                                                              |
        |  edit blocks → serialize(blocks) → block markup              |
        |                                                              |
        |  POST block-editor/api/save.php  { post, title, content } ──▶ b2posts.post_content
        |
  0.71 front end (index.php?p=N) renders the post; the <!-- wp:* -->
  delimiters are HTML comments, so they are invisible to visitors.
```

Block content is stored as block-markup HTML in 0.71's existing
`post_content` column. The 0.71 front end renders it normally because the
`<!-- wp:* -->` delimiters are HTML comments. A legacy 0.71 post that has no
block delimiters — a classic `b2edit.php` post — is parsed by `parse()` into
a single Custom HTML (`core/html`) block, because `main.jsx` sets the
freeform content handler to `core/html` after `registerCoreBlocks()`. Such
posts open as an editable HTML block without data loss; without that handler
they would fall through to the unsupported-block placeholder.

## Text-selection fix

Selecting text inside a paragraph block used to show **no highlight** in
Chromium / Firefox — the text was selected (typing replaced it) but invisible.

The cause is a CSS-minifier interaction. `@wordpress/block-editor`'s
`content.css` hides the native highlight on the block canvas with a deliberate
**Safari-only** hack — a single comma-separated selector list:

```css
_::-webkit-full-page-media, _:future,
:root .block-editor-block-list__layout::selection { background-color: transparent }
```

`_::-webkit-full-page-media` is a pseudo-element only Safari recognises. A
browser that cannot parse one selector in a list drops the **whole** rule, so
Chromium / Firefox normally discard this rule entirely and keep the highlight.

Vite's default (esbuild) CSS minifier "optimises" that rule into **separate**
rules — one selector each. The standalone
`:root .block-editor-block-list__layout::selection { background: transparent }`
rule is then valid in Chromium / Firefox, applies, and hides the highlight.

The fix is a small Vite plugin (`repairSelectionHack` in `vite.config.js`)
that runs after minification and rejoins the split rules back into the
original guarded comma-separated list, so the hack is Safari-only again.

A second part of the same issue: the paragraph's **text-alignment** toolbar
control (and other typography controls) are gated behind editor *settings*.
`Editor.jsx` now passes a `settings` object (`EDITOR_SETTINGS`) with the
`__experimentalFeatures` feature flags to `BlockEditorProvider`.

## Build

Requires Node.js (developed and tested with v24) and npm.

```sh
cd tools/block-editor
npm install
npm run build
```

`npm run build` bundles the app into `src/block-editor/assets/`
(git-ignored — it is a build artifact). `editor.php` reads
`src/block-editor/assets/.vite/manifest.json` to find the hashed bundle
filename.

## Open the editor

With the local Docker blog running (`docker compose up -d` from the
repository root) and after building:

1. Log in to the 0.71 admin at `http://localhost:8080/b2login.php`.
2. Open `http://localhost:8080/block-editor/api/editor.php?post=1` (replace
   `1` with any post id).

## Round-trip demo

Verified end to end against the Docker blog:

1. **Load** — `editor.php?post=1` loads "Hello world!" into the block editor.
   The plain-HTML 0.71 post is parsed into blocks.
2. **Edit** — add a heading block, edit a paragraph in the block UI.
3. **Save** — click *Save*; `save.php` writes
   `<!-- wp:heading --> … <!-- wp:paragraph --> …` into
   `b2posts.post_content`.
4. **Confirm storage** — the database row now holds `<!-- wp:* -->` block
   markup.
5. **Confirm the front end** — `index.php?p=1` still renders the post; the
   `<!-- wp:* -->` delimiters are HTML comments and stay invisible.

## What works

- Loading a 0.71 post into a modern block editor (`parse()`).
- Editing with the core **static** blocks — paragraph, heading, list, quote,
  image (client-side), separator, etc.
- **Visible text selection** — drag-selecting or shift-arrow-selecting text in
  a block shows the native highlight (see *Text-selection fix* below).
- **Per-block toolbars** — the floating `BlockTools` toolbar shows the
  controls of the currently selected block, including **Bold / Italic / Link**
  (from `@wordpress/format-library`) and the paragraph's **text-alignment**
  control.
- **Document Overview** — a toggleable list-view panel (the block outline),
  plus a `BlockBreadcrumb` under the canvas.
- **Settings sidebar** — a *Post* panel with a Status control
  (`publish` / `draft` / `private`) and a Category selector (`b2categories`),
  and a *Block* panel with `BlockInspector` for the selected block's
  attributes (Typography, Dimensions, ...).
- Saving block markup, `post_status` and `post_category` back into 0.71's
  `b2posts` (`serialize()`).
- The 0.71 front end rendering the saved post unchanged.
- Cookie-based auth and the `b2edit.php`-equivalent ownership check.
- **Responsive layout** — on a desktop the body is a three-column layout
  (Document Overview / canvas / settings sidebar); below 782px the header
  wraps onto multiple rows and the body collapses to a single column — the
  canvas first, then the Document Overview and settings panels stacked at
  full width — so the editor is usable on a phone. The mobile rules are
  guarded by a media query in `src/app.css`; the desktop layout is unchanged.

## Limitations

- **Static blocks only.** Dynamic / server-rendered blocks are out of scope:
  0.71 has no `register_block_type()` and no PHP `render_callback`.
- **No REST API.** Some `@wordpress/block-library` blocks probe
  `wp/v2/types` and similar REST endpoints; those requests return **404**
  (0.71 has no REST API, as `docs/gutenberg-investigation.md` documents). The
  editor degrades gracefully — the static blocks and the load/save round trip
  are unaffected — but REST-backed conveniences (e.g. the media library, post
  meta) are unavailable.
- **No autosave, no revisions, no full editor chrome.** This is a minimal
  proof-of-concept, not the `wp-admin` post editor.
- **Decoupled hybrid.** The result is a modern editor over 2003 storage; the
  React build subsystem is a substantial addition well beyond "port 0.71 to
  PHP 8.3".
- The bundle is large (~4 MB JS plus an image-processing worker chunk that is
  loaded lazily) because the whole `@wordpress/*` editor stack is bundled in.

---

# ブロックエディタ試作 (Issue #65)

`@wordpress/block-editor` パッケージを *ライブラリ* として、薄い
WordPress 0.71 の JSON バックエンドの背後に組み込むことで、**モダンな
ブロックエディタ**を WordPress 0.71-gold(2003 年)にもたらす実験的な
概念実証である。これは Gutenberg 実現可能性調査
(`docs/gutenberg-investigation.md`、Issue #61 / PR #63)の「方針B」である。
*アプリケーションとしての Gutenberg* を 0.71 へ移植するのは実現不可能だが、
`@wordpress/block-editor` ライブラリ上の *カスタム* ブロックエディタ **は**
実現可能、というもの。

> **これは明示的に実験的な試作であり、完成機能ではない。**
> `wp-admin/b2edit.php` を置き換えるものではない。

## 構成

協調する 2 つの部分から成る。

### 1. React アプリ (本ディレクトリ)

独自の **`package.json`** を持つ、小さく自己完結した React アプリ
(リポジトリルートの npm 設定には触れない)。使用パッケージ:

- `@wordpress/block-editor` — ブロック編集 UI(`BlockEditorProvider`・
  `BlockList`・`BlockTools`・`BlockToolbar`・`BlockInspector`・
  `BlockBreadcrumb`・リストビュー)。
- `@wordpress/block-library` — 標準の *静的* ブロック。`registerCoreBlocks()`
  で **クライアント側**に自己登録する。サーバー側の `register_block_type()`
  は不要であり、これこそが 0.71 でも動作する理由である。
- `@wordpress/blocks` — `parse()`(ブロックマークアップ → ブロックツリー)と
  `serialize()`(ブロックツリー → ブロックマークアップ)。
- `@wordpress/components`・`@wordpress/element`・
  `@wordpress/keyboard-shortcuts` — 補助 UI と React ラッパー。

Vite は React **と** 全 `@wordpress/*` パッケージを 1 つのスタンドアロン
モジュールへバンドルするため、起動ページは別の WordPress JavaScript
ランタイムを必要としない。ビルド成果物は Docker のブログが配信できるよう
`src/block-editor/assets/` へ書き出す。

### 2. WordPress 0.71 バックエンド (`src/block-editor/api/`)

既存の Docker ブログが配信する 3 + 1 個の小さな PHP ファイル:

- `bootstrap.php` — 共通ブートストラップ。`b2config.php` とその `$wpdb`
  接続を再利用し、0.71 自身のクッキー認証(`wordpressuser` /
  `wordpresspass`、`b2users` テーブル)を再利用する — `b2verifauth.php` と
  同じ信頼源。
- `load.php` — `GET load.php?post=ID` → JSON
  `{ id, title, content, status, category, categories }`。`category` は
  投稿の単一の `b2posts.post_category` の cat_ID、`categories` はサイド
  バーのセレクタ用に `b2categories` 全件(`{ id, name }`)。
- `save.php` — JSON ボディ `{ post, title, content, status, category }` の
  `POST save.php` → ブロックマークアップを `b2posts.post_content` へ
  書き込み、`post_status` / `post_category` を保存する。`status` は
  ホワイトリスト(`publish` / `draft` / `private`)、`category` は
  `b2categories` に存在するか検証する。
- `editor.php` — 起動ページ。`editor.php?post=ID` がバンドルを読み込み、
  その投稿に対してエディタをマウントする HTML シェルを配信する。

投稿 ID は `(int)` でキャストし、文字列は `wpdb::escape()` でエスケープする。
Issue #31 でプロジェクトが適用したのと同じ SQL 堅牢化である。`save.php` は
`b2edit.php` の `editpost` ハンドラと同じ所有者規則を適用する。

## 仕組み

```
  Browser (editor.php?post=N)
        |
        |  GET  block-editor/api/load.php?post=N      ── JSON ──▶  b2posts.post_content
        |                                                              |
        |  React app:  parse(content) → block tree → BlockEditor       |
        |                                                              |
        |  edit blocks → serialize(blocks) → block markup              |
        |                                                              |
        |  POST block-editor/api/save.php  { post, title, content } ──▶ b2posts.post_content
        |
  0.71 front end (index.php?p=N) renders the post; the <!-- wp:* -->
  delimiters are HTML comments, so they are invisible to visitors.
```

ブロック内容はブロックマークアップ HTML として 0.71 の既存
`post_content` カラムに保存される。`<!-- wp:* -->` 区切りは HTML コメントで
あるため、0.71 のフロントエンドは通常どおり描画する。ブロック区切りの無い
レガシーな 0.71 投稿 — クラシックな `b2edit.php` 投稿 — は `parse()` により
1 つの Custom HTML(`core/html`)ブロックとして解析される。`main.jsx` が
`registerCoreBlocks()` の後に freeform コンテンツハンドラを `core/html` に
設定しているためである。そうした投稿は編集可能な HTML ブロックとしてデータ
欠落なく開ける。ハンドラが無い場合は未対応ブロックのプレースホルダへ落ちる。

## テキスト選択の修正

段落ブロック内のテキストを選択しても Chromium / Firefox では
**ハイライトが表示されなかった** — テキストは選択されている(入力で
置き換わる)が見えない状態だった。

原因は CSS minifier との相互作用である。`@wordpress/block-editor` の
`content.css` は、意図的な **Safari 限定** ハック — 1 つのカンマ区切り
セレクタリスト(上記)— でブロックキャンバスのネイティブハイライトを
隠している。`_::-webkit-full-page-media` は Safari だけが認識する擬似要素
である。リスト内に解釈できないセレクタが 1 つでもあるとブラウザはルール
**全体** を破棄するため、Chromium / Firefox は通常このルールを丸ごと捨て、
ハイライトを保つ。

Vite 既定(esbuild)の CSS minifier はこのルールをセレクタごとの **別々の**
ルールへ「最適化」する。単独になった
`:root .block-editor-block-list__layout::selection { background: transparent }`
は Chromium / Firefox でも有効なため適用され、ハイライトを隠してしまう。

修正は小さな Vite プラグイン(`vite.config.js` の `repairSelectionHack`)で
ある。minify 後に走り、分割されたルールを元のガード付きカンマ区切り
リストへ結合し直す。これによりハックは再び Safari 限定となる。

同じ Issue のもう一部分: 段落の **テキスト配置** ツールバー操作子(その他の
文字組み操作子も)はエディタの *設定* によって出し分けられる。`Editor.jsx`
は `__experimentalFeatures` の機能フラグを持つ `settings` オブジェクト
(`EDITOR_SETTINGS`)を `BlockEditorProvider` へ渡すようになった。

## ビルド

Node.js(v24 で開発・検証)と npm が必要。

```sh
cd tools/block-editor
npm install
npm run build
```

`npm run build` はアプリを `src/block-editor/assets/` へバンドルする
(git 管理外 — ビルド成果物のため)。`editor.php` は
`src/block-editor/assets/.vite/manifest.json` を読んでハッシュ付きの
バンドルファイル名を特定する。

## エディタを開く

ローカルの Docker ブログを起動し(リポジトリルートで
`docker compose up -d`)、ビルドした後で:

1. `http://localhost:8080/b2login.php` で 0.71 の管理画面にログインする。
2. `http://localhost:8080/block-editor/api/editor.php?post=1` を開く
   (`1` は任意の投稿 ID に置き換える)。

## 往復デモ

Docker のブログに対して端から端まで検証済み:

1. **読み込み** — `editor.php?post=1` が "Hello world!" をブロックエディタへ
   読み込む。素の HTML の 0.71 投稿がブロックへ解析される。
2. **編集** — 見出しブロックを追加し、段落をブロック UI で編集する。
3. **保存** — *Save* をクリックすると `save.php` が
   `<!-- wp:heading --> … <!-- wp:paragraph --> …` を
   `b2posts.post_content` へ書き込む。
4. **保存の確認** — データベースの行が `<!-- wp:* -->` ブロックマークアップを
   保持するようになる。
5. **フロントエンドの確認** — `index.php?p=1` は投稿を引き続き描画する。
   `<!-- wp:* -->` 区切りは HTML コメントであり不可視のまま。

## 動作するもの

- 0.71 の投稿をモダンなブロックエディタへ読み込む(`parse()`)。
- 標準の **静的** ブロックでの編集 — 段落・見出し・リスト・引用・画像
  (クライアント側)・区切りなど。
- **テキスト選択の可視化** — ブロック内のテキストをドラッグ選択 / Shift +
  矢印で選択するとネイティブのハイライトが表示される(下記
  *テキスト選択の修正* を参照)。
- **各ブロックのツールバー** — フローティングの `BlockTools` ツールバーが
  現在選択中ブロックの操作子を表示する。**太字 / 斜体 / リンク**
  (`@wordpress/format-library`)や段落の **テキスト配置** 操作子を含む。
- **ドキュメント概観** — 切り替え可能なリストビューパネル(ブロックの
  アウトライン)と、キャンバス下の `BlockBreadcrumb`。
- **設定サイドバー** — Status 操作子(`publish` / `draft` / `private`)と
  Category セレクタ(`b2categories`)を持つ *Post* パネル、および選択
  ブロックの属性(Typography・Dimensions など)を出す `BlockInspector` の
  *Block* パネル。
- ブロックマークアップ・`post_status`・`post_category` を 0.71 の
  `b2posts` へ保存し戻す(`serialize()`)。
- 0.71 のフロントエンドが保存済み投稿を変更なく描画する。
- クッキーベース認証と `b2edit.php` 相当の所有者チェック。

## 制限

- **静的ブロックのみ。** 動的 / サーバーレンダリングのブロックはスコープ外。
  0.71 には `register_block_type()` も PHP の `render_callback` も無い。
- **REST API なし。** 一部の `@wordpress/block-library` ブロックは
  `wp/v2/types` などの REST エンドポイントを探りに行き、それらの要求は
  **404** を返す(0.71 に REST API は無い。`docs/gutenberg-investigation.md`
  に記録済み)。エディタは穏当に劣化する — 静的ブロックと読み書きの往復は
  影響を受けない — が、REST に依存する便利機能(メディアライブラリ・投稿
  メタなど)は利用できない。
- **自動保存・リビジョン・完全なエディタ UI なし。** 最小の概念実証であり、
  `wp-admin` の投稿エディタではない。
- **疎結合のハイブリッド。** 結果は 2003 年のストレージの上のモダンエディタ
  である。React のビルドサブシステムは「0.71 を PHP 8.3 へ移植」を大きく
  超える追加である。
- バンドルは大きい(JS 約 4 MB に加え、遅延読み込みされる画像処理ワーカー
  チャンク)。`@wordpress/*` のエディタスタック全体をバンドルに含めるため。
