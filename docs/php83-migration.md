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
