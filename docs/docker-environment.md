# Docker Development Environment

Local development environment for running WordPress 0.71-gold on
PHP 8.3 + MySQL 8, as required by CLAUDE.md.

## Composition

| Service | Image | Role |
|---------|-------|------|
| `web`   | Built from `Dockerfile` (`php:8.3-apache`) | Apache + PHP 8.3. Serves `./src`. |
| `db`    | `mysql:8.0` (official) | MySQL 8 database. |

Both base images are official. The `Dockerfile` keeps customization minimal:
it adds the `mysqli` extension (the base image ships with neither `mysql` nor
`mysqli`) and raises PHP's upload limits (`upload_max_filesize = 16M`,
`post_max_size = 20M`) so the block editor can upload images (Issue #102).

## Usage

```sh
# Start (build on first run)
docker compose up -d --build

# Stop
docker compose down

# Stop and remove the database volume
docker compose down -v

# Open a shell in the web container
docker compose exec web bash
```

After startup, open <http://localhost:8080>. `phpinfo` is available at
<http://localhost:8080/phpinfo.php>.

## Database connection

`src/b2config.php` defines the connection. `DB_HOST` is set to `db` — the
Compose service name of the MySQL container.

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
hand-written `docker-compose.yml` here is the appropriate local environment
for this 2003 codebase.

---

# Docker 開発環境

CLAUDE.md の要求に従い、WordPress 0.71-gold を PHP 8.3 + MySQL 8 で
動作させるためのローカル開発環境。

## 構成

| サービス | イメージ | 役割 |
|---------|---------|------|
| `web`   | `Dockerfile` からビルド(`php:8.3-apache`) | Apache + PHP 8.3。`./src` を配信する。 |
| `db`    | `mysql:8.0`(公式) | MySQL 8 データベース。 |

ベースイメージはいずれも公式。`Dockerfile` のカスタマイズは最小限で、
`mysqli` 拡張の追加（ベースイメージは `mysql` も `mysqli` も同梱しない）と、
ブロックエディタが画像をアップロードできるよう PHP のアップロード上限
（`upload_max_filesize = 16M`、`post_max_size = 20M`）を引き上げる 2 点
（Issue #102）。

## 使い方

```sh
# 起動 (初回はビルド)
docker compose up -d --build

# 停止
docker compose down

# 停止し DB ボリュームも削除
docker compose down -v

# web コンテナでシェルを開く
docker compose exec web bash
```

起動後 <http://localhost:8080> を開く。`phpinfo` は
<http://localhost:8080/phpinfo.php> で確認できる。

## データベース接続

接続情報は `src/b2config.php` で定義する。`DB_HOST` は MySQL コンテナの
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
`docker-compose.yml` が適切なローカル環境である。
