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

| Tool      | Equivalent of            | Directory     |
|-----------|--------------------------|---------------|
| `071-cli` | wp-cli                   | `/cli`        |
| `071-env` | wp-env                   | `/env`        |
| `071-now` | wp-now / WP Playground   | `/playground` |

## 2. Repository layout — npm workspaces

The three packages are declared as npm workspaces in the root `package.json`:

```
package.json          # root: adds "workspaces": ["cli", "env", "playground"]
cli/                  # 071-cli  package
env/                  # 071-env  package
playground/           # 071-now  package
src/                  # WordPress 0.71 source (unchanged)
src/block-editor/app/ # existing block-editor package (left as-is for now)
```

Each package has its own `package.json`, version, and `bin` entry. The
existing `src/block-editor/app` package is intentionally left outside the
workspace set in this first step to keep the change small; it can be folded
in later.

## 3. `071-cli` (`/cli`)

A wp-cli-style CLI covering what WordPress 0.71 can actually do.

### 3.1 Why the core is PHP

`071-cli` must read and write 0.71's data through 0.71's own database layer
(`b2config.php` → `b2-include/wp-db.php` → `$wpdb`). That layer is PHP, so
the substance of `071-cli` is a PHP program. The npm package wraps it.

### 3.2 Package structure

```
cli/
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

### 3.5 Where it runs

`071-cli` runs inside the `web` container (PHP 8.3 is present, and the `db`
host resolves). The Node `bin` also allows running it on a host that has a
PHP binary and can reach the database. `071-env run cli` (below) is the
primary entry point.

### 3.6 phpcs / phpstan

The new PHP under `/cli` is a maintained tool, not a throwaway prototype, so
it **is** included in the `phpcs` / `phpstan` scan (unlike
`src/block-editor/api/`, which is excluded as experimental). This is settled
in the Phase 1 Issue.

## 4. `071-env` (`/env`)

A Node CLI that wraps the existing Docker Compose environment — parity with
`wp-env`.

### 4.1 Package structure

```
env/
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

`071-env` wraps the existing `docker-compose.yml`; it does not replace it.

### 4.3 Reaching `071-cli` inside the container

Only `./src` is mounted into the `web` container, and `071-cli`'s PHP lives
in `/cli` — outside the web document root (intentionally, so the CLI is not
web-served). `071-env` bridges this with a Compose **override file**
(`env/docker-compose.071.yml`) that bind-mounts `./cli` read-only into the
container at `/opt/071-cli`. Every `071-env` Compose call passes both files:

```
docker compose -f docker-compose.yml -f env/docker-compose.071.yml …
```

`071-env run cli <args>` then becomes:

```
docker compose … exec web php /opt/071-cli/php/071-cli.php <args>
```

So `071-env run cli post list` runs `071 post list` in the container, as
required by Issue #104.

## 5. `071-now` (`/playground`)

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

Phase 3 begins with a **feasibility spike**: get php-wasm to render 0.71's
front page against a SQLite-backed database seeded with one post, before
committing to the full build. Image upload and the full admin are out of
scope for the spike.

## 6. Phasing

Tracked under umbrella Issue #104. Child Issues, in order:

1. **Design document** — this file (current PR).
2. **Phase 1 — `071-cli`** — npm workspaces setup + the `/cli` package and
   its command groups.
3. **Phase 2 — `071-env`** — the `/env` package.
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

| ツール    | 相当するもの             | ディレクトリ  |
|-----------|--------------------------|---------------|
| `071-cli` | wp-cli                   | `/cli`        |
| `071-env` | wp-env                   | `/env`        |
| `071-now` | wp-now / WP Playground   | `/playground` |

## 2. リポジトリ構成 — npm workspaces

3 パッケージはルート `package.json` の npm workspaces として宣言する:

```
package.json          # ルート: "workspaces": ["cli", "env", "playground"] を追加
cli/                  # 071-cli  パッケージ
env/                  # 071-env  パッケージ
playground/           # 071-now  パッケージ
src/                  # WordPress 0.71 ソース（変更なし）
src/block-editor/app/ # 既存のブロックエディタパッケージ（当面そのまま）
```

