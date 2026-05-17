/*
 * EN: Docker process execution for 071-env.
 *
 *     This module is the impure boundary: it spawns the `docker` binary with
 *     an argument vector built by compose.mjs. The argv construction is kept
 *     in compose.mjs so it stays unit-testable; this module only runs it.
 *
 * JA: 071-env のための Docker プロセス実行。
 *
 *     本モジュールは非純粋な境界である: compose.mjs が構築した引数ベクタで
 *     `docker` バイナリを起動する。引数ベクタの構築は単体テスト可能な
 *     compose.mjs に置き、本モジュールはそれを実行するだけである。
 */

import { spawnSync } from 'node:child_process';
import { repoRoot } from './paths.mjs';

/**
 * EN: Run `docker` with the given argument vector, inheriting stdio so the
 *     user sees Compose's output directly. The child runs with the repository
 *     root as its working directory, so the relative paths inside the Compose
 *     files (`./src`, `./cli`) resolve correctly regardless of the caller's
 *     own cwd.
 * JA: 与えられた引数ベクタで `docker` を実行する。stdio を継承し、ユーザーが
 *     Compose の出力を直接見られるようにする。子プロセスはリポジトリルートを
 *     作業ディレクトリとして実行されるため、Compose ファイル内の相対パス
 *     (`./src`・`./cli`) は呼び出し元の cwd によらず正しく解決される。
 *
 * @param {string[]} args The argument vector for the `docker` binary.
 * @returns {number} the `docker` process exit code (1 if it could not start).
 */
export function runDocker( args ) {
	const result = spawnSync( 'docker', args, {
		stdio: 'inherit',
		cwd: repoRoot,
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
