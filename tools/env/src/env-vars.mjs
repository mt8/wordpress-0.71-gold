/*
 * Compose environment-variable derivation for 071-env.
 *
 *     `docker-compose.yml` uses variable substitution with defaults for the
 *     two host port mappings, the PHP version and the MySQL database name and
 *     credentials:
 *
 *       ports:           "${WP_PORT:-8080}:80"   "${DB_PORT:-3306}:3306"
 *       build.args:      PHP_VERSION=${PHP_VERSION:-8.3}
 *       db.environment:  MYSQL_DATABASE=${DB_NAME:-b2}
 *                        MYSQL_USER=${DB_USER:-user}
 *                        MYSQL_PASSWORD=${DB_PASSWORD:-pass}
 *
 *     Compose *appends* port lists across `-f` files, so a layered override
 *     file cannot change a port -- variable substitution is the only correct
 *     mechanism. This module turns a validated config into the environment
 *     map 071-env passes to the spawned `docker compose` process. It is pure:
 *     given a config it returns an object, touching neither process.env nor
 *     the filesystem.
 *
 *     The database name and credentials are read from the `wpConfig` object --
 *     the same `DB_NAME` / `DB_USER` / `DB_PASSWORD` keys writeB2Config()
 *     writes into src/b2config.php -- so one setting drives both the blog's
 *     config and the MySQL container, and the two cannot drift. A key absent
 *     from `wpConfig` is left to the `:-default` in docker-compose.yml.
 */

/**
 * The environment-variable names referenced by `docker-compose.yml` for the
 *     host ports and the PHP version.
 */
export const ENV_VARS = {
	port: 'WP_PORT',
	dbPort: 'DB_PORT',
	phpVersion: 'PHP_VERSION',
};

/**
 * The `wpConfig` keys that also configure the MySQL container. Each names
 *     both a `define()` in src/b2config.php and the matching variable in
 *     docker-compose.yml, so a value set once in `wpConfig` reaches both the
 *     blog config and the database container.
 */
export const DB_ENV_KEYS = [ 'DB_NAME', 'DB_USER', 'DB_PASSWORD' ];

/**
 * Derive the Compose environment variables from a validated config. The
 *     returned object maps `WP_PORT` / `DB_PORT` / `PHP_VERSION` to strings
 *     (Compose substitution expands string values), and adds `DB_NAME` /
 *     `DB_USER` / `DB_PASSWORD` for whichever of those keys `wpConfig` sets.
 *     071-env merges this onto `process.env` when it spawns `docker compose`.
 *     Because every value also has a `:-default` in `docker-compose.yml`, a
 *     plain `docker compose up` run without 071-env still works unchanged.
 * @param {{ port: number, dbPort: number, phpVersion: string,
 *           wpConfig?: Record<string,(string|number|boolean)> }} config
 *        The merged, validated configuration.
 * @returns {Record<string,string>} the environment map for `docker compose`.
 */
export function deriveEnv( config ) {
	const env = {
		[ ENV_VARS.port ]: String( config.port ),
		[ ENV_VARS.dbPort ]: String( config.dbPort ),
		[ ENV_VARS.phpVersion ]: String( config.phpVersion ),
	};

	// Carry the database name / credentials through to the MySQL
	//     container when wpConfig sets them, so MYSQL_DATABASE and the
	//     blog's DB_NAME (and the user / password) always agree. A key
	//     wpConfig does not set is left to the docker-compose.yml default.
	const wpConfig = config.wpConfig || {};
	for ( const key of DB_ENV_KEYS ) {
		if ( Object.prototype.hasOwnProperty.call( wpConfig, key ) ) {
			env[ key ] = String( wpConfig[ key ] );
		}
	}

	return env;
}
