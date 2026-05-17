# 071-env

A wp-env-style environment manager for WordPress 0.71 (b2/cafelog). It wraps
the repository's existing Docker Compose environment -- it does not replace it.
See the design in [`docs/071-tooling.md`](../../docs/071-tooling.md) section 4.

---

## Usage

```
071-env <command> [arguments]
```

| Command                | Action |
|------------------------|--------|
| `071-env start`        | Build and start the environment (`docker compose up -d --build`) |
| `071-env stop`         | Stop the environment without removing it (`docker compose stop`) |
| `071-env destroy`      | Stop and remove the environment **and its database volume** (`docker compose down -v`) -- asks for confirmation first |
| `071-env status`       | Show the status of the environment (`docker compose ps`) |
| `071-env logs [svc]`   | Follow the environment logs (`docker compose logs -f [service]`) |
| `071-env run cli <…>`  | Run `071-cli` inside the `web` container |
| `071-env run <cmd…>`   | Run an arbitrary command in the `web` container |

`071-env` resolves the repository root from its own location, so it works
regardless of the caller's current working directory.

### Examples

```
071-env start
071-env run cli post list
071-env run cli post list --format=json
071-env run php -v
071-env logs web
071-env destroy            # prompts before deleting the database volume
```

## How `run cli` reaches the container

Only `./src` is mounted into the `web` container, and `071-cli`'s PHP lives in
`/tools/cli` -- outside the Apache document root, intentionally, so the CLI is
not web-served. `071-env` bridges this with a Compose **override file**,
[`docker-compose.071.yml`](docker-compose.071.yml), which bind-mounts
`./tools/cli` read-only into the container at `/opt/071-cli`. Every `071-env`
Compose call passes both files:

```
docker compose -f docker-compose.yml -f tools/env/docker-compose.071.yml …
```

So `071-env run cli post list` becomes:

```
docker compose … exec web php /opt/071-cli/php/071-cli.php post list --path=/var/www/html
```

Inside the container the database host `db` resolves, so no `--dbhost` flag is
needed.

## Configuration -- `.071-env.json`

`071-env` reads an optional `.071-env.json` at the repository root -- the
analogue of wp-env's `.wp-env.json`. An optional `.071-env.override.json`
(git-ignored, per-developer) is **deep-merged on top** of it. When neither
file exists `071-env` falls back to built-in defaults, so the environment
works with no configuration at all.

Every field is optional:

| Field              | Type                   | Default | Effect |
|--------------------|------------------------|---------|--------|
| `port`             | integer (1-65535)      | `8080`  | `web` host port |
| `dbPort`           | integer (1-65535)      | `3306`  | `db` host port |
| `phpVersion`       | string                 | `"8.3"` | base PHP image tag (`php:<v>-apache`) |
| `mappings`         | object (string→string) | `{}`    | extra read-write bind mounts for `web` (container path → host path) |
| `lifecycleScripts` | object (string→string) | `{}`    | hook name → shell command (`afterStart`, `beforeDestroy`) |

The config is validated -- an unknown key, a wrong type, or an unknown
lifecycle hook is rejected with a clear error.

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

How each field is applied:

- **`port` / `dbPort`** -- `docker-compose.yml` uses Compose variable
  substitution with defaults (`"${WP_PORT:-8080}:80"`,
  `"${DB_PORT:-3306}:3306"`); `071-env` passes `WP_PORT` / `DB_PORT` in the
  environment of `docker compose`. Compose appends port lists across `-f`
  files, so a layered override cannot change a port -- variable substitution
  is the correct mechanism.
- **`phpVersion`** -- the `Dockerfile` declares `ARG PHP_VERSION=8.3` /
  `FROM php:${PHP_VERSION}-apache`, the `web` service has a `build.args`
  entry, and `071-env` passes `PHP_VERSION`.
- **`mappings`** -- `071-env` generates a Compose override at runtime
  (`docker-compose.071-mappings.yml`, git-ignored) adding the extra `volumes`
  to the `web` service, passed as a third `-f`.
- **`lifecycleScripts`** -- `071-env` runs the hook's shell command at the
  right time: `afterStart` after a successful `start`, `beforeDestroy` after
  the destroy confirmation but before Compose tears the environment down. A
  failing `beforeDestroy` aborts the destroy.

A plain `docker compose up` without `071-env` still works exactly as before
-- all defaults are preserved. See [`docs/071-tooling.md`](../../docs/071-tooling.md)
section 4.4.

## Package structure

