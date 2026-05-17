# 071 Tooling Design

Design document for the 0.71-specific tooling tracked by the umbrella
Issue #104: `071-cli`, `071-env`, and `071-now`. Written and reviewed
**before** implementation begins.

## 1. Background

WordPress 0.71 (b2/cafelog, 2003) cannot use the modern WordPress tooling:

- **wp-cli** expects a modern bootstrap (`wp-load.php`, `wp-settings.php`,
  the `WP_CLI` hook surface) — none of which exist in 0.71.
- **wp-env** reads `wp-includes/version.php` and drives setup through wp-cli;
  it fails immediately on the b2/cafelog layout (see `docs/docker-environment.md`).
- **wp-now** / WordPress Playground assume the modern codebase and its
  database schema.

The goal is 0.71-specific equivalents, each an npm package inside this repo.

| Tool      | Equivalent of            | Directory           |
|-----------|--------------------------|---------------------|
| `071-cli` | wp-cli                   | `/tools/cli`        |
| `071-env` | wp-env                   | `/tools/env`        |
| `071-now` | wp-now / WP Playground   | `/tools/playground` |

## 2. Repository layout — npm workspaces

The three packages live under `tools/` and are declared as npm workspaces in
the root `package.json`:

```
package.json          # root: "workspaces": ["tools/cli", "tools/env", "tools/playground"]
tools/cli/            # 071-cli  package
tools/env/            # 071-env  package
tools/playground/     # 071-now  package
tools/block-editor/   # custom block editor build source (own package.json)
src/                  # WordPress 0.71 source (unchanged)
```

Each workspace package has its own `package.json`, version, and `bin` entry.
The custom block editor build source (`tools/block-editor`) has its own
`package.json` but is intentionally left outside the workspace set; it is
built on its own with `cd tools/block-editor && npm install && npm run build`.

## 3. `071-cli` (`/tools/cli`)

A wp-cli-style CLI covering what WordPress 0.71 can actually do.

### 3.1 Why the core is PHP

`071-cli` must read and write 0.71's data through 0.71's own database layer
(`b2config.php` → `b2-include/wp-db.php` → `$wpdb`). That layer is PHP, so
the substance of `071-cli` is a PHP program. The npm package wraps it.

### 3.2 Package structure

```
tools/cli/
  package.json        # name "071-cli", bin { "071": "bin/071.mjs" }
  bin/071.mjs         # Node entry: locate a PHP binary, spawn the PHP CLI,
                      #   pass through arguments and the exit code
  php/071-cli.php     # PHP CLI entry point (argument routing)
  php/bootstrap.php   # headless bootstrap of 0.71's DB layer
  php/commands/*.php  # one file per command group
```

The Node `bin` shim exists only so the tool installs and runs like any other
npm package (`npx 071-cli ...`, or a linked `071` command). All real work is
in the PHP layer.

### 3.3 Headless bootstrap

`php/bootstrap.php` loads `b2config.php` (which ends by requiring `wp-db.php`
and exposing `$wpdb`) plus the few `b2-include/` function files needed for
correct formatting/escaping — **without** the web context (no `$_GET`,
`$_COOKIE`, no `header()` output). This mirrors `src/block-editor/api/bootstrap.php`,
which already does the same for the block editor's JSON endpoints.

The 0.71 install path is resolved from a `--path` flag, a `B2_PATH`
environment variable, or a default of `./src`.

### 3.4 Command surface

```
071 post     list | get <id> | create | update <id> | delete <id>
071 user     list | get <id> | create | update <id> | delete <id>
071 category list | get <id> | create | delete <id>
071 comment  list | get <id> | delete <id>
071 link     list | get <id> | create | delete <id>
071 option   list | get <name> | set <name> <value>      # b2settings
071 db       query <sql> | tables
071 export   run                                          # static-site export
```

Global flags: `--format=table|json|csv|count|ids` (default `table`),
`--fields=<a,b,c>`, `--path=<dir>`.

Example:

```
$ 071 post list --fields=ID,post_title,post_status
+----+-------------------+-------------+
| ID | post_title        | post_status |
+----+-------------------+-------------+
|  1 | Hello world!      | publish     |
+----+-------------------+-------------+
```

The command surface starts with `post` / `user` / `category` / `option` /
`db` and extends to `comment` / `link`. It is deliberately scoped to what
0.71 supports — there are no taxonomies beyond the single post category, no
post meta, no REST.

The `export` group is the one outlier: instead of reading or writing the
database it crawls the running blog over HTTP and writes a self-contained
static HTML site under `static-export/` — the safe way to publish a 2003-era
blog. It is the former standalone `bin/static-export.php` script, folded into
the CLI; `composer static-export` is kept as a thin alias for `071 export`.
Because it makes no database access it does not use the headless bootstrap of
section 3.3. See `docs/static-export.md`.

### 3.5 Where it runs

