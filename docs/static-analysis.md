# Static Analysis / 静的解析

EN: Two static-analysis tools are wired up to track PHP 8.3 compatibility and
regressions. They run on the host (PHP 8.3 + Composer), not inside Docker, since
they are a dev/CI concern rather than the application runtime.

JA: PHP 8.3 互換性と退行を追跡するため、2 つの静的解析ツールを導入している。
アプリのランタイムではなく開発/CI の関心事のため、Docker 内ではなくホスト
(PHP 8.3 + Composer)で実行する。

## Setup / セットアップ

```sh
composer install
```

## phpcs + PHPCompatibility

EN: Flags code that is incompatible with a target PHP version. Configured by
`phpcs.xml.dist` to run the `PHPCompatibility` standard against `src/` with
`testVersion` 8.3.

JA: 対象 PHP バージョンと非互換なコードを検出する。`phpcs.xml.dist` で
`PHPCompatibility` 標準を `src/` に対し `testVersion` 8.3 で実行する設定。

```sh
composer phpcs                 # or: vendor/bin/phpcs
vendor/bin/phpcs --report=source   # summary by sniff
```

EN: As of Issue #22, **phpcs reports 0 violations**. The compatibility-shim
removal (Issue #13) first cut the count from 234 to 11, and Issue #22 fixed the
rest:

JA: Issue #22 時点で **phpcs は検出 0 件**。互換シム廃止(Issue #13)でまず
234 件から 11 件まで減り、Issue #22 で残りを修正した:

| Fixed in #22 / #22 で修正 | Count | How / 方法 |
|---|---|---|
| `/e` PCRE modifier | 5 | rewritten with `preg_replace_callback()` |
| `mysql_*` prefix | 2 | the dead `mysql_doh()` calls replaced with `print()` |
| `$HTTP_RAW_POST_DATA` | 2 | renamed to a plain `$raw_post_data` variable |
| PHP4-style constructor | 1 | `POP3::POP3()` → `POP3::__construct()` |
| `global $$var` | 1 | removed the unused variable-variable in `alert_error()` |

## PHPStan

EN: Deeper static analysis (undefined variables, type errors). Configured by
`phpstan.neon.dist`: level 0, analysing `src/`. WordPress 0.71 IS WordPress core
itself, so no WordPress stubs are needed. The bundled XML-RPC library lives in
`.inc` files, which PHPStan does not analyse by default; `scanFiles` makes their
classes/functions known to the analysis.

JA: より深い静的解析(未定義変数・型エラー)。`phpstan.neon.dist` で設定: level 0、
`src/` を解析。WordPress 0.71 は WordPress コア自体のため WordPress スタブは不要。
同梱の XML-RPC ライブラリは `.inc` ファイルにあり PHPStan は既定では解析しない
ため、`scanFiles` でそのクラス/関数を解析に認識させている。

```sh
composer phpstan               # or: vendor/bin/phpstan analyse
vendor/bin/phpstan analyse --memory-limit=1G
```

EN: As of Issue #22, **PHPStan level 0 reports 0 errors with no baseline**. The
legacy code previously produced ~260 level-0 findings captured in
`phpstan-baseline.neon`; Issue #22 fixed every remaining one (215 after earlier
Issues) and deleted the baseline file. Findings included unknown XML-RPC classes
(resolved with `scanFiles`), duplicate array keys, the undefined `dbconnect()` /
`rss_update()` functions, undefined variables, and PHP4-style constructors in
the XML-RPC library.

JA: Issue #22 時点で **PHPStan level 0 は baseline なしで検出 0 件**。レガシー
コードは以前 level 0 で約 260 件を検出し `phpstan-baseline.neon` に取り込んで
いたが、Issue #22 で残り(先行 Issue 後で 215 件)をすべて修正し baseline
ファイルを削除した。検出内容は XML-RPC クラスの未解決(`scanFiles` で解決)、
配列の重複キー、未定義の `dbconnect()` / `rss_update()`、未定義変数、XML-RPC
ライブラリの PHP4 形式コンストラクタなど。

EN: Raising the level above 0 is out of scope: level 1 alone adds roughly 1050
undefined-variable findings from WordPress 0.71's legacy global-heavy style, and
higher levels would require type hints throughout. Level 0 with 0 errors is the
realistic "clean" target, so any **new** regression now stands out immediately.

JA: level を 0 より上げることはスコープ外: level 1 だけで WordPress 0.71 の
レガシーな global 多用に由来する未定義変数が約 1050 件増え、より高い level は
全体への型注釈が必要になる。level 0 で 0 件が現実的な「クリーン」の目標であり、
今後は**新規**の退行がすぐに目立つようになる。
