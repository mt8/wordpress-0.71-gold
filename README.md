# WordPress 0.71-gold on PHP 8.3

An experimental project that takes the **oldest WordPress release —
0.71-gold (2003)** — and modifies it to run on **PHP 8.3 + MySQL 8**.

> ⚠️ **This is purely an experimental / study project — it is NOT intended
> for production use.** WordPress 0.71-gold is 2003-era b2/cafelog code; even
> with the changes in this repository it remains an obsolete platform and must
> not be used to run a real website or handle real data. The purpose is to
> explore running historical code on a current PHP/MySQL stack — it is
> modernised just enough to run, not rewritten.

## Requirements

- Docker (with Docker Compose v2)

## Quick start

```sh
docker compose up -d --build
```

Then open the installer at
<http://localhost:8080/wp-admin/wp-install.php> and follow it. Afterwards:

- Blog front end: <http://localhost:8080/>
- Admin screen: <http://localhost:8080/wp-admin/b2edit.php>

```sh
docker compose down       # stop
docker compose down -v    # stop and drop the database volume
```

## Environment

| Service | Image | Role |
|---------|-------|------|
| `web`   | `php:8.3-apache` + `mysqli` (built from `Dockerfile`) | Apache + PHP 8.3, serves `./src` |
| `db`    | `mysql:8.0` (official) | MySQL 8 database `b2` (user `user` / `pass`) |

Both base images are official; the only customization is the `Dockerfile`
adding the `mysqli` extension. Database credentials live in `src/b2config.php`
and match `docker-compose.yml`, so no configuration is needed for local use.

## Static analysis

```sh
composer install
composer phpcs     # WordPress-Core coding standard (WPCS)
composer phpstan   # PHPStan (level 0)
```

Both currently report **0**. phpcs runs the curated `WordPress-Core`
standard; PHPStan runs at level 0. A husky `pre-commit` hook runs `lint-staged`
(phpcs / phpstan on staged changes) so regressions are caught before they land.
See `docs/static-analysis.md`.

## Tests

```sh
composer test      # PHPUnit
```

A PHPUnit suite (**94 tests**) covers the unit-testable parts of the
2003-era code in `tests/phpunit/tests/`:

- **Pure helpers** — text formatting, escaping, date/URL/number helpers in
  `b2functions.php` and `b2template.functions.php`.
- **The `textile` formatter** in `b2-include/textile.php` (string in, HTML out).
- **Database-dependent helpers** — `get_postdata()`, `get_userdata()`,
  `get_the_category()`, etc. A test-support fake `$wpdb` stub
  (`tests/phpunit/includes/Support/FakeWpdb.php`) plus the table-name globals
  make these unit-testable without a live MySQL server.
- **The CSRF helpers** added in Issue #33.

## E2E tests

```sh
# 1. Start the local Docker blog
docker compose up -d
docker compose ps          # confirm web + db are Up

# 2. Install the Node tooling (first run only)
npm install
npx playwright install chromium

# 3. Run the suite
npm run test:e2e
```

