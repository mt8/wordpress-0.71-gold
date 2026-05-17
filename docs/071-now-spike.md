# 071-now feasibility spike — findings

Findings of the Phase 3 feasibility spike for `071-now`, browser-based
WordPress 0.71 (Issue #108, umbrella #104, design `docs/071-tooling.md`
section 5).

The spike's question: **can `@php-wasm/web` render WordPress 0.71's
front page in a browser, reading a post from an in-browser
SQLite-backed database?**

**Answer: yes.** The proof of concept does exactly that, verified in
headless Chromium. The principal risk identified in design section 5.2
— the MySQL-only database layer — is solved and is tractable for the
full build.

## Result

The `/tools/playground` package boots WordPress 0.71 entirely in the browser:
PHP 8.3 compiled to WebAssembly (`@php-wasm/web` 3.1.33), serving 0.71's
`src/` from the php-wasm virtual filesystem, with the database an
in-browser SQLite file. No MySQL server and no web server are involved.

`npm run verify` builds the playground, serves it, opens it in headless
Chromium and asserts the front page. All five checks pass:

```
PASS  HTTP 200 from index.php
PASS  seeded post title in HTML
PASS  seeded post body in HTML
PASS  seeded post title visible in iframe
PASS  no console errors
```

The rendered front page shows the blog title, the seeded post
("Hello world from 071-now") with its category, author and date, the
category list and the search form — WordPress 0.71's real front-page
template output, produced in the browser. A screenshot is written to
`tools/playground/test/071-now-frontpage.png`.

## The database approach — chosen and why

WordPress 0.71's `src/b2-include/wp-db.php` (the ezSQL `wpdb` class)
talks to MySQL through `mysqli`, and there is no MySQL in a browser.
Design section 5.2 named two candidate approaches.

### Approach (B) — userland `mysqli` shim — was rejected

A `mysqli`-compatible userland layer over SQLite would let 0.71's
`wp-db.php` run unchanged. It is **not workable on php-wasm**: the
`mysqli` extension is compiled into the php-wasm runtime, so the
procedural `mysqli_*` functions (`mysqli_connect`, `mysqli_query`,
`mysqli_fetch_object`, …) already exist as built-ins. PHP cannot
redeclare a built-in function — a userland `function mysqli_query() {}`
is a fatal `Cannot redeclare` error. A shim would only be possible with
a custom php-wasm build that omits the `mysqli` extension, which is out
of scope for a spike and adds a heavy maintenance burden.

(This was confirmed by probing the runtime: `@php-wasm/web` 3.1.33
reports `function_exists('mysqli_connect') === true`.)

### Approach (A) — SQLite-backed `wpdb` — was chosen

A 0.71-specific `wp-db.php` whose `$wpdb` runs against SQLite. php-wasm
ships PDO with the `sqlite` driver (`PDO::getAvailableDrivers()` =
`mysql, sqlite`; SQLite 3.51), so the backend needs no custom runtime.

The implementation (`tools/playground/db/wp-db.php`) keeps the **exact public
surface** of 0.71's ezSQL `wpdb` class — `query()`, `get_var()`,
`get_row()`, `get_col()`, `get_results()`, `escape()`, and the public
properties (`last_result`, `num_rows`, `insert_id`, …) — but is backed
by PDO/SQLite internally. SELECT results are cached as an array of
`stdClass` rows, the exact shape the `mysqli`-based class produced, so
every consumer (`b2config.php`, `blog.header.php`, the `b2-include`
function files, `wp-links/links.php`) runs **unchanged** against it.

This is a one-file overlay. It is applied only to the in-browser copy
of the source: `scripts/build-overlay.mjs` snapshots `src/` into the
generated `tools/playground/wp/` directory and replaces
`b2-include/wp-db.php` there. **`src/` and its MySQL / Docker setup are
never touched.**

## The MySQL → SQLite translation layer

Both approaches need 0.71's SQL translated to the SQLite dialect.
`tools/playground/db/sql-translator.php` (`WP071_SqlTranslator`) does this. It
is shared by the SQLite `wpdb` (runtime queries) and the seed (schema
DDL), so the schema and the live queries go through one path.

WordPress 0.71's SQL surface is genuinely tiny — this is the key
insight from design section 5.2, and the spike confirms it. The full
front-page render path issues only these query shapes:

- `SELECT * FROM b2settings` (`get_settings`)
- the main feed: `SELECT DISTINCT * FROM b2posts WHERE 1=1 AND
  post_date <= '…' AND post_category > 0 AND (post_status = "publish")
  ORDER BY post_date DESC LIMIT 20`
