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
