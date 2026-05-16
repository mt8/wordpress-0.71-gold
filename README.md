# WordPress 0.71-gold on PHP 8.3 / WordPress 0.71-gold を PHP 8.3 で動かす

EN: An experimental project that takes the **oldest WordPress release —
0.71-gold (2003)** — and modifies it to run on **PHP 8.3 + MySQL 8**.

JA: **最古の WordPress リリース 0.71-gold(2003 年)** を改修し、
**PHP 8.3 + MySQL 8** で動作させる実験プロジェクト。

> ⚠️ **EN: This is purely an experimental / study project — it is NOT intended
> for production use.** WordPress 0.71-gold is 2003-era b2/cafelog code; even
> with the changes in this repository it remains an obsolete platform and must
> not be used to run a real website or handle real data. The purpose is to
> explore running historical code on a current PHP/MySQL stack — it is
> modernised just enough to run, not rewritten.
>
> ⚠️ **JA: これはあくまでも実験・学習目的のプロジェクトであり、本番利用は
> 想定していません。** WordPress 0.71-gold は 2003 年当時の b2/cafelog コード
> で、本リポジトリの変更を加えても旧式のプラットフォームであることに変わりは
> なく、実運用のサイトや実データに使用してはいけません。目的は歴史的なコードを
> 現行の PHP/MySQL 環境で動かす検証であり、動作する範囲で近代化しているのみ、
> 全面的な書き直しはしていない。

## Requirements / 必要環境

- Docker (with Docker Compose v2) / Docker(Docker Compose v2)

## Quick start / クイックスタート

```sh
docker compose up -d --build
```

EN: Then open the installer at
<http://localhost:8080/wp-admin/wp-install.php> and follow it. Afterwards:

- Blog front end: <http://localhost:8080/>
- Admin screen: <http://localhost:8080/wp-admin/b2edit.php>

JA: 起動後、<http://localhost:8080/wp-admin/wp-install.php> のインストーラを
開いて進める。完了後:

- ブログ本体: <http://localhost:8080/>
- 管理画面: <http://localhost:8080/wp-admin/b2edit.php>

```sh
docker compose down       # stop / 停止
docker compose down -v    # stop and drop the database volume / 停止し DB ボリュームも削除
```

## Environment / 環境

| Service | Image / イメージ | Role / 役割 |
|---------|------------------|-------------|
| `web`   | `php:8.3-apache` + `mysqli` (built from `Dockerfile`) | Apache + PHP 8.3, serves `./src` |
| `db`    | `mysql:8.0` (official / 公式) | MySQL 8 database `b2` (user `user` / `pass`) |

EN: Both base images are official; the only customization is the `Dockerfile`
adding the `mysqli` extension. Database credentials live in `src/b2config.php`
and match `docker-compose.yml`, so no configuration is needed for local use.

JA: ベースイメージはいずれも公式。カスタマイズは `Dockerfile` で `mysqli`
拡張を追加する 1 点のみ。DB の認証情報は `src/b2config.php` にあり
`docker-compose.yml` と一致しているため、ローカル利用では設定不要。

## Static analysis / 静的解析

```sh
composer install
composer phpcs     # WordPress-Core coding standard (WPCS)
composer phpstan   # PHPStan (level 0)
```

EN: Both currently report **0**. phpcs runs the curated `WordPress-Core`
standard; PHPStan runs at level 0. See `docs/static-analysis.md`.

JA: いずれも現在 **0 件**。phpcs は精選した `WordPress-Core` 標準、PHPStan は
level 0 で実行する。詳細は `docs/static-analysis.md`。

## Tests / テスト

```sh
composer test      # PHPUnit
```

EN: A PHPUnit suite (**95 tests**) covers the unit-testable parts of the
2003-era code in `tests/`:

- **Pure helpers** — text formatting, escaping, date/URL/number helpers in
  `b2functions.php` and `b2template.functions.php`.
- **The `textile` formatter** in `b2-include/textile.php` (string in, HTML out).
- **Database-dependent helpers** — `get_postdata()`, `get_userdata()`,
  `get_the_category()`, etc. A test-support fake `$wpdb` stub
  (`tests/Support/FakeWpdb.php`) plus the table-name globals make these
  unit-testable without a live MySQL server.
- **The CSRF helpers** added in Issue #33.

JA: PHPUnit スイート(**95 テスト**)が、2003 年当時のコードのうち単体テスト
可能な部分を `tests/` で網羅する:

- **純粋なヘルパー** — `b2functions.php` と `b2template.functions.php` の
  テキスト整形・エスケープ・日付/URL/数値ヘルパー。
