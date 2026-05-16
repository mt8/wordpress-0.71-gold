# PHP 8.3 Migration Log / PHP 8.3 移行ログ

EN: This document records the changes made to run WordPress 0.71-gold on PHP 8.3.
It is updated per Issue as the migration progresses.

JA: 本ドキュメントは WordPress 0.71-gold を PHP 8.3 で動作させるための変更を記録する。
移行の進行に合わせて Issue ごとに更新する。

---

## Issue #1: Fix PHP 8.3 syntax (parse) errors / PHP 8.3 構文エラー(パースエラー)の修正

EN: First step of the strategy in CLAUDE.md — fix every location that produces a
parse error / fatal error under `php -l`. A check of all 52 PHP files found
parse errors in 2 files.

JA: CLAUDE.md「戦略」の第一段階。`php -l` でパースエラー / Fatal error になる箇所を
全件修正する。全 52 PHP ファイルを確認し、2 ファイルでパースエラーを検出した。

### Changes / 変更内容

#### 1. `src/b2-include/b2functions.php:30`

EN: Curly-brace string offset access syntax was removed in PHP 8.0.
JA: 波括弧による文字列オフセットアクセス構文は PHP 8.0 で廃止された。

```diff
- if ('<' != $curl{0} && $next) { // If it's not a tag
+ if ('<' != $curl[0] && $next) { // If it's not a tag
```

#### 2. `src/b2-include/b2template.functions.php:977, 979`

EN: Call-time pass-by-reference (`&` on a call argument) was removed in PHP 5.4.
The reference assignment on line 978 (`$email = &$comment->...`) is still valid
and was left unchanged.

JA: 関数呼び出し時の参照渡し(引数への `&`)は PHP 5.4 で廃止された。
978 行目の参照代入(`$email = &$comment->...`)は現在も有効なため変更しない。

```diff
- $url = trim(stripslashes(&$comment->comment_author_url));
+ $url = trim(stripslashes($comment->comment_author_url));
  $email = &$comment->comment_author_email;
- $author = stripslashes(&$comment->comment_author);
+ $author = stripslashes($comment->comment_author);
```

### Verification / 検証

EN: `php -l` reports `No syntax errors detected` for all 52 PHP files.
JA: 全 52 PHP ファイルに対し `php -l` が `No syntax errors detected` を返すことを確認。

```sh
for f in $(find src -name '*.php'); do php -l "$f"; done
```

### Out of scope / スコープ外

EN: PHP 8 behavioral changes that are not parse errors (e.g. old-style
constructors in the `wpdb` / `POP3` classes, removed functions) are handled in
later compatibility-phase Issues.

JA: パースエラーではない PHP 8 の挙動変更(`wpdb` / `POP3` クラスの旧式
コンストラクタ、廃止された関数など)は、後続の互換性対応フェーズの Issue で扱う。

---

## Issue #5: Migrate ext/mysql to mysqli via a compatibility shim / 互換レイヤー方式による ext/mysql → mysqli 移行

EN: WordPress 0.71 uses the ext/mysql API (`mysql_*`), removed in PHP 7.0 —
~140 calls across 20 files, mostly called directly rather than through the
`wpdb` class. The chosen approach is a compatibility shim: the `mysql_*`
functions are reimplemented over `mysqli`, and the legacy call sites are left
unchanged.

JA: WordPress 0.71 は PHP 7.0 で廃止された ext/mysql API(`mysql_*`)を使用する。
20 ファイル・約 140 箇所で使用され、その多くは `wpdb` クラスを経由せず直接
呼び出している。採用した方針は互換レイヤー方式で、`mysql_*` 関数を `mysqli`
上に再実装し、レガシーの呼び出し箇所は無改修とする。

### Changes / 変更内容

#### New file / 新規ファイル: `src/b2-include/mysql-shim.php`

EN: Defines the 16 `mysql_*` functions in use as thin `mysqli` wrappers. It:
- keeps a default connection link, replicating ext/mysql's implicit
  "last opened connection" (mysqli has none);
- swaps argument order where mysqli differs (e.g. `mysql_query($q, $link)` ->
  `mysqli_query($link, $q)`);
- implements `mysql_list_tables()` via `SHOW TABLES FROM`;
- tolerates a non-result argument (returns `false`) in the result helpers,
  because ext/mysql was lenient there whereas PHP 8's `mysqli_*` raise a
  `TypeError`;
- calls `mysqli_report(MYSQLI_REPORT_OFF)` so query errors return `false`
  instead of throwing — PHP 8.1+ defaults mysqli to exceptions, which the
  legacy `... or die()` pattern does not expect.

JA: 使用中の 16 個の `mysql_*` 関数を `mysqli` の薄いラッパーとして定義する。
- デフォルト接続リンクを保持し、ext/mysql の暗黙の「最後に開いた接続」を再現
  する(mysqli には無い);
- mysqli と引数順が異なる箇所を入れ替える(例: `mysql_query($q, $link)` ->
  `mysqli_query($link, $q)`);
- `mysql_list_tables()` は `SHOW TABLES FROM` で実装する;
- 結果セット系は結果以外の引数に寛容(`false` を返す)。ext/mysql は寛容だったが
  PHP 8 の `mysqli_*` は `TypeError` になるため;
- `mysqli_report(MYSQLI_REPORT_OFF)` を呼び、クエリエラーを例外送出ではなく
  `false` 返却にする。PHP 8.1 以降 mysqli は既定で例外を送出するが、レガシーの
  `... or die()` はこれを想定していない。

#### `src/b2-include/wp-db.php`

EN: Requires the shim at the top of the file. The old-style constructor
`function wpdb(...)` is renamed to `function __construct(...)` — old-style
constructors are no longer recognized as constructors in PHP 8.0.

JA: ファイル先頭でシムを require する。旧式コンストラクタ `function wpdb(...)`
を `function __construct(...)` に改名する。旧式コンストラクタは PHP 8.0 で
コンストラクタとして認識されない。

### Verification / 検証

EN: A test script run inside the Docker `web` container against the `db`
container passes all 25 checks — the 16 raw `mysql_*` functions (connect,
select, query, fetch variants, error handling, escaping, insert id, list
tables) and the `wpdb` class connecting and running queries via mysqli.

JA: Docker の `web` コンテナ内で `db` コンテナに対しテストスクリプトを実行し、
全 25 チェックに合格 — 16 個の生 `mysql_*` 関数(接続・選択・クエリ・各 fetch・
エラー処理・エスケープ・insert id・テーブル一覧)と、`wpdb` クラスが mysqli
経由で接続・クエリ実行できることを確認した。

### Out of scope / スコープ外

EN: `define('OBJECT', ..., true)` in `wp-db.php` emits an `E_WARNING` under
PHP 8.3 (case-insensitive constants were removed); the constant is still defined
and this is non-fatal — deferred to a later Issue. The `POP3` old-style
constructor, other removed functions (`get_magic_quotes_gpc()`, etc.), MySQL 8
SQL-compatibility, and full page rendering are also later Issues.

JA: `wp-db.php` の `define('OBJECT', ..., true)` は PHP 8.3 で `E_WARNING` を
出力する(大文字小文字を区別しない定数が廃止されたため)。定数自体は定義され
非 fatal であり、後続 Issue に先送りする。`POP3` 旧式コンストラクタ、その他の
廃止関数(`get_magic_quotes_gpc()` 等)、MySQL 8 の SQL 互換性、ページ全体の
描画も後続 Issue で扱う。

---

## Issue #7: Get the WordPress installer running on PHP 8.3 + MySQL 8 / WordPress インストーラを PHP 8.3 + MySQL 8 で動作させる

EN: First concrete, verifiable milestone — running `wp-admin/wp-install.php`
end to end. Reading it found exactly two blockers.

JA: 最初の具体的・検証可能なマイルストーン — `wp-admin/wp-install.php` を一通り
動作させる。精査の結果、障壁は 2 点だった。

### Changes / 変更内容

#### `src/b2-include/mysql-shim.php` — MySQL 8 `sql_mode`

EN: WordPress 0.71's installer SQL relies on the permissive 2003-era MySQL
behavior — `DATETIME` columns defaulting to `'0000-00-00 00:00:00'`, `''`
inserted into integer columns, zero-date and malformed-date literals in the
seed `INSERT`s. MySQL 8's default `sql_mode` (`STRICT_TRANS_TABLES`,
`NO_ZERO_DATE`, `NO_ZERO_IN_DATE`, ...) rejects all of these.

The shim's `mysql_connect()` now issues `SET SESSION sql_mode=''` immediately
after a successful connection, so MySQL 8 accepts the legacy SQL. Because every
connection (the `wpdb` class and all direct `mysql_*` callers) is opened through
the shim, the compatibility applies everywhere.

JA: WordPress 0.71 のインストーラ SQL は 2003 年頃の MySQL の寛容な挙動に依存
する — `DATETIME` 列の既定値 `'0000-00-00 00:00:00'`、整数列への `''` の挿入、
初期データ `INSERT` 中のゼロ日付・不正日付リテラル。MySQL 8 の既定 `sql_mode`
(`STRICT_TRANS_TABLES`, `NO_ZERO_DATE`, `NO_ZERO_IN_DATE` 等)はこれらをすべて
拒否する。

シムの `mysql_connect()` は接続成功直後に `SET SESSION sql_mode=''` を発行し、
MySQL 8 が旧 SQL を受け入れるようにした。全接続(`wpdb` クラスおよびすべての
直接 `mysql_*` 呼び出し)がシム経由で開かれるため、互換性は全体に適用される。

#### `src/wp-admin/wp-install.php` — `$HTTP_GET_VARS`

EN: Line 5 read the installer step from `$HTTP_GET_VARS['step']`. That
superglobal was removed in PHP 5.4, so `$step` was always null and the installer
could not advance past step 0. Changed to `$_GET['step']`.

JA: 5 行目はインストーラのステップを `$HTTP_GET_VARS['step']` から読んでいた。
このスーパーグローバルは PHP 5.4 で廃止されたため `$step` は常に null となり、
インストーラは step 0 から進めなかった。`$_GET['step']` に変更した。

### Verification / 検証

EN: In the Docker environment, starting from an empty database,
`wp-install.php?step=1` and `?step=2` both complete with no SQL errors. All 7
tables are created with the expected seed rows:

JA: Docker 環境で、空の DB から `wp-install.php?step=1` と `?step=2` がいずれも
SQL エラーなく完了。7 テーブルすべてが想定どおりの初期データ付きで作成された:

| Table / テーブル | Rows / 行数 |
|---|---|
| `b2posts` | 1 (Hello world!) |
| `b2users` | 1 (admin, level 10) |
| `b2comments` | 1 (Mr WordPress) |
| `b2categories` | 1 (General) |
| `b2settings` | 1 |
| `b2links` | 4 |
| `b2linkcategories` | 1 (General) |

### Out of scope / スコープ外

EN: The `$HTTP_*_VARS` superglobals in other files, `get_magic_quotes_gpc()`,
`ereg`/`each` and other removed functions, and rendering the blog front end /
admin pages are later Issues.

JA: 他ファイルの `$HTTP_*_VARS`、`get_magic_quotes_gpc()`、`ereg`/`each` 等の
廃止関数、ブログ表示・管理画面の描画は後続 Issue で扱う。

---

## Issue #9: Replace functions and variables removed in PHP 7/8 / PHP 7/8 で廃止された関数・変数の置き換え

EN: Toward rendering the blog front end and admin pages, four classes of removed
PHP features were addressed. Commits are split per item.

JA: ブログ本体・管理画面の表示に向け、廃止された PHP 機能 4 種類に対応した。
コミットは項目ごとに分割している。

### Changes / 変更内容

#### 1. `get_magic_quotes_gpc()` shim

EN: New file `src/b2-include/php-compat.php` defines a `get_magic_quotes_gpc()`
shim returning `false` (the function was removed in PHP 8.0). The shim is loaded
via PHP's `auto_prepend_file`, configured by `docker/php-compat.ini` (copied
into the image by the `Dockerfile`), so it is defined before every request —
necessary because some admin files (e.g. `wp-admin/b2edit.php`) call the
function before they load `b2config.php`.

JA: 新規ファイル `src/b2-include/php-compat.php` に `false` を返す
`get_magic_quotes_gpc()` シムを定義(同関数は PHP 8.0 で廃止)。シムは PHP の
`auto_prepend_file`(`docker/php-compat.ini` で設定し、`Dockerfile` でイメージへ
コピー)で全リクエストの前に読み込む。一部の管理画面ファイル
(例: `wp-admin/b2edit.php`)は `b2config.php` 読み込み前に同関数を呼ぶため。

#### 2. `ereg` / `eregi` / `ereg_replace` / `eregi_replace` shims

EN: The POSIX regex functions (removed in PHP 7.0) are reimplemented over PCRE
in `php-compat.php`. POSIX patterns are wrapped with a `~` delimiter; PCRE
errors degrade gracefully.

JA: POSIX 正規表現関数(PHP 7.0 で廃止)を `php-compat.php` で PCRE 上に再実装。
POSIX パターンは `~` デリミタで包み、PCRE エラー時は安全に縮退する。

#### 3. `each()` shim

EN: `each()` (removed in PHP 8.0) is reimplemented in `php-compat.php` using
`key()`/`current()`/`next()`.

JA: `each()`(PHP 8.0 で廃止)を `php-compat.php` で `key()`/`current()`/`next()`
を用いて再実装。

#### 4. `$HTTP_*_VARS` -> superglobals

EN: The `$HTTP_*_VARS` superglobals (removed in PHP 5.4) are mechanically
replaced with `$_GET` / `$_POST` / `$_COOKIE` / `$_SERVER` across 28 files
(343 occurrences).

JA: `$HTTP_*_VARS` スーパーグローバル(PHP 5.4 で廃止)を 28 ファイル・343 箇所で
`$_GET` / `$_POST` / `$_COOKIE` / `$_SERVER` へ機械的に置換。

#### 5. `array_merge()` null argument in `apply_filters()` (discovered during verification)

EN: Verifying the blog front end revealed a 5th blocker: `apply_filters()`
passed a possibly-null array element to `array_merge()`, which is a fatal
`TypeError` in PHP 8. The argument is now coerced to an array. This was not one
of the four enumerated items but is a hard fatal on the render path, so it is
included here.

JA: ブログ本体の表示検証で 5 件目の障壁が判明: `apply_filters()` が null の
可能性がある配列要素を `array_merge()` に渡しており、PHP 8 では fatal な
`TypeError` となる。引数を配列へ変換した。当初の 4 項目には含まれないが、表示
パス上の確実な fatal のため本 Issue に含めた。

### Verification / 検証

EN: In the Docker environment with WordPress installed, the blog front end
(`index.php`) and `b2login.php` both return HTTP 200 with **no fatal error**.

JA: Docker 環境(WordPress インストール済み)で、ブログ本体(`index.php`)と
`b2login.php` がいずれも HTTP 200 を返し、**fatal エラーが発生しない**ことを確認。

### Known remaining issues / 既知の残課題

EN: The blog front end renders without a fatal error, but the seeded post is not
yet displayed. Verification uncovered further, distinct problems, deferred to
later Issues:
- PHP 8 changed string-to-number comparison semantics: `'' != intval($user_ID)`
  (with `$user_ID` unset) is now true, so `blog.header.php` builds an invalid
  `SELECT` and the posts query fails with a SQL syntax error.
- The `/e` modifier in `preg_replace()` (e.g. `b2functions.php`) was removed in
  PHP 7.0 — it now emits a warning and does not transform the text.
- Numerous non-fatal `E_WARNING` / `E_DEPRECATED` notices (undefined variables,
  dynamic properties, `define()` 3rd argument, uninitialized string offsets).

JA: ブログ本体は fatal エラーなく描画されるが、初期投稿はまだ表示されない。検証
により、さらに別種の問題が判明した。後続 Issue で扱う:
- PHP 8 は文字列と数値の比較仕様を変更した。`'' != intval($user_ID)`
  (`$user_ID` 未設定)が真になり、`blog.header.php` が不正な `SELECT` を組み立て、
  投稿クエリが SQL 構文エラーになる。
- `preg_replace()` の `/e` 修飾子(例: `b2functions.php`)は PHP 7.0 で廃止。現在は
  警告を出し、テキストを変換しない。
- 多数の非 fatal な `E_WARNING` / `E_DEPRECATED`(未定義変数、動的プロパティ、
  `define()` 第3引数、未初期化文字列オフセット)。

---

## Issue #11: Make the blog front end display posts / ブログ本体に投稿を表示させる

EN: Follow-up to Issue #9. Two blockers stopped the blog from displaying the
seeded post.

JA: Issue #9 のフォローアップ。ブログが初期投稿を表示できない障壁が 2 つあった。

### Changes / 変更内容

#### 1. `src/blog.header.php` — PHP 8 comparison semantics

EN: PHP 8.0 changed string-to-number comparison: `0 == ''` is now false. The
condition `'' != intval($user_ID)` was therefore true when `$user_ID` is unset
(`intval` 0), so `blog.header.php` appended `OR post_author =  AND post_status
!= 'draft')` with an empty `$user_ID` — an invalid `SELECT` that failed with a
SQL syntax error. Changed to `if (intval($user_ID))`, which is true only for a
real (non-zero) user id, matching the original intent on PHP 7 and PHP 8.

JA: PHP 8.0 は文字列と数値の比較を変更し、`0 == ''` は false になった。条件
`'' != intval($user_ID)` は `$user_ID` 未設定時(`intval` 0)に真となり、
`blog.header.php` が空の `$user_ID` で `OR post_author =  AND post_status !=
'draft')` を連結 — 不正な `SELECT` となり SQL 構文エラーで失敗していた。
`if (intval($user_ID))` に変更。実在の(非ゼロの)user id でのみ真となり、
PHP 7 / PHP 8 双方で本来の意図に一致する。

#### 2. `src/b2-include/b2functions.php` — `/e` modifier in `convert_bbcode_email()`

EN: With the SQL fixed, the post was queried but its content rendered empty.
`convert_bbcode_email()` runs on every `the_content()` / `bloginfo()` call (it
is not behind the `$use_bbcode` guard), and its `preg_replace()` used the `/e`
modifier, removed in PHP 7.0. `preg_replace()` with `/e` now returns `null`,
which wiped `$content`. Rewritten with `preg_replace_callback()`.

JA: SQL を修正すると投稿はクエリされたが本文が空で描画された。
`convert_bbcode_email()` は `the_content()` / `bloginfo()` のたびに実行される
(`$use_bbcode` ガードの外)。その `preg_replace()` が PHP 7.0 で廃止された `/e`
修飾子を使っており、`/e` 付き `preg_replace()` は現在 `null` を返すため
`$content` が消えていた。`preg_replace_callback()` で書き換えた。

### Verification / 検証

EN: In the Docker environment with WordPress installed, the blog front end
(`index.php`) returns HTTP 200 with no SQL error and no fatal error, and
**displays the seeded post** — title ("Hello world!"), category, author, time
and content ("Welcome to WordPress...").

JA: Docker 環境(WordPress インストール済み)で、ブログ本体(`index.php`)が
SQL エラー・fatal エラーなく HTTP 200 を返し、**初期投稿を表示する** — タイトル
(「Hello world!」)、カテゴリ、著者、時刻、本文(「Welcome to WordPress...」)。

### Out of scope / スコープ外

EN: The remaining `/e` `preg_replace()` modifiers — the `%u` decoder and the
`$b2_bbcode` / `$b2_gmcode` / smilies arrays (which run only when the
corresponding `$use_*` option is on, all off by default) — and the non-fatal
`E_WARNING` / `E_DEPRECATED` notices (e.g. the `$tags` typo in `apply_filters()`,
uninitialized `$output` in `wptexturize()`) are deferred to later Issues.

JA: 残りの `/e` `preg_replace()` 修飾子 — `%u` デコーダおよび `$b2_bbcode` /
`$b2_gmcode` / スマイリーの配列(対応する `$use_*` オプションが有効なときのみ実行。
既定はすべて無効) — および非 fatal な `E_WARNING` / `E_DEPRECATED`(例:
`apply_filters()` の `$tags` タイプミス、`wptexturize()` の未初期化 `$output`)は
後続 Issue に先送りする。

---

## Issue #13: Replace the compatibility shims with native rewrites, add static analysis / 互換シムをネイティブ書き直しに置換し、静的解析を導入

EN: Static analysis tooling was introduced, and its findings led to dropping the
compatibility-shim approach entirely: the `mysql_*` and `ereg`/`each`/
`get_magic_quotes_gpc` shims were replaced with native PHP 8 / mysqli code.
See `docs/static-analysis.md` for the tooling.

JA: 静的解析ツールを導入し、その検出結果を受けて互換シム方式を全廃した。
`mysql_*` および `ereg`/`each`/`get_magic_quotes_gpc` のシムを、ネイティブな
PHP 8 / mysqli コードへ置き換えた。ツールについては `docs/static-analysis.md`
を参照。

### Changes (per commit) / 変更内容(コミット単位)

EN:
1. Add static-analysis tooling: `composer.json` (phpcs, PHPCompatibility,
   phpstan), `phpcs.xml.dist`, `phpstan.neon.dist`.
2. Rewrite the `wpdb` class to native `mysqli_*` (the constructor now does
   `mysqli_report(MYSQLI_REPORT_OFF)` and `SET SESSION sql_mode=''`).
3. Convert the `mysqli`-compatible result functions (`mysql_fetch_*`,
   `mysql_num_*`, `mysql_free_result`) project-wide.
4. Rewrite the direct `mysql_*` callers (19 files) to `mysqli_*` with
   `$wpdb->dbh`; add `global $wpdb;` to 16 functions.
5. Fix `wpdb::query()` to fetch only from a `mysqli_result`.
6. Delete `src/b2-include/mysql-shim.php`.
7. `each()` -> `foreach` (3 sites).
8. Remove `get_magic_quotes_gpc()` conditionals (10 sites).
9. Read the XML-RPC body from `php://input` instead of `$HTTP_RAW_POST_DATA`.
10. `ereg`/`ereg_replace` -> PCRE (16 sites).
11. Delete `src/b2-include/php-compat.php`, `docker/php-compat.ini`, and the
    Dockerfile `auto_prepend_file` line.
12. Add `phpstan-baseline.neon`.

JA:
1. 静的解析ツールを追加: `composer.json`(phpcs, PHPCompatibility, phpstan)、
   `phpcs.xml.dist`、`phpstan.neon.dist`。
2. `wpdb` クラスをネイティブ `mysqli_*` へ書き直し(コンストラクタが
   `mysqli_report(MYSQLI_REPORT_OFF)` と `SET SESSION sql_mode=''` を実行)。
3. `mysqli` 互換の結果取得関数(`mysql_fetch_*`、`mysql_num_*`、
   `mysql_free_result`)をプロジェクト全体で変換。
4. 直接の `mysql_*` 呼び出し(19 ファイル)を `$wpdb->dbh` 付き `mysqli_*` へ
   書き直し、16 関数に `global $wpdb;` を追加。
5. `wpdb::query()` が `mysqli_result` のときだけ取得するよう修正。
6. `src/b2-include/mysql-shim.php` を削除。
7. `each()` -> `foreach`(3 箇所)。
8. `get_magic_quotes_gpc()` の条件を除去(10 箇所)。
9. XML-RPC ボディを `$HTTP_RAW_POST_DATA` ではなく `php://input` から読む。
10. `ereg`/`ereg_replace` -> PCRE(16 箇所)。
11. `src/b2-include/php-compat.php`、`docker/php-compat.ini`、Dockerfile の
    `auto_prepend_file` 行を削除。
12. `phpstan-baseline.neon` を追加。

### Verification / 検証

EN: PHPCompatibility (testVersion 8.3) violations dropped from **234 to 14**;
the shim-related findings are fully eliminated. In the Docker environment the
installer completes and the blog front end displays the post, with no fatal
error and no SQL error and no compatibility shim loaded.

