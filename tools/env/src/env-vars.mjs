/*
 * EN: Compose environment-variable derivation for 071-env.
 *
 *     `docker-compose.yml` uses variable substitution with defaults for the
 *     two host port mappings and the PHP version:
 *
 *       ports:           "${WP_PORT:-8080}:80"   "${DB_PORT:-3306}:3306"
 *       build.args:      PHP_VERSION=${PHP_VERSION:-8.3}
 *
 *     Compose *appends* port lists across `-f` files, so a layered override
 *     file cannot change a port -- variable substitution is the only correct
 *     mechanism. This module turns a validated config into the environment
 *     map 071-env passes to the spawned `docker compose` process. It is pure:
 *     given a config it returns an object, touching neither process.env nor
 *     the filesystem.
 *
 * JA: 071-env のための Compose 環境変数の導出。
 *
 *     `docker-compose.yml` は 2 つのホストポートマッピングと PHP バージョン
 *     に既定値付きの変数置換を使う:
 *
 *       ports:           "${WP_PORT:-8080}:80"   "${DB_PORT:-3306}:3306"
 *       build.args:      PHP_VERSION=${PHP_VERSION:-8.3}
 *
 *     Compose は `-f` ファイル間でポートのリストを*追記*するため、重ねた
 *     上書きファイルではポートを変更できない -- 変数置換が唯一の正しい
 *     仕組みである。本モジュールは検証済みの設定を、071-env が起動する
 *     `docker compose` プロセスへ渡す環境マップへ変換する。純粋関数であり、
 *     設定からオブジェクトを返すだけで、process.env にもファイルシステムにも
 *     触れない。
 */

/**
 * EN: The environment-variable names referenced by `docker-compose.yml`.
 * JA: `docker-compose.yml` が参照する環境変数名。
 */
export const ENV_VARS = {
	port: 'WP_PORT',
	dbPort: 'DB_PORT',
	phpVersion: 'PHP_VERSION',
};

/**
 * EN: Derive the Compose environment variables from a validated config. The
 *     returned object maps `WP_PORT` / `DB_PORT` / `PHP_VERSION` to strings
 *     (Compose substitution expands string values). 071-env merges this onto
 *     `process.env` when it spawns `docker compose`. Because every value also
 *     has a `:-default` in `docker-compose.yml`, a plain `docker compose up`
 *     run without 071-env still works unchanged.
 * JA: 検証済みの設定から Compose 環境変数を導出する。返すオブジェクトは
 *     `WP_PORT` / `DB_PORT` / `PHP_VERSION` を文字列に対応付ける (Compose の
 *     置換は文字列値を展開する)。071-env は `docker compose` 起動時にこれを
 *     `process.env` にマージする。各値は `docker-compose.yml` 内に
 *     `:-default` も持つため、071-env を介さない素の `docker compose up` も
 *     変わらず動作する。
 *
 * @param {{ port: number, dbPort: number, phpVersion: string }} config
 *        The merged, validated configuration.
 * @returns {Record<string,string>} the environment map for `docker compose`.
 */
export function deriveEnv( config ) {
	return {
		[ ENV_VARS.port ]: String( config.port ),
		[ ENV_VARS.dbPort ]: String( config.dbPort ),
		[ ENV_VARS.phpVersion ]: String( config.phpVersion ),
	};
}
