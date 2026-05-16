# Docker Development Environment / Docker 開発環境

EN: Local development environment for running WordPress 0.71-gold on
PHP 8.3 + MySQL 8, as required by CLAUDE.md.

JA: CLAUDE.md の要求に従い、WordPress 0.71-gold を PHP 8.3 + MySQL 8 で
動作させるためのローカル開発環境。

## Composition / 構成

| Service | Image / イメージ | Role / 役割 |
|---------|------------------|-------------|
| `web`   | Built from `Dockerfile` (`php:8.3-apache`) | Apache + PHP 8.3. Serves `./src`. / `./src` を配信する Apache + PHP 8.3。 |
| `db`    | `mysql:8.0` (official / 公式) | MySQL 8 database. / MySQL 8 データベース。 |

EN: Both base images are official. The only customization is the `Dockerfile`
adding the `mysqli` extension, which the base image does not ship with.

JA: ベースイメージはいずれも公式。カスタマイズはベースイメージに含まれない
`mysqli` 拡張を `Dockerfile` で追加する 1 点のみ。

## Usage / 使い方

```sh
# Start (build on first run) / 起動 (初回はビルド)
docker compose up -d --build

# Stop / 停止
docker compose down

# Stop and remove the database volume / 停止し DB ボリュームも削除
docker compose down -v

# Open a shell in the web container / web コンテナでシェルを開く
docker compose exec web bash
```

EN: After startup, open <http://localhost:8080>. `phpinfo` is available at
<http://localhost:8080/phpinfo.php>.

JA: 起動後 <http://localhost:8080> を開く。`phpinfo` は
<http://localhost:8080/phpinfo.php> で確認できる。

## Database connection / データベース接続

EN: `src/b2config.php` defines the connection. `DB_HOST` is set to `db` — the
Compose service name of the MySQL container.

JA: 接続情報は `src/b2config.php` で定義する。`DB_HOST` は MySQL コンテナの
Compose サービス名である `db` に設定している。

| Setting / 設定 | Value / 値 |
|----------------|------------|
| `DB_HOST`      | `db` |
| `DB_NAME`      | `b2` |
| `DB_USER`      | `user` |
| `DB_PASSWORD`  | `pass` |

EN: The `db` service environment variables mirror these values, and MySQL
auto-creates the `b2` database and the `user` account on first startup.

JA: `db` サービスの環境変数はこれらの値と一致させており、MySQL は初回起動時に
`b2` データベースと `user` アカウントを自動作成する。

## Current limitations / 現時点の制約

EN: WordPress 0.71 does not fully run yet. Its `wpdb` class uses the ext/mysql
API (`mysql_connect()` etc.), removed in PHP 7.0, so pages that touch the
database will error. `phpinfo.php` and other DB-independent pages work. The
mysqli migration and MySQL 8 SQL-compatibility fixes are tracked in later
Issues. Running under wp-env (CLAUDE.md line 18) is also a later goal.

JA: WordPress 0.71 はまだ完全には動作しない。`wpdb` クラスは PHP 7.0 で廃止
された ext/mysql API(`mysql_connect()` 等)を使用しているため、DB にアクセス
するページはエラーになる。`phpinfo.php` など DB に依存しないページは動作する。
mysqli への移行および MySQL 8 の SQL 互換性修正は後続 Issue で扱う。wp-env での
動作(CLAUDE.md 18 行目)も後続の目標とする。