- `SELECT * FROM b2users WHERE ID = N` (post author)
- `SELECT cat_name FROM b2categories WHERE cat_ID = 'N'`
- `SELECT cat_ID, cat_name FROM b2categories` (category list)
- `SELECT … FROM b2links WHERE link_visible = 'Y' ORDER BY …` (links)
- the archive queries: `SELECT DISTINCT YEAR(post_date) …`

The translator covers exactly the constructs 0.71 emits, not the whole
of MySQL:

| MySQL construct (0.71)                  | SQLite translation |
|-----------------------------------------|--------------------|
| `int(N)`, `tinyint(N)`, `… unsigned`    | `INTEGER` |
| `varchar(N)`, `tinytext`                | `TEXT` |
| `datetime`                              | `TEXT` |
| `enum('publish','draft',…)`             | `TEXT` |
| `… auto_increment` + `PRIMARY KEY (id)` | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| `KEY` / `UNIQUE KEY` index lines        | dropped (not needed for the spike) |
| `"publish"` (double-quoted literal)     | `'publish'` (SQLite reads `"…"` as an identifier) |
| `YEAR/MONTH/DAYOFMONTH/HOUR/…(col)`     | `CAST(strftime('%Y', col) AS INTEGER)` etc. |
| `WEEK(col[, mode])`                     | `CAST(strftime('%W', col) AS INTEGER)` |
| `DATE_FORMAT(col, '…')`                 | `strftime('…', col)` |
| `rand()`                                | `random()` |

The schema DDL is taken verbatim from `src/wp-admin/wp-install.php` and
fed through the translator at seed time, so the in-browser schema is the
real 0.71 schema, translated by the same code the live blog uses.

## What works

- WordPress 0.71's unmodified front-page code path
  (`index.php` → `blog.header.php` → `b2config.php` → the `b2-include`
  function files → `wp-links/links.php`) runs in php-wasm.
- The SQLite-backed `wpdb` serves every front-page query; the seeded
  post, its author, category and the category list all render.
- The schema DDL and the live queries both translate cleanly.
- Deterministic boot: the database is re-seeded fresh per php-wasm
  instance by the `auto_prepend_file` boot shim.
- Headless-Chromium verification passes with no console errors.

## What does not work yet / out of scope for the spike

- **Page styling — resolved in the full build, step 1 (Issue #116).**
  The spike rendered the front-page HTML into a `blob:` URL iframe, so
  the page's asset requests (`layout2b.css`, `print.css`, the
  block-library CSS) and link clicks never reached the php-wasm request
  handler and the page was unstyled and not navigable. Step 1 of the
  full build adds a service worker (`tools/playground/public/sw.js`)
  that intercepts the blog's scoped same-origin requests and routes
  them through the `@php-wasm/web` request handler, as WordPress
  Playground does. The front page now renders with its CSS and internal
  navigation (front page → post page → category page) works.
- **Admin and write paths.** Only the front page was exercised. The
  admin (`wp-admin/`), login, posting and comments are untested. The
  `wpdb` write path (`INSERT`/`UPDATE`/`DELETE`) is implemented and the
  seed exercises `INSERT`, but the admin's own queries are not yet
  verified against the translator.
- **Direct `mysqli_*($wpdb->dbh, …)` call sites.** A few 0.71 functions
  bypass the `wpdb` methods and call `mysqli_query()` directly on
  `$wpdb->dbh` (`get_lastpostdate`, `dropdown_cats`, parts of
  `b2template.functions.php`). They are **not** on the front-page path
  with the spike's settings (`what_to_show = 'posts'`), so the spike
  does not hit them — but `$wpdb->dbh` is now a `PDO`, not a `mysqli`
  handle, so those paths would fatal. The full build must either route
  them through the `wpdb` methods or have the overlay also cover them.
- **Image upload** — explicitly out of scope per Issue #108.
- **Persistence.** The SQLite database lives in the php-wasm virtual
  filesystem and is discarded when the tab closes. A full build would
  persist it (IndexedDB / OPFS), as WordPress Playground does.
- **Bundle size.** `@php-wasm/web` bundles every PHP version it
  supports (5.2–8.5); the build emits ~9 MB of `.wasm`/`.data` assets.
  A full build should trim this to PHP 8.3 only.

## Risks for a full `071-now` build

- **Low risk — the database.** The principal risk from design section
  5.2 is resolved. 0.71's SQL surface is small and the translator
  covers it; extending it to the admin's queries is incremental work,
  not a redesign.
