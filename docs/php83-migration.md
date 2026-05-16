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
