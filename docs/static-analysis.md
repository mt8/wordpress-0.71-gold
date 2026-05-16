# Static Analysis / 静的解析

EN: Two static-analysis tools are wired up: phpcs (WordPress coding style) and
PHPStan (undefined variables, type errors, regressions). They run on the host
(PHP 8.3 + Composer), not inside Docker, since they are a dev/CI concern rather
than the application runtime.

JA: 2 つの静的解析ツールを導入している: phpcs(WordPress コーディングスタイル)と
PHPStan(未定義変数・型エラー・退行)。アプリのランタイムではなく開発/CI の
関心事のため、Docker 内ではなくホスト(PHP 8.3 + Composer)で実行する。

## Setup / セットアップ

```sh
composer install
```

## phpcs: WordPress-Core (WPCS)

EN: phpcs runs the official **WordPress-Core** coding standard
(`wp-coding-standards/wpcs`), configured by `phpcs.xml.dist` against `src/`,
curated down to a passing subset (see below).

JA: phpcs は公式の **WordPress-Core** コーディング標準
(`wp-coding-standards/wpcs`)を実行する。`phpcs.xml.dist` で `src/` に対して
設定し、合格するサブセットに精選している(下記参照)。

```sh
composer phpcs                 # or: vendor/bin/phpcs
vendor/bin/phpcs --report=source   # summary by sniff
```

EN: As of Issue #49, **phpcs reports 0 errors and 0 warnings**. The
`WordPress-Core` standard was added in Issue #49: `phpcbf` auto-formatted
15,081 style violations, the mechanical remainder (Yoda conditions, property
visibility, switch/control-structure formatting) was fixed by hand, and sniffs
requiring renames / prepared-SQL rewrites / behaviour changes were excluded with
documented bilingual comments. See `docs/php83-migration.md` (Issue #49) for the
full breakdown of fixed and excluded sniffs.

JA: Issue #49 時点で **phpcs はエラー 0 件・警告 0 件**。`WordPress-Core` 標準は
Issue #49 で追加した。`phpcbf` が 15,081 件のスタイル違反を自動整形し、機械的な
残り(Yoda 条件・プロパティ可視性・switch/制御構造の整形)を手作業で修正、
改名・prepared SQL 書き換え・挙動変更が必要な sniff は英日コメント付きで除外
した。修正・除外した sniff の詳細は `docs/php83-migration.md`(Issue #49)を参照。

EN: A `PHPCompatibility` (target PHP 8.3) standard was also run during the
migration; it reached 0 violations (Issues #13 and #22) and was then removed
from the phpcs config (Issue #49) once the PHP 8.3 migration was complete --
phpcs now checks WordPress code style only.

JA: 移行期間中は `PHPCompatibility`(対象 PHP 8.3)標準も実行しており、0 件に
到達した(Issue #13・#22)。PHP 8.3 移行の完了後、phpcs 設定から除去した
(Issue #49)。現在 phpcs は WordPress コードスタイルのみを検査する。

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

EN: As of Issue #22, **PHPStan level 0 reports 0 errors with no baseline**. The
legacy code previously produced ~260 level-0 findings captured in
`phpstan-baseline.neon`; Issue #22 fixed every remaining one (215 after earlier
Issues) and deleted the baseline file. Findings included duplicate array keys,
the undefined `dbconnect()` / `rss_update()` functions, and undefined variables.

JA: Issue #22 時点で **PHPStan level 0 は baseline なしで検出 0 件**。レガシー
コードは以前 level 0 で約 260 件を検出し `phpstan-baseline.neon` に取り込んで
いたが、Issue #22 で残り(先行 Issue 後で 215 件)をすべて修正し baseline
ファイルを削除した。検出内容は配列の重複キー、未定義の `dbconnect()` /
`rss_update()`、未定義変数など。

EN: Raising the level above 0 is out of scope: level 1 alone adds roughly 1050
undefined-variable findings from WordPress 0.71's legacy global-heavy style, and
higher levels would require type hints throughout. Level 0 with 0 errors is the
realistic "clean" target, so any **new** regression now stands out immediately.

JA: level を 0 より上げることはスコープ外: level 1 だけで WordPress 0.71 の
レガシーな global 多用に由来する未定義変数が約 1050 件増え、より高い level は
全体への型注釈が必要になる。level 0 で 0 件が現実的な「クリーン」の目標であり、
今後は**新規**の退行がすぐに目立つようになる。