- **Medium risk — same-origin asset serving.** Making the in-browser
  blog load its own CSS / follow its own links needs the
  request-handler-backed serving model (service worker) that WordPress
  Playground uses. It is well-trodden ground but is real engineering.
- **Medium risk — the direct `mysqli_*` call sites.** A handful of 0.71
  functions need either routing through `wpdb` or a slightly wider
  overlay. Bounded and enumerable, but must be done before the admin
  works.
- **Low risk — runtime maintenance.** `@php-wasm/web` is a published,
  maintained package; no custom php-wasm build is needed (approach A
  avoids it).

## Recommendation

**Proceed to the full `071-now` build.** The spike confirms the
approach: php-wasm runs WordPress 0.71 unchanged, and the
SQLite-backed `wpdb` (approach A) plus the small MySQL→SQLite
translator solves the database problem cleanly, with no custom runtime.

Suggested order for the full build:

1. Serve the in-browser blog through the php-wasm request handler (a
   service worker), so CSS, links and navigation work — this turns the
   PoC into a usable blog.
2. Trim the bundle to PHP 8.3 only.
3. Extend the translator and the overlay to cover the admin's queries
   and the direct `mysqli_*` call sites; exercise the admin and write
   paths.
4. Persist the SQLite database (IndexedDB / OPFS).
5. Decide image-upload handling (was out of scope for the spike).

---

# 071-now 実現可能性検証 — 検証結果

`071-now`（ブラウザ内 WordPress 0.71）の Phase 3 実現可能性検証
（feasibility spike）の検証結果（Issue #108、アンブレラ #104、設計は
`docs/071-tooling.md` セクション 5）。

検証の問い: **`@php-wasm/web` はブラウザ内で WordPress 0.71 のフロント
ページを描画し、ブラウザ内 SQLite ベースのデータベースから投稿を読み取
れるか?**

**答え: できる。** 概念実証は実際にそれを行い、ヘッドレス Chromium で
検証済みである。設計セクション 5.2 が挙げた主たるリスク — MySQL 専用の
データベース層 — は解決され、本格実装でも扱える見込みである。

## 結果

`/tools/playground` パッケージは WordPress 0.71 を完全にブラウザ内で起動する。
PHP 8.3 を WebAssembly へコンパイルしたもの（`@php-wasm/web` 3.1.33）が
0.71 の `src/` を php-wasm 仮想ファイルシステムから配信し、データベース
はブラウザ内の SQLite ファイルである。MySQL サーバーも Web サーバーも
関与しない。

`npm run verify` は playground をビルドし、配信し、ヘッドレス Chromium
で開いてフロントページを検証する。5 つのチェックすべてが成功する:

```
PASS  HTTP 200 from index.php
PASS  seeded post title in HTML
PASS  seeded post body in HTML
PASS  seeded post title visible in iframe
PASS  no console errors
```

描画されたフロントページにはブログタイトル、投入済み投稿
（「Hello world from 071-now」）とそのカテゴリー・著者・日付、カテゴ
リー一覧、検索フォームが表示される — WordPress 0.71 本来のフロント
ページテンプレートの出力が、ブラウザ内で生成されている。スクリーン
ショットは `tools/playground/test/071-now-frontpage.png` に書き出される。

## データベースのアプローチ — 選択と理由

WordPress 0.71 の `src/b2-include/wp-db.php`（ezSQL の `wpdb` クラス）は
`mysqli` 経由で MySQL と通信し、ブラウザに MySQL は存在しない。設計
セクション 5.2 は 2 つの候補を挙げた。

### アプローチ (B) — `mysqli` シム — 却下

SQLite の上に `mysqli` 互換のユーザーランド層を設ければ 0.71 の
`wp-db.php` を無改変で動かせる。これは **php-wasm では実現不可能**で
ある。`mysqli` 拡張は php-wasm ランタイムにコンパイル済みであり、手続き
型の `mysqli_*` 関数（`mysqli_connect`・`mysqli_query`・
`mysqli_fetch_object` …）は既に組み込み関数として存在する。PHP は組み
込み関数を再宣言できず、ユーザーランドの `function mysqli_query() {}` は
致命的な `Cannot redeclare` エラーになる。シムは `mysqli` 拡張を除いた
カスタム php-wasm ビルドでのみ可能だが、検証の範囲外であり保守負担も
重い。

（これはランタイムを調べて確認した。`@php-wasm/web` 3.1.33 は
`function_exists('mysqli_connect') === true` を返す。）

### アプローチ (A) — SQLite ベースの `wpdb` — 採用