A Playwright end-to-end suite (in `tests/e2e/`) drives the real admin and
front-end pages of the running Docker blog. It covers the admin flows
(log in; create / edit / delete a post; add / delete a category) and the
front end (home page, single post `?p=`, category `?cat=`, monthly archive
`?m=`, and the RSS .92 / RDF 1.0 / RSS 2.0 feeds), and asserts that no PHP
`Fatal error` / `Warning` / `Deprecated` text appears on any page. Test data
is seeded and cleaned up by helpers in `tests/e2e/helpers/`; every seeded row carries
an `E2E:` title/name prefix and only those rows are removed, so your existing
content is never touched and the suite is safe to re-run. The Docker blog must
be running first. See `docs/php83-migration.md` (Issue #60) for details.

## Publishing safely (static export)

```sh
071 export                 # or: composer static-export
```

WordPress 0.71 must never be exposed to the public internet as a running
PHP application. The intended workflow is: write posts in the **local**
environment, export the site to **static HTML** with `071 export` (the
`export` command group of `071-cli`), and upload only the static files to a
public server — which then runs no PHP and no database, so the 2003 codebase
is never exposed. `composer static-export` is a thin alias for `071 export`.
See `docs/static-export.md`.

## Block editor

The project also includes an experimental **custom block editor**, built on
the `@wordpress/block-editor` package — a modern editing method offered
alongside the classic `wp-admin/b2edit.php` editor (it does not replace it).
WordPress 0.71 has no REST API, so the editor is a deliberately-scoped
experiment; see `docs/gutenberg-investigation.md`.

Build the editor once:

```sh
cd src/block-editor/app
npm install
npm run build
```

Then, logged in to the admin, open a post in it from the **"Block editor"**
link shown next to each post in the admin post list (`wp-admin/b2edit.php`),
or directly at `block-editor/api/editor.php?post=<ID>`. Block content is
stored as block markup in the existing `post_content` column, so the 0.71
front end keeps rendering the post normally.

## Project layout

| Path | Contents |
|------|----------|
| `src/` | The WordPress 0.71-gold source — the actual modified codebase. |
| `tests/phpunit/` | PHPUnit unit tests (`tests/`) and support classes (`includes/`). |
| `tests/e2e/` | Playwright E2E specs and test-data helpers. |
| `docs/` | Documentation. |
| `tools/` | 0.71-specific tooling packages — `071-cli` (`tools/cli`, includes the static export), `071-env`, `071-now`. |
| `Dockerfile`, `docker-compose.yml` | Local PHP 8.3 + MySQL 8 environment. |
| `phpcs.xml.dist`, `phpstan.neon.dist` | Static-analysis configuration. |
| `composer.json` | PHP dev tooling (phpcs / WPCS / PHPStan / PHPUnit). |
| `package.json`, `playwright.config.js`, `lint-staged.config.mjs`, `.husky/` | Node tooling — Playwright E2E and the husky/lint-staged pre-commit hook. |

## What was done

- **PHP 8.3 migration** — `ext/mysql` → `mysqli`, POSIX `ereg*` → PCRE,
  removed/changed PHP functions and superglobals, PHP4-style constructors, etc.
- **MySQL 8 compatibility** — strict `sql_mode`, reserved words, etc.
- **Security hardening** — SQL injection, XSS, CSRF, authentication & session,
  access control, file upload, information disclosure.
- **Removed unused features** — XML-RPC, comments, trackback and pingback.
- **Static analysis** — phpcs (WordPress-Core / WPCS) and PHPStan, both at 0.

Every change is recorded, per GitHub Issue, in `docs/php83-migration.md`.

## Documentation

| File | Contents |
|------|----------|
| `docs/php83-migration.md` | Per-Issue migration log. |
| `docs/security-audit.md` | Security audit summary. |
| `docs/static-export.md` | Static export & safe publishing. |
| `docs/static-analysis.md` | phpcs / PHPStan tooling. |
| `docs/docker-environment.md` | Docker environment details. |
| `docs/gutenberg-investigation.md` | Gutenberg port feasibility investigation. |
| `docs/block-editor-media-and-layout.md` | Block editor: image upload & layout-block consistency. |

## License

GPL-2.0-or-later. WordPress is released under the GNU General Public
License; this derivative work follows the same license.

---

# WordPress 0.71-gold を PHP 8.3 で動かす

**最古の WordPress リリース 0.71-gold(2003 年)** を改修し、
**PHP 8.3 + MySQL 8** で動作させる実験プロジェクト。

> ⚠️ **これはあくまでも実験・学習目的のプロジェクトであり、本番利用は
> 想定していません。** WordPress 0.71-gold は 2003 年当時の b2/cafelog コード
> で、本リポジトリの変更を加えても旧式のプラットフォームであることに変わりは
> なく、実運用のサイトや実データに使用してはいけません。目的は歴史的なコードを
> 現行の PHP/MySQL 環境で動かす検証であり、動作する範囲で近代化しているのみ、
> 全面的な書き直しはしていない。

## 必要環境

- Docker(Docker Compose v2)

## クイックスタート

```sh
docker compose up -d --build
```

起動後、<http://localhost:8080/wp-admin/wp-install.php> のインストーラを
開いて進める。完了後:

- ブログ本体: <http://localhost:8080/>
- 管理画面: <http://localhost:8080/wp-admin/b2edit.php>

```sh
docker compose down       # 停止
docker compose down -v    # 停止し DB ボリュームも削除
```

## 環境

| サービス | イメージ | 役割 |
|---------|---------|------|
| `web`   | `php:8.3-apache` + `mysqli`(`Dockerfile` からビルド) | Apache + PHP 8.3、`./src` を配信 |
| `db`    | `mysql:8.0`(公式) | MySQL 8 データベース `b2`(ユーザー `user` / `pass`) |

ベースイメージはいずれも公式。カスタマイズは `Dockerfile` で `mysqli`
拡張を追加する 1 点のみ。DB の認証情報は `src/b2config.php` にあり
`docker-compose.yml` と一致しているため、ローカル利用では設定不要。

## 静的解析

```sh
composer install
composer phpcs     # WordPress-Core coding standard (WPCS)
composer phpstan   # PHPStan (level 0)
```

いずれも現在 **0 件**。phpcs は精選した `WordPress-Core` 標準、PHPStan は
level 0 で実行する。husky の `pre-commit` フックが `lint-staged`(staged 変更
への phpcs / phpstan)を実行し、退行をマージ前に捕捉する。詳細は
`docs/static-analysis.md`。

## テスト

```sh
composer test      # PHPUnit
```

PHPUnit スイート(**94 テスト**)が、2003 年当時のコードのうち単体テスト
可能な部分を `tests/phpunit/tests/` で網羅する:

- **純粋なヘルパー** — `b2functions.php` と `b2template.functions.php` の
  テキスト整形・エスケープ・日付/URL/数値ヘルパー。
- **`textile` フォーマッタ** — `b2-include/textile.php`(文字列入力・HTML 出力)。
- **DB 依存ヘルパー** — `get_postdata()`・`get_userdata()`・
  `get_the_category()` ほか。テスト補助の偽 `$wpdb` スタブ
  (`tests/phpunit/includes/Support/FakeWpdb.php`)とテーブル名グローバルに
  より、実 MySQL サーバー無しで単体テスト可能にする。
- **CSRF ヘルパー** — Issue #33 で追加。

## E2E テスト

```sh
# 1. ローカル Docker ブログを起動
docker compose up -d
docker compose ps          # web と db が Up か確認

# 2. Node ツールを導入 (初回のみ)
npm install
npx playwright install chromium

# 3. スイートを実行
npm run test:e2e
```

Playwright の E2E スイート(`tests/e2e/`)が、稼働中の Docker ブログの実際の
管理画面・フロントエンドのページを操作する。管理画面フロー(ログイン、投稿の
作成/編集/削除、カテゴリの追加/削除)とフロントエンド(トップ、単一投稿
`?p=`、カテゴリ `?cat=`、月別アーカイブ `?m=`、RSS .92 / RDF 1.0 / RSS 2.0
フィード)を対象とし、どのページにも PHP の `Fatal error` / `Warning` /
`Deprecated` が出ないことを検証する。テストデータは `tests/e2e/helpers/` の
ヘルパーが投入・後始末する。投入する行はすべて `E2E:` というタイトル/名前接頭辞を持ち、
その行のみを削除するため、既存コンテンツに触れることはなく、再実行しても安全
である。先に Docker ブログを起動しておくこと。詳細は `docs/php83-migration.md`
(Issue #60)を参照。

## 安全な公開（静的書き出し）

```sh
071 export                 # or: composer static-export
```

WordPress 0.71 を、稼働中の PHP アプリケーションとして公開インターネット
へ晒してはならない。想定するワークフローは: **ローカル**環境で投稿を書き、
`071 export`（`071-cli` の `export` コマンドグループ）でサイトを**静的 HTML**
へ書き出し、静的ファイルだけを公開サーバーへアップロードする — 公開サーバーは
PHP も DB も動かさないため、2003 年のコードベースが晒されることはない。
`composer static-export` は `071 export` の薄いエイリアスである。詳細は
`docs/static-export.md`。

## ブロックエディタ

本プロジェクトには、`@wordpress/block-editor` パッケージを用いた実験的な
**カスタムブロックエディタ**も入っている — 従来の `wp-admin/b2edit.php`
エディタと並ぶモダンな編集手段である(置き換えではない)。WordPress 0.71 に
REST API は無いため、本エディタは範囲を限定した実験である。詳細は
`docs/gutenberg-investigation.md` を参照。

エディタは最初に一度ビルドする:

```sh
cd src/block-editor/app
npm install
npm run build
```

ビルド後、管理画面にログインした状態で、管理画面の投稿一覧
(`wp-admin/b2edit.php`)の各投稿の隣に表示される **「Block editor」**リンク、
または直接 `block-editor/api/editor.php?post=<ID>` から投稿をブロック
エディタで開く。ブロック内容はブロックマークアップとして既存の
`post_content` カラムに保存されるため、0.71 のフロントエンドは投稿を通常
どおり描画し続ける。

## 構成

| パス | 内容 |
|------|------|
| `src/` | WordPress 0.71-gold のソース(改修対象の本体)。 |
| `tests/phpunit/` | PHPUnit 単体テスト(`tests/`)と補助クラス(`includes/`)。 |
| `tests/e2e/` | Playwright E2E spec とテストデータヘルパー。 |
| `docs/` | ドキュメント。 |
| `tools/` | 0.71 専用のツールパッケージ — `071-cli`（`tools/cli`、静的書き出しを含む）・`071-env`・`071-now`。 |
| `Dockerfile`, `docker-compose.yml` | ローカルの PHP 8.3 + MySQL 8 環境。 |
| `phpcs.xml.dist`, `phpstan.neon.dist` | 静的解析の設定。 |
| `composer.json` | PHP 開発ツール(phpcs / WPCS / PHPStan / PHPUnit)。 |
| `package.json`, `playwright.config.js`, `lint-staged.config.mjs`, `.husky/` | Node ツール — Playwright E2E と husky/lint-staged の pre-commit フック。 |

## 実施内容

- **PHP 8.3 移行** — `ext/mysql` → `mysqli`、POSIX `ereg*` → PCRE、廃止・変更
  された PHP 関数やスーパーグローバル、PHP4 形式コンストラクタ など。
- **MySQL 8 互換** — 厳格な `sql_mode`、予約語 など。
- **セキュリティ強化** — SQL インジェクション・XSS・CSRF・認証/セッション・
  アクセス制御・ファイルアップロード・情報漏洩。
- **不要機能の撤去** — XML-RPC・コメント・トラックバック・ピンバック。
- **静的解析** — phpcs(WordPress-Core / WPCS)と PHPStan、いずれも 0 件。

すべての変更は GitHub Issue 単位で `docs/php83-migration.md` に記録している。

## ドキュメント

| ファイル | 内容 |
|------|------|
| `docs/php83-migration.md` | Issue 単位の移行ログ。 |
| `docs/security-audit.md` | セキュリティ監査のまとめ。 |
| `docs/static-export.md` | 静的書き出しと安全な公開。 |
| `docs/static-analysis.md` | phpcs・PHPStan ツール。 |
| `docs/docker-environment.md` | Docker 環境の詳細。 |
| `docs/gutenberg-investigation.md` | Gutenberg 移植可否の調査。 |
| `docs/block-editor-media-and-layout.md` | ブロックエディタ: 画像アップロードとレイアウト整合性。 |

## ライセンス

GPL-2.0-or-later。WordPress は GNU 一般公衆利用許諾契約書で配布されており、
本派生物も同じライセンスに従う。
