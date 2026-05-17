/*
 * Compose environment-variable derivation for 071-env.
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
 */

/**
 * The environment-variable names referenced by `docker-compose.yml`.
 */
export const ENV_VARS = {
	port: 'WP_PORT',
	dbPort: 'DB_PORT',
	phpVersion: 'PHP_VERSION',
};

/**
 * Derive the Compose environment variables from a validated config. The
 *     returned object maps `WP_PORT` / `DB_PORT` / `PHP_VERSION` to strings
 *     (Compose substitution expands string values). 071-env merges this onto
 *     `process.env` when it spawns `docker compose`. Because every value also
 *     has a `:-default` in `docker-compose.yml`, a plain `docker compose up`
 *     run without 071-env still works unchanged.
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
