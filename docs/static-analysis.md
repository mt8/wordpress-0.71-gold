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

EN: After the compatibility-shim removal (Issue #13) the count dropped from
**234 to 14** violations. The shim-related findings (`mysql_*`, `ereg*`,
`each`, `get_magic_quotes_gpc` — 220 of them) are fully eliminated. What
remains is deferred to later Issues:

JA: 互換シム廃止(Issue #13)後、検出は **234 件から 14 件**に減少した。シム関連
の検出(`mysql_*`・`ereg*`・`each`・`get_magic_quotes_gpc`、220 件)は完全に解消。
残りは後続 Issue に先送り:

| Remaining / 残り | Count | Note |
|---|---|---|
| `/e` PCRE modifier | 5 | the `%u` decoder etc., on rarely-hit paths |
| `define()` 3rd argument | 3 | `define('OBJECT', ..., true)` in wp-db.php |
| `$HTTP_RAW_POST_DATA` | 2 | variable name kept (xmlrpcs.inc references it); now self-populated from `php://input` |
| `mysql_*` prefix | 2 | the undefined `mysql_doh()` dead code in b2-2-wp.php (not an ext/mysql function) |
| PHP4-style constructor | 1 | the `POP3` class |
| `global $$var` | 1 | a pre-existing variable-variable in b2functions.php |

## PHPStan

EN: Deeper static analysis (undefined variables, type errors). Configured by
`phpstan.neon.dist`: level 0, analysing `src/`. WordPress 0.71 IS WordPress core
itself, so no WordPress stubs are needed.

JA: より深い静的解析(未定義変数・型エラー)。`phpstan.neon.dist` で設定: level 0、
`src/` を解析。WordPress 0.71 は WordPress コア自体のため WordPress スタブは不要。

```sh
composer phpstan               # or: vendor/bin/phpstan analyse
vendor/bin/phpstan analyse --memory-limit=1G
```

EN: The legacy codebase produces 260 level-0 findings (mostly runtime warnings:
undefined variables, dynamic properties). They are captured in
`phpstan-baseline.neon` so `phpstan analyse` is green and any **new** regression
stands out. Reducing the baseline is a later "runtime warnings" Issue.

JA: レガシーコードは level 0 で 260 件を検出する(主に実行時警告: 未定義変数・
動的プロパティ)。これらは `phpstan-baseline.neon` に取り込み、`phpstan analyse`
を green に保ち、**新規**の退行が目立つようにしている。baseline の削減は後続の
「実行時警告」Issue で行う。