JA: PHPCompatibility(testVersion 8.3)の検出は **234 件から 14 件**へ減少し、
シム関連の検出は完全に解消。Docker 環境でインストーラが完走し、ブログ本体が
投稿を表示する。fatal エラー・SQL エラーは無く、互換シムも読み込まれない。

### Out of scope / スコープ外

EN: The runtime `E_WARNING` / `E_DEPRECATED` notices (undefined variables,
dynamic properties, `${var}` interpolation, `define()` 3rd argument, the `/e`
modifier on rarely-hit paths, the `POP3` old-style constructor) are handled in a
separate later Issue.

JA: 実行時の `E_WARNING` / `E_DEPRECATED`(未定義変数、動的プロパティ、`${var}`
補間、`define()` 第3引数、ほとんど通らないパスの `/e` 修飾子、`POP3` 旧式
コンストラクタ)は、別の後続 Issue で扱う。

---

## Issue #15: Clean up the runtime warnings on the blog front end / ブログ本体の実行時警告を掃除

EN: After Issue #13 the blog front end still emitted ~46 non-fatal
`E_WARNING` / `E_DEPRECATED` notices. They are all fixed; the front end now
renders with **zero** warning/deprecated/notice lines.

JA: Issue #13 完了後もブログ本体は約 46 件の非 fatal な `E_WARNING` /
`E_DEPRECATED` を出力していた。これらをすべて修正し、フロントは警告/非推奨/通知
が **0 行**で描画されるようになった。

### Changes (per commit) / 変更内容(コミット単位)

EN:
1. `apply_filters()` (b2template.functions.php): fix the `$tags` typo (should be
   `$tag`).
2. `wptexturize()` (b2functions.php): initialize `$output`; guard `$curl[0]`
   with `?? ''`.
3. `wp-db.php`: drop the removed 3rd argument of `define()`.
4. `wpdb` class: declare the previously-dynamic properties.
5. `blog.header.php`: initialize `$showposts` / `$user_ID` reads.
6. `blog.header.php`: initialize the `$querycount` global counter.
7. Add `global $querycount;` to the query-counter functions that lacked it.
8. `pingWeblogsRss()`: remove the optional parameter declared before a required
   one (this also removed the "headers already sent" warning).

JA:
1. `apply_filters()`(b2template.functions.php): `$tags` のタイプミスを修正
   (`$tag` が正)。
2. `wptexturize()`(b2functions.php): `$output` を初期化、`$curl[0]` を `?? ''`
   でガード。
3. `wp-db.php`: `define()` の廃止された第3引数を除去。
4. `wpdb` クラス: 動的だったプロパティを宣言。
5. `blog.header.php`: `$showposts` / `$user_ID` の参照を初期化。
6. `blog.header.php`: グローバルカウンタ `$querycount` を初期化。
7. `$querycount` を使うのに `global` 宣言が無かったクエリカウンタ関数に
   `global $querycount;` を追加。
8. `pingWeblogsRss()`: 必須引数より前の任意引数を除去(「headers already sent」
   警告も解消)。

### Verification / 検証

EN: In the Docker environment `http://localhost:8080/` returns HTTP 200,
displays the seeded post, and produces **zero** `Warning` / `Deprecated` /
`Notice` lines, with no fatal error and no SQL error.

JA: Docker 環境で `http://localhost:8080/` が HTTP 200 を返し、初期投稿を表示し、
`Warning` / `Deprecated` / `Notice` を **0 行**しか出さない。fatal エラー・
SQL エラーも無い。

### Out of scope / スコープ外

EN: Warnings on admin pages beyond what the front end exercises, the remaining
`/e` modifiers, and the `POP3` old-style constructor are later Issues.

JA: ブログ本体が通らない管理画面の警告、残りの `/e` 修飾子、`POP3` 旧式
コンストラクタは後続 Issue で扱う。

---

## Issue #19: Fix the b2register.php 404 and the login/feed warnings / b2register.php の 404 とログイン・フィードの警告を修正

EN: A Playwright link check found the blog front-end links fully clean, but the
linked login / register / feed pages still had issues. All are fixed.

JA: Playwright のリンク検査でフロントのリンクは完全にクリーンと確認されたが、
リンク先のログイン/登録/フィードに問題が残っていた。すべて修正した。

### Changes (per commit) / 変更内容(コミット単位)

EN:
1. `b2register.php`: the stylesheet `<link>` used `$b2inc/b2.css`
   (`/b2-include/b2.css`, a 404); point it at `$siteurl/wp-admin/b2.css`, where
   `b2.css` actually lives (3 occurrences).
2. `b2login.php`: guard the null user row -- `get_userdatabylogin()` returns
   null for a non-existent login, so `$userdata->user_pass` / `md5(null)`
   warned. Short-circuit with `!$userdata`.
3. `wpdb::get_row()`: use `isset()` for `$this->last_result[$y]` so a query
   that returned no rows does not raise "array offset on null".
4. `b2template.functions.php`: initialize `$excerpt` before the two RSS
   excerpt-building loops.
5. `b2rdf.php`: remove the dead `$b2_items[] = $row;` -- `$row` was never set
   and `$b2_items` was never read.

JA:
1. `b2register.php`: スタイルシートの `<link>` が `$b2inc/b2.css`
   (`/b2-include/b2.css`、404)を使っていた。`b2.css` の実在場所
   `$siteurl/wp-admin/b2.css` を指すようにした(3 箇所)。
2. `b2login.php`: null のユーザー行をガード -- `get_userdatabylogin()` は
   存在しないログインに null を返すため `$userdata->user_pass` / `md5(null)` が
   警告していた。`!$userdata` で短絡する。
3. `wpdb::get_row()`: `$this->last_result[$y]` を `isset()` で判定し、行を
   返さなかったクエリで「array offset on null」が出ないようにする。
4. `b2template.functions.php`: RSS 抜粋生成の 2 つのループの前で `$excerpt` を
   初期化する。
5. `b2rdf.php`: 不要な `$b2_items[] = $row;` を除去 -- `$row` は未設定で
   `$b2_items` はどこからも読まれていなかった。

### Verification / 検証

EN: A Playwright pass over the 11 internal links from the front page reports,
for every link: HTTP 200, no fatal error, **0 PHP warnings**, **0 JS errors**
(including no 404 for `b2register.php`'s stylesheet). The front end is
unchanged (still 0 warnings).

JA: フロントページの内部リンク 11 本を Playwright で巡回した結果、全リンクで
HTTP 200・fatal エラー無し・**PHP 警告 0**・**JS エラー 0**(`b2register.php` の
スタイルシート 404 も解消)。フロントは不変(引き続き警告 0)。

---

## Issue #22: Bring phpcs and PHPStan (level 0) to zero / phpcs と PHPStan(level 0) を 0 件にする

EN: Finish the static-analysis cleanup: phpcs from 11 to 0, PHPStan level 0 from
215 to 0, and delete the PHPStan baseline so both tools are completely clean
without any suppression.

JA: 静的解析の仕上げ: phpcs を 11→0、PHPStan level 0 を 215→0 にし、PHPStan の
baseline を削除して、両ツールを抑制なしで完全にクリーンにする。

### Changes / 変更内容

EN — phpcs (PHPCompatibility) findings, 11 → 0:
1. `/e` PCRE modifier (5): the `%uXXXX` decoder rewritten with
   `preg_replace_callback()` in `b2bookmarklet.php`, `b2template.functions.php`
   and `blog.header.php`.
2. `mysql_doh()` (2): this error helper does not exist in WordPress 0.71-gold;
   the two dead calls in `b2-2-wp.php` replaced with `print()`, matching the
   file's own error style.
3. `$HTTP_RAW_POST_DATA` (2): PHP removed this predefined global in 7.0 and the
   bare name is flagged; renamed to a plain `$raw_post_data` in `xmlrpc.php`
   and `xmlrpcs.inc`.
4. PHP4-style constructor (1): `POP3::POP3()` → `POP3::__construct()`.
5. `global $$var` (1): the buggy `global $$_SERVER;` in `alert_error()`
   removed -- it was a variable-variable on an array and the function never
   used `$_SERVER`.

EN — PHPStan level 0 findings, 215 → 0:
6. XML-RPC classes (~159): `xmlrpcval`, `xmlrpcresp`, etc. live in `.inc`
   files PHPStan does not analyse by default; added `scanFiles` for
   `xmlrpc.inc` / `xmlrpcs.inc` to `phpstan.neon.dist`.
7. PHP4-style constructors in the XML-RPC library: `xmlrpc_client`,
   `xmlrpcresp`, `xmlrpcmsg`, `xmlrpcval` (`xmlrpc.inc`) and `xmlrpc_server`
   (`xmlrpcs.inc`) renamed to `__construct()` -- they were silently broken on
   PHP 8 (the object was never initialised).
8. Duplicate array keys (22): `$b2_htmltransbis` in `b2vars.php` (20 keys) and
   the `$b2smiliestrans` smilies map in `b2vars.php` / `b2config.php` (1 each).
   The last occurrence (the value PHP actually keeps) is preserved.
9. Undefined `dbconnect()` / `rss_update()` (19): referenced by `xmlrpc.php`
   and `b2mail.php` but absent from WordPress 0.71-gold; defined as documented
   no-ops in `b2functions.php` (the DB connection already exists via `$wpdb`).
10. Undefined variables (5): `$host_start` set to 0 in `b2functions.php`'s
    pingback code; `$post` added to the globals of `the_author_posts()` and
    two stray `$postdata['Date']` changed to `$post->post_date`; the
    `$agesorter` typo fixed to `$agesorter_arr` in `xmlrpc.php`.
11. `mktime()` with no arguments (1): replaced with `time()` in
    `b2calendar.php` (zero-arg `mktime()` was removed in PHP 8.0).
12. Optional-before-required parameter (1): `textile.php`'s `callback_url()`
    given a default for `$url`.
13. `require_once()` path (1): `links.weblogs.com.php` lives in `wp-links/`,
    so `b2config.php` → `../b2config.php`.
14. Removed `phpstan-baseline.neon` and the `includes:` line; PHPStan is now
    green with no suppression.

JA — phpcs(PHPCompatibility)検出、11 → 0:
1. `/e` PCRE 修飾子(5): `%uXXXX` デコーダを `preg_replace_callback()` に書き
   換え(`b2bookmarklet.php`・`b2template.functions.php`・`blog.header.php`)。
2. `mysql_doh()`(2): このエラーヘルパーは WordPress 0.71-gold に存在しない。
   `b2-2-wp.php` の不要な 2 呼び出しを、同ファイルのエラー出力様式に合わせて
   `print()` に置換。
3. `$HTTP_RAW_POST_DATA`(2): PHP 7.0 でこの定義済みグローバルは廃止され、
   名前自体が警告される。`xmlrpc.php`・`xmlrpcs.inc` で通常の
   `$raw_post_data` に改名。
4. PHP4 形式コンストラクタ(1): `POP3::POP3()` → `POP3::__construct()`。
5. `global $$var`(1): `alert_error()` 内の不正な `global $$_SERVER;` を除去。
   配列に対する可変変数で、関数は `$_SERVER` を使っていなかった。

JA — PHPStan level 0 検出、215 → 0:
6. XML-RPC クラス(約159): `xmlrpcval`・`xmlrpcresp` 等は PHPStan が既定で
   解析しない `.inc` にある。`phpstan.neon.dist` に `xmlrpc.inc` /
   `xmlrpcs.inc` の `scanFiles` を追加。
7. XML-RPC ライブラリの PHP4 形式コンストラクタ: `xmlrpc_client`・
   `xmlrpcresp`・`xmlrpcmsg`・`xmlrpcval`(`xmlrpc.inc`)、`xmlrpc_server`
   (`xmlrpcs.inc`)を `__construct()` に改名。PHP 8 ではコンストラクタが
   呼ばれず、オブジェクトが未初期化のまま静かに壊れていた。
8. 配列の重複キー(22): `b2vars.php` の `$b2_htmltransbis`(20 キー)、
   `b2vars.php` / `b2config.php` のスマイリー表 `$b2smiliestrans`(各 1)。
   PHP が実際に採用する最後の出現を残した。
9. 未定義の `dbconnect()` / `rss_update()`(19): `xmlrpc.php`・`b2mail.php`
   から参照されるが WordPress 0.71-gold に定義がない。`b2functions.php` に
   コメント付きの空関数として定義(DB 接続は既に `$wpdb` で確立済み)。
10. 未定義変数(5): `b2functions.php` のピンバック処理で `$host_start` を 0 に
    設定、`the_author_posts()` の global に `$post` を追加し誤った
    `$postdata['Date']` 2 箇所を `$post->post_date` に修正、`xmlrpc.php` の
    `$agesorter` の打ち間違いを `$agesorter_arr` に修正。
11. 引数なしの `mktime()`(1): `b2calendar.php` で `time()` に置換(引数なし
    `mktime()` は PHP 8.0 で廃止)。
12. 任意引数が必須引数の前(1): `textile.php` の `callback_url()` の `$url` に
    既定値を付与。
13. `require_once()` のパス(1): `links.weblogs.com.php` は `wp-links/` に
    あるため `b2config.php` → `../b2config.php`。
14. `phpstan-baseline.neon` と `includes:` 行を削除。PHPStan は抑制なしで
    green になった。

### Verification / 検証

EN:
- `composer phpcs` -> **0 violations** (52 files).
- `composer phpstan` (level 0, no baseline) -> **0 errors**.
- `php -l` -> **0 syntax errors** across all 54 `.php` / `.inc` files.
- The Docker blog front end still renders correctly with no new warnings; the
  pre-existing legacy warnings on the category / archive pages are unchanged
  from `main` (verified by stashing the branch).

JA:
- `composer phpcs` -> **検出 0 件**(52 ファイル)。
- `composer phpstan`(level 0、baseline なし)-> **エラー 0 件**。
- `php -l` -> 全 54 個の `.php` / `.inc` で **構文エラー 0**。
- Docker のブログ本体は引き続き正しく描画され、新規の警告は無い。category /
  archive ページの既存のレガシー警告は `main` と同一(ブランチを stash して
  確認)。

### Out of scope / スコープ外

EN: The XML-RPC endpoint (`xmlrpc.php`) has remaining PHP 8 *runtime*
incompatibilities -- e.g. `xml_parser_create()` now returns an `XMLParser`
object used as an array offset, and `${var}` string interpolation is deprecated
in the `.inc` library. These are not flagged by phpcs/PHPStan (the `.inc` files
are not analysed for issues) and belong to a dedicated XML-RPC / runtime-warning
Issue. Raising PHPStan above level 0 is also out of scope.

JA: XML-RPC エンドポイント(`xmlrpc.php`)には PHP 8 の*実行時*非互換が残る。
例えば `xml_parser_create()` は `XMLParser` オブジェクトを返すようになり配列
オフセットとして使えない、`.inc` ライブラリの `${var}` 文字列補間が非推奨、
など。これらは phpcs/PHPStan では検出されず(`.inc` は問題解析の対象外)、
専用の XML-RPC / 実行時警告 Issue で扱う。PHPStan を level 0 より上げることも
スコープ外。

---

## Issue #24: Fix runtime warnings on the admin screens / 管理画面の実行時警告を修正

EN: Logged in as admin and swept the WordPress 0.71 admin screens. No
fatal/parse errors, but many PHP 8 runtime warnings (undefined variables,
property/array access on null, duplicate `define()`). All are fixed.

JA: 管理者でログインし WordPress 0.71 の管理画面を巡回した。致命的/構文
エラーは無いが、PHP 8 実行時警告(未定義変数・null へのプロパティ/配列
アクセス・`define()` 重複)が多数あった。すべて修正した。

### Changes / 変更内容

EN:
1. `b2config.php`: guard the four `DB_*` `define()`s with `if (!defined())`.
   Some admin pages process `b2config.php` twice (a plain `require` after an
   `include_once`), which raised `Constant DB_HOST already defined` etc. The
   guard makes the file safe to include repeatedly.
2. `b2edit.form.php`: initialise `$post_status`, `$comment_status`,
   `$ping_status`, `$post_password`, `$form_prevstatus` with defaults so the
   new-post screen does not read undefined variables (the `edit` case still
   overrides them from the stored post).
3. `b2functions.php`: `dropdown_categories()` and `touch_time()` guard their
   `$postdata` access with `isset()` (it is null on the new-post screen);
   `get_postdata()` returns `false` for a non-existent post id instead of an
   array of nulls.
4. `b2edit.php`: `case 'edit'` now uses `get_postdata($post) or die(...)`, so
   editing a non-existent post fails cleanly (same pattern as `case 'delete'`)
   instead of cascading property-on-null warnings.
5. `b2edit.showposts.php`: `empty($showposts)` instead of `!$showposts`;
   initialise `$besp_selected`; guard `$postdata["Category"]`; fix two wrong
   variable names (`$row` → `$category` / `$post`).
6. `linkmanager.php`: guard `$_COOKIE["links_show_cat_id"]` and `$link_url`.
   The `Cannot modify header information` warning was a knock-on of those
   warnings printing before `setcookie()`, so it is resolved too.
7. `linkcategories.php`: guard `$cat_id` on the edit-category dropdown.
8. `links.import.php`: guard `$_GET['step']`.

JA:
1. `b2config.php`: 4 つの `DB_*` `define()` を `if (!defined())` でガード。
   一部の管理画面は `b2config.php` を二重に処理し(`include_once` の後に
   素の `require`)、`Constant DB_HOST already defined` 等が出ていた。
   ガードにより繰り返し読み込んでも安全になる。
2. `b2edit.form.php`: `$post_status`・`$comment_status`・`$ping_status`・
   `$post_password`・`$form_prevstatus` を既定値で初期化し、新規投稿画面が
   未定義変数を読まないようにした(`edit` の場合は保存済み投稿で上書き)。
3. `b2functions.php`: `dropdown_categories()` と `touch_time()` は
   `$postdata`(新規投稿画面では null)へのアクセスを `isset()` でガード。
   `get_postdata()` は存在しない投稿 ID に対し null の配列ではなく `false`
   を返す。
4. `b2edit.php`: `case 'edit'` を `get_postdata($post) or die(...)` にし、
   存在しない投稿の編集が(`case 'delete'` と同じ形で)きれいに失敗する
   ようにした。null へのプロパティアクセス警告の連鎖が無くなる。
5. `b2edit.showposts.php`: `!$showposts` を `empty($showposts)` に変更、
   `$besp_selected` を初期化、`$postdata["Category"]` をガード、誤った
   変数名 2 箇所(`$row` → `$category` / `$post`)を修正。
6. `linkmanager.php`: `$_COOKIE["links_show_cat_id"]` と `$link_url` を
   ガード。`Cannot modify header information` 警告は上記の警告が
   `setcookie()` より前に出力されたことによる二次的なもので、併せて解消。
7. `linkcategories.php`: カテゴリ編集ドロップダウンの `$cat_id` をガード。
8. `links.import.php`: `$_GET['step']` をガード。

### Verification / 検証

EN: Logged in as admin, every admin screen -- b2edit.php (new post / edit /
non-existent post), b2categories, b2options, b2profile, b2team, linkmanager,
linkcategories, b2upload, b2sidebar, links.import -- loads with **0 PHP
warnings / notices / deprecations / fatals**. Editing a non-existent post now
shows a clean "Oops, no post with this ID" message. The blog front end and the
static analysis tools (phpcs 0, PHPStan level 0) are unchanged.

JA: 管理者でログインし、全管理画面 -- b2edit.php(新規/編集/存在しない投稿)、
b2categories、b2options、b2profile、b2team、linkmanager、linkcategories、
b2upload、b2sidebar、links.import -- が **PHP 警告/notice/非推奨/致命的
エラー 0** で表示される。存在しない投稿の編集は「Oops, no post with this ID」
と正しく表示される。ブログ本体と静的解析(phpcs 0、PHPStan level 0)は不変。

### Out of scope / スコープ外

EN: The blog front end's category / archive pages still emit two pre-existing
legacy warnings (`b2template.functions.php` lines 825 and 105); they exist on
`main` as well and belong to a separate front-end runtime-warning cleanup.

JA: ブログ本体の category / archive ページには既存のレガシー警告が 2 件残る
(`b2template.functions.php` の 825 行・105 行)。`main` にも存在し、フロント
エンドの実行時警告の別 Issue で扱う。

---

## Issue #26: Fix the two front-end runtime warnings / フロントエンドの実行時警告 2 件を修正

EN: Follow-up to Issue #24. A sweep of the blog front end (home, category,
archive, single post, search, author, weekly, feeds) found exactly two PHP 8
runtime warnings; both are fixed.

JA: Issue #24 の続き。ブログ本体(home・category・archive・単一投稿・検索・
著者・週・フィード)を巡回し、PHP 8 実行時警告がちょうど 2 件見つかった。
両方とも修正した。

### Changes / 変更内容

EN:
1. `b2template.functions.php` `single_month_title()` (line 105): a year-only
   archive (`$m = 'YYYY'`) has no month part, so `substr($m,4,2)` is `''` and
   `$month['']` raised `Undefined array key ""`. Default to `''` with `?? ''`.
2. `b2template.functions.php` `get_the_category_by_ID()` (line 825): the
   `$cache_categories` cache is read before it exists, so
   `!$cache_categories[$cat_ID]` raised `Trying to access array offset on
   null`. Use `empty()` instead -- the same form the sibling
   `get_the_category()` already uses.

JA:
1. `b2template.functions.php` の `single_month_title()`(105 行): 年のみの
   archive(`$m='YYYY'`)は月が無いため `substr($m,4,2)` が `''` となり
   `$month['']` が `Undefined array key ""` を出していた。`?? ''` で既定値
   `''` にする。
2. `b2template.functions.php` の `get_the_category_by_ID()`(825 行):
   `$cache_categories` キャッシュが存在する前に読まれ、
   `!$cache_categories[$cat_ID]` が `Trying to access array offset on null`
   を出していた。姉妹関数 `get_the_category()` と同じ `empty()` を使う。

### Verification / 検証

EN: Every front-end page -- home, `?cat=`, `?m=` (year and year+month),
`?p=`, `?s=`, `?author=`, `?w=`, and the three feeds -- loads with **0 PHP
warnings**. Category and archive titles still render correctly; the admin
screens and the static analysis tools (phpcs 0, PHPStan level 0) are
unchanged.

JA: フロントエンドの全ページ -- home・`?cat=`・`?m=`(年と年月)・`?p=`・
`?s=`・`?author=`・`?w=`、および 3 つのフィード -- が **PHP 警告 0** で
表示される。category / archive のタイトルも正しく描画され、管理画面と
静的解析(phpcs 0、PHPStan level 0)は不変。

---

## Issue #28: Posting from the admin fails to redirect / 管理画面からの投稿でリダイレクトが失敗する

EN: Testing "post from the admin" found that posting does insert the row, but
the page does not redirect back to `b2edit.php` -- two undefined variables in
the publish branch print output, which then breaks the `header("Location:")`
redirect.

JA: 「管理画面から投稿」をテストした結果、投稿自体は行が INSERT されるが
`b2edit.php` へリダイレクトされないことが判明した。publish 分岐の未定義変数
2 つが出力を行い、`header("Location:")` のリダイレクトを壊していた。

### Changes / 変更内容