- **`textile` フォーマッタ** — `b2-include/textile.php`(文字列入力・HTML 出力)。
- **DB 依存ヘルパー** — `get_postdata()`・`get_userdata()`・
  `get_the_category()` ほか。テスト補助の偽 `$wpdb` スタブ
  (`tests/Support/FakeWpdb.php`)とテーブル名グローバルにより、実 MySQL
  サーバー無しで単体テスト可能にする。
- **CSRF ヘルパー** — Issue #33 で追加。

## Publishing safely (static export) / 安全な公開（静的書き出し）

```sh
composer static-export     # or: php bin/static-export.php
```

EN: WordPress 0.71 must never be exposed to the public internet as a running
PHP application. The intended workflow is: write posts in the **local**
environment, export the site to **static HTML** with `bin/static-export.php`,
and upload only the static files to a public server — which then runs no PHP
and no database, so the 2003 codebase is never exposed. See
`docs/static-export.md`.

JA: WordPress 0.71 を、稼働中の PHP アプリケーションとして公開インターネット
へ晒してはならない。想定するワークフローは: **ローカル**環境で投稿を書き、
`bin/static-export.php` でサイトを**静的 HTML** へ書き出し、静的ファイルだけを
公開サーバーへアップロードする — 公開サーバーは PHP も DB も動かさないため、
2003 年のコードベースが晒されることはない。詳細は `docs/static-export.md`。

## Project layout / 構成

| Path | Contents / 内容 |
|------|-----------------|
| `src/` | The WordPress 0.71-gold source — the actual modified codebase. / WordPress 0.71-gold のソース(改修対象の本体)。 |
| `docs/` | Documentation. / ドキュメント。 |
| `bin/` | Tooling scripts — the static-export script. / ツールスクリプト(静的書き出し)。 |
| `Dockerfile`, `docker-compose.yml` | Local PHP 8.3 + MySQL 8 environment. / ローカルの PHP 8.3 + MySQL 8 環境。 |
| `phpcs.xml.dist`, `phpstan.neon.dist` | Static-analysis configuration. / 静的解析の設定。 |
| `composer.json` | Dev tooling (phpcs / WPCS / PHPStan). / 開発ツール。 |

## What was done / 実施内容

EN:
- **PHP 8.3 migration** — `ext/mysql` → `mysqli`, POSIX `ereg*` → PCRE,
  removed/changed PHP functions and superglobals, PHP4-style constructors, etc.
- **MySQL 8 compatibility** — strict `sql_mode`, reserved words, etc.
- **Security hardening** — SQL injection, XSS, CSRF, authentication & session,
  access control, file upload, information disclosure.
- **Removed unused features** — XML-RPC, comments, trackback and pingback.
- **Static analysis** — phpcs (WordPress-Core / WPCS) and PHPStan, both at 0.

JA:
- **PHP 8.3 移行** — `ext/mysql` → `mysqli`、POSIX `ereg*` → PCRE、廃止・変更
  された PHP 関数やスーパーグローバル、PHP4 形式コンストラクタ など。
- **MySQL 8 互換** — 厳格な `sql_mode`、予約語 など。
- **セキュリティ強化** — SQL インジェクション・XSS・CSRF・認証/セッション・
  アクセス制御・ファイルアップロード・情報漏洩。
- **不要機能の撤去** — XML-RPC・コメント・トラックバック・ピンバック。
- **静的解析** — phpcs(WordPress-Core / WPCS)と PHPStan、いずれも 0 件。

EN: Every change is recorded, per GitHub Issue, in `docs/php83-migration.md`.

JA: すべての変更は GitHub Issue 単位で `docs/php83-migration.md` に記録している。

## Documentation / ドキュメント

| File | Contents / 内容 |
|------|-----------------|
| `docs/php83-migration.md` | Per-Issue migration log. / Issue 単位の移行ログ。 |
| `docs/security-audit.md` | Security audit summary. / セキュリティ監査のまとめ。 |
| `docs/static-export.md` | Static export & safe publishing. / 静的書き出しと安全な公開。 |
| `docs/static-analysis.md` | phpcs / PHPStan tooling. / phpcs・PHPStan ツール。 |
| `docs/docker-environment.md` | Docker environment details. / Docker 環境の詳細。 |
| `docs/gutenberg-investigation.md` | Gutenberg port feasibility investigation. / Gutenberg 移植可否の調査。 |

## License / ライセンス

EN: GPL-2.0-or-later. WordPress is released under the GNU General Public
License; this derivative work follows the same license.

JA: GPL-2.0-or-later。WordPress は GNU 一般公衆利用許諾契約書で配布されており、
本派生物も同じライセンスに従う。
