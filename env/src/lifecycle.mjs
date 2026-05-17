/*
 * EN: Lifecycle-script support for 071-env.
 *
 *     `.071-env.json`'s `lifecycleScripts` field maps a hook name to a shell
 *     command. 071-env runs `afterStart` after a successful `start`, and
 *     `beforeDestroy` before `destroy` proceeds -- the analogue of wp-env's
 *     lifecycle scripts.
 *
 *     `lifecycleCommand` is pure: it looks a hook up in the config and returns
 *     the command string (or null). `runLifecycleScript` is the thin impure
 *     boundary that spawns a shell to run it, in the repository root.
 *
 * JA: 071-env のためのライフサイクルスクリプト対応。
 *
 *     `.071-env.json` の `lifecycleScripts` フィールドはフック名をシェル
 *     コマンドへ対応付ける。071-env は `start` 成功後に `afterStart` を、
 *     `destroy` の実行前に `beforeDestroy` を走らせる -- wp-env の
 *     ライフサイクルスクリプトの相当物である。
 *
 *     `lifecycleCommand` は純粋関数で、フックを設定から引き、コマンド文字列
 *     (または null) を返す。`runLifecycleScript` はそれを実行するシェルを
 *     リポジトリルートで起動する、薄い非純粋な境界である。
 */

import { spawnSync } from 'node:child_process';
import { repoRoot } from './paths.mjs';

/**
 * EN: Look the shell command up for a lifecycle hook. Returns the command
 *     string, or `null` when the hook is not configured. This is pure so the
 *     dispatcher's hook-selection logic is unit testable.
 * JA: ライフサイクルフックのシェルコマンドを引く。コマンド文字列を返すか、
 *     フックが設定されていなければ `null` を返す。純粋関数であり、
 *     ディスパッチャのフック選択ロジックを単体テストできるようにする。
 *
 * @param {object} config   The merged configuration.
 * @param {string} hookName The hook name (`afterStart` / `beforeDestroy`).
 * @returns {string|null} the command string, or null when not configured.
 */
export function lifecycleCommand( config, hookName ) {
	const scripts = ( config && config.lifecycleScripts ) || {};
	const command = scripts[ hookName ];
	if ( typeof command !== 'string' || command.trim() === '' ) {
		return null;
	}
	return command;
}

/**
 * EN: Run a lifecycle hook's shell command, if one is configured. The command
 *     runs through the system shell (`spawnSync` with `shell: true`) with the
 *     repository root as its working directory and stdio inherited, so the
 *     user sees its output. Returns the exit code, or 0 when the hook is not
 *     configured (an absent hook is a no-op success).
 * JA: ライフサイクルフックのシェルコマンドを、設定されていれば実行する。
 *     コマンドはシステムシェル経由で (`shell: true` の `spawnSync`)、
 *     リポジトリルートを作業ディレクトリとし、stdio を継承して実行されるため、
 *     ユーザーはその出力を見られる。終了コードを返すか、フックが設定されて
 *     いなければ 0 を返す (フックの欠如は何もしない成功)。
 *
 * @param {object} config   The merged configuration.
 * @param {string} hookName The hook name (`afterStart` / `beforeDestroy`).
 * @returns {number} the exit code (0 when there is no hook).
 */
export function runLifecycleScript( config, hookName ) {
	const command = lifecycleCommand( config, hookName );
	if ( command === null ) {
		return 0;
	}

	process.stdout.write( `071-env: running ${ hookName } script: ${ command }\n` );

	const result = spawnSync( command, {
		stdio: 'inherit',
		cwd: repoRoot,
		shell: true,
	} );

	if ( result.error ) {
		process.stderr.write(
			`071-env: ${ hookName } script failed to start: ${ result.error.message }\n`
		);
		return 1;
	}

	return result.status === null ? 1 : result.status;
}
