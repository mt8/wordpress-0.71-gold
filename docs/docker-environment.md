# Docker Development Environment

Local development environment for running WordPress 0.71-gold on
PHP 8.3 + MySQL 8, as required by CLAUDE.md.

## File locations

The Docker environment files live in `tools/env/`, together with the
`071-env` environment manager and its override `docker-compose.071.yml`:

| File | Role |
|------|------|
| `tools/env/docker-compose.yml`     | The base Compose file (`web` + `db` services). |
| `tools/env/Dockerfile`             | The `web` image (`php:8.3-apache` + `mysqli`). |
| `tools/env/docker-compose.071.yml` | `071-env` override: bind-mounts `tools/cli/` into `web`. |

The Compose file's in-file relative paths (`./src`, the build context `.`)
are **repository-root-relative**, so Compose must run with its project
directory set to the repository root. `071-env` does this automatically; a
plain `docker compose` invocation must pass `--project-directory .` from the
repository root (see [Usage](#usage)).

## Composition

| Service | Image | Role |
|---------|-------|------|
| `web`   | Built from `tools/env/Dockerfile` (`php:8.3-apache`) | Apache + PHP 8.3. Serves `./src`. |
| `db`    | `mysql:8.0` (official) | MySQL 8 database. |

Both base images are official. The `Dockerfile` keeps customization minimal:
it adds the `mysqli` extension (the base image ships with neither `mysql` nor
`mysqli`) and raises PHP's upload limits (`upload_max_filesize = 16M`,
`post_max_size = 20M`) so the block editor can upload images (Issue #102).

## Usage

The simplest way to operate the environment is the `071-env` manager:

```sh
npx 071-env start      # build (first run) and start
npx 071-env stop       # stop without removing
npx 071-env status     # show container status
npx 071-env destroy    # stop and remove, including the database volume
```

The equivalent plain `docker compose` commands, run from the repository
root, must point at the Compose file and set the project directory:

```sh
# Start (build on first run)
docker compose -f tools/env/docker-compose.yml --project-directory . up -d --build

# Stop
docker compose -f tools/env/docker-compose.yml --project-directory . down

# Stop and remove the database volume
docker compose -f tools/env/docker-compose.yml --project-directory . down -v

# Open a shell in the web container
docker compose -f tools/env/docker-compose.yml --project-directory . exec web bash
```

After startup, open <http://localhost:8080>. `phpinfo` is available at
<http://localhost:8080/phpinfo.php>.

## Database connection

`src/b2config.php` defines the connection. `071-env start` generates that file
from `src/b2config-sample.php`; `DB_HOST` is set to `db` — the Compose service
name of the MySQL container.

| Setting | Value |
|---------|-------|
| `DB_HOST`      | `db` |
| `DB_NAME`      | `b2` |
| `DB_USER`      | `user` |
| `DB_PASSWORD`  | `pass` |

The `db` service environment variables mirror these values, and MySQL
auto-creates the `b2` database and the `user` account on first startup.

## Why not wp-env?

The official `@wordpress/env` (wp-env) tool was investigated (Issue #55)
as an alternative to this hand-written Compose setup, but **it cannot host
WordPress 0.71**. `wp-env start` fails immediately while reading its
configuration:

```
✖ ENOENT: no such file or directory, open '.../src/wp-includes/version.php'
```

wp-env detects the WordPress version by reading `wp-includes/version.php`, but
the 2003-era b2/cafelog layout has no `wp-includes/` directory at all (it uses
`b2-include/`). Beyond that first failure, wp-env also drives setup through
WP-CLI (`wp core install`), a generated `wp-config.php`, and the modern
`wp-load.php` / `wp-settings.php` bootstrap — none of which exist in
WordPress 0.71. wp-env is fundamentally tied to modern WordPress, so the
hand-written `tools/env/docker-compose.yml` here is the appropriate local
environment for this 2003 codebase.

---

# Docker 開発環境

CLAUDE.md の要求に従い、WordPress 0.71-gold を PHP 8.3 + MySQL 8 で
動作させるためのローカル開発環境。

## ファイルの配置

Docker 環境ファイルは `tools/env/` に置かれ、環境マネージャ `071-env` と
そのオーバーライド `docker-compose.071.yml` と同じ場所にまとまっている:

| ファイル | 役割 |
|---------|------|
| `tools/env/docker-compose.yml`     | ベースの Compose ファイル（`web` + `db` サービス）。 |
| `tools/env/Dockerfile`             | `web` イメージ（`php:8.3-apache` + `mysqli`）。 |
| `tools/env/docker-compose.071.yml` | `071-env` オーバーライド: `tools/cli/` を `web` にバインドマウント。 |

Compose ファイル内の相対パス（`./src`、ビルドコンテキスト `.`）は
**リポジトリルート基準**であるため、Compose はプロジェクトディレクトリを
リポジトリルートに設定して実行する必要がある。`071-env` はこれを自動で
行う。素の `docker compose` 呼び出しはリポジトリルートから
`--project-directory .` を渡す必要がある（[使い方](#使い方)を参照）。

## 構成

| サービス | イメージ | 役割 |
|---------|---------|------|
| `web`   | `tools/env/Dockerfile` からビルド(`php:8.3-apache`) | Apache + PHP 8.3。`./src` を配信する。 |
| `db`    | `mysql:8.0`(公式) | MySQL 8 データベース。 |

ベースイメージはいずれも公式。`Dockerfile` のカスタマイズは最小限で、
`mysqli` 拡張の追加（ベースイメージは `mysql` も `mysqli` も同梱しない）と、
ブロックエディタが画像をアップロードできるよう PHP のアップロード上限
（`upload_max_filesize = 16M`、`post_max_size = 20M`）を引き上げる 2 点
（Issue #102）。

## 使い方

環境を操作する最も簡単な方法は `071-env` マネージャである:

```sh
npx 071-env start      # ビルド（初回）して起動
npx 071-env stop       # 削除せず停止
npx 071-env status     # コンテナの状態を表示
npx 071-env destroy    # 停止・削除（データベースボリュームを含む）
```

これに相当する素の `docker compose` コマンドは、リポジトリルートから実行し、
Compose ファイルを指定してプロジェクトディレクトリを設定する必要がある:

```sh
# 起動 (初回はビルド)
docker compose -f tools/env/docker-compose.yml --project-directory . up -d --build

# 停止
docker compose -f tools/env/docker-compose.yml --project-directory . down

# 停止し DB ボリュームも削除
docker compose -f tools/env/docker-compose.yml --project-directory . down -v

# web コンテナでシェルを開く
docker compose -f tools/env/docker-compose.yml --project-directory . exec web bash
```

起動後 <http://localhost:8080> を開く。`phpinfo` は
<http://localhost:8080/phpinfo.php> で確認できる。

## データベース接続

接続情報は `src/b2config.php` で定義する。同ファイルは `071-env start` が
`src/b2config-sample.php` から生成する。`DB_HOST` は MySQL コンテナの
Compose サービス名である `db` に設定している。

| 設定 | 値 |
|------|----|
| `DB_HOST`      | `db` |
| `DB_NAME`      | `b2` |
| `DB_USER`      | `user` |
| `DB_PASSWORD`  | `pass` |

`db` サービスの環境変数はこれらの値と一致させており、MySQL は初回起動時に
`b2` データベースと `user` アカウントを自動作成する。

## wp-env を採用しない理由

公式の `@wordpress/env`(wp-env)を、この手書き Compose 構成の代替として
調査した(Issue #55)が、**WordPress 0.71 をホストできない**。`wp-env start`
は設定読み込みの段階で即座に失敗する:

```
✖ ENOENT: no such file or directory, open '.../src/wp-includes/version.php'
```

wp-env は `wp-includes/version.php` を読んで WordPress のバージョンを判定
するが、2003 年当時の b2/cafelog 構成には `wp-includes/` ディレクトリ自体が
無い(`b2-include/` を使う)。この最初の失敗の先でも、wp-env は WP-CLI
(`wp core install`)・生成される `wp-config.php`・モダンな `wp-load.php` /
`wp-settings.php` ブートストラップに依存してセットアップを進めるが、いずれも
WordPress 0.71 には存在しない。wp-env は本質的にモダン WordPress 専用で
あるため、この 2003 年のコードベースには、ここにある手書きの
`tools/env/docker-compose.yml` が適切なローカル環境である。