`071-cli` runs inside the `web` container (PHP 8.3 is present, and the `db`
host resolves). The Node `bin` also allows running it on a host that has a
PHP binary and can reach the database. `071-env run cli` (below) is the
primary entry point.

### 3.6 phpcs / phpstan

The new PHP under `/tools/cli` is a maintained tool, not a throwaway prototype, so
it **is** included in the `phpcs` / `phpstan` scan (unlike
`src/block-editor/api/`, which is excluded as experimental). This is settled
in the Phase 1 Issue.

### 3.7 Functional test suite (Behat)

`071-cli` has a Behat functional test suite, the 0.71 equivalent of wp-cli's
own Behat tests. The Gherkin feature files live under `tools/cli/features/`, one per
command group plus `cli.feature` for the entry point; they cover every verb,
every `--format` variant, `--fields`, and the error cases. A PHP
`FeatureContext` (`tools/cli/features/bootstrap/FeatureContext.php`) runs the `071`
CLI as a child process and asserts on its STDOUT / STDERR / exit code.

The `export` group is the exception to the per-group database coverage:
`export.feature` covers the help text, the unknown-verb error, and the
unreachable-blog failure path, because a full export run crawls a running blog
over HTTP — which the database-only harness does not provide. The full export
run is verified manually against the running Docker environment.

**Database isolation.** The suite never touches the developer's `b2`
database. `tools/cli/tests/docker-compose.yml` is a **separate Docker Compose
project** (`071-cli-test`) running its own MySQL 8 on host port **3307** with
a database named `b2_test`. A `@BeforeScenario` hook reseeds that database
from `tools/cli/tests/fixtures.sql` (the WordPress 0.71 schema from
`wp-admin/wp-install.php`, plus a fixed minimal fixture set) before every
scenario, so each scenario starts from an identical, known state.

Run it with `composer behat` (which starts the test database, waits for it to
become healthy, then runs Behat). The `tools/cli/php` PHP stays in the
`phpcs` / `phpstan` scope; the Behat PHP under `tools/cli/features/` and `tools/cli/tests/`
is test code, outside that scope. See `tools/cli/README.md`.

## 4. `071-env` (`/tools/env`)

A Node CLI that wraps the existing Docker Compose environment — parity with
`wp-env`.

### 4.1 Package structure

```
tools/env/
  package.json        # name "071-env", bin { "071-env": "bin/071-env.mjs" }
  bin/071-env.mjs     # Node CLI entry point
  src/*.mjs           # one module per subcommand
```

### 4.2 Commands

| Command                | Action |
|------------------------|--------|
| `071-env start`        | `docker compose up -d --build` |
| `071-env stop`         | `docker compose stop` |
| `071-env destroy`      | `docker compose down -v` (confirmation prompt — removes the DB volume) |
| `071-env status`       | `docker compose ps` |
| `071-env logs [svc]`   | `docker compose logs -f` |
| `071-env run cli <…>`  | run `071-cli` inside the `web` container |
| `071-env run <cmd…>`   | run an arbitrary command in the `web` container |

`071-env` wraps the existing `tools/env/docker-compose.yml`; it does not
replace it.

### 4.3 Reaching `071-cli` inside the container

Only `./src` is mounted into the `web` container, and `071-cli`'s PHP lives
in `/tools/cli` — outside the web document root (intentionally, so the CLI is not
web-served). `071-env` bridges this with a Compose **override file**
(`tools/env/docker-compose.071.yml`) that bind-mounts `./tools/cli` read-only into the
container at `/opt/071-cli`. Every `071-env` Compose call passes both files:

```
docker compose -f tools/env/docker-compose.yml -f tools/env/docker-compose.071.yml …
```

`071-env run cli <args>` then becomes:

```
docker compose … exec web php /opt/071-cli/php/071-cli.php <args>
```

So `071-env run cli post list` runs `071 post list` in the container, as
required by Issue #104.

### 4.4 Configuration — `.071-env.json`

`071-env` reads an optional `.071-env.json` at the repository root — the
analogue of wp-env's `.wp-env.json`. An optional `.071-env.override.json`
(git-ignored, per-developer) is **deep-merged on top** of it, the
local-override pattern wp-env uses. When neither file exists `071-env` falls
back to built-in defaults, so the environment works with no configuration at
all.

**Schema** — every field is optional:

| Field              | Type                  | Default | Effect |
|--------------------|-----------------------|---------|--------|
| `port`             | integer (1–65535)     | `8080`  | `web` host port |
| `dbPort`           | integer (1–65535)     | `3306`  | `db` host port |
| `phpVersion`       | string                | `"8.3"` | base PHP image tag (`php:<v>-apache`) |
| `mappings`         | object (string→string)| `{}`    | extra read-write bind mounts for `web` (container path → host path) |
| `lifecycleScripts` | object (string→string)| `{}`    | hook name → shell command (`afterStart`, `beforeDestroy`) |

The config is validated: an unknown key, a wrong type, or an unknown
lifecycle hook is rejected with a clear error naming the offending file.

