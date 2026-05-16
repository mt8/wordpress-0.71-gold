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