各パッケージは独自の `package.json`・バージョン・`bin` エントリを持つ。既存の
`src/block-editor/app` パッケージは、変更を小さく保つため、この最初の段階では
意図的に workspaces 集合の外に置く。後から取り込むことは可能。

## 3. `071-cli`（`/cli`）

WordPress 0.71 が実際にできることを対象とした wp-cli 風 CLI。

### 3.1 中核が PHP である理由

`071-cli` は 0.71 自身のデータベース層（`b2config.php` →
`b2-include/wp-db.php` → `$wpdb`）を通じて 0.71 のデータを読み書きする
必要がある。この層は PHP であるため、`071-cli` の実体は PHP プログラムと
なる。npm パッケージはそれをラップする。

### 3.2 パッケージ構成

```
cli/
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

### 3.5 実行場所

`071-cli` は `web` コンテナ内で実行する（PHP 8.3 が存在し、`db` ホストが
解決できる）。Node の `bin` により、PHP バイナリを持ち DB に到達できる
ホスト上での実行も可能。主要な入口は後述の `071-env run cli` である。

### 3.6 phpcs / phpstan

`/cli` 配下の新しい PHP は使い捨ての試作ではなく保守されるツールであるため、
`phpcs` / `phpstan` のスキャン対象に**含める**（実験的として除外している
`src/block-editor/api/` とは異なる）。これは Phase 1 の Issue で確定する。

## 4. `071-env`（`/env`）

既存の Docker Compose 環境をラップする Node CLI — `wp-env` との対応。

### 4.1 パッケージ構成

```
env/
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

`071-env` は既存の `docker-compose.yml` をラップするものであり、置き換える
ものではない。

### 4.3 コンテナ内の `071-cli` への到達

`web` コンテナにマウントされるのは `./src` のみで、`071-cli` の PHP は
`/cli` — Web ドキュメントルートの外 — に置かれる（CLI を Web 配信させない
ための意図的な配置）。`071-env` はこれを Compose の**オーバーライドファイル**
（`env/docker-compose.071.yml`）で橋渡しする。これは `./cli` を読み取り専用で
コンテナ内 `/opt/071-cli` にバインドマウントする。`071-env` の各 Compose
呼び出しは両ファイルを渡す:

```
docker compose -f docker-compose.yml -f env/docker-compose.071.yml …
```

`071-env run cli <args>` は次のようになる:

```
docker compose … exec web php /opt/071-cli/php/071-cli.php <args>
```

これにより、Issue #104 の要求どおり `071-env run cli post list` が
コンテナ内で `071 post list` を実行する。

## 5. `071-now`（`/playground`）

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

Phase 3 は**実現可能性検証（feasibility spike）**から始める: 本格実装に
踏み切る前に、投稿 1 件を投入した SQLite ベースの DB に対して php-wasm が
0.71 のフロントページを描画できることを確認する。画像アップロードと管理
画面全体は spike の対象外とする。

## 6. フェーズ

アンブレラ Issue #104 の下で追跡する。子 Issue は順に:

1. **設計ドキュメント** — 本ファイル（現在の PR）。
2. **Phase 1 — `071-cli`** — npm workspaces の整備と `/cli` パッケージ・
   そのコマンドグループ。
3. **Phase 2 — `071-env`** — `/env` パッケージ。
4. **Phase 3 — `071-now`** — まず実現可能性検証の Issue、その後に本実装。

各フェーズは CLAUDE.md に従い、個別のブランチ・PR・コードレビュー・マージと
する。

## 7. 規約

- Issue・PR・コミット・ドキュメントは「Japanese below」形式でバイリンガル。
  コードコメントは英語のみ。「by AI」表記は付けない。
- npm workspaces。リポジトリの Node バージョン（v24）。
- CLAUDE.md に従い、最終形は再現可能なローカル環境であり続ける。ここでは
  `071-env` がその環境の入口となる。