`$wpdb` が SQLite に対して動作する 0.71 専用の `wp-db.php`。php-wasm は
`sqlite` ドライバ付きの PDO を同梱し（`PDO::getAvailableDrivers()` は
`mysql, sqlite`、SQLite 3.51）、バックエンドにカスタムランタイムは
不要である。

実装（`tools/playground/db/wp-db.php`）は 0.71 の ezSQL `wpdb` クラスの**公開
表面をそのまま**保つ — `query()`・`get_var()`・`get_row()`・
`get_col()`・`get_results()`・`escape()`、および公開プロパティ
（`last_result`・`num_rows`・`insert_id` …）— が、内部は PDO/SQLite を
使う。SELECT 結果は `stdClass` 行の配列としてキャッシュし、`mysqli`
ベースのクラスが生成していたのと同一の形にするため、すべての利用側
（`b2config.php`・`blog.header.php`・`b2-include` の関数ファイル群・
`wp-links/links.php`）は**無改変**で動作する。

これは 1 ファイルのオーバーレイである。ソースのブラウザ内コピーにのみ
適用される: `scripts/build-overlay.mjs` が `src/` を生成物の
`tools/playground/wp/` ディレクトリへスナップショットし、そこで
`b2-include/wp-db.php` を置き換える。**`src/` とその MySQL / Docker
構成には一切触れない。**

## MySQL → SQLite 変換層

いずれのアプローチも 0.71 の SQL を SQLite 方言へ変換する必要がある。
`tools/playground/db/sql-translator.php`（`WP071_SqlTranslator`）がこれを行う。
SQLite の `wpdb`（実行時クエリ）とシード（スキーマ DDL）が共有するため、
スキーマとライブクエリは 1 つの経路を通る。

WordPress 0.71 の SQL は実に小さい — これは設計セクション 5.2 の重要な
洞察であり、検証はそれを裏付けた。フロントページの全描画経路が発行する
クエリの形は次のものだけである:

- `SELECT * FROM b2settings`（`get_settings`）
- メインフィード: `SELECT DISTINCT * FROM b2posts WHERE 1=1 AND
  post_date <= '…' AND post_category > 0 AND (post_status = "publish")
  ORDER BY post_date DESC LIMIT 20`
- `SELECT * FROM b2users WHERE ID = N`（投稿の著者）
- `SELECT cat_name FROM b2categories WHERE cat_ID = 'N'`
- `SELECT cat_ID, cat_name FROM b2categories`（カテゴリー一覧）
- `SELECT … FROM b2links WHERE link_visible = 'Y' ORDER BY …`（リンク）
- アーカイブクエリ: `SELECT DISTINCT YEAR(post_date) …`

変換層は 0.71 が発行する構文だけを対象とし、MySQL 全体は対象としない:

| MySQL 構文（0.71）                       | SQLite への変換 |
|------------------------------------------|-----------------|
| `int(N)`・`tinyint(N)`・`… unsigned`     | `INTEGER` |
| `varchar(N)`・`tinytext`                 | `TEXT` |
| `datetime`                               | `TEXT` |
| `enum('publish','draft',…)`              | `TEXT` |
| `… auto_increment` + `PRIMARY KEY (id)`  | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| `KEY` / `UNIQUE KEY` のインデックス行    | 削除（検証では不要） |
| `"publish"`（二重引用符の文字列）        | `'publish'`（SQLite は `"…"` を識別子と解釈） |
| `YEAR/MONTH/DAYOFMONTH/HOUR/…(col)`      | `CAST(strftime('%Y', col) AS INTEGER)` 等 |
| `WEEK(col[, mode])`                      | `CAST(strftime('%W', col) AS INTEGER)` |
| `DATE_FORMAT(col, '…')`                  | `strftime('…', col)` |
| `rand()`                                 | `random()` |

スキーマ DDL は `src/wp-admin/wp-install.php` から原文どおり取り、シード
時に変換層を通す。よってブラウザ内のスキーマは、ライブブログが使うのと
同じコードで変換された、本物の 0.71 スキーマである。

## できること

- WordPress 0.71 の無改変のフロントページ経路
  （`index.php` → `blog.header.php` → `b2config.php` → `b2-include` の
  関数ファイル群 → `wp-links/links.php`）が php-wasm で動作する。
- SQLite ベースの `wpdb` がフロントページの全クエリを処理し、投入済み
  投稿・その著者・カテゴリー・カテゴリー一覧がすべて描画される。
- スキーマ DDL とライブクエリの双方がきれいに変換される。
- 決定的な起動: `auto_prepend_file` の起動シムが php-wasm インスタンス
  ごとにデータベースを新規に再投入する。
