# 071-cli

A wp-cli-style command-line interface for WordPress 0.71 (b2/cafelog). See the
design in [`docs/071-tooling.md`](../../docs/071-tooling.md) sections 2 and 3.

---

## Usage

```
071 <group> <verb> [args] [--flags]
```

| Group      | Verbs |
|------------|-------|
| `post`     | `list` / `get <id>` / `create` / `update <id>` / `delete <id>` |
| `user`     | `list` / `get <id>` / `create` / `update <id>` / `delete <id>` |
| `category` | `list` / `get <id>` / `create` / `delete <id>` |
| `comment`  | `list` / `get <id>` / `delete <id>` |
| `link`     | `list` / `get <id>` / `create` / `delete <id>` |
| `option`   | `list` / `get <name>` / `set <name> <value>` |
| `db`       | `query <sql>` / `tables` |

Global flags: `--format=table|json|csv|count|ids` (default `table`),
`--fields=<a,b,c>`, `--path=<dir>`, `--dbhost` / `--dbname` / `--dbuser` /
`--dbpass`, `--help`.

## Functional test suite (Behat)

`071-cli` has a [Behat](https://behat.org) functional test suite -- the 0.71
equivalent of wp-cli's own Behat tests.

```
tools/cli/
  features/
    cli.feature            entry point: usage, help, unknown group, bad --format
    post.feature           post group: list/get/create/update/delete, formats, errors
    user.feature           user group: list/get/create/update/delete, formats, errors
    category.feature       category group: list/get/create/delete, formats, errors
    comment.feature        comment group: list/get/delete, formats, errors
    link.feature           link group: list/get/create/delete, formats, errors
    option.feature         option group: list/get/set, formats, errors
    db.feature             db group: query/tables, formats, errors
    bootstrap/
      FeatureContext.php   Gherkin steps: runs the 071 CLI, captures
                           STDOUT/STDERR/exit code, reseeds the test database
  tests/
    docker-compose.yml     dedicated test-database stack (MySQL 8, host port 3307)
    fixtures.sql           WordPress 0.71 schema + minimal deterministic fixtures
    run-behat.sh           starts the test database, then runs Behat
```

### Database isolation

The suite **never touches the developer's `b2` database**. The test database
is a **separate Docker Compose project** (`071-cli-test`, defined in
`tools/cli/tests/docker-compose.yml`): its own MySQL 8 container on host port
**3307**, its own named volume, and a database named `b2_test`. The
developer's stack on 3306 and its `b2` data are left completely alone.

`FeatureContext` reseeds `b2_test` from `tools/cli/tests/fixtures.sql` in a
`@BeforeScenario` hook -- so every scenario starts from an identical, known
state, and write commands (`create` / `update` / `delete` / `set` /
non-SELECT `db query`) cannot leak between scenarios. `fixtures.sql` carries
the WordPress 0.71 schema (the DDL from `src/wp-admin/wp-install.php`, plus
the `b2comments` table the `comment` group reads) and a fixed minimal data
set with deterministic IDs.

The seeder connects with `sql_mode=''`, exactly as WordPress 0.71's
`wp-db.php` does, so the 2003-era DDL (`0000-00-00` datetime defaults) loads
under MySQL 8's strict mode.

### Running the suite

From the repository root, with Node v24 and `composer install` done:

```
composer behat
```

This starts the dedicated test database (`docker compose -p 071-cli-test -f
tools/cli/tests/docker-compose.yml up -d`), waits for it to become healthy, then
runs Behat. The test database is left running afterwards so repeated runs are
fast. To stop and remove it:

```
docker compose -p 071-cli-test -f tools/cli/tests/docker-compose.yml down -v
```

To run a single feature, pass it through:

```
composer behat -- tools/cli/features/post.feature
```

### Connection overrides

The test-database connection defaults to `127.0.0.1:3307` / `b2_test` /
`root`. Override via environment variables if needed:

| Variable               | Default       |
|------------------------|---------------|
| `B2_TEST_DB_HOST`      | `127.0.0.1`   |
| `B2_TEST_DB_PORT`      | `3307`        |
| `B2_TEST_DB_NAME`      | `b2_test`     |
| `B2_TEST_DB_USER`      | `root`        |
| `B2_TEST_DB_PASSWORD`  | `rootpass`    |

---

## 使い方

```
071 <group> <verb> [args] [--flags]
```

| グループ   | 動詞 |
|------------|------|
| `post`     | `list` / `get <id>` / `create` / `update <id>` / `delete <id>` |
| `user`     | `list` / `get <id>` / `create` / `update <id>` / `delete <id>` |
| `category` | `list` / `get <id>` / `create` / `delete <id>` |
| `comment`  | `list` / `get <id>` / `delete <id>` |
| `link`     | `list` / `get <id>` / `create` / `delete <id>` |
| `option`   | `list` / `get <name>` / `set <name> <value>` |
| `db`       | `query <sql>` / `tables` |

グローバルフラグ: `--format=table|json|csv|count|ids`（既定 `table`）・
`--fields=<a,b,c>`・`--path=<dir>`・`--dbhost` / `--dbname` / `--dbuser` /
`--dbpass`・`--help`。

## 機能テストスイート（Behat）

`071-cli` には [Behat](https://behat.org) の機能テストスイートがある --
wp-cli 自身の Behat テストの 0.71 版である。

```
tools/cli/
  features/
    cli.feature            エントリポイント: 使い方・ヘルプ・未知のグループ・不正な --format
    post.feature           post グループ: list/get/create/update/delete・形式・エラー
    user.feature           user グループ: list/get/create/update/delete・形式・エラー
    category.feature       category グループ: list/get/create/delete・形式・エラー
    comment.feature        comment グループ: list/get/delete・形式・エラー
    link.feature           link グループ: list/get/create/delete・形式・エラー
    option.feature         option グループ: list/get/set・形式・エラー
    db.feature             db グループ: query/tables・形式・エラー
    bootstrap/
      FeatureContext.php   Gherkin ステップ: 071 CLI を実行し
                           STDOUT/STDERR/終了コードを捕捉し、テスト DB を再投入
  tests/
    docker-compose.yml     専用テストデータベーススタック（MySQL 8、ホストポート 3307）
    fixtures.sql           WordPress 0.71 スキーマ + 最小の決定的フィクスチャ
    run-behat.sh           テストデータベースを起動して Behat を実行する
```

### データベース分離

スイートは**開発者の `b2` データベースに決して触れない**。テストデータ
ベースは**別の Docker Compose プロジェクト**（`071-cli-test`、
`tools/cli/tests/docker-compose.yml` で定義）である: 独自の MySQL 8 コンテナを
ホストポート **3307** で実行し、独自の名前付きボリュームと `b2_test` という
名前のデータベースを持つ。開発者の 3306 上のスタックとその `b2` データには
一切触れない。

`FeatureContext` は `@BeforeScenario` フックで `tools/cli/tests/fixtures.sql` から
`b2_test` を再投入する -- そのため各シナリオは同一の既知の状態から開始し、
書き込みコマンド（`create` / `update` / `delete` / `set` / SELECT 以外の
`db query`）がシナリオ間で漏れることはない。`fixtures.sql` は WordPress
0.71 スキーマ（`src/wp-admin/wp-install.php` 由来の DDL と、`comment`
グループが読む `b2comments` テーブル）と、決定的な id を持つ固定の最小
データセットを含む。

シーダーは WordPress 0.71 の `wp-db.php` とまったく同じく `sql_mode=''` で
接続するため、2003 年当時の DDL（`0000-00-00` の datetime 既定値）が
MySQL 8 の厳格モード下でも読み込める。

### スイートの実行

リポジトリルートから、Node v24 と `composer install` 済みの状態で:

```
composer behat
```

これは専用のテストデータベース（`docker compose -p 071-cli-test -f
tools/cli/tests/docker-compose.yml up -d`）を起動し、healthy になるのを待ってから
Behat を実行する。テストデータベースはその後も起動したままにし、繰り返しの
実行を高速にする。停止して削除するには:

```
docker compose -p 071-cli-test -f tools/cli/tests/docker-compose.yml down -v
```

単一の feature を実行するには引数で渡す:

```
composer behat -- tools/cli/features/post.feature
```

### 接続の上書き

テストデータベースの接続は既定で `127.0.0.1:3307` / `b2_test` / `root`。
必要なら環境変数で上書きする:

| 変数                   | 既定値        |
|------------------------|---------------|
| `B2_TEST_DB_HOST`      | `127.0.0.1`   |
| `B2_TEST_DB_PORT`      | `3307`        |
| `B2_TEST_DB_NAME`      | `b2_test`     |
| `B2_TEST_DB_USER`      | `root`        |
| `B2_TEST_DB_PASSWORD`  | `rootpass`    |
