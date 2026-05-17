# 071-env

A wp-env-style environment manager for WordPress 0.71 (b2/cafelog). It wraps
the repository's existing Docker Compose environment -- it does not replace it.
See the design in [`docs/071-tooling.md`](../docs/071-tooling.md) section 4.

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
`/cli` -- outside the Apache document root, intentionally, so the CLI is not
web-served. `071-env` bridges this with a Compose **override file**,
[`docker-compose.071.yml`](docker-compose.071.yml), which bind-mounts `./cli`
read-only into the container at `/opt/071-cli`. Every `071-env` Compose call
passes both files:

```
docker compose -f docker-compose.yml -f env/docker-compose.071.yml …
```

So `071-env run cli post list` becomes:

```
docker compose … exec web php /opt/071-cli/php/071-cli.php post list --path=/var/www/html
```

Inside the container the database host `db` resolves, so no `--dbhost` flag is
needed.

## Package structure

```
env/
  package.json            name "071-env", bin { "071-env": "bin/071-env.mjs" }
  docker-compose.071.yml  Compose override: bind-mounts cli/ at /opt/071-cli
  bin/071-env.mjs         Node CLI entry point (thin wrapper around src/main.mjs)
  src/
    cli.mjs               argument / command parsing and help text (pure)
    compose.mjs           builds the `docker compose` argv for each command (pure)
    paths.mjs             resolves the repository root from this file's location
    prompt.mjs            interactive yes/no confirmation for `destroy`
    docker.mjs            spawns the `docker` binary (impure boundary)
    main.mjs              command dispatcher
  test/
    cli.test.mjs          tests argument / command parsing
    compose.test.mjs      tests the `docker compose` argv each command builds
    prompt.test.mjs       tests the confirmation logic
    main.test.mjs         tests the dispatcher's non-Docker paths
```

## Tests

Unit tests use Node's built-in test runner (`node:test`) -- no extra
dependency. They cover the pure logic: argument / command parsing and the
`docker compose` argv each subcommand constructs.

```
npm run test:env        # from the repository root
npm test                # from env/
```

---

# 071-env

WordPress 0.71 (b2/cafelog) 向けの wp-env 風環境マネージャ。リポジトリの既存
Docker Compose 環境をラップする -- 置き換えはしない。設計は
[`docs/071-tooling.md`](../docs/071-tooling.md) セクション 4 を参照。

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

`web` コンテナにマウントされるのは `./src` のみで、`071-cli` の PHP は `/cli`
-- Apache ドキュメントルートの外 -- に置かれる（CLI を Web 配信させないための
意図的な配置）。`071-env` はこれを Compose の**オーバーライドファイル**
[`docker-compose.071.yml`](docker-compose.071.yml) で橋渡しする。これは
`./cli` を読み取り専用でコンテナ内 `/opt/071-cli` にバインドマウントする。
`071-env` の各 Compose 呼び出しは両ファイルを渡す:

```
docker compose -f docker-compose.yml -f env/docker-compose.071.yml …
```

そのため `071-env run cli post list` は次のようになる:

```
docker compose … exec web php /opt/071-cli/php/071-cli.php post list --path=/var/www/html
```

コンテナ内ではデータベースホスト `db` が解決されるため、`--dbhost` フラグは
不要である。

## パッケージ構成

```
env/
  package.json            name "071-env"、bin { "071-env": "bin/071-env.mjs" }
  docker-compose.071.yml  Compose オーバーライド: cli/ を /opt/071-cli にバインドマウント
  bin/071-env.mjs         Node CLI エントリポイント（src/main.mjs の薄いラッパ）
  src/
    cli.mjs               引数 / コマンドの解析とヘルプテキスト（純粋）
    compose.mjs           各コマンドの `docker compose` 引数ベクタを構築（純粋）
    paths.mjs             本ファイルの位置からリポジトリルートを解決
    prompt.mjs            `destroy` のための対話的な yes/no 確認
    docker.mjs            `docker` バイナリを起動する（非純粋な境界）
    main.mjs              コマンドディスパッチャ
  test/
    cli.test.mjs          引数 / コマンドの解析をテスト
    compose.test.mjs      各コマンドが構築する `docker compose` 引数ベクタをテスト
    prompt.test.mjs       確認ロジックをテスト
    main.test.mjs         ディスパッチャの Docker 非経由パスをテスト
```

## テスト

単体テストは Node 組み込みのテストランナー（`node:test`）を使用する --
追加の依存は無い。純粋ロジックを対象とする: 引数 / コマンドの解析と、各
サブコマンドが構築する `docker compose` 引数ベクタ。

```
npm run test:env        # リポジトリルートから
npm test                # env/ から
```