- ヘッドレス Chromium の検証がコンソールエラー無しで成功する。

## まだできないこと / 検証の対象外

- **ページのスタイリング — 本格実装のステップ 1（Issue #116）で解決。**
  スパイクはフロントページ HTML を `blob:` URL の iframe に描画したため、
  ページのアセット要求（`layout2b.css`・`print.css`・ブロックライブラリ
  CSS）やリンククリックが php-wasm リクエストハンドラへ届かず、ページは
  無装飾で描画され遷移もできなかった。本格実装のステップ 1 はサービス
  ワーカー（`tools/playground/public/sw.js`）を追加し、ブログのスコープ
  付き同一オリジン要求を横取りして `@php-wasm/web` のリクエストハンドラ
  へ通す（WordPress Playground と同様）。これによりフロントページは CSS
  付きで描画され、内部遷移（フロントページ → 投稿ページ → カテゴリー
  ページ）が機能する。
- **管理画面と書き込み経路。** フロントページのみを動かした。管理画面
  （`wp-admin/`）・ログイン・投稿・コメントは未検証。`wpdb` の書き込み
  経路（`INSERT`/`UPDATE`/`DELETE`）は実装済みでシードが `INSERT` を
  動かすが、管理画面自身のクエリは変換層に対して未検証。
- **直接の `mysqli_*($wpdb->dbh, …)` 呼び出し箇所。** 一部の 0.71 関数
  は `wpdb` メソッドを介さず `$wpdb->dbh` に対し直接 `mysqli_query()` を
  呼ぶ（`get_lastpostdate`・`dropdown_cats`・`b2template.functions.php`
  の一部）。検証の設定（`what_to_show = 'posts'`）ではフロントページ
  経路に乗らないため検証では到達しないが、`$wpdb->dbh` は今や `mysqli`
  ハンドルではなく `PDO` であり、それらの経路は致命的エラーになる。
  本格実装はそれらを `wpdb` メソッド経由にするか、オーバーレイで併せて
  対応する必要がある。
- **画像アップロード** — Issue #108 で明示的に対象外。
- **永続化。** SQLite データベースは php-wasm 仮想ファイルシステム上に
  あり、タブを閉じると失われる。本格実装は WordPress Playground と同様、
  これを永続化する（IndexedDB / OPFS）。
- **バンドルサイズ。** `@php-wasm/web` は対応する全 PHP バージョン
  （5.2〜8.5）をバンドルし、ビルドは約 9 MB の `.wasm`/`.data` アセット
  を出力する。本格実装は PHP 8.3 のみへ絞るべきである。

## 本格 `071-now` 実装のリスク

- **低リスク — データベース。** 設計セクション 5.2 の主たるリスクは
  解消した。0.71 の SQL は小さく変換層がそれを網羅する。管理画面の
  クエリへの拡張は再設計ではなく漸進的な作業である。
- **中リスク — 同一オリジンでのアセット配信。** ブラウザ内ブログに
  自身の CSS を読み込ませ自身のリンクを辿らせるには、WordPress
  Playground が使うリクエストハンドラ駆動の配信モデル（サービス
  ワーカー）が必要。実績ある手法だが相応の実装作業である。
- **中リスク — 直接の `mysqli_*` 呼び出し箇所。** 少数の 0.71 関数を
  `wpdb` 経由にするか、ややオーバーレイを広げる必要がある。範囲は限定
  され列挙可能だが、管理画面が動く前に対応が必要。
- **低リスク — ランタイム保守。** `@php-wasm/web` は公開・保守された
  パッケージであり、カスタム php-wasm ビルドは不要（アプローチ A が
  それを回避する）。

## 推奨

**本格 `071-now` 実装へ進むことを推奨する。** 検証はアプローチを裏付け
た。php-wasm は WordPress 0.71 を無改変で動かし、SQLite ベースの `wpdb`
（アプローチ A）と小さな MySQL→SQLite 変換層が、カスタムランタイム無し
でデータベース問題をきれいに解決する。

本格実装の推奨順序:

1. ブラウザ内ブログを php-wasm リクエストハンドラ経由（サービス
   ワーカー）で配信し、CSS・リンク・遷移を動作させる — これで PoC が
   使えるブログになる。
2. バンドルを PHP 8.3 のみへ絞る。
3. 変換層とオーバーレイを管理画面のクエリと直接の `mysqli_*` 呼び出し
   箇所まで拡張し、管理画面と書き込み経路を動かす。
4. SQLite データベースを永続化する（IndexedDB / OPFS）。
5. 画像アップロードの扱いを決める（検証では対象外だった）。