EN:
1. `b2config.php`: define `$cafelogID` and `$use_cafelogping` (a new "Cafelog
   ping" block, disabled). WordPress 0.71 references `$cafelogID`
   (`b2edit.php`, `xmlrpc.php`, `b2mail.php`) but the original `b2config.php`
   never shipped the Cafelog settings, so `$cafelogID` was undefined.
2. `b2edit.php`: `case 'post'` reads `$_POST["post_pingback"]` with `?? 0`
   (the pingback checkbox is not submitted when left unchecked); `case
   'editpost'` never read `$post_pingback` at all, so it is now read the same
   way. Both `case`s call `pingCafelog($cafelogID, ...)` and `if
   ($post_pingback)` in the draft/private -> publish branch.

JA:
1. `b2config.php`: `$cafelogID` と `$use_cafelogping` を定義(新しい
   「Cafelog ping」ブロック、無効)。WordPress 0.71 は `$cafelogID` を
   `b2edit.php` / `xmlrpc.php` / `b2mail.php` で参照するが、元の
   `b2config.php` には Cafelog 設定が無く `$cafelogID` が未定義だった。
2. `b2edit.php`: `case 'post'` は `$_POST["post_pingback"]` を `?? 0` 付きで
   読む(pingback チェックボックスは未チェックだと送信されない)。`case
   'editpost'` は `$post_pingback` を全く読んでいなかったため、同じ形で
   読むようにした。両 `case` とも draft/private -> publish 分岐で
   `pingCafelog($cafelogID, ...)` と `if ($post_pingback)` を呼ぶ。

### Verification / 検証

EN: From the admin, creating a post (publish and draft), editing a post
(`editpost`, including a draft -> publish transition) and deleting a post all
redirect with **HTTP 302** and **0 PHP warnings**; the post is correctly
inserted / updated / removed in the database. Admin screens, the blog front
end and the static analysis tools (phpcs 0, PHPStan level 0) are unchanged.
The temporary test posts were removed afterwards.

JA: 管理画面から、投稿の作成(publish と draft)、編集(`editpost`、
draft -> publish の遷移を含む)、削除のいずれも **HTTP 302** と
**PHP 警告 0** でリダイレクトされ、投稿は DB に正しく作成/更新/削除される。
管理画面・ブログ本体・静的解析(phpcs 0、PHPStan level 0)は不変。
検証に使った一時的なテスト投稿は後で削除した。

---

## Issue #31: Fix SQL injection in numeric id contexts / 数値 ID コンテキストの SQL インジェクションを修正

EN: A security audit (Issue #31) found that WordPress 0.71 builds every SQL
query by string interpolation. The only defence is `addslashes()` applied to
`$_GET` / `$_POST` / `$_COOKIE` (magic_quotes emulation), which does **not**
protect **numeric / unquoted** contexts: `WHERE ID = $post` with `$post` taken
straight from `$_GET` is directly injectable (e.g. `?post=1 OR 1=1`).

The agreed, behaviour-preserving fix is the one the Issue itself recommends:
cast every numeric id to integer with `(int)`. A full prepared-statements
rewrite is explicitly out of scope. The cast is applied at the point the id is
read from `$_GET` / `$_POST` (so the variable is clean everywhere it is later
used), and inside functions for ids that arrive as parameters. Casting a
genuine numeric id to int does not change behaviour; an injection payload such
as `1 OR 1=1` collapses to the integer `1`, and a non-numeric payload to `0`
(an invalid id, handled cleanly by the existing `... or die()` guards).

JA: セキュリティ監査(Issue #31)で、WordPress 0.71 はすべての SQL クエリを
文字列連結で組み立てていることが判明した。唯一の防御は `$_GET` / `$_POST` /
`$_COOKIE` への `addslashes()`(magic_quotes 模倣)で、これは**数値・クォート
無し**のコンテキストを**保護しない**。`WHERE ID = $post`(`$post` は `$_GET`
由来)は直接インジェクション可能(例: `?post=1 OR 1=1`)。

合意した挙動保存の修正は、Issue 自身が推奨するもの — 数値 ID をすべて `(int)`
で整数にキャストする。プリペアドステートメントへの全面書き換えは明示的に
スコープ外。キャストは ID を `$_GET` / `$_POST` から読む箇所(以降の利用箇所
すべてで変数が安全になる)、および ID を引数で受け取る関数の内部に適用する。
正当な数値 ID を整数にキャストしても挙動は変わらず、`1 OR 1=1` のような
インジェクション文字列は整数 `1` に縮退し、非数値の文字列は `0`(不正な ID、
既存の `... or die()` ガードで安全に処理される)になる。

### Changes / 変更内容

EN:
1. `wp-admin/b2edit.php`: cast `$post` (`$_GET['post']`, `edit` / `delete`
   cases), `$post_ID` (`$_POST['post_ID']`, `editpost`), `$comment`
   (`$_GET['comment']`, `editcomment` / `deletecomment`), `$p`
   (`$_GET['p']`), `$comment_ID` and `$comment_post_ID`
   (`$_POST`, `editedcomment`).
2. `wp-admin/b2categories.php`: cast `$cat_ID` in the `editedcat` case (it was
   `addslashes()`-ed and then used unquoted in `WHERE cat_ID = $cat_ID`; the
   `Delete` case already used `intval()`).
3. `wp-admin/b2team.php`: cast `$id` (`$_GET['id']`) in the `promote` and
   `delete` cases.
4. `wp-admin/b2profile.php`: cast `$user_ID` before the profile `UPDATE`.
5. `wp-admin/linkmanager.php`: cast `$link_id` in the `Save` and `Delete`
   cases (`$_POST['link_id']`) and in `linkedit` (it arrives via the
   `$b2varstoreset` loop from `$_GET` / `$_POST`).
6. `b2-include/b2functions.php`: cast the id parameter inside `get_userdata()`,
   `get_usernumposts()`, `get_postdata()` and `get_commentdata()` -- these are
   reached with request-derived ids from many call sites.
7. `b2comments.post.php`: cast `$comment_post_ID` (`$_POST`).
8. `b2trackback.php`: cast `$tb_id` (both the GET form and the
   request-URI form) and `$id` in the included render branch.
9. `b2commentspopup.php`, `b2comments.php`, `b2pingbacks.php`,
   `b2pingbackspopup.php`, `b2trackbackpopup.php`: cast `$id` before the
   per-post comment / pingback / trackback queries.
10. `xmlrpc.php`: cast `$post_ID` in the pingback handler (it is derived from
    the remote pingback URL) and after `scalarval()` in the `editPost`,
    `deletePost` and `getPost` XML-RPC methods.
11. `wp-links/links.php`: cast the `$id` parameter inside `get_linkcatname()`
    and `get_autotoggle()` (`get_autotoggle()` is called with the
    request-supplied `$_POST['category']`).
12. `wp-links/links.weblogs.com.php`: cast the link id before the
    `link_updated` `UPDATE`.

JA:
1. `wp-admin/b2edit.php`: `$post`(`$_GET['post']`、`edit` / `delete`)、
   `$post_ID`(`$_POST['post_ID']`、`editpost`)、`$comment`
   (`$_GET['comment']`、`editcomment` / `deletecomment`)、`$p`
   (`$_GET['p']`)、`$comment_ID` と `$comment_post_ID`
   (`$_POST`、`editedcomment`)をキャスト。
2. `wp-admin/b2categories.php`: `editedcat` の `$cat_ID` をキャスト(`addslashes()`
   されてから `WHERE cat_ID = $cat_ID` でクォート無しで使われていた。`Delete`
   は既に `intval()` を使用)。
3. `wp-admin/b2team.php`: `promote` と `delete` の `$id`(`$_GET['id']`)を
   キャスト。
4. `wp-admin/b2profile.php`: プロフィール `UPDATE` の前で `$user_ID` をキャスト。
5. `wp-admin/linkmanager.php`: `Save` と `Delete` の `$link_id`
   (`$_POST['link_id']`)、および `linkedit`(`$b2varstoreset` ループ経由で
   `$_GET` / `$_POST` から渡る)の `$link_id` をキャスト。
6. `b2-include/b2functions.php`: `get_userdata()`・`get_usernumposts()`・
   `get_postdata()`・`get_commentdata()` の内部で ID 引数をキャスト —
   これらは多数の呼び出し元からリクエスト由来の ID で到達する。
7. `b2comments.post.php`: `$comment_post_ID`(`$_POST`)をキャスト。
8. `b2trackback.php`: `$tb_id`(GET 形式とリクエスト URI 形式の両方)と、
   インクルードされる描画分岐の `$id` をキャスト。
9. `b2commentspopup.php`・`b2comments.php`・`b2pingbacks.php`・
   `b2pingbackspopup.php`・`b2trackbackpopup.php`: 投稿ごとのコメント /
   ピンバック / トラックバッククエリの前で `$id` をキャスト。
10. `xmlrpc.php`: ピンバックハンドラの `$post_ID`(リモートのピンバック URL
    由来)、および `editPost`・`deletePost`・`getPost` の XML-RPC メソッドで
    `scalarval()` 後の `$post_ID` をキャスト。
11. `wp-links/links.php`: `get_linkcatname()` と `get_autotoggle()` の内部で
    `$id` 引数をキャスト(`get_autotoggle()` はリクエスト由来の
    `$_POST['category']` で呼ばれる)。
12. `wp-links/links.weblogs.com.php`: `link_updated` の `UPDATE` の前で
    リンク ID をキャスト。

### Verification / 検証

EN:
- `php -l` -> **0 syntax errors** across all 16 changed files.
- `composer phpcs` -> **0 violations** (52 files).
- `composer phpstan` (`--memory-limit=1G`) -> **0 errors**.
- In the Docker environment the blog front end and the admin (login +
  `b2edit.php`, `b2categories.php`, `b2team.php`, `linkmanager.php`,
  `b2profile.php`) load with **0 PHP warnings / fatals**; the seeded post is
  still displayed.
- Injection sanity check: with 21 posts in the database, the home page lists
  20 posts, but `index.php?p=1%20OR%201=1` returns **exactly one** post
  (post #1, "Hello world!") -- the `OR 1=1` does not leak the other posts.
  `?p=0%20OR%201=1` and `?p=abc` collapse to an invalid id and return 0 posts.
  On the admin, `b2edit.php?action=edit&post=0%20OR%201=1` shows the clean
  "Oops, no post with this ID" message.

JA:
- `php -l` -> 変更した全 16 ファイルで **構文エラー 0**。
- `composer phpcs` -> **検出 0 件**(52 ファイル)。
- `composer phpstan`(`--memory-limit=1G`)-> **エラー 0 件**。
- Docker 環境で、ブログ本体および管理画面(ログイン + `b2edit.php`・
  `b2categories.php`・`b2team.php`・`linkmanager.php`・`b2profile.php`)が
  **PHP 警告 / fatal 0** で表示され、初期投稿も引き続き表示される。
- インジェクションの動作確認: DB に 21 件の投稿がある状態で、ホームページは
  20 件を表示するが、`index.php?p=1%20OR%201=1` は**ちょうど 1 件**(投稿 #1
  「Hello world!」)を返す — `OR 1=1` は他の投稿を漏らさない。
  `?p=0%20OR%201=1` と `?p=abc` は不正な ID に縮退し 0 件を返す。管理画面では
  `b2edit.php?action=edit&post=0%20OR%201=1` が「Oops, no post with this ID」
  と正しく表示される。

### Out of scope / スコープ外

EN: A full migration to `mysqli` prepared statements / bound parameters is the
ideal long-term fix but is explicitly out of scope for this Issue -- the `(int)`
casts are the agreed, behaviour-preserving fix and exactly Issue #31's stated
recommendation. String-valued inputs used inside quoted SQL contexts remain
protected only by `addslashes()`; hardening those is separate follow-up work.

JA: `mysqli` のプリペアドステートメント/バインドへの全面移行が理想的な長期
対応だが、本 Issue では明示的にスコープ外 — `(int)` キャストが合意した挙動
保存の修正であり、Issue #31 が述べる推奨対応そのものである。クォート付き SQL
コンテキストで使われる文字列入力は引き続き `addslashes()` のみで保護される。
その強化は別の後続作業とする。

---

## Issue #32: Escape reflected user input in HTML output / HTML 出力に反映されるユーザー入力をエスケープ

EN: A security audit (Issue #32) found several reflected XSS sites where
user-controlled data (`$_SERVER` values, `$_POST` fields) is echoed straight
into an HTML attribute or text node without escaping. An attacker who controls
the value -- e.g. the `Referer` header, the `PATH_INFO` portion of the URL, or
a crafted `cat_ID` field -- can break out of the attribute with a `"` and
inject `<script>`. The escaping was already applied inconsistently: some files
(`b2comments.php`, `b2commentspopup.php`) wrapped the value in
`htmlspecialchars()`, while the equivalent admin code did not.

The agreed, behaviour-preserving fix is the one the Issue recommends: wrap each
reflected value in `htmlspecialchars()` at the point it is echoed. For a
legitimate value (a real URL, a numeric id) `htmlspecialchars()` is a no-op in
the browser -- it only encodes `<`, `>`, `"`, `&`, `'`-context-relevant
characters -- so behaviour is preserved; an injection payload such as
`x"><script>alert(1)</script>` collapses to inert text
(`x&quot;&gt;&lt;script&gt;...`).

JA: セキュリティ監査(Issue #32)で、ユーザー制御データ(`$_SERVER` の値、
`$_POST` のフィールド)がエスケープ無しで HTML 属性やテキストノードに直接
出力される反射型 XSS の箇所が複数見つかった。値を制御できる攻撃者 — 例えば
`Referer` ヘッダ、URL の `PATH_INFO` 部分、細工した `cat_ID` フィールド — は
`"` で属性を抜け出し `<script>` を注入できる。エスケープは既に不統一で、
一部のファイル(`b2comments.php`・`b2commentspopup.php`)は値を
`htmlspecialchars()` で包んでいたが、同等の管理画面コードは包んでいなかった。

合意した挙動保存の修正は、Issue が推奨するもの — 反映される各値を出力箇所で
`htmlspecialchars()` で包む。正当な値(本物の URL、数値 ID)に対して
`htmlspecialchars()` はブラウザ上で実質無変換であり(`<`・`>`・`"`・`&` 等を
エンコードするだけ)挙動は保たれる。`x"><script>alert(1)</script>` のような
インジェクション文字列は無害なテキスト(`x&quot;&gt;&lt;script&gt;...`)に
縮退する。

### Changes / 変更内容

EN:
1. `b2-include/b2functions.php`: in `alert_error()`, escape
   `$_SERVER["HTTP_REFERER"]` in the "go back" link (`<a href="...">`).
2. `index.php`: escape `$PHP_SELF` (`= $_SERVER['PHP_SELF']`) in the search
   form `action="..."` attribute.
3. `wp-admin/b2categories.php`: escape `$_POST["cat_ID"]` in the hidden
   `cat_ID` field of the rename form.
4. `wp-admin/linkcategories.php`: escape `$_POST["cat_id"]` in the hidden
   `cat_id` field of the rename form.
5. `wp-admin/b2edit.showposts.php`: escape `$_SERVER["REQUEST_URI"]` in the
   hidden `redirect_to` field -- matching `b2comments.php` and
   `b2commentspopup.php`, which already escaped the same value.

JA:
1. `b2-include/b2functions.php`: `alert_error()` の "go back" リンク
   (`<a href="...">`)で `$_SERVER["HTTP_REFERER"]` をエスケープ。
2. `index.php`: 検索フォームの `action="..."` 属性で `$PHP_SELF`
   (`= $_SERVER['PHP_SELF']`)をエスケープ。
3. `wp-admin/b2categories.php`: 名称変更フォームの隠し `cat_ID` フィールドで
   `$_POST["cat_ID"]` をエスケープ。
4. `wp-admin/linkcategories.php`: 名称変更フォームの隠し `cat_id` フィールドで
   `$_POST["cat_id"]` をエスケープ。
5. `wp-admin/b2edit.showposts.php`: 隠し `redirect_to` フィールドで
   `$_SERVER["REQUEST_URI"]` をエスケープ — 同じ値を既にエスケープ済みの
   `b2comments.php`・`b2commentspopup.php` に合わせる。

### Verification / 検証

EN:
- `php -l` -> **0 syntax errors** across all 5 changed files.
- `composer phpcs` -> **0 violations** (52 files).
- `composer phpstan` -> **0 errors**.
- `b2-include/b2functions.php` is Latin-1 encoded; it was edited byte-safely
  and the high-byte line count is unchanged (**20** before and after).
- In the Docker environment the blog front end and the admin (login +
  `b2edit.php`, `b2categories.php`, `linkcategories.php`) load with **0 new
  PHP warnings / fatals**.
- Escaping sanity check: feeding `x"><script>alert(1)</script>` through
  `htmlspecialchars()` produces `x&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;`
  -- the `"` can no longer close the attribute and the `<script>` becomes inert
  text.

JA:
- `php -l` -> 変更した全 5 ファイルで **構文エラー 0**。
- `composer phpcs` -> **検出 0 件**(52 ファイル)。
- `composer phpstan` -> **エラー 0 件**。
- `b2-include/b2functions.php` は Latin-1 エンコード。バイト安全に編集し、
  高位バイトを含む行数は変化なし(前後とも **20**)。
- Docker 環境で、ブログ本体および管理画面(ログイン + `b2edit.php`・
  `b2categories.php`・`linkcategories.php`)が **新規 PHP 警告 / fatal 0** で
  表示される。
- エスケープの動作確認: `x"><script>alert(1)</script>` を
  `htmlspecialchars()` に通すと
  `x&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;` になる — `"` はもう属性を
  閉じられず、`<script>` は無害なテキストになる。

### Out of scope / スコープ外

EN: Post content rendered by `the_content()` and comment content rendered by
`comment_text()` are **not** wholesale-escaped. WordPress 0.71 posts are HTML
by design -- escaping them would break the blog. Comment input is, however,
already filtered on input: `b2comments.post.php` runs
`strip_tags($comment, $comment_allowed_tags)`, restricting saved comment HTML
to the tag allow-list defined in `b2config.php`
(`<b><i><strong><em><code><blockquote><p><br><strike><a>`). That allow-list
does not strip dangerous attributes (e.g. `<a href="javascript:...">` or
`on*=` handlers), so it is a partial -- not complete -- stored-XSS defence; a
proper attribute-level sanitiser is separate follow-up work. A project-wide
output-encoding overhaul is likewise out of scope; this Issue is limited to
the reflected-XSS sites above.

JA: `the_content()` が描画する投稿本文、および `comment_text()` が描画する
コメント本文は**一括エスケープしない**。WordPress 0.71 の投稿は設計上 HTML で
あり、エスケープするとブログが壊れる。ただしコメント入力は入力時点で既に
フィルタされている。`b2comments.post.php` が
`strip_tags($comment, $comment_allowed_tags)` を実行し、保存されるコメント
HTML を `b2config.php` で定義された許可タグリスト
(`<b><i><strong><em><code><blockquote><p><br><strike><a>`)に制限している。
この許可リストは危険な属性(例: `<a href="javascript:...">` や `on*=`
ハンドラ)を除去しないため、蓄積型 XSS への防御としては部分的で完全ではない。
属性レベルの適切なサニタイザは別の後続作業とする。プロジェクト全体の出力
エンコーディング刷新も同様にスコープ外であり、本 Issue は上記の反射型 XSS の
箇所に限定する。

## Issue #33: Add CSRF protection to state-changing admin actions / 状態変更を行う管理操作に CSRF 対策を追加

EN: A security audit (Issue #33) found that WordPress 0.71 has no CSRF
protection at all -- no nonces, no tokens, no origin/referer checks. Worse,
several state-changing actions (delete post, delete comment, promote/delete
user) were reachable via **GET**, so a single `<img>` tag on a third-party
page could trigger them while an admin was logged in (e.g.
`<img src="http://blog/wp-admin/b2edit.php?action=delete&post=1">` deletes
post 1). Every admin POST form (options, profile, post create/edit) was
equally unprotected.

WordPress 0.71 has no PHP sessions, so a classic per-session token cannot be
stored. The fix derives the token from the admin authentication cookie
`wordpresspass` instead: `b2_csrf_token($action)` returns
`substr(md5($action . '|' . $cookie . '|b2-csrf-v1'), 0, 20)`. A cross-site
attacker performing CSRF cannot read that cookie (it is sent by the browser
but not exposed to a foreign-origin script), so cannot compute a valid token,
so cannot forge a state-changing request. A distinct `$action` string scopes
each token to a single operation, so a token leaked for one action cannot be
replayed against another.

JA: セキュリティ監査(Issue #33)で、WordPress 0.71 には CSRF 対策が一切無い
ことが判明した — nonce もトークンも origin/referer チェックも無い。さらに
状態を変更する操作のいくつか(投稿削除・コメント削除・ユーザー昇格/削除)が
**GET** で実行でき、管理者がログイン中なら第三者ページに置いた `<img>`
タグ一つで発火した(例: `<img src="http://blog/wp-admin/b2edit.php?action=delete&post=1">`
は投稿 1 を削除する)。管理画面の POST フォーム(オプション・プロフィール・
投稿の作成/編集)も同様に無防備だった。

WordPress 0.71 には PHP セッションが無いため、従来のセッション単位トークンを
保存できない。本修正では代わりに管理者の認証クッキー `wordpresspass` から
トークンを生成する。`b2_csrf_token($action)` は
`substr(md5($action . '|' . $cookie . '|b2-csrf-v1'), 0, 20)` を返す。CSRF を
行うクロスサイトの攻撃者はそのクッキーを読めない(ブラウザは送信するが、
別オリジンのスクリプトには公開されない)ため、正しいトークンを計算できず、
状態変更リクエストを偽造できない。`$action` 文字列ごとにトークンを 1 つの
操作へ限定するため、ある操作で漏れたトークンを別の操作へ転用できない。

### Changes / 変更内容

EN:
1. `b2-include/b2functions.php`: add three helper functions, loaded by every
   admin page via `b2header.php` -- `b2_csrf_token($action)` (compute the
   token), `b2_csrf_field($action)` (print a hidden `_b2csrf` input for POST
   forms), `b2_csrf_check($action)` (verify `$_REQUEST['_b2csrf']`; `die()`
   with "Security check failed" if missing or wrong).
2. `wp-admin/b2edit.php`: `b2_csrf_check()` at the start of the `post`,
   `editpost`, `delete`, `deletecomment`, `editedcomment` handlers
   (token actions `post` / `editpost` / `delete-post` / `delete-comment` /
   `editedcomment`).
3. `wp-admin/b2edit.form.php`: emit `b2_csrf_field($form_action)` in the
   shared post/comment form (so the token is scoped to `post` / `editpost` /
   `editedcomment`), and append the token to the "Delete this post" GET link.
4. `wp-admin/b2edit.showposts.php`: append the token to the Delete (post) and
   Delete (comment) GET links in the post/comment list.
5. `wp-admin/b2team.php`: `b2_csrf_check()` in the `promote` and `delete`
   handlers (`promote-user` / `delete-user`) and append the token to the
   promote/demote/delete GET links in both user lists.
6. `wp-admin/b2categories.php`: `b2_csrf_check()` in the `addcat`, `Delete`,
   `Rename` and `editedcat` handlers (`addcat` / `catop` / `editedcat`), and
   `b2_csrf_field()` in the `cats`, `addcat` and `renamecat` forms.
7. `wp-admin/b2options.php`: `b2_csrf_check('options-update')` in the
   `update` handler and `b2_csrf_field()` in the options form.
8. `wp-admin/b2profile.php`: `b2_csrf_check('profile-update')` in the
   `update` handler (before the password is changed, so the token is still
   computed against the current cookie) and `b2_csrf_field()` in the profile
   form.
9. `wp-admin/linkmanager.php`: `b2_csrf_check()` in the `Add`, `editlink`
   (Save) and `Delete` handlers (`link-add` / `link-edit` / `link-list`), and
   `b2_csrf_field()` in the `editlink`, `links` and `addlink` forms.

JA:
1. `b2-include/b2functions.php`: `b2header.php` 経由で全管理ページに読み込まれ
   る 3 つのヘルパー関数を追加 -- `b2_csrf_token($action)`(トークン計算)、
   `b2_csrf_field($action)`(POST フォーム用に隠し `_b2csrf` 入力を出力)、
   `b2_csrf_check($action)`(`$_REQUEST['_b2csrf']` を検証。欠落/不一致なら
   "Security check failed" で `die()`)。
2. `wp-admin/b2edit.php`: `post`・`editpost`・`delete`・`deletecomment`・
   `editedcomment` ハンドラの先頭で `b2_csrf_check()`(トークンアクションは
   `post` / `editpost` / `delete-post` / `delete-comment` / `editedcomment`)。
3. `wp-admin/b2edit.form.php`: 共有の投稿/コメントフォームで
   `b2_csrf_field($form_action)` を出力(トークンを `post` / `editpost` /
   `editedcomment` に限定)し、「Delete this post」GET リンクにトークンを付与。
4. `wp-admin/b2edit.showposts.php`: 投稿/コメント一覧の Delete(投稿)・
   Delete(コメント)GET リンクにトークンを付与。
5. `wp-admin/b2team.php`: `promote`・`delete` ハンドラで `b2_csrf_check()`
   (`promote-user` / `delete-user`)、両ユーザー一覧の昇格/降格/削除 GET
   リンクにトークンを付与。
6. `wp-admin/b2categories.php`: `addcat`・`Delete`・`Rename`・`editedcat`
   ハンドラで `b2_csrf_check()`(`addcat` / `catop` / `editedcat`)、`cats`・
   `addcat`・`renamecat` フォームで `b2_csrf_field()`。
7. `wp-admin/b2options.php`: `update` ハンドラで
   `b2_csrf_check('options-update')`、オプションフォームで `b2_csrf_field()`。
8. `wp-admin/b2profile.php`: `update` ハンドラで
   `b2_csrf_check('profile-update')`(パスワード変更前に実行されるため、
   トークンは現在のクッキーで計算される)、プロフィールフォームで
   `b2_csrf_field()`。
9. `wp-admin/linkmanager.php`: `Add`・`editlink`(Save)・`Delete` ハンドラで
   `b2_csrf_check()`(`link-add` / `link-edit` / `link-list`)、`editlink`・
   `links`・`addlink` フォームで `b2_csrf_field()`。

### Verification / 検証

EN:
- `php -l` -> **0 syntax errors** across all 9 changed files.
- `composer phpcs` -> **0 violations** (52 files).
- `composer phpstan` -> **0 errors** (run with `--memory-limit=1G`; the
  default 128 MB limit is exhausted by the codebase regardless of this fix).
- `b2-include/b2functions.php` is Latin-1 encoded; the three functions were
  appended byte-safely. The original 20 Latin-1 high-byte lines are untouched
  (only new UTF-8 bilingual comments were added).
- End-to-end in the Docker environment, logged in as `admin`: each protected
  operation was exercised twice -- once with a valid `_b2csrf` token read from
  the real admin HTML (must succeed) and once forged without a token (must be
  rejected). All passed:
  - Create post -> valid: HTTP 302, row inserted; forged: "Security check
    failed", 0 rows.
  - Edit post -> valid: HTTP 302, title updated; forged: rejected.
  - Delete post (GET link) -> valid: HTTP 302, row removed; forged: rejected,
    post survived.
  - Add category -> valid: HTTP 302, row inserted; forged: rejected.
  - Delete category -> valid: HTTP 302, row removed; forged: rejected,
    category survived.
  - Rename -> editedcat chain -> valid: HTTP 302, name updated.
  - Save options -> valid: HTTP 302, settings written; forged: rejected,
    `posts_per_page` unchanged.
  - Save profile -> valid: HTTP 200 "Profile updated!", row written; forged:
    rejected, nickname unchanged.
  - Edit comment (`editedcomment`) -> valid: HTTP 302, written; forged:
    rejected. Delete comment (GET) forged -> rejected, comment survived.
  - Link add / edit (Save) / delete -> valid: HTTP 302, DB changed; forged:
    rejected, DB unchanged.
- The blog front end and the admin pages load with **0 PHP warnings /
  fatals**. All test posts/categories/links were cleaned up; the original
  "Hello world!" post and the five default categories are intact.

JA:
- `php -l` -> 変更した全 9 ファイルで **構文エラー 0**。
- `composer phpcs` -> **検出 0 件**(52 ファイル)。
- `composer phpstan` -> **エラー 0 件**(`--memory-limit=1G` で実行。既定の
  128 MB 上限は本修正と無関係にコードベース全体で枯渇する)。
- `b2-include/b2functions.php` は Latin-1 エンコード。3 つの関数はバイト安全に
  追記した。元の Latin-1 高位バイト行 20 行は無変更(新規 UTF-8 二言語
  コメントを追加しただけ)。
- Docker 環境で `admin` としてログインし、各保護対象操作をエンドツーエンドで
  2 回ずつ実行した — 実際の管理画面 HTML から読み取った有効な `_b2csrf`
  トークン付き(成功するべき)と、トークン無しの偽造(拒否されるべき)。
  すべて合格:
  - 投稿作成 -> 有効: HTTP 302、行が挿入。偽造: "Security check failed"、
    0 行。
  - 投稿編集 -> 有効: HTTP 302、タイトル更新。偽造: 拒否。
  - 投稿削除(GET リンク)-> 有効: HTTP 302、行が削除。偽造: 拒否、投稿は
    残存。
  - カテゴリ追加 -> 有効: HTTP 302、行が挿入。偽造: 拒否。
  - カテゴリ削除 -> 有効: HTTP 302、行が削除。偽造: 拒否、カテゴリは残存。
  - Rename -> editedcat の連鎖 -> 有効: HTTP 302、名称更新。
  - オプション保存 -> 有効: HTTP 302、設定が書き込み。偽造: 拒否、
    `posts_per_page` は不変。
  - プロフィール保存 -> 有効: HTTP 200 "Profile updated!"、行が書き込み。
    偽造: 拒否、ニックネームは不変。
  - コメント編集(`editedcomment`)-> 有効: HTTP 302、書き込み。偽造: 拒否。
    コメント削除(GET)の偽造 -> 拒否、コメントは残存。
  - リンク 追加 / 編集(Save)/ 削除 -> 有効: HTTP 302、DB 変更。偽造:
    拒否、DB は不変。
- ブログ本体および管理ページが **PHP 警告 / fatal 0** で表示される。テスト用
  の投稿/カテゴリ/リンクはすべて削除し、元の「Hello world!」投稿と 5 つの
  既定カテゴリは無傷である。

### Out of scope / スコープ外

EN: The **public comment form** (`b2comments.post.php`, `b2comments.php`,
`b2edit.showposts.php`'s "Leave Comment" form) is intentionally **not**
protected. Commenters are anonymous -- they have no `wordpresspass`
authentication cookie -- so this cookie-derived token scheme does not apply,
and posting a comment is an action anyone may perform anyway, so it is not a
CSRF concern. The **logout** link is also left unprotected: forcing a logout
is low severity (no data is destroyed) and protecting it is not worth the
churn. Authentication itself was not redesigned. The `Show`-by-category
filter in `linkmanager.php` and `linkcategories.php` (link-category
management) only set a display/cookie filter or live in a separate file and
are outside the explicit file list for this Issue; they are not
state-changing writes to core blog data and were left for follow-up.

JA: **公開コメントフォーム**(`b2comments.post.php`・`b2comments.php`・
`b2edit.showposts.php` の「Leave Comment」フォーム)は意図的に**保護しない**。
コメント投稿者は匿名であり `wordpresspass` 認証クッキーを持たないため、この
クッキー由来のトークン方式は適用できない。またコメント投稿はそもそも誰でも
行える操作であり CSRF の懸念には当たらない。**ログアウト**リンクも未保護の
ままとした — 強制ログアウトは深刻度が低く(データは失われない)、保護に見合
わない。認証そのものは再設計していない。`linkmanager.php` のカテゴリ別
`Show` フィルタや `linkcategories.php`(リンクカテゴリ管理)は表示/クッキー
フィルタを設定するだけ、あるいは別ファイルにあり本 Issue の明示的なファイル
一覧外であって、ブログ中核データへの状態変更書き込みではないため、後続作業と
した。

---

## Issue #34: Authentication & session management / 認証・セッション管理

EN: WordPress 0.71-gold stored and compared passwords in plaintext, emailed the
stored password on the lost-password flow, derived the auth cookie from the
typed plaintext, and set cookies with no security flags. This Issue hashes
passwords, makes the auth cookie consistent with the stored value, resets
(instead of emails) lost passwords, and hardens the cookies.

JA: WordPress 0.71-gold はパスワードを平文で保存・比較し、パスワード再発行で
保存パスワードをメール送信し、認証クッキーを入力された平文から生成し、
クッキーにセキュリティフラグを付けていなかった。本 Issue ではパスワードを
ハッシュ化し、認証クッキーを保存値と整合させ、パスワード再発行をメール送信
ではなくリセットに変更し、クッキーを強化する。

### A. Password hashing with transparent migration / パスワードのハッシュ化と透過的移行

EN: New passwords are stored as bcrypt hashes via
`password_hash($pw, PASSWORD_DEFAULT)` in `b2register.php` (registration) and
`wp-admin/b2profile.php` (profile password change).

`login()` in `b2login.php` no longer matches `WHERE user_pass = '...'`. It
loads the row by `user_login` only, then verifies in PHP:

- If the stored value is a hash (`password_get_info()['algo']` is truthy) →
  `password_verify($typed, $stored)`.
- If it is not a hash (a legacy plaintext row) → compare plaintext; on a match,
  immediately `password_hash()` the typed password and `UPDATE` the row. This
  transparently upgrades each legacy account on its next successful login.

So the existing `admin` / `password` account keeps working and is upgraded to a
bcrypt hash on first login.

JA: 新しいパスワードは `b2register.php`(登録)と `wp-admin/b2profile.php`
(プロフィールのパスワード変更)で `password_hash($pw, PASSWORD_DEFAULT)` に
より bcrypt ハッシュとして保存する。

`b2login.php` の `login()` は `WHERE user_pass = '...'` での照合をやめた。
`user_login` のみで行を取得し、PHP 側で検証する。

- 保存値がハッシュ(`password_get_info()['algo']` が真)なら →
  `password_verify($typed, $stored)`。
- ハッシュでない(レガシーな平文行)なら → 平文比較し、一致したら直ちに
  入力パスワードを `password_hash()` して行を `UPDATE` する。これにより各
  レガシーアカウントは次回ログイン成功時に透過的にアップグレードされる。

よって既存の `admin` / `password` アカウントは引き続き動作し、初回ログイン時に
bcrypt ハッシュへアップグレードされる。

### B. Auth-cookie consistency / 認証クッキーの整合性

EN: `checklogin()` verifies the session by comparing the `wordpresspass` cookie
to `md5($userdata->user_pass)`. Previously `login()` set the cookie to
`md5(typed plaintext)`, which only matched because `user_pass` *was* the
plaintext. After hashing, that would break the session.

`login()` now sets `wordpresspass` to `md5()` of the **stored** `user_pass`
value (the bcrypt hash, including the row just upgraded by the transparent
migration). `wp-admin/b2profile.php` applies the same after a password change.
Both sides of `checklogin()` therefore agree whether the row is hashed or still
legacy plaintext, and the CSRF token (Issue #33), which seeds from the same
cookie, stays consistent.

JA: `checklogin()` は `wordpresspass` クッキーを `md5($userdata->user_pass)` と
比較してセッションを検証する。従来 `login()` はクッキーを `md5(入力平文)` に
設定しており、`user_pass` が平文そのものだったから一致していた。ハッシュ化後は
これではセッションが壊れる。

`login()` は `wordpresspass` を、**保存された** `user_pass` の値(透過的移行で
今アップグレードされた行も含む bcrypt ハッシュ)の `md5()` に設定するように
変更した。`wp-admin/b2profile.php` もパスワード変更後に同様に設定する。これに
より `checklogin()` の両辺は行がハッシュ済みでもレガシー平文でも一致し、同じ
クッキーから生成される CSRF トークン(Issue #33)も整合性を保つ。

### C. Lost password becomes a reset / パスワード再発行をリセットに変更

EN: The `retrievepassword` case in `b2login.php` used to email
`$user_data->user_pass`. After hashing that would email a useless hash. It now
generates a fresh 12-character random temporary password with `random_int()`,
stores its bcrypt hash, and emails only the new plaintext temporary password.
No stored secret is ever emailed. The response no longer reveals whether a
given login exists.

JA: `b2login.php` の `retrievepassword` ケースは `$user_data->user_pass` を
メール送信していた。ハッシュ化後はこれでは無意味なハッシュを送ることになる。
現在は `random_int()` で 12 文字のランダムな一時パスワードを新規生成し、その
bcrypt ハッシュを保存して、新しい平文の一時パスワードのみをメール送信する。
保存されている秘密情報を送ることは一切ない。応答は指定ログインの存在有無も
明かさない。

### D. Cookie security flags / クッキーのセキュリティフラグ

EN: All authentication `setcookie()` calls (`wordpressuser`, `wordpresspass`,
`wordpressblogid` in `b2login.php`; `wordpresspass` in `b2profile.php`) now use
the PHP 7.3+ options-array form with `httponly => true`, `samesite => 'Lax'`,
and `secure => !empty($_SERVER['HTTPS'])` so the flag is set only over HTTPS
and the local HTTP environment keeps working. `b2login.php` centralises this in
a `b2_auth_cookie_flags()` helper; the logout case expires the cookies with the
same path/flags so the browser actually deletes them.

JA: すべての認証 `setcookie()` 呼び出し(`b2login.php` の `wordpressuser`・
`wordpresspass`・`wordpressblogid`、`b2profile.php` の `wordpresspass`)は
PHP 7.3 以降のオプション配列形式を用い、`httponly => true`・
`samesite => 'Lax'`・`secure => !empty($_SERVER['HTTPS'])` を設定する。Secure は
HTTPS のときだけ付与され、ローカルの HTTP 環境は動作し続ける。`b2login.php` は
これを `b2_auth_cookie_flags()` ヘルパーに集約し、ログアウト時は同じ
path/フラグでクッキーを失効させ、ブラウザが確実に削除するようにした。

### E. Database column width / データベースのカラム幅

EN: A bcrypt hash is 60 characters but `b2users.user_pass` was `varchar(20)`.
The column was widened to `varchar(255)` on the live database
(`ALTER TABLE b2users MODIFY user_pass VARCHAR(255) NOT NULL`) and the
`CREATE TABLE b2users` in `src/wp-admin/wp-install.php` was updated so fresh
installs get the wider column.

JA: bcrypt ハッシュは 60 文字だが `b2users.user_pass` は `varchar(20)` だった。
ライブデータベースのカラムを `varchar(255)` に拡張し
(`ALTER TABLE b2users MODIFY user_pass VARCHAR(255) NOT NULL`)、新規インス
トールが広いカラムを得られるよう `src/wp-admin/wp-install.php` の
`CREATE TABLE b2users` も更新した。

### Changes / 変更内容

- `src/b2login.php` — `b2_auth_cookie_flags()` helper; `login()` rewritten to
  look up by login name and verify with `password_verify()` plus legacy
  re-hash; auth cookie set to `md5(stored value)`; hardened logout cookies;
  `retrievepassword` resets instead of emailing the stored secret.
- `src/b2register.php` — registration stores `password_hash()` output.
- `src/wp-admin/b2profile.php` — profile password change stores
  `password_hash()` output and sets the hardened cookie to `md5(stored hash)`.
- `src/wp-admin/wp-install.php` — `b2users.user_pass` column widened to
  `varchar(255)`.

### Verification / 検証

EN: `php -l` passes on all four changed files; `composer phpcs` reports 0
violations; `composer phpstan --memory-limit=1G` reports 0 errors. The full
login lifecycle was verified with `curl` against the Docker environment on this
branch: fresh `admin`/`password` login (302 to `wp-admin`, cookies set), the
admin row upgraded to a `$2y$` bcrypt hash, an authenticated request stays
logged in, logout then re-login via the hash path, wrong password rejected,
profile password change writes a hash and the new password logs in, and
`retrievepassword` rotates the stored hash without emailing a secret. Front end
and admin pages load with no PHP warnings or fatals.

JA: 変更した 4 ファイルすべてで `php -l` が通り、`composer phpcs` は違反 0 件、
`composer phpstan --memory-limit=1G` はエラー 0 件。本ブランチの Docker 環境に
対し `curl` でログインのライフサイクル全体を検証した。`admin`/`password` の新規
ログイン(`wp-admin` へ 302、クッキー設定)、admin 行が `$2y$` bcrypt ハッシュへ
アップグレード、認証済みリクエストでログイン維持、ログアウト後にハッシュ経路で
再ログイン、誤ったパスワードの拒否、プロフィールのパスワード変更でハッシュを
書き込み新パスワードでログイン、`retrievepassword` が秘密情報を送らずに保存
ハッシュをローテーション。フロントエンドと管理画面は PHP 警告・fatal なしで
表示される。

### Out of scope / スコープ外

EN: Replacing the `md5(password-hash)` bearer cookie with a server-side random
session id is **not** done here — WordPress 0.71-gold has no session storage
infrastructure and that is a separate, larger change. The existing cookie
mechanism is kept, made consistent per section B. As a consequence the
`md5:`-prefixed password path in `login()` (where the client sends
`md5(stored user_pass)`) now only authenticates a legacy **plaintext** row: a
bcrypt hash is not recoverable from its md5, so a hashed account cannot be
reached through the `md5:` path. The normal username+password path is fully
functional for hashed accounts; the `md5:` path is an edge feature and this
limitation is documented rather than worked around. The XML-RPC password check
(`user_pass_ok()` in the Latin-1 `b2functions.php`) still compares plaintext
and is left for a follow-up Issue.

JA: `md5(パスワードハッシュ)` のベアラークッキーをサーバー側のランダムな
セッション ID に置き換えることは本 Issue では**行わない** — WordPress
0.71-gold にはセッション保存基盤が無く、別個のより大きな変更となる。既存の
クッキー方式は維持し、セクション B の通り整合させた。その結果、`login()` の
`md5:` 接頭辞付きパスワード経路(クライアントが `md5(保存された user_pass)` を
送る方式)はレガシーな**平文**行のみ認証する。bcrypt ハッシュはその md5 から
復元できないため、ハッシュ済みアカウントは `md5:` 経路では認証できない。通常の
ユーザー名+パスワード経路はハッシュ済みアカウントで完全に機能する。`md5:`
経路はエッジ機能であり、本制限は回避せず記録するにとどめる。XML-RPC の
パスワードチェック(Latin-1 の `b2functions.php` の `user_pass_ok()`)は
依然として平文比較であり、後続 Issue とした。

## Issue #44: Remove the XML-RPC, comment, trackback and pingback features / XML-RPC・コメント・トラックバック・ピンバック機能を撤去

### Summary / 概要

EN: The XML-RPC server, the comment feature, trackback and pingback were
removed completely from WordPress 0.71-gold. The user requested full deletion
("丸ごといらない" — not needed at all), and trackback/pingback were removed
together with comments. The blog front end (posts, archives, categories,
search, feeds) and the admin (post create/edit/delete, categories, options,
profile, links, users) keep working without them.

JA: WordPress 0.71-gold から XML-RPC サーバ・コメント機能・トラックバック・
ピンバックを完全に撤去した。ユーザーは完全削除(「丸ごといらない」)を希望し、
トラックバック/ピンバックもコメントと一緒に撤去した。ブログ本体(投稿・
アーカイブ・カテゴリ・検索・フィード)と管理画面(投稿の作成/編集/削除・
カテゴリ・オプション・プロフィール・リンク・ユーザー)はそれら無しで動作し
続ける。

### A. Files deleted / 削除したファイル

EN: Thirteen files were removed with `git rm`:

- XML-RPC: `src/xmlrpc.php`, `src/b2-include/xmlrpc.inc`,
  `src/b2-include/xmlrpcs.inc`
- Comments: `src/b2comments.php`, `src/b2comments.post.php`,
  `src/b2commentspopup.php`
- Trackback: `src/b2trackback.php`, `src/b2trackbackpopup.php`
- Pingback: `src/b2pingbacks.php`, `src/b2pingbackspopup.php`
- Mail-to-blog: `src/b2mail.php` and `src/b2-include/class.POP3.php`
  (b2mail depends on the XML-RPC library and the ping helpers being removed,
  so it cannot work without them and is removed as collateral)
- `src/b2.php`: a dead legacy alternate theme superseded by `src/index.php`;
  it called `comments_popup_script()`, `comments_popup_link()` and
  `include('b2comments.php')`, so leaving it would have left a file that
  fatals. The modern entry point is `index.php`, so the dead stub was deleted.

JA: 13 個のファイルを `git rm` で削除した:

- XML-RPC: `src/xmlrpc.php`, `src/b2-include/xmlrpc.inc`,
  `src/b2-include/xmlrpcs.inc`
- コメント: `src/b2comments.php`, `src/b2comments.post.php`,
  `src/b2commentspopup.php`
- トラックバック: `src/b2trackback.php`, `src/b2trackbackpopup.php`
- ピンバック: `src/b2pingbacks.php`, `src/b2pingbackspopup.php`
- メール投稿: `src/b2mail.php` と `src/b2-include/class.POP3.php`
  (b2mail は XML-RPC ライブラリと撤去対象の ping ヘルパーに依存しており、
  それら無しでは動作しないため巻き添えで削除)
- `src/b2.php`: `src/index.php` に置き換えられた死んだレガシー代替テーマ。
  `comments_popup_script()`・`comments_popup_link()`・
  `include('b2comments.php')` を呼んでおり、残すと fatal するファイルが残る。
  現行のエントリポイントは `index.php` のため、死んだスタブを削除した。

### B. References cleaned up / 参照の除去

EN:

- `src/blog.header.php` — removed the `require_once` of `xmlrpc.inc` /
  `xmlrpcs.inc` and the `X-Pingback` HTTP header.
- `src/wp-admin/b2header.php` — removed the `require_once` of `xmlrpc.inc` /
  `xmlrpcs.inc`.
- `src/index.php` (default theme) — removed the `<link rel="pingback">`, the
  `comments_popup_script()` comment line, `comments_popup_link()`,
  `trackback_rdf()` and `include('b2comments.php')`. The post loop, link
  pages and everything else still work.
- `src/wp-admin/b2edit.php` — removed the `editcomment` / `deletecomment` /
  `editedcomment` switch cases, the `pingWeblogs()` / `pingCafelog()` /
  `pingBlogs()` / `pingback()` / `trackback()` calls in the `post` and
  `editpost` cases, the `$post_pingback` reads, and the
  `DELETE FROM $tablecomments` query in the `delete` case.
- `src/wp-admin/b2edit.showposts.php` — removed the comment-list section, the
  edit/delete-comment links and the comment-count link; the post listing
  still works.
- `src/wp-admin/b2edit.form.php` — removed the `editcomment` branch of the
  switch, the comment-editing form HTML, and the `$form_pingback` /
  `$form_trackback` fields.
- `src/wp-admin/b2template.php` — removed the dead "edit the comments
  template" links pointing at the deleted `b2comments.php` /
  `b2commentspopup.php`.
- `phpstan.neon.dist` — removed the `scanFiles` entries for the deleted
  `.inc` files and their now-obsolete explanatory comment.
- `src/wp-admin/wp-install.php` — removed the `CREATE TABLE b2comments`
  schema and its sample comment `INSERT` from the installer. The
  password-generation logic was not touched.
- `src/b2config.php` — the comment/ping config variables (`$tablecomments`,
  `$use_cafelogping`, `$cafelogID`, `$use_trackback`, `$use_pingback`, the
  Weblogs/Blo.gs ping and `b2mail` settings) were left in place as harmless
  unused config; the misleading Cafelog comment that referenced the deleted
  `xmlrpc.php` / `b2mail.php` was updated.

JA:

- `src/blog.header.php` — `xmlrpc.inc` / `xmlrpcs.inc` の `require_once` と
  `X-Pingback` HTTP ヘッダーを除去した。
- `src/wp-admin/b2header.php` — `xmlrpc.inc` / `xmlrpcs.inc` の
  `require_once` を除去した。
- `src/index.php`(既定テーマ)— `<link rel="pingback">`、
  `comments_popup_script()` のコメント行、`comments_popup_link()`、
  `trackback_rdf()`、`include('b2comments.php')` を除去した。投稿ループ・
  ページ送り・その他はすべて動作する。
- `src/wp-admin/b2edit.php` — `editcomment` / `deletecomment` /
  `editedcomment` の switch ケース、`post` / `editpost` ケース内の
  `pingWeblogs()` / `pingCafelog()` / `pingBlogs()` / `pingback()` /
  `trackback()` 呼び出し、`$post_pingback` の読み取り、`delete` ケースの
  `DELETE FROM $tablecomments` クエリを除去した。
- `src/wp-admin/b2edit.showposts.php` — コメント一覧セクション、コメント
  編集/削除リンク、コメント数リンクを除去した。投稿一覧は動作する。
- `src/wp-admin/b2edit.form.php` — switch の `editcomment` 分岐、コメント
  編集フォームの HTML、`$form_pingback` / `$form_trackback` フィールドを
  除去した。
- `src/wp-admin/b2template.php` — 削除済みの `b2comments.php` /
  `b2commentspopup.php` を指す死んだ「コメントテンプレートを編集」リンクを
  除去した。
- `phpstan.neon.dist` — 削除した `.inc` ファイルの `scanFiles` エントリと、
  それに関する不要になった説明コメントを除去した。
- `src/wp-admin/wp-install.php` — インストーラから `CREATE TABLE b2comments`
  スキーマとサンプルコメントの `INSERT` を除去した。パスワード生成ロジックは
  変更していない。
- `src/b2config.php` — コメント/ping 設定変数(`$tablecomments`、
  `$use_cafelogping`、`$cafelogID`、`$use_trackback`、`$use_pingback`、
  Weblogs/Blo.gs ping と `b2mail` の設定)は無害な未使用設定としてそのまま
  残した。削除済みの `xmlrpc.php` / `b2mail.php` を参照していた誤解を招く
  Cafelog コメントは更新した。

### C. Functions removed / 撤去した関数

EN: Before removing each function the whole `src/` tree was grepped to confirm
no remaining callers. Removed from `src/b2-include/b2template.functions.php`
(the whole comment/trackback tag block): `comments_number()`,
`comments_link()`, `comments_popup_script()`, `comments_popup_link()`,
`comment_ID()`, `comment_author()`, `comment_author_email()`,
`comment_author_link()`, `comment_type()`, `comment_author_url()`,
`comment_author_email_link()`, `comment_author_url_link()`,
`comment_author_IP()`, `comment_text()`, `comment_date()`, `comment_time()`,
`trackback_url()`, `trackback_rdf()`, and the `pingback_url` case of
`get_bloginfo()`.

Removed from `src/b2-include/b2functions.php` (Latin-1 / UTF-8 mixed file,
edited byte-safely in binary mode): `pingWeblogs()`, `pingWeblogsRss()`,
`pingCafelog()`, `pingBlogs()`, `trackback()`, `trackback_response()`,
`xmlrpc_getposttitle()`, `xmlrpc_getpostcategory()`,
`xmlrpc_removepostdata()`, `debug_fopen()`, `debug_fwrite()`,
`debug_fclose()`, `pingback()`, `get_commentdata()` and `rss_update()`.

JA: 各関数を削除する前に `src/` ツリー全体を grep し、残存する呼び出し元が
無いことを確認した。`src/b2-include/b2template.functions.php` から(コメント/
トラックバックタグのブロックごと)撤去: `comments_number()`、
`comments_link()`、`comments_popup_script()`、`comments_popup_link()`、
`comment_ID()`、`comment_author()`、`comment_author_email()`、
`comment_author_link()`、`comment_type()`、`comment_author_url()`、
`comment_author_email_link()`、`comment_author_url_link()`、
`comment_author_IP()`、`comment_text()`、`comment_date()`、
`comment_time()`、`trackback_url()`、`trackback_rdf()`、および
`get_bloginfo()` の `pingback_url` ケース。

`src/b2-include/b2functions.php`(Latin-1 / UTF-8 混在ファイル。バイナリ
モードでバイト安全に編集)から撤去: `pingWeblogs()`、`pingWeblogsRss()`、
`pingCafelog()`、`pingBlogs()`、`trackback()`、`trackback_response()`、
`xmlrpc_getposttitle()`、`xmlrpc_getpostcategory()`、
`xmlrpc_removepostdata()`、`debug_fopen()`、`debug_fwrite()`、
`debug_fclose()`、`pingback()`、`get_commentdata()`、`rss_update()`。

### D. Functions intentionally kept / 意図的に残した関数

EN: `make_url_footnote()` in `b2functions.php` was *kept* — despite living
next to the XML-RPC helpers, it is a content helper still called by
`the_content_rss()` and `the_excerpt_rss()`. `dbconnect()` was kept (it is an
unrelated no-op stub from an earlier Issue, out of scope here); only its
comment was trimmed since it previously also described the now-removed
`rss_update()`. No function had to be left with a broken caller.

JA: `b2functions.php` の `make_url_footnote()` は*残した* — XML-RPC ヘルパー
の隣にあるが、これは `the_content_rss()` と `the_excerpt_rss()` から今も
呼ばれるコンテンツ補助関数である。`dbconnect()` も残した(以前の Issue 由来の
無関係な no-op スタブで本 Issue のスコープ外)。`rss_update()` も説明していた
コメントだけを刈り込んだ。呼び出し元が壊れたまま残った関数は無い。

### Verification / 検証

EN: `php -l` passes on every changed file and across all `src/**/*.php` (0
syntax errors). `composer phpcs` reports 0 violations (41 files).
`composer phpstan --memory-limit=1G` reports 0 errors (the default 128 MB
OOMs on this repo — a pre-existing, unrelated limitation). A whole-tree grep
confirms no remaining references to the deleted files or removed functions.
`b2functions.php` stays valid UTF-8 with its Japanese comment bytes intact.

Against the Docker environment on this branch (web container restarted to
clear OPcache): the front end (`/` twice, `?cat=1`, `?m=202605`, `?p=1`)
displays posts with 0 PHP fatals/warnings/deprecated and no comment links or
pingback `<link>`. The admin (`b2edit.php`, `b2categories.php`,
`b2options.php`, `b2profile.php`, `linkmanager.php`, `b2team.php`, plus
`b2edit.php?action=edit`) loads with 0 PHP warnings/fatals. The removed entry
points (`xmlrpc.php`, `b2comments*.php`, `b2trackback*.php`, `b2pingback*.php`,
`b2mail.php`, `b2.php`) all return HTTP 404. Posting still works: a test post
submitted through the `post` action (302 redirect) and appeared on the front
page, then was removed.

JA: `php -l` は変更した全ファイルおよび `src/**/*.php` 全体で通る(構文
エラー 0)。`composer phpcs` は違反 0 件(41 ファイル)。
`composer phpstan --memory-limit=1G` はエラー 0 件(既定の 128 MB はこの
リポジトリで OOM する — 既知の無関係な制約)。ツリー全体の grep で削除した
ファイルや撤去した関数への参照が残っていないことを確認した。
`b2functions.php` は日本語コメントのバイトを保ったまま有効な UTF-8 を維持。

本ブランチの Docker 環境に対し(OPcache を消すため web コンテナを再起動):
フロントエンド(`/` を 2 回、`?cat=1`、`?m=202605`、`?p=1`)は PHP fatal/
warning/deprecated 0 で投稿を表示し、コメントリンクもピンバック `<link>` も
無い。管理画面(`b2edit.php`・`b2categories.php`・`b2options.php`・
`b2profile.php`・linkmanager.php`・`b2team.php`、加えて
`b2edit.php?action=edit`)は PHP 警告/fatal 0 で表示される。撤去した
エントリポイント(`xmlrpc.php`・`b2comments*.php`・`b2trackback*.php`・
`b2pingback*.php`・`b2mail.php`・`b2.php`)はすべて HTTP 404 を返す。投稿も
動作する: `post` アクションで送信したテスト投稿が成功(302 リダイレクト)し
フロントページに表示され、その後削除した。

## Issue #35: Access control / authorization / アクセス制御・認可

EN: A security audit (Issue #35) found that authorization was enforced
inconsistently in the admin screens. Two distinct problems remained after the
comment feature was removed in Issue #44:

1. `b2team.php` -- the `promote` and `delete` action handlers only performed a
   *relative* level check (`if ($user_level <= $target_level) die()`). They
   had **no minimum-level gate**. The user-list UI shows the promote/demote
   links only to `$user_level >= 2` users and the delete link only to
   high-level users, but that is a display-time test only. A low-level user
   who crafts the request URL directly (with a valid CSRF token) bypassed the
   UI gate entirely and could act on any user below their own level -- e.g. a
   level-1 user deleting level-0 users.

2. `b2edit.php` -- the `edit` and `delete` handlers checked ownership with the
   loose test `if ($user_level < $authordata->user_level)`, so a user at the
   *same* level as the author could edit or delete that author's posts even
   when they were not the author. Worse, the `editpost` handler (the form
   submission that actually writes the UPDATE) loaded no post row and ran no
   ownership check at all -- it only rejected `$user_level == 0`. Any non-zero
   user could overwrite any post by posting a crafted `post_ID`.

JA: セキュリティ監査(Issue #35)で、管理画面の認可の適用が不統一であること
が判明した。Issue #44 でコメント機能を撤去した後も、次の 2 つの問題が残って
いた:

1. `b2team.php` -- `promote`・`delete` アクションハンドラは*相対的*なレベル
   比較(`if ($user_level <= $target_level) die()`)のみを行っていた。
   **最低レベルのゲートが無かった**。ユーザー一覧の UI は昇格/降格リンクを
   `$user_level >= 2` のユーザーにのみ、削除リンクを高レベルのユーザーにのみ
   表示するが、これは表示時の判定にすぎない。リクエスト URL を直接組み立てた
   低レベルユーザー(正しい CSRF トークン付き)は UI のゲートを完全に回避し、
   自分より下のレベルのユーザーを操作できた — 例えば level-1 ユーザーが
   level-0 ユーザーを削除できた。

2. `b2edit.php` -- `edit`・`delete` ハンドラは所有者チェックを緩い判定
   `if ($user_level < $authordata->user_level)` で行っていたため、作者と
   *同じ*レベルのユーザーは、作者本人でなくてもその作者の投稿を編集・削除
   できた。さらに `editpost` ハンドラ(実際に UPDATE を書き込むフォーム送信)
   は投稿行を読み込まず、所有者チェックを一切行っていなかった — `$user_level
   == 0` を拒否するだけだった。0 でないユーザーなら誰でも、`post_ID` を細工
   して送信すれば任意の投稿を上書きできた。

### Changes / 変更内容

EN:
1. `wp-admin/b2team.php`: add an explicit minimum-level gate at the start of
   each action handler, right after the existing CSRF check, so the server
   enforces the same condition the UI uses.
   - `case 'promote'`: require `$user_level >= 2`, otherwise `die()` with
     "You are not allowed to change user levels."
   - `case 'delete'`: require `$user_level > 3`, otherwise `die()` with
     "You are not allowed to delete users."
   The pre-existing relative check (a user cannot act on someone at or above
   their own level) is kept as defence in depth.
2. `wp-admin/b2edit.php`: tighten the post edit/delete authorization to proper
   ownership in the `edit`, `editpost` and `delete` handlers. A user may act
   on a post only if they are its author **or** their level is strictly
   higher than the author's; the handler rejects when
   `$postdata["Author_ID"] != $user_ID && $user_level <= $authordata->user_level`.
   The post's real author is taken from the loaded post row
   (`get_postdata()` -> `Author_ID`), never from a request value. The
   `editpost` handler -- which previously loaded no post -- now calls
   `get_postdata()` and keeps an `or die(...)` guard for a non-existent post,
   matching the `edit`/`delete` handlers.

JA:
1. `wp-admin/b2team.php`: 各アクションハンドラの先頭、既存の CSRF チェックの
   直後に、明示的な最低レベルゲートを追加。UI が使うのと同じ条件をサーバー側
   でも強制する。
   - `case 'promote'`: `$user_level >= 2` を要求。満たさなければ
     "You are not allowed to change user levels." で `die()`。
   - `case 'delete'`: `$user_level > 3` を要求。満たさなければ
     "You are not allowed to delete users." で `die()`。
   既存の相対チェック(自分と同等以上のユーザーは操作不可)は多層防御として
   残す。
2. `wp-admin/b2edit.php`: `edit`・`editpost`・`delete` ハンドラの投稿編集/
   削除の認可を、適切な所有者チェックに厳格化。投稿を操作できるのはその投稿の
   作者本人、**または**作者よりレベルが厳密に高いユーザーのみ。
   `$postdata["Author_ID"] != $user_ID && $user_level <= $authordata->user_level`
   のとき拒否する。投稿の真の作者は読み込んだ投稿行(`get_postdata()` の
   `Author_ID`)から取得し、リクエスト値は使わない。これまで投稿を読み込んで
   いなかった `editpost` ハンドラは `get_postdata()` を呼び、存在しない投稿に
   対する `or die(...)` ガードを `edit`/`delete` ハンドラと同様に持つように
   した。

### Notes / 注記

EN: The new minimum-level gates run *after* the CSRF check added in Issue #33,
so a forged cross-site request is still rejected first and the gate then
applies to legitimately-tokened requests. The new gates do not change or
weaken the CSRF protection. Note the `delete` gate (`$user_level > 3`) is
slightly stricter than the inactive-user-list delete link, which the UI shows
at `$user_level >= 3`; this follows the audit recommendation to enforce a
clear high-level requirement for user deletion. The tightened ownership rule
is transparent for normal use: the admin is level 10 and authors own their
posts, so an author always passes the "is author" branch and the admin always
passes the "strictly higher level" branch.

JA: 新しい最低レベルゲートは Issue #33 で追加した CSRF チェックの*後*に実行
されるため、偽造されたクロスサイトリクエストは先に拒否され、ゲートは正しく
トークンを持つリクエストにのみ適用される。新しいゲートは CSRF 対策を変更も
弱体化もしない。`delete` ゲート(`$user_level > 3`)は、UI が `$user_level
>= 3` で表示する非アクティブユーザー一覧の削除リンクよりわずかに厳格である
が、これはユーザー削除に明確な高レベル要件を強制するという監査の推奨に従った
もの。厳格化した所有者ルールは通常利用では透過的である: 管理者は level 10
であり、作者は自分の投稿を所有するため、作者は常に「作者本人」分岐を、
管理者は常に「レベルが厳密に高い」分岐を通過する。

### Verification / 検証

EN: `php -l` passes on both changed files (`b2team.php`, `b2edit.php`) with 0
syntax errors. `composer phpcs` reports 0 violations (41 files).
`composer phpstan --memory-limit=1G` reports 0 errors (the default 128 MB
OOMs on this repository -- a pre-existing, unrelated constraint). Against the
Docker environment on this branch (web container restarted to clear OPcache):
logged in as `admin` (level 10), `b2team.php` and `b2edit.php` both load with
0 PHP warnings/fatals; the admin created a test post, edited it via
`action=edit` + `editpost`, and deleted it via `action=delete` -- all returned
302 redirects with no "not allowed" message. A `delete` request without the
CSRF token is still rejected with "Security check failed", confirming the new
level gate sits alongside (after) the Issue #33 CSRF check without breaking
it. The front end (`/`, `?p=1`) and admin pages load with 0 PHP
warnings/fatals.

JA: `php -l` は変更した両ファイル(`b2team.php`・`b2edit.php`)で通る(構文
エラー 0)。`composer phpcs` は違反 0 件(41 ファイル)。
`composer phpstan --memory-limit=1G` はエラー 0 件(既定の 128 MB はこの
リポジトリで OOM する — 既知の無関係な制約)。本ブランチの Docker 環境に
対し(OPcache を消すため web コンテナを再起動): `admin`(level 10)で
ログインし、`b2team.php` と `b2edit.php` はともに PHP 警告/fatal 0 で表示。
管理者はテスト投稿を作成し、`action=edit` + `editpost` で編集、
`action=delete` で削除した — いずれも 302 リダイレクトを返し「not allowed」
は出なかった。CSRF トークン無しの `delete` リクエストは引き続き
"Security check failed" で拒否され、新しいレベルゲートが Issue #33 の CSRF
チェックの隣(後ろ)に位置し、それを壊していないことを確認した。
フロントエンド(`/`・`?p=1`)と管理画面は PHP 警告/fatal 0 で表示される。

## Issue #36: File upload security / ファイルアップロードのセキュリティ

EN: A security audit (Issue #36) found that `wp-admin/b2upload.php` built the
destination path directly from the user-supplied file name and saved the file
with `move_uploaded_file()` (or `rename()`), with two distinct flaws:

1. **Path traversal** -- the saved file name came straight from
   `$_FILES['img1']['name']` (or `$_POST['imgalt']`) with no sanitisation,
   and `$pathtofile = $fileupload_realpath."/".$img1_name`. A name such as
   `../../../../var/www/html/shell.php` would write the uploaded file
   anywhere the web server could reach -- including the document root.

2. **Loose extension check** -- the type test was a substring `preg_match`:
   `preg_match('~'.strtolower($imgtype).'~', strtolower($fileupload_allowedtypes))`.
   That matches a *substring*, so a file whose extension is not in the
   allow-list could still pass (e.g. an extension that happens to be a
   substring of an allowed one), and the test looked at a `.`-split segment
   rather than the genuine final extension.

If a script file (`.php`, `.phtml`, ...) landed in a web-served directory
this is remote code execution. The only thing preventing exploitation today
is `$use_fileupload = 0` in `b2config.php` -- a config default, not a code
control. The fix hardens the code so it is safe even when uploads are enabled.

JA: セキュリティ監査(Issue #36)で、`wp-admin/b2upload.php` が保存先パスを
ユーザー指定のファイル名から直接組み立て、`move_uploaded_file()`(または
`rename()`)で保存していることが判明した。2 つの欠陥があった:

1. **パストラバーサル** -- 保存ファイル名が `$_FILES['img1']['name']`(または
   `$_POST['imgalt']`)からサニタイズ無しでそのまま使われ、
   `$pathtofile = $fileupload_realpath."/".$img1_name` となっていた。
   `../../../../var/www/html/shell.php` のような名前は、Web サーバーが届く
   任意の場所(ドキュメントルートを含む)にファイルを書き込めた。

2. **緩い拡張子チェック** -- 型判定が部分一致の `preg_match` だった:
   `preg_match('~'.strtolower($imgtype).'~', strtolower($fileupload_allowedtypes))`。
   これは*部分文字列*に一致するため、許可リストに無い拡張子でも通過しうる
   (許可拡張子の部分文字列になっている場合など)。さらに、本来の最終拡張子
   ではなく `.` で分割した一要素を見ていた。

スクリプトファイル(`.php`・`.phtml` など)が Web 公開ディレクトリに置かれ
れば、これはリモートコード実行である。現状で悪用を防いでいるのは
`b2config.php` の `$use_fileupload = 0` のみ — 設定の既定値であって、コード
上の対策ではない。本修正はコードを堅牢化し、アップロードを有効化しても
安全になるようにする。

### Changes / 変更内容

EN: All changes are confined to `wp-admin/b2upload.php`.

1. **File-name sanitisation (path-traversal defence)**: before the name is
   used in any path, apply `basename()` to strip directory components, then
   `preg_replace` to keep only the safe set `[A-Za-z0-9._-]` (other
   characters become `_`), collapse repeated dots and trim leading/trailing
   dots. An empty result is rejected with `die('Invalid file name.')`. The
   sanitised name is also written back to `$imgalt`, so the alternate-name
   upload path is hardened identically.

2. **Strict extension whitelist**: the extension is taken as the final
   `.`-separated segment of the *sanitised* name, lower-cased, and matched
   with `in_array(..., true)` against the allow-list built from
   `$fileupload_allowedtypes` (default ` jpg gif png `). A name with no
   extension, or whose final extension is not whitelisted, is rejected with a
   clear message and no file is moved. Because only the *final* extension
   decides, `evil.php.jpg` is treated as `jpg` (allowed) and `shell.php` as
   `php` (rejected) -- a `.php` file can never be accepted.

3. **Destination containment check (defence in depth)**: before any write,
   `realpath()` of the destination directory is compared for exact equality
   with `realpath($fileupload_realpath)`; a mismatch aborts with
   `die('Invalid upload destination.')`.

4. The existing `MAX_FILE_SIZE` hidden field and PHP's size handling are
   unchanged. Both `move_uploaded_file()` sites and the `rename()` path are
   covered, because they all consume the now-sanitised `$img1_name` /
   `$imgalt` / `$pathtofile`.

5. The misleading source comment `//Path to your images directory, chmod the
   dir to 777` was softened: a comment now notes that the upload directory
   only needs to be writable by the web server user (e.g. 0755/0775) and that
   `chmod 777` is not required and should be avoided. Comment only -- no
   behaviour change.

JA: 変更はすべて `wp-admin/b2upload.php` に限定する。

1. **ファイル名のサニタイズ(パストラバーサル対策)**: パスに使う前に
   `basename()` でディレクトリ部分を除去し、`preg_replace` で安全な文字種
   `[A-Za-z0-9._-]` のみを残す(それ以外は `_` に置換)。連続するドットを
   1 つにまとめ、先頭・末尾のドットを除去する。結果が空なら
   `die('Invalid file name.')` で拒否する。サニタイズ後の名前は `$imgalt`
   にも書き戻し、代替名のアップロード経路も同様に堅牢化する。

2. **厳格な拡張子ホワイトリスト**: 拡張子は*サニタイズ後*の名前を `.` で
   分割した最終要素を小文字化して取得し、`$fileupload_allowedtypes`
   (既定 ` jpg gif png `)から作った許可リストと `in_array(..., true)` で
   厳密一致させる。拡張子が無い名前、または最終拡張子が許可リストに無い名前
   は明確なメッセージで拒否し、ファイルは移動しない。判定するのは*最終*
   拡張子のみなので、`evil.php.jpg` は `jpg`(許可)、`shell.php` は `php`
   (拒否)として扱われ、`.php` ファイルが受理されることは決してない。

3. **保存先の封じ込めチェック(多層防御)**: 書き込み前に、保存先
   ディレクトリの `realpath()` と `realpath($fileupload_realpath)` が完全に
   一致するか比較し、一致しなければ `die('Invalid upload destination.')` で
   中止する。

4. 既存の `MAX_FILE_SIZE` 隠しフィールドと PHP のサイズ処理は変更しない。
   2 つの `move_uploaded_file()` 箇所と `rename()` 経路はすべてサニタイズ
   済みの `$img1_name` / `$imgalt` / `$pathtofile` を使うため、いずれも
   保護される。

5. 誤解を招くソースコメント `//Path to your images directory, chmod the dir
   to 777` を緩和した。アップロードディレクトリは Web サーバーのユーザーが
   書き込めればよく(例 0755/0775)、`chmod 777` は不要で避けるべきである
   旨をコメントで記した。コメントのみで、挙動は変更しない。

### Notes / 注記

EN: `move_uploaded_file()` already only accepts a path that PHP itself
recorded as a valid HTTP upload, but it does not constrain the *destination*;
the destination is exactly what this fix sanitises and contains. MIME
verification by file content (as the audit also suggested) was deliberately
left out of scope -- the extension whitelist plus name sanitisation is the
load-bearing control here, and content sniffing on a 2003-era code path would
add fragility without removing the RCE risk that the extension check already
closes. `$use_fileupload` stays `0` by default; the fix is a hardening of the
code regardless of that switch.

JA: `move_uploaded_file()` は PHP 自身が正当な HTTP アップロードとして記録
したパスしか受け付けないが、*保存先*は制約しない。保存先こそが本修正で
サニタイズ・封じ込めする対象である。監査が併せて提案したファイル内容に
よる MIME 検証は意図的にスコープ外とした — ここで効くのは拡張子ホワイト
リストと名前サニタイズであり、2003 年頃のコード経路で内容判定を行うと、
拡張子チェックが既に塞いでいる RCE リスクを減らさないまま脆さを増やす。
`$use_fileupload` は既定の `0` のまま。本修正はそのスイッチに関わらず
コードを堅牢化するものである。

### Verification / 検証

EN: `php -l wp-admin/b2upload.php` passes with 0 syntax errors.
`composer phpcs` reports 0 violations (41 files). `composer phpstan
--memory-limit=1G` reports 0 errors (the default 128 MB OOMs on this
repository -- a pre-existing, unrelated constraint). Functional test against
the Docker environment: `b2config.php` was temporarily set to
`$use_fileupload = 1` with `$fileupload_realpath` pointed at a throwaway
directory (a local-only change, reverted afterwards and not committed), the
web container restarted to clear OPcache, and admin logged in. Three uploads
were submitted with curl multipart:
(a) a normal `test.gif` -- accepted, landed in the upload directory;
(b) a file named `../../../../tmp/escaped.gif` -- the traversal was
neutralised, `basename()` reduced it to `escaped.gif` and it landed inside
the upload directory; the filesystem confirmed nothing was written outside
(`/tmp/escaped.gif`, `/escaped.gif`, `/var/www/escaped.gif` all absent);
(c) `shell.php` -- rejected with "File shell.php of type .php is not allowed.",
no file written. After the test `b2config.php` was reverted
(`git checkout`) and the temp directory removed. The front end (`/`) and the
admin (`b2edit.php`) load with HTTP 200 and 0 PHP warnings/fatals.

JA: `php -l wp-admin/b2upload.php` は構文エラー 0 で通る。`composer phpcs`
は違反 0 件(41 ファイル)。`composer phpstan --memory-limit=1G` はエラー
0 件(既定の 128 MB はこのリポジトリで OOM する — 既知の無関係な制約)。
Docker 環境での機能テスト: `b2config.php` を一時的に `$use_fileupload = 1`
にし、`$fileupload_realpath` を使い捨てディレクトリに向け(ローカル限定の
変更で、後で元に戻しコミットしない)、OPcache を消すため web コンテナを
再起動し、admin でログインした。curl のマルチパートで 3 件のアップロードを
送信した:
(a) 通常の `test.gif` -- 受理され、アップロードディレクトリに保存された;
(b) `../../../../tmp/escaped.gif` という名前のファイル -- トラバーサルは
無効化され、`basename()` により `escaped.gif` に縮約されてアップロード
ディレクトリ内に保存された。ファイルシステム上、外部
(`/tmp/escaped.gif`・`/escaped.gif`・`/var/www/escaped.gif`)には何も
書き込まれていないことを確認した;
(c) `shell.php` -- "File shell.php of type .php is not allowed." で拒否され、
ファイルは書き込まれなかった。テスト後、`b2config.php` を
(`git checkout` で)元に戻し、一時ディレクトリを削除した。フロントエンド
(`/`)と管理画面(`b2edit.php`)は HTTP 200・PHP 警告/fatal 0 で表示される。

---

## Issue #37: Information disclosure & misc / 情報漏洩・その他

EN: A security audit (Issue #37) found three remaining lower-severity issues.
The original finding also listed mail-header injection in `b2comments.post.php`
and the `X-Mailer` version header; those code paths were deleted entirely by
Issue #44 (comment / trackback / XML-RPC removal) and no longer exist, so this
fix covers only what remains:

1. **SQL error disclosure** -- `wp-admin/linkmanager.php` and
   `wp-admin/b2edit.showposts.php` printed `mysqli_error()` -- and, in
   `linkmanager.php`, the full SQL string (`"sql=[$sql]"`) -- straight to the
   browser when a query failed. This leaks the database schema, table/column
   names and the exact queries to any visitor who can trigger an error.

2. **Version disclosure** -- the WordPress version was exposed publicly:
   `index.php` carried `<meta name="generator" content="WordPress .7" />`, and
   the three feeds (`b2rss.php`, `b2rss2.php`, `b2rdf.php`) echoed
   `$b2_version` into `generator` comments and `admin:generatorAgent` tags
   (`?v=0.71`). An exact version helps an attacker target known 0.71
   vulnerabilities.

3. **`register_globals`-style `$$var` assignment** -- the entry scripts
   populated variables with the variable-variable form
   `$$b2var = $_GET/$_POST[...]` inside a loop. The name list (`$b2varstoreset`)
   is a fixed whitelist, so this was never arbitrary variable injection, but
   `$$var` is a fragile, register_globals-era construct that obscures intent.

JA: セキュリティ監査(Issue #37)で、深刻度が中程度の残り 3 件の問題が
判明した。元の指摘には `b2comments.post.php` のメールヘッダインジェクション
と `X-Mailer` バージョンヘッダも含まれていたが、それらのコード経路は
Issue #44(コメント・トラックバック・XML-RPC の撤去)で完全に削除され
最早存在しないため、本修正は残った項目のみを扱う:

1. **SQL エラーの露出** -- `wp-admin/linkmanager.php` と
   `wp-admin/b2edit.showposts.php` は、クエリ失敗時に `mysqli_error()` を、
   さらに `linkmanager.php` では SQL 全文(`"sql=[$sql]"`)をそのまま
   ブラウザに出力していた。これはデータベースのスキーマ、テーブル/カラム名、
   クエリそのものを、エラーを起こせる訪問者に漏らす。

2. **バージョン露出** -- WordPress のバージョンが公開出力に出ていた:
   `index.php` は `<meta name="generator" content="WordPress .7" />` を
   持ち、3 つのフィード(`b2rss.php`・`b2rss2.php`・`b2rdf.php`)は
   `$b2_version` を `generator` コメントと `admin:generatorAgent` タグ
   (`?v=0.71`)に出力していた。正確なバージョンは、既知の 0.71 脆弱性を
   攻撃者が狙いやすくする。

3. **`register_globals` 風の `$$var` 代入** -- エントリスクリプトは、ループ内で
   可変変数 `$$b2var = $_GET/$_POST[...]` の形で変数を生成していた。名前
   リスト(`$b2varstoreset`)は固定のホワイトリストなので任意の変数注入では
   ないが、`$$var` は register_globals 時代の脆い構文で意図を分かりにくくする。

### Changes / 変更内容

EN:

**A. SQL error disclosure.**

- `wp-admin/linkmanager.php`: a small helper `linkmanager_db_error($dbh, $sql)`
  was added. It writes the technical detail
  (`mysqli_error()` + the query text) to the server error log via
  `error_log()` and then `die('A database error occurred.')`. All nine
  `... or die("Couldn't execute query." ...)` sites -- including the four that
  echoed `"sql=[$sql]"` -- now call this helper, so nothing query- or
  schema-specific reaches the page; the detail is still available to the
  operator in the server log.
- `wp-admin/b2edit.showposts.php`: the three
  `mysqli_query(...) or die($arc_sql."<br />".mysqli_error(...))` sites
  (the monthly / daily / weekly archive dropdowns) were rewritten to test the
  result, `error_log()` the detail server-side and `die('A database error
  occurred.')` for the visitor.

**B. Version disclosure.**

- `index.php`: the `generator` meta tag changed from
  `content="WordPress .7"` to a bare `content="WordPress"` -- the tag is
  kept (it is harmless and conventional) but no longer carries a version.
- `b2rss.php`, `b2rss2.php`, `b2rdf.php`: the `generator="wordpress/<version>"`
  HTML comment became a bare `generator="wordpress"`, and in `b2rss2.php` /
  `b2rdf.php` the `admin:generatorAgent` resource changed from
  `http://wordpress.org/?v=<version>` to `http://wordpress.org/`. The feeds
  remain well-formed XML.
- `$b2_version` is **kept defined** in `b2-include/b2vars.php` -- other code
  (e.g. the admin footer `wp-admin/b2footer.php`) still uses it internally.
  Only the *public* printing of the value was removed; that file was not
  touched (it holds Latin-1 bytes and must be edited byte-safely).

**C. `register_globals`-style `$$var` assignment.**

- The `$$b2var` assignment loop appears in eleven entry scripts:
  `blog.header.php`, `b2login.php`, `b2register.php`, and the admin scripts
  `wp-admin/b2header.php`, `b2edit.php`, `b2categories.php`, `b2template.php`,
  `b2options.php`, `b2profile.php`, `b2team.php`, `linkmanager.php`,
  `linkcategories.php`. Every loop runs at **global scope** (none is inside a
  function), so `$$b2var` and `$GLOBALS[$b2var]` are exactly equivalent there.
  Each `$$b2var` read/write was replaced with the explicit
  `$GLOBALS[$b2var]` form (including the `isset()` test), and a bilingual
  comment was added before each loop explaining the change. This is a
  behaviour-preserving readability/robustness hardening: it makes explicit
  that the script populates a known, whitelisted set of globals from
  `$_GET`/`$_POST`, and removes the fragile variable-variable construct
  without changing what runs on the front end.

### Decision on item C / 項目 C の判断

EN: The audit asked to weigh hardening item C versus leaving it. The chosen
option is to **harden it**, because the change is provably behaviour-neutral:
every `$$b2var` loop runs at file/global scope, so `$GLOBALS[$b2var]` produces
the identical variable. No `$$var` loop lives inside a function, so there is no
scope difference to break. The whitelist (`$b2varstoreset`) and all downstream
logic are untouched, and `blog.header.php` -- which runs on every front-end
page -- was verified unchanged in behaviour. Switching to `$GLOBALS[...]` is the
explicit form recommended in the audit and removes the register_globals-era
idiom without risk.

JA: 監査は項目 C を堅牢化するか、そのまま残すかの判断を求めていた。選んだ
方針は **堅牢化する** ことである。変更が挙動中立であることを証明できるため
だ: すべての `$$b2var` ループはファイル/グローバルスコープで動くので、
`$GLOBALS[$b2var]` は同一の変数を生成する。関数内で動く `$$var` ループは無く、
スコープの差異で壊れる箇所が無い。ホワイトリスト(`$b2varstoreset`)と下流の
ロジックはすべて無変更で、毎ページ動く `blog.header.php` も挙動不変であること
を確認した。`$GLOBALS[...]` への切り替えは監査が推奨する明示形であり、
register_globals 時代の語法をリスク無く除去できる。

JA(A): **SQL エラーの露出。** `wp-admin/linkmanager.php` には小さなヘルパ
`linkmanager_db_error($dbh, $sql)` を追加した。技術的詳細(`mysqli_error()`
とクエリ本文)を `error_log()` でサーバのエラーログに書き、その後
`die('A database error occurred.')` する。`"sql=[$sql]"` を出力していた 4 箇所
を含む 9 箇所すべての `... or die("Couldn't execute query." ...)` がこの
ヘルパを呼ぶようになり、クエリやスキーマに固有の情報はページに出ない。
詳細は運用者向けにサーバログに残る。`wp-admin/b2edit.showposts.php` の 3 箇所
(月別/日別/週別アーカイブのドロップダウン)は、結果を判定し詳細を
`error_log()` でサーバ側に記録し、訪問者には `die('A database error
occurred.')` を表示するよう書き換えた。

JA(B): **バージョン露出。** `index.php` の `generator` meta タグは
`content="WordPress .7"` から、バージョンを持たない `content="WordPress"`
に変更した(タグ自体は無害で慣例的なので残す)。`b2rss.php`・`b2rss2.php`・
`b2rdf.php` の `generator="wordpress/<version>"` という HTML コメントは
`generator="wordpress"` にし、`b2rss2.php` / `b2rdf.php` の
`admin:generatorAgent` リソースを `http://wordpress.org/?v=<version>` から
`http://wordpress.org/` に変更した。フィードは整形式 XML のまま。
`$b2_version` は `b2-include/b2vars.php` に**定義したまま残す** -- 管理画面
フッタ `wp-admin/b2footer.php` など他のコードが内部で使うため。値の*公開*
出力のみを除去した。`b2vars.php` は Latin-1 バイトを含むため触れていない。

### Verification / 検証

EN: `php -l` passes with 0 syntax errors on all 17 changed files.
`composer phpcs` reports 0 violations (41 files). `composer phpstan
--memory-limit=1G` reports 0 errors (the default 128 MB OOMs on this
repository -- a pre-existing, unrelated constraint). Functional test against
the Docker environment on the `issue-37-info-disclosure` branch, web container
restarted to clear OPcache: the front end (`/`, requested twice) returns HTTP
200 with 0 PHP warnings/fatals, the `generator` meta now reads
`content="WordPress"` with no version, and all 20 posts still display. The
three feeds (`b2rss2.php`, `b2rss.php`, `b2rdf.php`) return HTTP 200, pass
`xmllint` as well-formed XML, and show no version in their generator output.
Admin login succeeds (HTTP 302, auth cookies set), confirming the
`$GLOBALS[...]`-driven `$action` dispatch in `b2login.php` still works;
`wp-admin/linkmanager.php`, `b2edit.php`, the `showposts` archive view,
`b2categories.php`, `b2team.php`, `b2options.php`, `b2profile.php`,
`b2template.php`, `linkcategories.php` and the `linkedit` action all return
HTTP 200 with 0 PHP warnings/fatals.

JA: `php -l` は変更した 17 ファイルすべてで構文エラー 0 で通る。`composer
phpcs` は違反 0 件(41 ファイル)。`composer phpstan --memory-limit=1G` は
エラー 0 件(既定の 128 MB はこのリポジトリで OOM する — 既知の無関係な
制約)。`issue-37-info-disclosure` ブランチで OPcache を消すため web コンテナ
を再起動し、Docker 環境で機能テストを実施した: フロントエンド(`/`、2 回
取得)は HTTP 200・PHP 警告/fatal 0 で、`generator` meta は
`content="WordPress"` でバージョン無し、20 件の投稿はすべて表示される。
3 つのフィード(`b2rss2.php`・`b2rss.php`・`b2rdf.php`)は HTTP 200 で、
`xmllint` で整形式 XML として通り、generator 出力にバージョンが出ない。
管理者ログインは成功(HTTP 302、認証クッキー設定)し、`b2login.php` の
`$GLOBALS[...]` 駆動の `$action` ディスパッチが動作することを確認した。
`wp-admin/linkmanager.php`・`b2edit.php`・`showposts` のアーカイブ表示・
`b2categories.php`・`b2team.php`・`b2options.php`・`b2profile.php`・
`b2template.php`・`linkcategories.php` および `linkedit` アクションは
すべて HTTP 200・PHP 警告/fatal 0 で表示される。

## Issue #49: Raise phpcs to the WordPress Coding Standard / phpcs を WordPress コーディング規約に引き上げる

EN: phpcs previously ran only `PHPCompatibility`. Issue #49 adds the official
**WordPress Coding Standards** (`wp-coding-standards/wpcs`) and curates it down
to a passing `WordPress-Core` subset, so phpcs now also enforces the WordPress
code style. The full WordPress-Core standard reported about 1,043 violations on
this 2003-era codebase. They were addressed in three steps:

1. **Auto-format** — `phpcbf` fixed **15,081** whitespace/brace/spacing
   violations automatically.
2. **Manual fixes** — the mechanical, behaviour-preserving remainder was fixed
   by hand (see the table below).
3. **Curated ruleset** — sniffs whose only "fix" would be renaming public
   identifiers/files, rewriting SQL to prepared statements, or changing runtime
   behaviour were excluded in `phpcs.xml.dist`, each with a bilingual comment.

EN: After all three steps, `composer phpcs` reports **0 errors and 0 warnings**.

JA: phpcs はこれまで `PHPCompatibility` のみを実行していた。Issue #49 で公式の
**WordPress Coding Standards**(`wp-coding-standards/wpcs`)を追加し、合格する
`WordPress-Core` のサブセットに絞り込んだ。これにより phpcs は WordPress の
コードスタイルも検査するようになった。WordPress-Core 標準は 2003 年当時の本
コードベースに対し約 1,043 件の違反を報告した。これらを 3 段階で対応した:

1. **自動整形** — `phpcbf` が空白・波括弧・スペースの違反 **15,081** 件を自動修正。
2. **手動修正** — 機械的で挙動を変えない残りを手作業で修正(下表)。
3. **ルールセットの精選** — 唯一の「修正」が公開識別子・ファイル名の改名、
   prepared statement への SQL 書き換え、または実行時挙動の変更となる sniff は
   `phpcs.xml.dist` で除外し、それぞれに英日のコメントを付した。

JA: 3 段階すべての後、`composer phpcs` は **エラー 0 件・警告 0 件** を報告する。

EN: As a follow-up within this Issue, the `PHPCompatibility` standard (and the
`phpcompatibility/php-compatibility` dev dependency) were removed from the phpcs
configuration: it had already reached 0 violations and the PHP 8.3 migration is
complete, so phpcs now runs the `WordPress-Core` standard only.

JA: 本 Issue の追加対応として、`PHPCompatibility` 標準(および
`phpcompatibility/php-compatibility` 開発依存)を phpcs 設定から除去した。
すでに 0 件に到達しており PHP 8.3 移行も完了しているため、phpcs は現在
`WordPress-Core` 標準のみを実行する。

### Manual fixes / 手動修正

| Sniff | Count | Fix / 修正 |
|---|---|---|
| `WordPress.PHP.YodaConditions.NotYoda` | 232 | rewrote each `$var == literal` comparison to Yoda form `literal == $var` (behaviour-identical) / 各 `$var == literal` 比較を Yoda 形式 `literal == $var` に書き換え(挙動は同一) |
| `PSR2.Classes.PropertyDeclaration` (`VarUsed` / `ScopeMissing`) | 24 | replaced the `var` keyword on `wpdb` properties with explicit `public` / `wpdb` のプロパティの `var` を明示的な `public` に置換 |
| `Squiz.Scope.MethodScope.Missing` | 13 | added explicit `public` visibility to every `wpdb` method / `wpdb` の各メソッドに明示的な `public` 可視性を付与 |
| `PSR2.ControlStructures.SwitchDeclaration` | 14 | removed the `{ }` blocks wrapping `case`/`default` bodies / `case`/`default` 本体を包む `{ }` ブロックを除去 |
| `Squiz.PHP.DisallowMultipleAssignments.FoundInControlStructure` | 9 | moved each assignment used inside an `if ( ... )` condition to its own statement / `if ( ... )` 条件内の代入を独立した文に移動 |
| `Squiz.ControlStructures.ControlSignature.SpaceAfterCloseBrace` | 4 | joined `elseif`/`else` to the preceding closing brace / `elseif`/`else` を直前の閉じ波括弧に連結 |

### Excluded sniffs / 除外した sniff

EN: These sniffs are excluded inside the `<rule ref="WordPress-Core">` block of
`phpcs.xml.dist`. Each exclusion would require a rename / SQL rewrite /
behaviour change that is out of scope for a code-style pass.

JA: 以下の sniff は `phpcs.xml.dist` の `<rule ref="WordPress-Core">` ブロック内
で除外する。いずれも改名・SQL 書き換え・挙動変更が必要で、コードスタイル対応の
範囲外である。

| Sniff | Why excluded / 除外理由 |
|---|---|
| `WordPress.NamingConventions.ValidVariableName` / `ValidFunctionName` | snake_case renaming would rewrite the 2003-era b2/WordPress API (`the_ID()`, `balanceTags()`, …) / snake_case 改名は 2003 年当時の b2/WordPress API を書き換える |
| `PEAR.NamingConventions.ValidClassName` | wants `class wpdb` renamed to `Wpdb`; `wpdb` is a public API class / `class wpdb` を `Wpdb` に改名要求。`wpdb` は公開 API クラス |
| `Universal.NamingConventions.NoReservedKeywordParameterNames` | renaming a parameter changes the public function signature / 引数の改名は公開関数のシグネチャを変える |
| `WordPress.Files.FileName` | renaming files ripples through every include/require and link / ファイル名の改名は全 include/require とリンクに波及 |
| `WordPress.DB.PreparedSQL` | prepared statements; Issue #31 already hardened SQL with `(int)` casts / prepared statement。Issue #31 で `(int)` キャストにより SQL は堅牢化済み |
| `WordPress.DB.RestrictedFunctions` | "use `$wpdb` not `mysqli_*`"; WordPress 0.71 IS the data layer and calls mysqli by design / 「`mysqli_*` でなく `$wpdb`」だが 0.71 はデータ層そのもので設計上 mysqli を直接呼ぶ |
| `Universal.Operators.StrictComparisons` | `==`→`===` changes comparison strictness / `==`→`===` は比較の厳密さを変える |
| `WordPress.PHP.StrictInArray` | adding `true` to `in_array()` changes comparison strictness / `in_array()` への `true` 追加は比較の厳密さを変える |
| `WordPress.DateTime.RestrictedFunctions` | `date()`→`gmdate()` is a timezone behaviour change / `date()`→`gmdate()` はタイムゾーンの挙動変更 |
| `WordPress.PHP.NoSilencedErrors` | removing `@` changes runtime warning behaviour / `@` の除去は実行時の警告挙動を変える |
| `Generic.CodeAnalysis.AssignmentInCondition` | the `while ( $row = mysqli_fetch_*() )` fetch-loop idiom cannot be silenced with extra parentheses, and restructuring every loop risks infinite loops; the safe `if ( ... )` cases were fixed instead / `while ( $row = mysqli_fetch_*() )` の取得ループ慣用句は括弧追加では抑止できず、全ループ再構成は無限ループのリスク。安全な `if ( ... )` の事例は修正済み |

### Verification / 検証

EN: `vendor/bin/phpcs` reports 0 errors and 0 warnings; `php -l` passes on all
30 changed files; `composer phpstan --memory-limit=1G` still reports 0 errors
(the Yoda rewrites did not regress it). In Docker (web container restarted to
clear OPcache) the front end (`/`, `?cat=2`, `?p=1`) returns HTTP 200 with 0 PHP
warnings/fatals and still renders 20 posts; admin login succeeds (HTTP 302) and
`wp-admin/b2edit.php`, `linkmanager.php` and `linkcategories.php` load with 0
warnings/fatals.

JA: `vendor/bin/phpcs` はエラー 0 件・警告 0 件。`php -l` は変更した 30 ファイル
すべてで通る。`composer phpstan --memory-limit=1G` はエラー 0 件のまま(Yoda
の書き換えで退行なし)。Docker(OPcache を消すため web コンテナを再起動)で
フロントエンド(`/`・`?cat=2`・`?p=1`)は HTTP 200・PHP 警告/fatal 0 で 20 件の
投稿を表示し、管理者ログインは成功(HTTP 302)、`wp-admin/b2edit.php`・
`linkmanager.php`・`linkcategories.php` は警告/fatal 0 で表示される。

---

## Issue #53: Add PHPUnit and a starter test suite / PHPUnit とテストスイートの土台を追加

EN: WordPress 0.71 shipped with no tests. Issue #53 adds PHPUnit (`^12.5`) as a
dev dependency and a test foundation: `phpunit.xml.dist`, a `tests/` directory
with a bootstrap, a `composer test` script, and a starter suite.

JA: WordPress 0.71 にはテストが無かった。Issue #53 で PHPUnit(`^12.5`)を
dev 依存として追加し、テストの土台を整える: `phpunit.xml.dist`、ブートストラップ
付きの `tests/` ディレクトリ、`composer test` スクリプト、初期スイート。

### Scope / 範囲

EN: WordPress 0.71 is 2003-era procedural code with no test seams -- most of it
depends on global database state or echoes HTML. The starter suite targets the
functions that are unit-testable in isolation: pure string / format helpers in
`b2-include/b2functions.php` and the CSRF token helper added in Issue #33.
`b2functions.php` loads standalone with no database connection, so
`tests/bootstrap.php` simply requires it (after setting a dummy
`$_SERVER['HTTP_USER_AGENT']`, which `wptexturize()` reads).

JA: WordPress 0.71 は 2003 年当時の手続き型コードでテストの接合点が無い
(多くがグローバルな DB 状態に依存、または HTML を直接出力する)。初期スイートは
単独で単体テスト可能な関数を対象とする: `b2-include/b2functions.php` の純粋な
文字列/整形ヘルパーと、Issue #33 で追加した CSRF トークンヘルパー。
`b2functions.php` は DB 接続なしで単独読み込みできるため、`tests/bootstrap.php`
はそれを require するだけ(`wptexturize()` が参照するダミーの
`$_SERVER['HTTP_USER_AGENT']` を設定したうえで)。

### Tests / テスト

| File | Covers / 対象 |
|---|---|
| `tests/HelpersTest.php` | `zeroise()`, `is_email()`, `mysql2date()` |
| `tests/TextFormattingTest.php` | `wptexturize()`, `balanceTags()` |
| `tests/SecurityTest.php` | `b2_csrf_token()` |

### Verification / 検証

EN: `composer test` runs PHPUnit -- **12 tests, 18 assertions, all passing**.
phpcs and PHPStan are unchanged: both analyse `src/` only, and `tests/` is new
code outside their scope.

JA: `composer test` で PHPUnit が走り、**12 テスト・18 アサーション・全合格**。
phpcs と PHPStan は不変: 両者は `src/` のみを解析し、`tests/` はその対象外の
新規コードである。

## Issue #59: Expand PHPUnit coverage toward all functions and classes / PHPUnit の網羅性を高める

EN: The Issue #53 starter suite covered five pure helpers and the CSRF token
helper (12 tests). Issue #59 substantially expands `composer test` to cover the
unit-testable functions and the pure classes -- including the database-dependent
helpers, made testable by mocking the global database state.

JA: Issue #53 の初期スイートは純粋なヘルパー 5 つと CSRF トークンヘルパーを
網羅していた(12 テスト)。Issue #59 では `composer test` を大幅に拡充し、
単体テスト可能な関数と純粋クラス -- グローバルな DB 状態をモック化して
テスト可能にした DB 依存ヘルパーを含む -- を網羅する。

### Mocking the global state / グローバル状態のモック化

EN: Many legacy helpers read `global $wpdb` and the table-name globals
(`$tableposts`, `$tableusers`, ...). Two test-support classes make them
unit-testable without a live MySQL server:

- `tests/Support/FakeWpdb.php` -- a fake `$wpdb`. Its `get_row()` /
  `get_results()` / `get_var()` / `query()` return values the test
  pre-configures, and it records every SQL string it was given so the test can
  assert on the query (e.g. that an id was cast to `int`).
- `tests/Support/DatabaseTestCase.php` -- a shared base `TestCase` that, in
  `setUp()`, installs a fresh `FakeWpdb` as the `$wpdb` global, sets the
  table-name globals as fixtures, and disables the in-process result caches;
  `tearDown()` removes them so tests stay isolated.

`tests/bootstrap.php` now also loads `b2template.functions.php`, `b2vars.php`
(required for the `convert_*()` helpers' translation tables) and `textile.php`.
`b2vars.php` is a Latin-1 file loaded inside a closure that promotes its
translation tables into `$GLOBALS`; the file itself is never modified.

JA: 多くのレガシーヘルパーは `global $wpdb` とテーブル名グローバル
(`$tableposts`・`$tableusers` ほか)を読む。2 つのテスト補助クラスにより、
実 MySQL サーバー無しで単体テスト可能にする:

- `tests/Support/FakeWpdb.php` -- 偽の `$wpdb`。その `get_row()` /
  `get_results()` / `get_var()` / `query()` はテストが事前設定した値を返し、
  渡された SQL 文字列をすべて記録するため、テストはクエリ内容(例: id が
  `int` にキャストされたか)を検証できる。
- `tests/Support/DatabaseTestCase.php` -- 共有ベース `TestCase`。`setUp()` で
  新しい `FakeWpdb` を `$wpdb` グローバルとして差し込み、テーブル名グローバルを
  フィクスチャとして設定し、プロセス内の結果キャッシュを無効化する。
  `tearDown()` でそれらを除去しテストを分離する。

`tests/bootstrap.php` は `b2template.functions.php`・`b2vars.php`
(`convert_*()` ヘルパーの変換テーブルに必要)・`textile.php` も読み込むように
した。`b2vars.php` は Latin-1 ファイルで、変換テーブルを `$GLOBALS` へ昇格
させるクロージャ内で読み込む。ファイル自体は一切変更しない。

### Tests / テスト

| File | Covers / 対象 |
|---|---|
| `tests/HelpersTest.php` | `zeroise()`, `is_email()`, `mysql2date()` |
| `tests/TextFormattingTest.php` | `wptexturize()`, `balanceTags()` |
| `tests/SecurityTest.php` | `b2_csrf_token()`, `b2_csrf_field()` |
| `tests/FormattingFunctionsTest.php` | `wpautop()`, `autobrize()`, `unautobrize()`, `backslashit()`, `format_to_edit()`, `format_to_post()`, `popuplinks()`, `make_clickable()`, `strip_all_but_one_link()`, `make_url_footnote()`, `convert_bbcode()`, `convert_bbcode_email()`, `convert_gmcode()`, `convert_smilies()`, `convert_chars()`, `antispambot()` |
| `tests/DateAndMiscHelpersTest.php` | `date_i18n()`, `mysql2date()`, `get_weekstartend()`, `timer_start()`, `timer_stop()`, `addslashes_gpc()`, `wptexturize()` |
| `tests/TextileTest.php` | `textile()` (Textile 1.0 formatter), `callback_url()`, `linkit()`, `cmap()`, `encode_high()`, `decode_high()` |
| `tests/TemplateFunctionsTest.php` | `get_bloginfo()`, `get_the_title()`, `get_the_content()`, `get_the_excerpt()`, `single_month_title()`, `is_new_day()`, `apply_filters()`, `add_filter()` |
| `tests/DatabaseDependentFunctionsTest.php` | `get_postdata()`, `get_postdata2()`, `get_userdata()`, `get_userdata2()`, `get_userdatabylogin()`, `get_userid()`, `get_usernumposts()`, `user_pass_ok()`, `get_settings()`, `get_the_category()`, `get_the_category_by_ID()` |

EN: Page-level scripts (`index.php`, `wp-admin/b2edit.php`, ...) and the `wpdb`
class against a live database are intentionally **out of scope** -- they are
covered by the E2E suite (Issue #60).

JA: ページレベルのスクリプト(`index.php`・`wp-admin/b2edit.php` ほか)と、実
データベースに対する `wpdb` クラスは意図的に**範囲外** -- E2E スイート
(Issue #60)で扱う。

### Bug noticed (not fixed) / 発見したバグ(未修正)

EN: `user_pass_ok()` (`b2functions.php`) reads `$userdata['user_pass']` as an
**array**, but its uncached path calls `get_userdatabylogin()`, which returns an
**object** from `$wpdb->get_row()`. On the uncached path this raises
"Cannot use object of type stdClass as array". The function only works on the
cache path, where `cache_userdata` holds arrays. Per the Issue #59 scope, the
tests document this and exercise the working cache path; `src/` is not changed.

JA: `user_pass_ok()`(`b2functions.php`)は `$userdata['user_pass']` を
**配列**として読むが、非キャッシュ経路は `get_userdatabylogin()` を呼び、
これは `$wpdb->get_row()` から**オブジェクト**を返す。非キャッシュ経路では
「stdClass オブジェクトを配列として使えない」エラーになる。本関数は
`cache_userdata` が配列を保持するキャッシュ経路でしか動かない。Issue #59 の
範囲に従い、テストはこれを記録し、動作するキャッシュ経路を検証する。`src/` は
変更しない。

### Verification / 検証

EN: `composer test` runs PHPUnit -- **95 tests, 150 assertions, all passing**
(up from 12 tests / 18 assertions). `php -l` reports 0 syntax errors on every
new test file. phpcs and PHPStan are unchanged: both analyse `src/` only, which
this Issue did not touch, and `tests/` is outside their scope.

JA: `composer test` で PHPUnit が走り、**95 テスト・150 アサーション・全合格**
(12 テスト・18 アサーションから増加)。`php -l` は新規テストファイルすべてで
構文エラー 0 件。phpcs と PHPStan は不変: 両者は本 Issue が触れていない `src/`
のみを解析し、`tests/` はその対象外である。

## Issue #60: Introduce an end-to-end (E2E) test suite / E2E テストスイートを導入

EN: The PHPUnit suite (Issue #53) unit-tests pure helpers, but nothing
exercised the 2003-era PHP **end to end** -- a real HTTP request hitting
Apache + PHP 8.3 + MySQL 8 and producing a rendered page. Current WordPress
core uses **Playwright** for its E2E tests, so this Issue adds a Playwright
suite that drives the real admin and front-end pages of the running Docker
blog.

JA: PHPUnit スイート(Issue #53)は純粋なヘルパーを単体テストするが、2003 年
当時の PHP を**エンドツーエンド**で動かすもの -- Apache + PHP 8.3 + MySQL 8 に
実際の HTTP リクエストを当て、レンダリングされたページを生成すること -- は
無かった。現在の WordPress コアは E2E に **Playwright** を使用しているため、
本 Issue は稼働中の Docker ブログの実際の管理画面・フロントエンドのページを
操作する Playwright スイートを追加する。

### Playwright setup / Playwright のセットアップ

EN: The project had no Node side before this Issue. Added at the repo root:

- `package.json` -- declares `@playwright/test` as the only devDependency and
  the `test:e2e` script (`playwright test`).
- `playwright.config.js` -- `testDir: ./e2e`, baseURL `http://localhost:8080`,
  a single `chromium` project, and sensible timeouts (30 s per test, 10 s for
  actions/assertions, 15 s for navigation). It runs **serially with one
  worker**: the admin specs create and delete rows in the small shared `b2`
  database, so parallel files would race each other.
- `.gitignore` -- `node_modules/`, `test-results/`, `playwright-report/` and
  `/playwright/.cache/` are ignored.

JA: 本 Issue 以前、プロジェクトに Node 側は無かった。リポジトリ直下に追加:

- `package.json` -- 唯一の devDependency として `@playwright/test` を、
  スクリプトとして `test:e2e`(`playwright test`)を宣言する。
- `playwright.config.js` -- `testDir: ./e2e`、baseURL は
  `http://localhost:8080`、`chromium` プロジェクト 1 つ、妥当なタイムアウト
  (テスト 30 秒、アクション/アサーション 10 秒、ナビゲーション 15 秒)。
  **ワーカー 1 つで直列実行**する: 管理画面 spec は小さな共有 `b2` データベース
  の行を作成・削除するため、並列実行ではファイル同士が競合する。
- `.gitignore` -- `node_modules/`・`test-results/`・`playwright-report/`・
  `/playwright/.cache/` を無視する。

### Test-data helpers / テストデータヘルパー

EN: `e2e/helpers/` holds three helper modules:

- `test-data.js` -- seeds posts and categories to a known state and cleans them
  up afterwards. It is deliberately **non-destructive**: every row it creates
  carries an `E2E:` marker prefix in its title / name, and `cleanupE2EData()`
  deletes **only** rows with that marker (the default category, `cat_ID` 1, is
  never deleted). The developer's existing posts and categories are never
  touched, so the suite is safe to re-run. Seeding is done via SQL
  (`docker compose exec -T db mysql ... -e "..."`) because direct SQL is the
  most reliable way to put the small shared `b2` database into a known state.
  `INSERT` and `SELECT LAST_INSERT_ID()` are issued in **one** `mysql -e` call,
  because `LAST_INSERT_ID()` is MySQL-session-scoped and each
  `docker compose exec` is a fresh session.
- `auth.js` -- `loginAsAdmin()` drives the real `b2login.php` form with the
  Docker-environment credentials (`admin` / `password`).
- `assertions.js` -- `expectNoPhpErrors()` asserts a rendered page contains no
  PHP error output (`Fatal error`, `Parse error`, `<b>Warning</b>`,
  `<b>Notice</b>`, `<b>Deprecated</b>`, `Uncaught Error`).

JA: `e2e/helpers/` に 3 つのヘルパーモジュールを置く:

- `test-data.js` -- 投稿・カテゴリを既知の状態に投入し、後で後始末する。
  意図的に**非破壊**である: 作成する行はすべてタイトル/名前に `E2E:` マーカー
  接頭辞を持ち、`cleanupE2EData()` はそのマーカーを持つ行**のみ**を削除する
  (既定カテゴリ `cat_ID` 1 は削除しない)。開発者の既存の投稿・カテゴリには
  一切触れないため、スイートは再実行しても安全である。データ投入は SQL
  (`docker compose exec -T db mysql ... -e "..."`)で行う。レガシーな管理 UI に
  依存せず、小さな共有 `b2` データベースを既知の状態に置く最も確実な方法だから
  である。`INSERT` と `SELECT LAST_INSERT_ID()` は **1 回**の `mysql -e` 呼び
  出しで発行する。`LAST_INSERT_ID()` は MySQL のセッションスコープであり、
  各 `docker compose exec` は別セッションになるためである。
- `auth.js` -- `loginAsAdmin()` が Docker 環境の資格情報(`admin` /
  `password`)で実際の `b2login.php` フォームを操作する。
- `assertions.js` -- `expectNoPhpErrors()` が、レンダリングされたページに PHP の
  エラー出力(`Fatal error`・`Parse error`・`<b>Warning</b>`・`<b>Notice</b>`・
  `<b>Deprecated</b>`・`Uncaught Error`)が無いことを検証する。

### Specs / spec

EN: Two spec files under `e2e/`, **10 tests** in total:

- `admin.spec.js` (3 tests) -- log in to the admin; the full post lifecycle
  (create / edit / delete); category management (add / delete). The specs drive
  the **real** b2/cafelog admin forms and links, so the hidden `_b2csrf` token
  in every POST form and the `_b2csrf` parameter on every delete link are
  handled automatically -- the suite never mints a token by hand. Each
  state-changing step is verified against the database via the helpers.
- `frontend.spec.js` (7 tests) -- the home page, a single post (`?p=`), a
  category page (`?cat=`), a monthly archive (`?m=`), and the three feeds
  (RSS .92 / RDF 1.0 / RSS 2.0). Every page is checked for the absence of PHP
  error output.

JA: `e2e/` 配下に 2 つの spec ファイル、合計 **10 テスト**:

- `admin.spec.js`(3 テスト)-- 管理画面へのログイン、投稿のライフサイクル
  全体(作成/編集/削除)、カテゴリ管理(追加/削除)。spec は**実際の**
  b2/cafelog 管理フォーム・リンクを操作するため、各 POST フォームの隠し
  `_b2csrf` トークンと各削除リンクの `_b2csrf` パラメータは自動的に処理される
  -- スイートが手動でトークンを生成することはない。状態を変更する各ステップは
  ヘルパー経由でデータベースに対して検証する。
- `frontend.spec.js`(7 テスト)-- トップページ、単一投稿(`?p=`)、カテゴリ
  ページ(`?cat=`)、月別アーカイブ(`?m=`)、3 種のフィード(RSS .92 /
  RDF 1.0 / RSS 2.0)。どのページでも PHP エラー出力が無いことを検査する。

### Bug found and fixed / 発見・修正したバグ

EN: The admin post-edit spec immediately caught a genuine PHP 8.3 regression:
`b2edit.php` (`editpost` case) read `$_POST['post_autobr']` directly, but the
edit form `b2edit.form.php` never renders a `post_autobr` field. Under PHP 8.3
this raised `Warning: Undefined array key "post_autobr"`, which in turn caused
a `Cannot modify header information` warning because the warning text was
emitted before the redirect `header()`. Fixed with an `isset()` guard
(`$post_autobr = isset( $_POST['post_autobr'] ) ? intval( ... ) : 0;`), matching
the hardening style of the earlier admin-warning fixes. This is the only `src/`
change in this Issue.

JA: 管理画面の投稿編集 spec が、本物の PHP 8.3 リグレッションを即座に検出した:
`b2edit.php`(`editpost` ケース)は `$_POST['post_autobr']` を直接読んでいたが、
編集フォーム `b2edit.form.php` は `post_autobr` フィールドを出力しない。PHP 8.3
ではこれが `Warning: Undefined array key "post_autobr"` を出し、さらにその警告
テキストがリダイレクトの `header()` より前に出力されたため
`Cannot modify header information` 警告も発生していた。過去の管理画面警告修正の
堅牢化スタイルに合わせ、`isset()` ガード
(`$post_autobr = isset( $_POST['post_autobr'] ) ? intval( ... ) : 0;`)で修正
した。これが本 Issue における唯一の `src/` 変更である。

### Verification / 検証

EN: With the Docker blog running (`docker compose up -d`), `npm run test:e2e`
runs **10 tests, all passing** against the local environment. The suite is
**idempotent**: re-running it leaves no `E2E:`-marked rows behind, and the
developer's original posts and categories remain intact (verified by counting
`E2E:`-marked rows -- 0 -- and total rows -- unchanged -- after two consecutive
runs). PHPUnit, phpcs and PHPStan are unaffected.

JA: Docker ブログを起動した状態(`docker compose up -d`)で `npm run test:e2e`
を実行すると、ローカル環境に対して **10 テスト・全合格**。スイートは**冪等**で
ある: 再実行しても `E2E:` マーカー付きの行は残らず、開発者の元の投稿・カテゴリ
は保持される(連続 2 回実行後に `E2E:` マーカー付き行が 0 件、総数が不変で
あることを確認)。PHPUnit・phpcs・PHPStan には影響しない。

## Issue #71: Add husky + lint-staged pre-commit hooks (phpcs / phpstan) / husky + lint-staged の pre-commit フックを追加

EN: PR #66 merged a phpcs warning into `main` that went unnoticed until a
post-merge check (fixed in PR #69). A git `pre-commit` hook that runs the
static analysis would have caught it at commit time, so one was added.

JA: PR #66 が phpcs 警告に誰も気づかないまま `main` にマージし、マージ後の
チェックで初めて発覚した(PR #69 で修正)。commit 時に静的解析を走らせる git
の `pre-commit` フックがあれば検出できていたため、これを追加した。

### What was added / 追加内容

EN:
- `husky` and `lint-staged` as devDependencies in the root `package.json`
  (the same `package.json` added for the Playwright E2E suite in Issue #60).
- `.husky/pre-commit` -- runs `lint-staged`. It first skips gracefully when
  the dev tooling is not installed (`vendor/bin/phpcs`, `vendor/bin/phpstan`
  or `node_modules/lint-staged` missing -- e.g. a fresh git worktree), so
  commits in such checkouts are not blocked by missing binaries.
- `lint-staged.config.mjs` -- for staged `src/**/*.php` files it runs `phpcs`
  scoped to the staged files, and `phpstan` project-wide. phpstan is run on
  the whole codebase on purpose: it resolves symbols across files, so
  analysing only the staged files in isolation would raise false
  "function/class not found" errors.
- The `composer phpstan` script now passes `--memory-limit=1G`. PHPStan's
  default memory limit OOM-crashes on some machines; the explicit limit makes
  both the script and the hook reliable.

JA:
- ルートの `package.json`(Issue #60 で Playwright E2E スイート用に追加した
  ものと同じ)に `husky` と `lint-staged` を devDependencies として追加。
- `.husky/pre-commit` -- `lint-staged` を実行する。先頭で、開発ツールが未導入
  のとき(`vendor/bin/phpcs`・`vendor/bin/phpstan`・`node_modules/lint-staged`
  のいずれかが無い -- 新規 git worktree など)はグレースフルにスキップし、
  そうした作業場所でバイナリ欠如によりコミットが妨げられないようにする。
- `lint-staged.config.mjs` -- staged な `src/**/*.php` に対し、`phpcs` を
  staged ファイルに限定して実行し、`phpstan` をプロジェクト全体で実行する。
  phpstan を全体で実行するのは意図的である: ファイルをまたいで記号解決する
  ため、staged ファイルだけを単体解析すると誤検出の「関数/クラスが
  見つかりません」エラーが出る。
- `composer phpstan` スクリプトが `--memory-limit=1G` を渡すようにした。
  PHPStan の既定のメモリ上限は環境によって OOM クラッシュするため、明示指定で
  スクリプトとフックの両方を確実に動くようにする。

### Verification / 検証

EN: The hook was exercised with three commits: a file with a phpcs violation
(commit blocked), a phpcs-clean file with an undefined-function call (blocked
by phpstan), and a clean file (commit succeeded). No `src/` runtime code was
changed -- this Issue only adds dev tooling.

JA: フックは 3 つのコミットで検証した: phpcs 違反のあるファイル(コミット
ブロック)、phpcs はクリーンだが未定義関数を呼ぶファイル(phpstan が
ブロック)、クリーンなファイル(コミット成功)。`src/` のランタイムコードは
変更していない -- 本 Issue は開発ツールの追加のみである。

## Issue #64: Remove the unused, buggy user_pass_ok() / 未使用かつ不具合のある user_pass_ok() を削除

EN: `user_pass_ok()` in `b2-include/b2functions.php` ended with
`return ( $user_pass == $userdata['user_pass'] );` -- array access on
`$userdata`, which on the uncached path is a stdClass object returned by
`get_userdatabylogin()` (`$wpdb->get_row()`), raising "Cannot use object of
type stdClass as array" on PHP 8. The bug was found while expanding the
PHPUnit suite (Issue #59) and filed as Issue #64.

The function had no callers anywhere in `src/` -- its only caller was the
XML-RPC server, removed in Issue #44 -- and it still did a plaintext password
comparison rather than `password_verify()` (flagged by Issue #34). Rather than
fix dead, insecure code, the function was removed entirely, together with its
PHPUnit test (`testUserPassOkComparesAgainstTheCachedPassword`, which only
exercised the working cache path). The suite goes from 95 to 94 tests; phpcs
and PHPStan remain at 0.

JA: `b2-include/b2functions.php` の `user_pass_ok()` は末尾が
`return ( $user_pass == $userdata['user_pass'] );` で、`$userdata` への配列
アクセスだった。非キャッシュ経路では `$userdata` は `get_userdatabylogin()`
(`$wpdb->get_row()`)が返す stdClass オブジェクトであり、PHP 8 では
「Cannot use object of type stdClass as array」になる。本バグは PHPUnit
スイート拡充(Issue #59)中に発見し Issue #64 として起票した。

本関数は `src/` のどこからも呼ばれておらず -- 唯一の呼び出し元だった XML-RPC
サーバーは Issue #44 で撤去済み -- かつ `password_verify()` ではなく平文の
パスワード比較のままだった(Issue #34 が指摘)。デッドかつ安全でないコードを
修正するのではなく、関数を専用の PHPUnit テスト
(`testUserPassOkComparesAgainstTheCachedPassword`。動作するキャッシュ経路
のみを検証していた)ごと完全に削除した。スイートは 95 から 94 テストに減少。
phpcs と PHPStan は 0 件のまま。

## Issue #65: Prototype a custom block editor for WordPress 0.71 / WordPress 0.71 向けカスタムブロックエディタを試作する

EN: The Gutenberg investigation (Issue #61 / PR #63,
`docs/gutenberg-investigation.md`) concluded that porting *Gutenberg the
application* to WordPress 0.71 is not feasible, but that a **custom block
editor** built on the `@wordpress/block-editor` *library* with a thin
WordPress-0.71 backend **is** feasible ("policy B"). Issue #65 builds that
prototype: an experimental proof-of-concept, clearly labelled as such, that
does **not** replace `wp-admin/b2edit.php`.

JA: Gutenberg 調査(Issue #61 / PR #63、`docs/gutenberg-investigation.md`)の
結論は、*アプリケーションとしての Gutenberg* を WordPress 0.71 へ移植するのは
実現不可能だが、`@wordpress/block-editor` *ライブラリ* と薄い WordPress 0.71
バックエンドで作る**カスタムブロックエディタ**は実現可能(「方針B」)、という
ものだった。Issue #65 はその試作を作る。明示的に実験的と銘打った概念実証で
あり、`wp-admin/b2edit.php` を置き換える**ものではない**。

### What was added / 追加したもの

EN: Two cooperating parts.

- **`block-editor-prototype/`** (repository root) -- a self-contained React app
  with its **own `package.json`** (it does not touch the repository-root npm
  setup that Issue #60's E2E suite owns). It uses `@wordpress/block-editor`,
  `@wordpress/block-library`, `@wordpress/blocks`, `@wordpress/components`,
  `@wordpress/element` and `@wordpress/keyboard-shortcuts`. Vite bundles React
  and every `@wordpress/*` package **into** one standalone module, so the boot
  page needs no separate WordPress JavaScript runtime. The core *static* blocks
  register themselves client-side via `registerCoreBlocks()`; no server-side
  `register_block_type()` is involved, which is exactly why this works on 0.71.
  `npm run build` writes the bundle to `src/block-editor-assets/`.
- **`src/block-editor-api/`** -- the thin WordPress-0.71 backend, served by the
  Docker blog: `bootstrap.php` (shared bootstrap; reuses `b2config.php` /
  `$wpdb` and 0.71's cookie auth), `load.php` (`GET` a post's `post_content` as
  JSON), `save.php` (`POST` block markup into `b2posts.post_content`) and
  `editor.php` (the boot page that mounts the bundle for a post id).

JA: 協調する 2 つの部分から成る。

- **`block-editor-prototype/`**(リポジトリルート)-- 独自の **`package.json`**
  を持つ自己完結した React アプリ(Issue #60 の E2E スイートが所有する
  リポジトリルートの npm 設定には触れない)。`@wordpress/block-editor`・
  `@wordpress/block-library`・`@wordpress/blocks`・`@wordpress/components`・
  `@wordpress/element`・`@wordpress/keyboard-shortcuts` を使う。Vite は React と
  全 `@wordpress/*` パッケージを 1 つのスタンドアロンモジュールへバンドルする
  ため、起動ページは別の WordPress JavaScript ランタイムを必要としない。標準の
  *静的* ブロックは `registerCoreBlocks()` でクライアント側に自己登録する。
  サーバー側の `register_block_type()` は関与せず、これこそが 0.71 でも動作
  する理由である。`npm run build` はバンドルを `src/block-editor-assets/` へ
  書き出す。
- **`src/block-editor-api/`** -- Docker のブログが配信する薄い WordPress 0.71
  バックエンド: `bootstrap.php`(共通ブートストラップ。`b2config.php` /
  `$wpdb` と 0.71 のクッキー認証を再利用)・`load.php`(投稿の `post_content`
  を JSON で `GET`)・`save.php`(ブロックマークアップを
  `b2posts.post_content` へ `POST`)・`editor.php`(投稿 ID に対しバンドルを
  マウントする起動ページ)。

### How the round trip works / 往復の仕組み

EN: The editor loads a post via `load.php`, runs `parse()` on the
`post_content` to get a block tree, edits it in `@wordpress/block-editor`, runs
`serialize()` to get `<!-- wp:* -->` block markup, and `POST`s it back through
`save.php` into the existing `b2posts.post_content` column. The 0.71 front end
(`index.php?p=N`) keeps rendering the post normally because the `<!-- wp:* -->`
delimiters are HTML comments. A legacy 0.71 post with no block delimiters is
parsed as a single classic ("freeform") block, so existing posts open without
data loss. Post ids are cast with `(int)` and strings escaped with
`wpdb::escape()` (the Issue #31 SQL hardening); `save.php` enforces the same
ownership rule as `b2edit.php`'s `editpost` handler.

JA: エディタは `load.php` 経由で投稿を読み込み、`post_content` に `parse()` を
適用してブロックツリーを得て、`@wordpress/block-editor` で編集し、
`serialize()` で `<!-- wp:* -->` ブロックマークアップを得て、`save.php` 経由で
既存の `b2posts.post_content` カラムへ `POST` で書き戻す。`<!-- wp:* -->`
区切りは HTML コメントであるため、0.71 のフロントエンド(`index.php?p=N`)は
投稿を通常どおり描画し続ける。ブロック区切りの無いレガシーな 0.71 投稿は
1 つのクラシック(freeform)ブロックとして解析されるため、既存の投稿は
データ欠落なく開ける。投稿 ID は `(int)` でキャストし、文字列は
`wpdb::escape()` でエスケープする(Issue #31 の SQL 堅牢化)。`save.php` は
`b2edit.php` の `editpost` ハンドラと同じ所有者規則を適用する。

### What works / what does not / 動作するもの・しないもの

EN: **Works:** loading a 0.71 post into a modern block editor, editing with the
core static blocks (paragraph, heading, list, quote, image, ...), the block
toolbar and inspector, saving block markup back into `post_content`, and the
0.71 front end rendering the saved post unchanged. The full load → edit → save →
front-end round trip was verified end to end against the Docker blog, including
a real-browser test driving the editor UI.

**Does not / limitations:** static blocks only (0.71 has no
`register_block_type()` / PHP `render_callback` for dynamic blocks); some
`@wordpress/block-library` blocks probe REST endpoints such as `wp/v2/types`,
which return **404** because 0.71 has no REST API (the editor degrades
gracefully -- the static blocks and the round trip are unaffected); no autosave,
no revisions, no full editor chrome. It is a decoupled hybrid -- a modern editor
over 2003 storage.

JA: **動作する:** 0.71 の投稿をモダンなブロックエディタへ読み込む、標準の
静的ブロック(段落・見出し・リスト・引用・画像ほか)での編集、ブロック
ツールバーとインスペクタ、ブロックマークアップを `post_content` へ保存し
戻す、0.71 のフロントエンドが保存済み投稿を変更なく描画する。読み込み →
編集 → 保存 → フロントエンドの往復全体を、エディタ UI を操作する実ブラウザ
テストを含め、Docker のブログに対して端から端まで検証した。

**動作しない・制限:** 静的ブロックのみ(0.71 には動的ブロック用の
`register_block_type()` / PHP `render_callback` が無い);一部の
`@wordpress/block-library` ブロックは `wp/v2/types` などの REST
エンドポイントを探りに行き、0.71 に REST API が無いため **404** を返す
(エディタは穏当に劣化する -- 静的ブロックと往復は影響を受けない);
自動保存・リビジョン・完全なエディタ UI なし。結果は疎結合のハイブリッド
-- 2003 年のストレージの上のモダンエディタである。

### Keeping the project green / プロジェクトを緑のまま保つ

EN: `block-editor-prototype/node_modules/` and the build output
`src/block-editor-assets/` are git-ignored (they are artifacts). The prototype
PHP under `src/block-editor-api/` is a clearly-labelled experiment decoupled
from the 2003 b2/cafelog code path, so it is excluded from the project's
`phpcs` (`<exclude-pattern>`) and `phpstan` (`excludePaths`) -- both documented
inline in `phpcs.xml.dist` / `phpstan.neon.dist`. `composer phpcs` (41 files)
and `composer phpstan` stay at 0, and `composer test` is unchanged (94 tests).
The existing blog and pages are untouched.

JA: `block-editor-prototype/node_modules/` とビルド成果物
`src/block-editor-assets/` は git 管理外(成果物のため)。`src/block-editor-api/`
配下の試作 PHP は、2003 年の b2/cafelog のコードパスから切り離した明示的な
実験であるため、プロジェクトの `phpcs`(`<exclude-pattern>`)と `phpstan`
(`excludePaths`)から除外する -- いずれも `phpcs.xml.dist` /
`phpstan.neon.dist` 内に注記済み。`composer phpcs`(41 ファイル)と
`composer phpstan` は 0 件のまま、`composer test` は不変(94 テスト)。
既存のブログとページには手を加えていない。

## Issue #76: Adopt the block editor into src/block-editor / ブロックエディタを src/block-editor へ取り込む

EN: The block editor prototype (Issue #65 / PR #70) was verified working
locally and adopted. Its code had been split across three locations -- the
React app at the repository root (`block-editor-prototype/`), the PHP backend
(`src/block-editor-api/`), and the git-ignored build output
(`src/block-editor-assets/`) -- and was consolidated under a single
`src/block-editor/` directory.

JA: ブロックエディタ試作(Issue #65 / PR #70)はローカルで動作を確認して
取り込んだ。コードはリポジトリ直下の React アプリ(`block-editor-prototype/`)、
PHP バックエンド(`src/block-editor-api/`)、git 管理外のビルド成果物
(`src/block-editor-assets/`)の 3 箇所に分かれていたが、単一の
`src/block-editor/` ディレクトリ配下に集約した。

### New layout / 新しい構成

| Was / 旧 | Now / 新 |
|---|---|
| `block-editor-prototype/` (repo root) | `src/block-editor/app/` |
| `src/block-editor-api/` | `src/block-editor/api/` |
| `src/block-editor-assets/` (git-ignored) | `src/block-editor/assets/` (git-ignored) |

### Path updates / パス更新

EN:
- `api/bootstrap.php`: the `b2config.php` require is now
  `__DIR__ . '/../../b2config.php'` (the file moved one directory level
  deeper). `b2config.php` derives `$abspath` from `$siteurl` and
  `DOCUMENT_ROOT`, not the script location, so nothing else in the backend
  needed to change.
- `api/editor.php`: the asset / manifest URLs point at `../assets/`, and the
  front-end link is `../../index.php`.
- `app/vite.config.js`: the build `outDir` is `../assets`.
- `app/src/main.jsx`: the Vite-dev fallback endpoints point at
  `/src/block-editor/api/`.
- `.gitignore`, `phpcs.xml.dist`, `phpstan.neon.dist`: the ignore / exclude
  entries now cover the whole `src/block-editor/` directory. `api/` stays
  excluded from phpcs / phpstan as prototype code; `app/` and `assets/` are
  JavaScript, not PHP.

JA:
- `api/bootstrap.php`: `b2config.php` の require を
  `__DIR__ . '/../../b2config.php'` に変更(ファイルが 1 階層深くなったため)。
  `b2config.php` は `$abspath` を `$siteurl` と `DOCUMENT_ROOT` から導出し、
  スクリプト位置には依存しないため、バックエンドの他は変更不要だった。
- `api/editor.php`: asset / manifest の URL を `../assets/` に、フロントエンド
  リンクを `../../index.php` に変更。
- `app/vite.config.js`: ビルドの `outDir` を `../assets` に変更。
- `app/src/main.jsx`: Vite dev 用フォールバックのエンドポイントを
  `/src/block-editor/api/` に変更。
- `.gitignore`・`phpcs.xml.dist`・`phpstan.neon.dist`: ignore / 除外設定を
  `src/block-editor/` ディレクトリ全体に対応させた。`api/` は試作コードとして
  phpcs / phpstan の対象外のまま。`app/` と `assets/` は PHP ではなく
  JavaScript。

### Verification / 検証

EN: Rebuilt the React app (`npm run build` -> `src/block-editor/assets/`) and
re-ran the local round trip against the relocated API: `editor.php` serves the
bundle, `load.php` returns JSON (401 without auth, 404 for a missing post), and
a `save.php` round trip stores block markup that the 0.71 front end still
renders. `composer phpcs` / `phpstan` / `test` stay at 0 / 0 / 94. The block
editor is still a clearly-labelled experiment; it does not replace
`wp-admin/b2edit.php`.

JA: React アプリを再ビルドし(`npm run build` -> `src/block-editor/assets/`)、
移転後の API に対してローカルのラウンドトリップを再実行した: `editor.php` は
バンドルを配信し、`load.php` は JSON を返し(無認証時は 401、存在しない投稿は
404)、`save.php` のラウンドトリップはブロックマークアップを保存して 0.71 の
フロントエンドが引き続き描画する。`composer phpcs` / `phpstan` / `test` は
0 / 0 / 94 のまま。ブロックエディタは依然として明示的な実験であり、
`wp-admin/b2edit.php` を置き換えるものではない。

## Issue #79: Build out the block-editor UI / ブロックエディタ UI を拡充する

EN: The block editor at `src/block-editor/` mounted `@wordpress/block-editor`
but was missing standard editing chrome. Issue #79 adds the three pieces of UI
a real block editor needs -- a Document Overview, a settings sidebar and
per-block toolbars -- and extends the JSON backend so the post's status and
category round-trip.

JA: `src/block-editor/` のブロックエディタは `@wordpress/block-editor` を
マウントしていたが、標準的な編集 UI を欠いていた。Issue #79 は本格的な
ブロックエディタに必要な 3 つの UI -- ドキュメント概観・設定サイドバー・
各ブロックのツールバー -- を追加し、投稿のステータスとカテゴリーが往復する
よう JSON バックエンドを拡張する。

### Frontend (`app/src/Editor.jsx`) / フロントエンド

EN:
- **Per-block toolbars.** The component imported `BlockTools` / `BlockToolbar`
  but never rendered the toolbar. With `hasFixedToolbar` set, `<BlockToolbar>`
  is now rendered directly in a fixed bar above the editor body, and a
  `Popover.Slot` is kept so the toolbar's dropdowns (block switcher, Options
  menu) appear. The toolbar shows the controls of the currently selected
  block.
- **Document Overview.** A toggleable left panel hosts the block outline /
  list view. `ListView` is exported under the `__experimentalListView` name in
  `@wordpress/block-editor` 15.19.0, so it is imported with an alias. A
  `BlockBreadcrumb` is pinned beneath the canvas.
- **Settings sidebar.** A *Post* panel with a Status `SelectControl`
  (`publish` / `draft` / `private`, the same enumeration 0.71's
  `b2edit.form.php` offers) and a Category `SelectControl` populated from the
  `b2categories` list; and a *Block* panel that hosts `BlockInspector` for the
  selected block's attributes.

JA:
- **各ブロックのツールバー。** コンポーネントは `BlockTools` /
  `BlockToolbar` を import しながらツールバーを描画していなかった。
  `hasFixedToolbar` を設定したうえで `<BlockToolbar>` をエディタ本体上部の
  固定バーへ直接描画し、ツールバーのドロップダウン(ブロック切替・Options
  メニュー)が出るよう `Popover.Slot` を維持する。ツールバーは現在選択中
  ブロックの操作子を表示する。
- **ドキュメント概観。** ブロックのアウトライン / リストビューを載せた、
  切り替え可能な左パネル。`ListView` は `@wordpress/block-editor` 15.19.0
  では `__experimentalListView` 名で公開されるため、別名で import する。
  キャンバスの下に `BlockBreadcrumb` を固定する。
- **設定サイドバー。** Status の `SelectControl`(`publish` / `draft` /
  `private`、0.71 の `b2edit.form.php` が提供するのと同じ列挙)と
  `b2categories` 一覧で埋めた Category の `SelectControl` を持つ *Post*
  パネル、および選択ブロックの属性を出す `BlockInspector` を載せた *Block*
  パネル。

### Backend (`api/load.php`, `api/save.php`) / バックエンド

EN:
- `load.php`'s response gains `status`, `category` (the single
  `b2posts.post_category` cat_ID) and `categories` -- the whole `b2categories`
  table as `{ id, name }` -- so the sidebar's selectors have their data in the
  initial load. `b2categories` has just two columns (`cat_ID`, `cat_name`),
  confirmed against `wp-admin/wp-install.php`.
- `save.php` accepts `status` and `category`. `status` is validated against a
  fixed whitelist; `category` is `(int)`-cast and verified to exist in
  `b2categories` (via `COUNT(*)`, so 0.71's `wpdb::get_var()` raises no
  undefined-offset warning for a no-match query) before the `UPDATE`. The
  existing cookie auth, the `b2edit.php`-equivalent ownership check and the
  `(int)`-cast / `wpdb::escape()` SQL hardening are unchanged.

JA:
- `load.php` の応答に `status`・`category`(単一の `b2posts.post_category`
  の cat_ID)・`categories`(`b2categories` 全体を `{ id, name }` で)を
  追加し、サイドバーのセレクタが初回読み込みでデータを持つようにする。
  `b2categories` は `cat_ID`・`cat_name` の 2 カラムのみで、
  `wp-admin/wp-install.php` で確認した。
- `save.php` は `status` と `category` を受け取る。`status` は固定ホワイト
  リストで検証し、`category` は `(int)` キャストのうえ `UPDATE` 前に
  `b2categories` に存在するか確認する(`COUNT(*)` を使うため、不一致
  クエリでも 0.71 の `wpdb::get_var()` が未定義オフセット警告を出さない)。
  既存のクッキー認証・`b2edit.php` 相当の所有者チェック・`(int)` キャスト
  / `wpdb::escape()` の SQL 堅牢化は変更しない。

### Verification / 検証

EN: Rebuilt the React app and verified end to end in a headless Chromium
against a throwaway Docker stack (a distinct `be79` Compose project on ports
8081 / 3307, so the user's stack on 8080 / 3306 was untouched). On a freshly
created test post: the block toolbar shows the selected block's controls (the
block switcher + Options for a paragraph), the Document Overview list view
lists the blocks, and the settings sidebar shows the Post panel (Status +
Category selectors, pre-filled from `load.php`) and the Block panel (the
paragraph's Typography / Advanced inspector). A save round trip persisted
`post_status`, `post_category` and the block content to `b2posts`, and the
0.71 front end (`index.php?p=N`) still rendered the post with its category.
`composer phpcs` / `phpstan` / `test` stay at 0 / 0 / 94 -- `src/block-editor/`
remains excluded from phpcs / phpstan as prototype code.

JA: React アプリを再ビルドし、使い捨ての Docker スタック(ポート 8081 /
3307 の独立した `be79` Compose プロジェクト。ユーザーの 8080 / 3306 の
スタックには触れない)に対しヘッドレス Chromium で端から端まで検証した。
新規作成したテスト投稿で: ブロックツールバーは選択ブロックの操作子
(段落ならブロック切替 + Options)を表示し、ドキュメント概観のリスト
ビューはブロックを列挙し、設定サイドバーは Post パネル(`load.php` から
事前入力された Status + Category セレクタ)と Block パネル(段落の
Typography / Advanced インスペクタ)を表示する。保存の往復は
`post_status`・`post_category`・ブロック内容を `b2posts` へ保存し、0.71 の
フロントエンド(`index.php?p=N`)は投稿をカテゴリー付きで引き続き描画した。
`composer phpcs` / `phpstan` / `test` は 0 / 0 / 94 のまま -- `src/block-editor/`
は試作コードとして phpcs / phpstan の対象外のまま。

### Text-selection bug fix / テキスト選択バグの修正

EN: After Issue #79's UI work, a follow-up bug surfaced: selecting text inside
a paragraph block showed **no highlight** in Chromium / Firefox. The text was
selected (typing replaced it; the selection range existed in the DOM) but the
browser painted no visible highlight.

**Root cause.** `@wordpress/block-editor`'s `content.css` hides the native
selection highlight on the block canvas with a deliberate, Safari-only CSS
hack -- a single comma-separated selector list:

```css
_::-webkit-full-page-media, _:future,
:root .block-editor-block-list__layout::selection { background-color: transparent }
```

`_::-webkit-full-page-media` is a pseudo-element only Safari recognises. A
browser that cannot parse one selector of a top-level selector *list* drops
the **entire** rule, so Chromium / Firefox normally discard this rule and keep
the native highlight. Vite's default (esbuild) CSS minifier, however,
"optimises" that rule into **separate** rules -- one selector each. The
standalone `:root .block-editor-block-list__layout::selection { background:
transparent }` rule is then valid in Chromium / Firefox, applies, and hides
the highlight on every paragraph block. (Browser inspection confirmed the
selection range was correct -- 280x18 px -- with no visible highlight, while a
plain `contenteditable` injected into the same page highlighted normally.)

**Fix.** A small Vite plugin -- `repairSelectionHack` in
`src/block-editor/app/vite.config.js` -- runs after minification
(`generateBundle`) and rejoins the split rules back into the original guarded
comma-separated list, so the hack is Safari-only again and the highlight works
in Chromium / Firefox. CSS minification stays on; the CSS size is unchanged.

A second part of the same fix: the paragraph's **text-alignment** toolbar
control (and other typography controls) are gated behind editor *settings* --
`useSettings()` reads them from `settings.__experimentalFeatures`, populated
from `theme.json` in a real WordPress install. The standalone editor passed no
`settings` prop, so the alignment control never rendered. `Editor.jsx` now
passes an `EDITOR_SETTINGS` object with the `__experimentalFeatures` feature
flags to `BlockEditorProvider`.

**Verification.** Rebuilt the app and verified in headless Chromium against a
throwaway Docker stack (a distinct `be79sel` Compose project on ports 8091 /
3317). On a test paragraph block: drag-select and shift-arrow selection now
show the highlight; the floating block toolbar shows Bold / Italic / Link and
the text-alignment control; Bold / Italic apply `<strong>` / `<em>`; the
Document Overview toggle works; the settings sidebar shows the Post and Block
panels; and a save round trip persisted content / status / category, with the
0.71 front end rendering the post. `composer phpcs` / `phpstan` / `test` stay
at 0 / 0 / 94.

JA: Issue #79 の UI 作業の後、後続のバグが判明した: 段落ブロック内の
テキストを選択しても Chromium / Firefox では **ハイライトが表示されない**。
テキストは選択されている(入力で置き換わり、選択範囲も DOM に存在する)が、
ブラウザが可視ハイライトを描画しなかった。

**根本原因。** `@wordpress/block-editor` の `content.css` は、意図的な
Safari 限定の CSS ハック -- 1 つのカンマ区切りセレクタリスト(上記)-- で
ブロックキャンバスのネイティブ選択ハイライトを隠している。
`_::-webkit-full-page-media` は Safari だけが認識する擬似要素である。
トップレベルのセレクタ「リスト」内に解釈できないセレクタが 1 つでもあると
ブラウザはルール **全体** を破棄するため、Chromium / Firefox は通常この
ルールを捨てネイティブハイライトを保つ。しかし Vite 既定(esbuild)の CSS
minifier はこのルールをセレクタごとの **別々の** ルールへ「最適化」する。
単独になった `:root .block-editor-block-list__layout::selection { background:
transparent }` は Chromium / Firefox でも有効なため適用され、すべての段落
ブロックでハイライトを隠してしまう。(ブラウザ調査で、選択範囲は正しく
280x18 px ありながら可視ハイライトが無いこと、同じページに注入した素の
`contenteditable` は正常にハイライトされることを確認した。)

**修正。** 小さな Vite プラグイン -- `src/block-editor/app/vite.config.js` の
`repairSelectionHack` -- が minify 後(`generateBundle`)に走り、分割された
ルールを元のガード付きカンマ区切りリストへ結合し直す。これによりハックは
再び Safari 限定となり、Chromium / Firefox でハイライトが効く。CSS の
minify は有効のままで、CSS サイズも変わらない。

同じ修正のもう一部分: 段落の **テキスト配置** ツールバー操作子(その他の
文字組み操作子も)はエディタの *設定* によって出し分けられる。
`useSettings()` はそれらを `settings.__experimentalFeatures`(本物の
WordPress では `theme.json` から供給される)から読み取る。スタンドアロン
エディタは `settings` prop を渡していなかったため配置操作子が描画されな
かった。`Editor.jsx` は `__experimentalFeatures` の機能フラグを持つ
`EDITOR_SETTINGS` オブジェクトを `BlockEditorProvider` へ渡すようになった。

**検証。** アプリを再ビルドし、使い捨ての Docker スタック(ポート 8091 /
3317 の独立した `be79sel` Compose プロジェクト)に対しヘッドレス Chromium
で検証した。テスト用の段落ブロックで: ドラッグ選択と Shift + 矢印選択で
ハイライトが表示され、フローティングのブロックツールバーは太字 / 斜体 /
リンクとテキスト配置操作子を表示し、太字 / 斜体は `<strong>` / `<em>` を
適用し、ドキュメント概観の切り替えが動作し、設定サイドバーは Post / Block
パネルを表示し、保存の往復は内容 / ステータス / カテゴリーを保存して 0.71
フロントエンドが投稿を描画した。`composer phpcs` / `phpstan` / `test` は
0 / 0 / 94 のまま。