Example `.071-env.json`:

```json
{
  "port": 9000,
  "dbPort": 3399,
  "phpVersion": "8.3",
  "mappings": {
    "/var/www/html/wp-content/themes/custom": "./themes/custom"
  },
  "lifecycleScripts": {
    "afterStart": "echo environment is up",
    "beforeDestroy": "echo backing up before teardown"
  }
}
```

**How each field is applied:**

- **`port` / `dbPort`** — `tools/env/docker-compose.yml` uses Compose variable
  substitution with defaults — `"${WP_PORT:-8080}:80"` and
  `"${DB_PORT:-3306}:3306"` — and `071-env` passes `WP_PORT` / `DB_PORT` in
  the environment of the spawned `docker compose`. Compose **appends** port
  lists across `-f` files, so a layered override file cannot change a port;
  env-var substitution is the correct mechanism. A plain `docker compose up`
  with no variables set still uses 8080 / 3306.
- **`phpVersion`** — `tools/env/Dockerfile` declares `ARG PHP_VERSION=8.3` and
  `FROM php:${PHP_VERSION}-apache`; the `web` service in
  `tools/env/docker-compose.yml` has a `build.args` entry
  `PHP_VERSION: "${PHP_VERSION:-8.3}"`; and `071-env` passes `PHP_VERSION`.
  A plain `docker build` still defaults to 8.3.
- **`mappings`** — `071-env` generates a Compose override at runtime
  (`docker-compose.071-mappings.yml` at the repository root, git-ignored)
  adding the extra `volumes` to the `web` service, and passes it as a third
  `-f` after `tools/env/docker-compose.yml` and
  `tools/env/docker-compose.071.yml`. Compose
  appends `volumes` cleanly across `-f` files. When `mappings` is empty the
  generated file is removed and no extra `-f` is passed.
- **`lifecycleScripts`** — `071-env` runs the hook's shell command through the
  system shell, in the repository root, at the right time: `afterStart` after
  a successful `start`, and `beforeDestroy` after the destroy confirmation but
  before Compose tears the environment down (so the hook can still reach a
  live stack). A failing `beforeDestroy` hook aborts the destroy.

All defaults are preserved, so a plain `docker compose up` without `071-env`
still works exactly as before — the change is non-breaking.

## 5. `071-now` (`/tools/playground`)

Browser-based WordPress 0.71 — wp-now / WordPress Playground in spirit.

### 5.1 Approach

`071-now` runs PHP in the browser with `@php-wasm/web` (the WebAssembly PHP
runtime that powers WordPress Playground), serving 0.71's `src/` from the
php-wasm virtual filesystem.

### 5.2 The database problem (principal risk)

0.71's `wp-db.php` talks to MySQL through `mysqli`. There is no MySQL server
in a browser. WordPress Playground solves the same problem with an in-browser
SQLite database plus a MySQL→SQLite translation layer.

Two candidate approaches for 0.71:

- **(A) SQLite-backed `wpdb`** — provide a 0.71-specific `wp-db.php` whose
  `$wpdb` runs against SQLite (php-wasm ships with SQLite).
- **(B) `mysqli` shim** — a userland `mysqli`-compatible layer over SQLite, so
  0.71's existing `wp-db.php` runs unchanged.

Both require translating 0.71's SQL — the schema DDL in `wp-install.php` and
the queries throughout the codebase — to the SQLite dialect.

**Key insight:** 0.71's SQL surface is tiny — a handful of tables and simple
queries, far smaller than modern WordPress. This makes the translation
tractable and is what makes `071-now` realistic.

### 5.3 Plan

Phase 3 began with a **feasibility spike**: get php-wasm to render 0.71's
front page against a SQLite-backed database seeded with one post, before
committing to the full build (the spike's findings are in
`docs/071-now-spike.md`). The full build then followed in six steps.

### 5.4 Status — built

`071-now` is **built**, no longer a spike. `/tools/playground` runs
WordPress 0.71 entirely in the browser — PHP 8.3 compiled to WebAssembly
via `@php-wasm/web`, reading from an in-browser SQLite database, with no
MySQL server and no web server. The full build was delivered in six
steps under umbrella Issue #104:

