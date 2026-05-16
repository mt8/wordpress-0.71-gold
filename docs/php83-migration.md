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
