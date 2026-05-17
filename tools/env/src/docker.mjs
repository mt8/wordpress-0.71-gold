/*
 * Docker process execution for 071-env.
 *
 *     This module is the impure boundary: it spawns the `docker` binary with
 *     an argument vector built by compose.mjs. The argv construction is kept
 *     in compose.mjs so it stays unit-testable; this module only runs it.
 */

import { spawnSync } from 'node:child_process';
import { repoRoot } from './paths.mjs';

/**
 * Run `docker` with the given argument vector, inheriting stdio so the
 *     user sees Compose's output directly. The child runs with the repository
 *     root as its working directory; combined with the `--project-directory`
 *     argument compose.mjs adds, the relative paths inside the Compose files
 *     (`./src`, `./tools/cli`) resolve correctly regardless of the caller's
 *     own cwd.
 *
 *     `extraEnv` is merged onto the inherited environment before the child is
 *     spawned. 071-env uses it to pass `WP_PORT` / `DB_PORT` / `PHP_VERSION`,
 *     which `docker-compose.yml` reads through variable substitution. Because
 *     each of those also has a `:-default` in the Compose file, omitting them
 *     (a plain `docker compose up`) still works.
 *
 * @param {string[]} args The argument vector for the `docker` binary.
 * @param {Record<string,string>} extraEnv Variables merged onto the env.
 * @returns {number} the `docker` process exit code (1 if it could not start).
 */
export function runDocker( args, extraEnv = {} ) {
	const result = spawnSync( 'docker', args, {
		stdio: 'inherit',
		cwd: repoRoot,
		env: { ...process.env, ...extraEnv },
	} );

	if ( result.error ) {
		if ( result.error.code === 'ENOENT' ) {
			process.stderr.write(
				'071-env: could not find the `docker` binary. Install Docker and ' +
					'ensure it is on PATH.\n'
			);
		} else {
			process.stderr.write( `071-env: failed to run docker: ${ result.error.message }\n` );
		}
		return 1;
	}

	return result.status === null ? 1 : result.status;
}