```
tools/env/
  package.json            name "071-env", bin { "071-env": "bin/071-env.mjs" }
  docker-compose.071.yml  Compose override: bind-mounts tools/cli/ at /opt/071-cli
  bin/071-env.mjs         Node CLI entry point (thin wrapper around src/main.mjs)
  src/
    cli.mjs               argument / command parsing and help text (pure)
    compose.mjs           builds the `docker compose` argv for each command (pure)
    config.mjs            loads / deep-merges / validates .071-env.json (pure + load)
    env-vars.mjs          derives WP_PORT / DB_PORT / PHP_VERSION (pure)
    mappings.mjs          generates the runtime `mappings` Compose override
    lifecycle.mjs         looks up and runs lifecycle-hook shell commands
    paths.mjs             resolves the repository root from this file's location
    prompt.mjs            interactive yes/no confirmation for `destroy`
    docker.mjs            spawns the `docker` binary (impure boundary)
    main.mjs              command dispatcher
  test/
    cli.test.mjs          tests argument / command parsing
    compose.test.mjs      tests the `docker compose` argv each command builds
    config.test.mjs       tests config loading / deep-merge / validation
    env-vars.test.mjs     tests env-var derivation
    mappings.test.mjs     tests the generated mappings override
    lifecycle.test.mjs    tests lifecycle-hook lookup and dispatch
    prompt.test.mjs       tests the confirmation logic
    main.test.mjs         tests the dispatcher's non-Docker paths
```

The repository root holds the committed `.071-env.json` (the project's
explicit default config). `.071-env.override.json` and the generated
`docker-compose.071-mappings.yml` are git-ignored.

## Tests

Unit tests use Node's built-in test runner (`node:test`) -- no extra
dependency. They cover the pure logic: argument / command parsing, the
`docker compose` argv each subcommand constructs, config loading / deep-merge
/ validation, env-var derivation, the generated mappings override, and
lifecycle-hook dispatch.

```
npm run test:env        # from the repository root
npm test                # from tools/env/
```

---

# 071-env

WordPress 0.71 (b2/cafelog) 向けの wp-env 風環境マネージャ。リポジトリの既存
Docker Compose 環境をラップする -- 置き換えはしない。設計は
[`docs/071-tooling.md`](../../docs/071-tooling.md) セクション 4 を参照。

---

## 使い方

```
071-env <command> [arguments]
```

| コマンド               | 動作 |
|------------------------|--------|
| `071-env start`        | 環境をビルドして起動する（`docker compose up -d --build`） |
| `071-env stop`         | 環境を削除せず停止する（`docker compose stop`） |
| `071-env destroy`      | 環境**とそのデータベースボリューム**を停止・削除する（`docker compose down -v`） -- 先に確認する |
| `071-env status`       | 環境の状態を表示する（`docker compose ps`） |
| `071-env logs [svc]`   | 環境のログを追従する（`docker compose logs -f [service]`） |
| `071-env run cli <…>`  | `web` コンテナ内で `071-cli` を実行する |
| `071-env run <cmd…>`   | `web` コンテナ内で任意のコマンドを実行する |

`071-env` は自身の位置からリポジトリルートを解決するため、呼び出し元の
カレントディレクトリによらず動作する。

### 例

```
071-env start
071-env run cli post list
071-env run cli post list --format=json
071-env run php -v
071-env logs web
071-env destroy            # データベースボリュームの削除前に確認する
```

## `run cli` がコンテナへ到達する仕組み

`web` コンテナにマウントされるのは `./src` のみで、`071-cli` の PHP は
`/tools/cli` -- Apache ドキュメントルートの外 -- に置かれる（CLI を Web
配信させないための意図的な配置）。`071-env` はこれを Compose の
**オーバーライドファイル** [`docker-compose.071.yml`](docker-compose.071.yml)
で橋渡しする。これは `./tools/cli` を読み取り専用でコンテナ内 `/opt/071-cli`
にバインドマウントする。`071-env` の各 Compose 呼び出しは両ファイルを渡す:

```
docker compose -f docker-compose.yml -f tools/env/docker-compose.071.yml …
```

そのため `071-env run cli post list` は次のようになる:

```
docker compose … exec web php /opt/071-cli/php/071-cli.php post list --path=/var/www/html
```

コンテナ内ではデータベースホスト `db` が解決されるため、`--dbhost` フラグは
不要である。

## 設定 -- `.071-env.json`

`071-env` はリポジトリルートの任意の `.071-env.json` を読む -- wp-env の
`.wp-env.json` の相当物である。任意の `.071-env.override.json`（git 管理外、
開発者ごと）がその上に**ディープマージ**される。どちらのファイルも無い場合、
`071-env` は組み込みの既定値にフォールバックするため、環境は設定無しでも
動作する。

各フィールドは任意:

| フィールド          | 型                          | 既定値  | 効果 |
|---------------------|-----------------------------|---------|------|
| `port`              | 整数（1-65535）             | `8080`  | `web` のホストポート |
| `dbPort`            | 整数（1-65535）             | `3306`  | `db` のホストポート |
| `phpVersion`        | 文字列                      | `"8.3"` | ベース PHP イメージのタグ（`php:<v>-apache`） |
| `mappings`          | オブジェクト（文字列→文字列） | `{}`  | `web` 向けの追加の読み書きバインドマウント（コンテナパス → ホストパス） |
| `lifecycleScripts`  | オブジェクト（文字列→文字列） | `{}`  | フック名 → シェルコマンド（`afterStart`・`beforeDestroy`） |

設定は検証される -- 未知のキー・誤った型・未知のライフサイクルフックは、
明確なエラーとともに拒否される。

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

各フィールドの適用方法:

- **`port` / `dbPort`** -- `docker-compose.yml` は既定値付きの Compose 変数
  置換（`"${WP_PORT:-8080}:80"`・`"${DB_PORT:-3306}:3306"`）を使い、`071-env`
  は `docker compose` の環境に `WP_PORT` / `DB_PORT` を渡す。Compose は `-f`
  ファイル間でポートのリストを追記するため、重ねた上書きではポートを変更
  できない -- 変数置換が正しい仕組みである。
- **`phpVersion`** -- `Dockerfile` は `ARG PHP_VERSION=8.3` /
  `FROM php:${PHP_VERSION}-apache` を宣言し、`web` サービスは `build.args`
  エントリを持ち、`071-env` は `PHP_VERSION` を渡す。
- **`mappings`** -- `071-env` は実行時に Compose オーバーライド
  （`docker-compose.071-mappings.yml`、git 管理外）を生成し、`web` サービスに
  追加の `volumes` を加え、3 つ目の `-f` として渡す。
- **`lifecycleScripts`** -- `071-env` はフックのシェルコマンドを適切な
  タイミングで実行する: `afterStart` は `start` 成功後、`beforeDestroy` は
  destroy 確認後・Compose が環境を破棄する前。`beforeDestroy` が失敗したら
  destroy を中止する。

`071-env` を介さない素の `docker compose up` も以前とまったく同じく動作する
-- すべての既定値が保持される。[`docs/071-tooling.md`](../../docs/071-tooling.md)
セクション 4.4 を参照。

## パッケージ構成

```
tools/env/
  package.json            name "071-env"、bin { "071-env": "bin/071-env.mjs" }
  docker-compose.071.yml  Compose オーバーライド: tools/cli/ を /opt/071-cli にバインドマウント
  bin/071-env.mjs         Node CLI エントリポイント（src/main.mjs の薄いラッパ）
  src/
    cli.mjs               引数 / コマンドの解析とヘルプテキスト（純粋）
    compose.mjs           各コマンドの `docker compose` 引数ベクタを構築（純粋）
    config.mjs            .071-env.json の読み込み / ディープマージ / 検証（純粋 + 読込）
    env-vars.mjs          WP_PORT / DB_PORT / PHP_VERSION を導出（純粋）
    mappings.mjs          実行時の `mappings` Compose オーバーライドを生成
    lifecycle.mjs         ライフサイクルフックのシェルコマンドを検索・実行
    paths.mjs             本ファイルの位置からリポジトリルートを解決
    prompt.mjs            `destroy` のための対話的な yes/no 確認
    docker.mjs            `docker` バイナリを起動する（非純粋な境界）
    main.mjs              コマンドディスパッチャ
  test/
    cli.test.mjs          引数 / コマンドの解析をテスト
    compose.test.mjs      各コマンドが構築する `docker compose` 引数ベクタをテスト
    config.test.mjs       設定の読み込み / ディープマージ / 検証をテスト
    env-vars.test.mjs     環境変数の導出をテスト
    mappings.test.mjs     生成される mappings オーバーライドをテスト
    lifecycle.test.mjs    ライフサイクルフックの検索とディスパッチをテスト
    prompt.test.mjs       確認ロジックをテスト
    main.test.mjs         ディスパッチャの Docker 非経由パスをテスト
```

リポジトリルートにはコミットされる `.071-env.json`（プロジェクトの明示的な
既定設定）が置かれる。`.071-env.override.json` と生成される
`docker-compose.071-mappings.yml` は git 管理外である。

## テスト

単体テストは Node 組み込みのテストランナー（`node:test`）を使用する --
追加の依存は無い。純粋ロジックを対象とする: 引数 / コマンドの解析、各
サブコマンドが構築する `docker compose` 引数ベクタ、設定の読み込み /
ディープマージ / 検証、環境変数の導出、生成される mappings オーバーライド、
ライフサイクルフックのディスパッチ。

```
npm run test:env        # リポジトリルートから
npm test                # tools/env/ から
```