1. **Service-worker serving** (#117) — the in-browser blog is served
   through a request-routing service worker, so it loads its own CSS and
   is fully navigable.
2. **PHP-8.3-only bundle** (#119) — a Vite plugin trims the php-wasm
   bundle to the PHP 8.3 runtime alone (40 MB, down from ~290 MB).
3. **The working admin** (#121) — the WordPress 0.71 admin (`wp-admin/`)
   works: it opens already logged in, and a post can be created, edited
   and a category managed through it.
4. **Persisted database** (#123) — the SQLite database is persisted in
   the browser (OPFS / IndexedDB), so content created through the admin
   survives a reload, with a reset control.
5. **Image upload** (#125) — an image uploaded through the classic
   admin's `b2upload.php` is stored, served and persisted.
6. **Final polish** (#126) — a fresh playground opens on a small seeded
   demo blog (several posts across a couple of categories), a loading
   splash covers the php-wasm boot, and the host page frames the
   playground and links back to the repository.

The package, its layout and the `npm run build` / `dev` / `preview` /
`verify` workflow are documented in `tools/playground/README.md`.

### 5.5 Public deployment — GitHub Pages (#128)

`071-now` is deployed to GitHub Pages so anyone viewing the repository
can launch it from <https://mt8.github.io/wordpress-0.71-gold/>.

- **Workflow.** `.github/workflows/playground-pages.yml` builds the
  `tools/playground` npm workspace and publishes its `dist/` with
  `actions/configure-pages`, `actions/upload-pages-artifact` and
  `actions/deploy-pages`. It runs on a push to `main` and on manual
  dispatch, with the standard `pages: write` / `id-token: write` /
  `contents: read` permissions and the `github-pages` environment. The
  build output is roughly 54 MB (the ~40 MB PHP 8.3 `.wasm` runtime
  included), well within the GitHub Pages 1 GB site-size limit.
- **The base path.** A project page is served under the repository name,
  so the workflow builds with `PLAYGROUND_BASE=/wordpress-0.71-gold/`.
  `vite.config.js` reads it as the public base, and the browser app
  (`src/main.js`) builds its service-worker registration and the scoped
  blog paths under that base — so the service worker's scope covers the
  scoped traffic. The local `preview` / `verify` keep the default `/`.
- **Cross-origin isolation.** php-wasm runs PHP threads on
  `SharedArrayBuffer`, which a browser exposes only to a
  cross-origin-isolated page — one served with the COOP/COEP headers.
  GitHub Pages cannot set custom HTTP headers, so the playground's
  service worker (`public/sw.js`) adds them itself: alongside its
  request-routing job it fetches every app-shell response from the
  network and re-serves it with `Cross-Origin-Opener-Policy:
  same-origin` / `Cross-Origin-Embedder-Policy: require-corp` (and a
  `Cross-Origin-Resource-Policy`) attached — the `coi-serviceworker`
  technique, in the one existing service worker rather than a second
  registration. On the first visit the document is fetched before the
  worker controls the page, so `src/main.js` reloads once (guarded by a
  `sessionStorage` flag) to pick the headers up; the local dev / preview
  server sends them itself, so no reload happens there.

## 6. Phasing

Tracked under umbrella Issue #104. Child Issues, in order:

1. **Design document** — this file (current PR).
2. **Phase 1 — `071-cli`** — npm workspaces setup + the `/tools/cli` package and
   its command groups.
3. **Phase 2 — `071-env`** — the `/tools/env` package.
4. **Phase 3 — `071-now`** — a feasibility-spike Issue first, then the build.

Each phase is its own branch, PR, code review, and merge, per CLAUDE.md.

## 7. Conventions

- Issues, PRs, commits, and docs are bilingual in the "Japanese below" format;
  code comments are English only; no "by AI" attribution.
- npm workspaces; the repository's Node version (v24).
- Per CLAUDE.md, the end state remains a reproducible local environment; here
  `071-env` becomes that environment's front door.

---

# 071 ツール設計

アンブレラ Issue #104 で追跡する 0.71 専用ツール群 — `071-cli`・`071-env`・
`071-now` — の設計ドキュメント。実装着手の**前に**作成しレビューする。

## 1. 背景

WordPress 0.71（b2/cafelog、2003 年）は現代の WordPress ツールを利用できない:

- **wp-cli** は現代的なブートストラップ（`wp-load.php`・`wp-settings.php`・
  `WP_CLI` フック群）を前提とするが、いずれも 0.71 には存在しない。
- **wp-env** は `wp-includes/version.php` を読み、セットアップを wp-cli で
  進めるため、b2/cafelog 構成では即座に失敗する（`docs/docker-environment.md`
  参照）。
- **wp-now** / WordPress Playground は現代のコードベースとその DB スキーマを
  前提とする。

目標は 0.71 専用の代替ツールであり、各々を本リポジトリ内の npm パッケージと
する。

| ツール    | 相当するもの             | ディレクトリ        |
|-----------|--------------------------|---------------------|
| `071-cli` | wp-cli                   | `/tools/cli`        |
| `071-env` | wp-env                   | `/tools/env`        |
| `071-now` | wp-now / WP Playground   | `/tools/playground` |

## 2. リポジトリ構成 — npm workspaces

3 パッケージは `tools/` 配下に置かれ、ルート `package.json` の npm
workspaces として宣言する:

```
package.json          # ルート: "workspaces": ["tools/cli", "tools/env", "tools/playground"]
tools/cli/            # 071-cli  パッケージ
tools/env/            # 071-env  パッケージ
tools/playground/     # 071-now  パッケージ
tools/block-editor/   # カスタムブロックエディタのビルドソース（独自 package.json）
src/                  # WordPress 0.71 ソース（変更なし）
```

各 workspace パッケージは独自の `package.json`・バージョン・`bin` エントリを
持つ。カスタムブロックエディタのビルドソース（`tools/block-editor`）は独自の
`package.json` を持つが、意図的に workspaces 集合の外に置かれ、
`cd tools/block-editor && npm install && npm run build` で単独でビルドする。

## 3. `071-cli`（`/tools/cli`）

WordPress 0.71 が実際にできることを対象とした wp-cli 風 CLI。

### 3.1 中核が PHP である理由

`071-cli` は 0.71 自身のデータベース層（`b2config.php` →
`b2-include/wp-db.php` → `$wpdb`）を通じて 0.71 のデータを読み書きする
必要がある。この層は PHP であるため、`071-cli` の実体は PHP プログラムと
なる。npm パッケージはそれをラップする。

### 3.2 パッケージ構成

```
tools/cli/
  package.json        # name "071-cli"、bin { "071": "bin/071.mjs" }
  bin/071.mjs         # Node エントリ: PHP バイナリを探し、PHP CLI を起動し、
                      #   引数と終了コードを橋渡しする
  php/071-cli.php     # PHP CLI エントリポイント（引数ルーティング）
  php/bootstrap.php   # 0.71 DB 層のヘッドレスブートストラップ
  php/commands/*.php  # コマンドグループごとに 1 ファイル
```

Node の `bin` シムは、本ツールが他の npm パッケージと同様にインストール・
実行できるようにするためだけに存在する（`npx 071-cli ...`、またはリンク
された `071` コマンド）。実処理はすべて PHP 層にある。

### 3.3 ヘッドレスブートストラップ

`php/bootstrap.php` は `b2config.php`（最後に `wp-db.php` を require し
`$wpdb` を公開する）と、正しい整形・エスケープに必要な `b2-include/` の
関数ファイル数点を、**Web コンテキスト無し**で読み込む（`$_GET`・`$_COOKIE`
無し、`header()` 出力無し）。これは、ブロックエディタの JSON エンドポイント
向けに同じことを既に行っている `src/block-editor/api/bootstrap.php` に倣う。

0.71 のインストールパスは `--path` フラグ・`B2_PATH` 環境変数・既定値
`./src` の順で解決する。

### 3.4 コマンド体系

```
071 post     list | get <id> | create | update <id> | delete <id>
071 user     list | get <id> | create | update <id> | delete <id>
071 category list | get <id> | create | delete <id>
071 comment  list | get <id> | delete <id>
071 link     list | get <id> | create | delete <id>
071 option   list | get <name> | set <name> <value>      # b2settings
071 db       query <sql> | tables
071 export   run                                          # static-site export
```

グローバルフラグ: `--format=table|json|csv|count|ids`（既定 `table`）・
`--fields=<a,b,c>`・`--path=<dir>`。

例:

```
$ 071 post list --fields=ID,post_title,post_status
+----+-------------------+-------------+
| ID | post_title        | post_status |
+----+-------------------+-------------+
|  1 | Hello world!      | publish     |
+----+-------------------+-------------+
```

コマンド体系は `post` / `user` / `category` / `option` / `db` から始め、
`comment` / `link` へ拡張する。0.71 がサポートする範囲に意図的に限定する
— 単一の投稿カテゴリーを超えるタクソノミーも、ポストメタも、REST も無い。

`export` グループはただ一つの例外である: データベースを読み書きする代わりに
稼働中のブログを HTTP でクロールし、`static-export/` 配下に自己完結した静的
HTML サイトを書き出す — 2003 年当時のブログを安全に公開する方法である。
これはかつての単独スクリプト `bin/static-export.php` を CLI へ畳み込んだ
ものである。`composer static-export` は `071 export` の薄いエイリアスとして
残す。データベースアクセスを行わないため、セクション 3.3 のヘッドレス
ブートストラップは使わない。`docs/static-export.md` を参照。

### 3.5 実行場所

`071-cli` は `web` コンテナ内で実行する（PHP 8.3 が存在し、`db` ホストが
解決できる）。Node の `bin` により、PHP バイナリを持ち DB に到達できる
ホスト上での実行も可能。主要な入口は後述の `071-env run cli` である。

### 3.6 phpcs / phpstan

`/tools/cli` 配下の新しい PHP は使い捨ての試作ではなく保守されるツールであるため、
`phpcs` / `phpstan` のスキャン対象に**含める**（実験的として除外している
`src/block-editor/api/` とは異なる）。これは Phase 1 の Issue で確定する。

### 3.7 機能テストスイート（Behat）

`071-cli` には Behat の機能テストスイートがある。wp-cli 自身の Behat
テストの 0.71 版である。Gherkin の feature ファイルは `tools/cli/features/` 配下に
置き、コマンドグループごとに 1 ファイルとエントリポイント用の
`cli.feature` を持つ。すべての動詞、すべての `--format` バリアント、
`--fields`、エラーケースをカバーする。PHP の `FeatureContext`
（`tools/cli/features/bootstrap/FeatureContext.php`）は `071` CLI を子プロセスとして
実行し、その STDOUT / STDERR / 終了コードに対してアサートする。

`export` グループはグループごとのデータベースカバレッジの例外である:
`export.feature` はヘルプテキスト、未知の動詞エラー、到達不能ブログの失敗
経路をカバーする。完全な書き出し実行は稼働中のブログを HTTP でクロールする
ため — データベース専用のハーネスはそれを提供しない。完全な書き出し実行は
稼働中の Docker 環境に対して手動で検証する。

**データベース分離。** スイートは開発者の `b2` データベースに決して触れない。
`tools/cli/tests/docker-compose.yml` は**別の Docker Compose プロジェクト**
（`071-cli-test`）であり、独自の MySQL 8 をホストポート **3307** で実行し、
`b2_test` という名前のデータベースを持つ。`@BeforeScenario` フックが各
シナリオの前に `tools/cli/tests/fixtures.sql`（`wp-admin/wp-install.php` 由来の
WordPress 0.71 スキーマと、固定の最小フィクスチャ集合）からそのデータ
ベースを再投入するため、各シナリオは同一の既知の状態から開始する。

実行は `composer behat`（テストデータベースを起動し、healthy になるのを
待ってから Behat を実行する）。`tools/cli/php` の PHP は `phpcs` / `phpstan` の
対象のまま。`tools/cli/features/` と `tools/cli/tests/` 配下の Behat の PHP はテスト
コードであり、その対象外である。`tools/cli/README.md` を参照。

## 4. `071-env`（`/tools/env`）

既存の Docker Compose 環境をラップする Node CLI — `wp-env` との対応。

### 4.1 パッケージ構成

```
tools/env/
  package.json        # name "071-env"、bin { "071-env": "bin/071-env.mjs" }
  bin/071-env.mjs     # Node CLI エントリポイント
  src/*.mjs           # サブコマンドごとに 1 モジュール
```

### 4.2 コマンド

| コマンド               | 動作 |
|------------------------|--------|
| `071-env start`        | `docker compose up -d --build` |
| `071-env stop`         | `docker compose stop` |
| `071-env destroy`      | `docker compose down -v`（確認プロンプト — DB ボリュームを削除） |
| `071-env status`       | `docker compose ps` |
| `071-env logs [svc]`   | `docker compose logs -f` |
| `071-env run cli <…>`  | `web` コンテナ内で `071-cli` を実行 |
| `071-env run <cmd…>`   | `web` コンテナ内で任意のコマンドを実行 |

`071-env` は既存の `tools/env/docker-compose.yml` をラップするものであり、
置き換えるものではない。

### 4.3 コンテナ内の `071-cli` への到達

`web` コンテナにマウントされるのは `./src` のみで、`071-cli` の PHP は
`/tools/cli` — Web ドキュメントルートの外 — に置かれる（CLI を Web 配信させない
ための意図的な配置）。`071-env` はこれを Compose の**オーバーライドファイル**
（`tools/env/docker-compose.071.yml`）で橋渡しする。これは `./tools/cli` を読み取り専用で
コンテナ内 `/opt/071-cli` にバインドマウントする。`071-env` の各 Compose
呼び出しは両ファイルを渡す:

```
docker compose -f tools/env/docker-compose.yml -f tools/env/docker-compose.071.yml …
```

`071-env run cli <args>` は次のようになる:

```
docker compose … exec web php /opt/071-cli/php/071-cli.php <args>
```

これにより、Issue #104 の要求どおり `071-env run cli post list` が
コンテナ内で `071 post list` を実行する。

### 4.4 設定 — `.071-env.json`

`071-env` はリポジトリルートの任意の `.071-env.json` を読む — wp-env の
`.wp-env.json` の相当物である。任意の `.071-env.override.json`（git 管理外、
開発者ごと）がその上に**ディープマージ**される。wp-env が用いるローカル
上書きパターンである。どちらのファイルも無い場合、`071-env` は組み込みの
既定値にフォールバックするため、環境は設定無しでも動作する。

**スキーマ** — 各フィールドは任意:

| フィールド          | 型                     | 既定値  | 効果 |
|---------------------|------------------------|---------|------|
| `port`              | 整数（1–65535）        | `8080`  | `web` のホストポート |
| `dbPort`            | 整数（1–65535）        | `3306`  | `db` のホストポート |
| `phpVersion`        | 文字列                 | `"8.3"` | ベース PHP イメージのタグ（`php:<v>-apache`） |
| `mappings`          | オブジェクト（文字列→文字列） | `{}` | `web` 向けの追加の読み書きバインドマウント（コンテナパス → ホストパス） |
| `lifecycleScripts`  | オブジェクト（文字列→文字列） | `{}` | フック名 → シェルコマンド（`afterStart`・`beforeDestroy`） |

設定は検証される: 未知のキー・誤った型・未知のライフサイクルフックは、
問題のファイル名を含む明確なエラーとともに拒否される。

`.071-env.json` の例:

```json
{
  "port": 9000,
  "dbPort": 3399,
  "phpVersion": "8.3",
  "mappings": {
    "/var/www/html/wp-content/themes/custom": "./themes/custom"
  },
  "lifecycleScripts": {
    "afterStart": "echo environment is up",
    "beforeDestroy": "echo backing up before teardown"
  }
}
```

**各フィールドの適用方法:**

- **`port` / `dbPort`** — `tools/env/docker-compose.yml` は既定値付きの
  Compose 変数置換 — `"${WP_PORT:-8080}:80"` と `"${DB_PORT:-3306}:3306"` —
  を使い、`071-env` は起動する `docker compose` の環境に `WP_PORT` /
  `DB_PORT` を渡す。Compose は `-f` ファイル間でポートのリストを**追記**する
  ため、重ねた上書きファイルではポートを変更できない。環境変数置換が正しい
  仕組みである。変数を設定しない素の `docker compose up` は引き続き
  8080 / 3306 を使う。
- **`phpVersion`** — `tools/env/Dockerfile` は `ARG PHP_VERSION=8.3` と
  `FROM php:${PHP_VERSION}-apache` を宣言し、`tools/env/docker-compose.yml`
  の `web` サービスは `build.args` エントリ
  `PHP_VERSION: "${PHP_VERSION:-8.3}"` を持ち、`071-env` は `PHP_VERSION` を
  渡す。素の `docker build` は引き続き 8.3 を既定とする。
- **`mappings`** — `071-env` は実行時に Compose オーバーライド
  （リポジトリルートの `docker-compose.071-mappings.yml`、git 管理外）を
  生成し、`web` サービスに追加の `volumes` を加え、`tools/env/docker-compose.yml`
  と `tools/env/docker-compose.071.yml` の後ろに 3 つ目の `-f` として渡す。Compose は
  `-f` ファイル間で `volumes` をきれいに追記する。`mappings` が空のときは
  生成ファイルを削除し、追加の `-f` も渡さない。
- **`lifecycleScripts`** — `071-env` はフックのシェルコマンドを、システム
  シェル経由でリポジトリルートにて、適切なタイミングで実行する: `afterStart`
  は `start` 成功後、`beforeDestroy` は destroy 確認後・Compose が環境を破棄
  する前（フックがまだ稼働中のスタックに到達できる）。`beforeDestroy` フック
  が失敗したら destroy を中止する。

すべての既定値が保持されるため、`071-env` を介さない素の `docker compose up`
も以前とまったく同じく動作する — 変更は非破壊的である。

## 5. `071-now`（`/tools/playground`）

ブラウザ内 WordPress 0.71 — wp-now / WordPress Playground に倣う。

### 5.1 アプローチ

`071-now` は `@php-wasm/web`（WordPress Playground を支える WebAssembly PHP
ランタイム）でブラウザ内 PHP を動かし、0.71 の `src/` を php-wasm の仮想
ファイルシステムから配信する。

### 5.2 データベース問題（主たるリスク）

0.71 の `wp-db.php` は `mysqli` 経由で MySQL と通信する。ブラウザ内に
MySQL サーバーは存在しない。WordPress Playground は同じ問題を、ブラウザ内
SQLite データベースと MySQL→SQLite 変換層で解決している。

0.71 向けの候補は 2 つ:

- **(A) SQLite ベースの `wpdb`** — `$wpdb` が SQLite に対して動作する
  0.71 専用の `wp-db.php` を用意する（php-wasm は SQLite を同梱する）。
- **(B) `mysqli` シム** — SQLite の上に `mysqli` 互換のユーザーランド層を
  設け、0.71 既存の `wp-db.php` を無改変で動かす。

いずれも 0.71 の SQL — `wp-install.php` のスキーマ DDL とコードベース全体の
クエリ — を SQLite 方言へ変換する必要がある。

**重要な洞察:** 0.71 の SQL は非常に小さい — 数個のテーブルと単純なクエリ
のみで、現代の WordPress よりはるかに小さい。これにより変換は現実的となり、
`071-now` を実現可能にしている。

### 5.3 計画

Phase 3 は**実現可能性検証（feasibility spike）**から始めた: 本格実装に
踏み切る前に、投稿 1 件を投入した SQLite ベースの DB に対して php-wasm が
0.71 のフロントページを描画できることを確認した（検証結果は
`docs/071-now-spike.md`）。その後、本格実装を 6 ステップで進めた。

### 5.4 状況 — 実装済み

`071-now` は **実装済み**であり、スパイクではない。`/tools/playground` は
WordPress 0.71 を完全にブラウザ内で動かす — `@php-wasm/web` 経由で
WebAssembly へコンパイルした PHP 8.3 が、ブラウザ内 SQLite データベースを
読み、MySQL サーバーも Web サーバーも介さない。本格実装はアンブレラ
Issue #104 の下で 6 ステップで実施した:

1. **サービスワーカー配信**（#117）— ブラウザ内ブログをリクエスト
   ルーティングのサービスワーカー経由で配信し、自身の CSS を読み込み
   完全に遷移できるようにする。
2. **PHP 8.3 のみのバンドル**（#119）— Vite プラグインが php-wasm
   バンドルを PHP 8.3 ランタイムのみへ絞る（約 290 MB から 40 MB へ）。
3. **動作する管理画面**（#121）— WordPress 0.71 の管理画面（`wp-admin/`）
   が動作する: ログイン済みで開き、管理画面から投稿の作成・編集と
   カテゴリーの管理ができる。
4. **永続化データベース**（#123）— SQLite データベースをブラウザ内に
   永続化し（OPFS / IndexedDB）、管理画面から作成した内容がリロードを
   越えて残る。リセット操作付き。
5. **画像アップロード**（#125）— 従来型管理画面の `b2upload.php` から
   アップロードした画像が保存・配信・永続化される。
6. **仕上げ**（#126）— 新規 playground は小さなシード済みデモブログ
   （複数カテゴリーにまたがる数件の投稿）で開き、ローディング
   スプラッシュが php-wasm の起動を覆い、ホストページが playground を
   枠付けしリポジトリへリンクする。

パッケージ・そのレイアウト・`npm run build` / `dev` / `preview` /
`verify` のワークフローは `tools/playground/README.md` に記載している。

### 5.5 公開デプロイ — GitHub Pages（#128）

`071-now` は GitHub Pages へデプロイされ、リポジトリを見た人が
<https://mt8.github.io/wordpress-0.71-gold/> から起動できる。

- **ワークフロー。** `.github/workflows/playground-pages.yml` が
  `tools/playground` の npm ワークスペースをビルドし、その `dist/` を
  `actions/configure-pages`・`actions/upload-pages-artifact`・
  `actions/deploy-pages` で公開する。`main` への push と手動ディスパッチ
  で実行され、標準の `pages: write` / `id-token: write` /
  `contents: read` 権限と `github-pages` 環境を用いる。ビルド成果物は
  約 54 MB（約 40 MB の PHP 8.3 `.wasm` ランタイムを含む）で、GitHub
  Pages の 1 GB サイトサイズ上限に十分収まる。
- **ベースパス。** プロジェクトページはリポジトリ名配下で配信されるため、
  ワークフローは `PLAYGROUND_BASE=/wordpress-0.71-gold/` でビルドする。
  `vite.config.js` がこれを公開ベースとして読み取り、ブラウザアプリ
  （`src/main.js`）はサービスワーカー登録とスコープ付きブログのパスを
  そのベース配下に構築する — これでサービスワーカーのスコープが
  スコープ付きトラフィックを覆う。ローカルの `preview` / `verify` は
  既定の `/` のままである。
- **クロスオリジン分離。** php-wasm は `SharedArrayBuffer` 上で PHP
  スレッドを動かすが、ブラウザはこれを cross-origin-isolated なページ
  — COOP/COEP ヘッダ付きで配信されたページ — にのみ公開する。GitHub
  Pages はカスタム HTTP ヘッダを設定できないため、playground の
  サービスワーカー（`public/sw.js`）が自前で付与する。リクエスト
  ルーティングの役割と並んで、アプリシェルの全応答をネットワークから
  取得し、`Cross-Origin-Opener-Policy: same-origin` /
  `Cross-Origin-Embedder-Policy: require-corp`（および
  `Cross-Origin-Resource-Policy`）を付けて再配信する — `coi-serviceworker`
  の手法を、新たな登録ではなく既存の 1 つのサービスワーカー内で行う。
  初回訪問ではワーカーがページを制御する前にドキュメントが取得される
  ため、`src/main.js` が一度だけリロードして（`sessionStorage` フラグで
  ガード）ヘッダを取り込む。ローカルの dev / preview サーバーは自身で
  ヘッダを送るためリロードは起きない。

## 6. フェーズ

アンブレラ Issue #104 の下で追跡する。子 Issue は順に:

1. **設計ドキュメント** — 本ファイル（現在の PR）。
2. **Phase 1 — `071-cli`** — npm workspaces の整備と `/tools/cli` パッケージ・
   そのコマンドグループ。
3. **Phase 2 — `071-env`** — `/tools/env` パッケージ。
4. **Phase 3 — `071-now`** — まず実現可能性検証の Issue、その後に本実装。

各フェーズは CLAUDE.md に従い、個別のブランチ・PR・コードレビュー・マージと
する。

## 7. 規約

- Issue・PR・コミット・ドキュメントは「Japanese below」形式でバイリンガル。
  コードコメントは英語のみ。「by AI」表記は付けない。
- npm workspaces。リポジトリの Node バージョン（v24）。
- CLAUDE.md に従い、最終形は再現可能なローカル環境であり続ける。ここでは
  `071-env` がその環境の入口となる。
