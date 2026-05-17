/*
 * EN: 071-env command dispatcher.
 *
 *     Ties the pure modules together: parse argv (cli.mjs), load the merged
 *     configuration (config.mjs), derive the Compose environment variables
 *     (env-vars.mjs) and the runtime `mappings` override (mappings.mjs), build
 *     the `docker` argv (compose.mjs), prompt for destructive actions
 *     (prompt.mjs), run lifecycle scripts (lifecycle.mjs), and run `docker`
 *     (docker.mjs). bin/071-env.mjs is a thin wrapper around `main`.
 *
 * JA: 071-env のコマンドディスパッチャ。
 *
 *     純粋モジュールを結びつける: argv を解析し (cli.mjs)、マージ済み設定を
 *     読み込み (config.mjs)、Compose 環境変数 (env-vars.mjs) と実行時の
 *     `mappings` オーバーライド (mappings.mjs) を導出し、`docker` の引数
 *     ベクタを構築し (compose.mjs)、破壊的操作を確認し (prompt.mjs)、
 *     ライフサイクルスクリプトを実行し (lifecycle.mjs)、`docker` を実行する
 *     (docker.mjs)。bin/071-env.mjs は `main` の薄いラッパである。
 */

import { parseArgs, isKnownCommand, helpText, COMMANDS } from './cli.mjs';
import { buildComposeArgs } from './compose.mjs';
import { confirm } from './prompt.mjs';
import { runDocker } from './docker.mjs';
import { loadConfig } from './config.mjs';
import { deriveEnv } from './env-vars.mjs';
import { writeMappingsOverride } from './mappings.mjs';
import { runLifecycleScript, lifecycleCommand } from './lifecycle.mjs';

/**
 * EN: Run 071-env for a given raw argv. Returns the process exit code instead
 *     of calling process.exit, so it is straightforward to test.
 * JA: 与えられた生の argv に対して 071-env を実行する。process.exit を呼ばず
 *     プロセス終了コードを返すため、テストが容易である。
 *
 * @param {string[]} argv Raw argv, excluding `node` and the script path.
 * @returns {Promise<number>} the exit code.
 */
export async function main( argv ) {
	const { command, args, help } = parseArgs( argv );

	if ( help ) {
		process.stdout.write( `${ helpText() }\n` );
		return 0;
	}

	if ( ! isKnownCommand( command ) ) {
		process.stderr.write( `071-env: unknown command '${ command }'.\n\n` );
		process.stderr.write( `${ helpText() }\n` );
		return 1;
	}

	// EN: Load `.071-env.json` (+ `.071-env.override.json`) once. A malformed
	//     or invalid config aborts here with a clear message.
	// JA: `.071-env.json` (+ `.071-env.override.json`) を一度読み込む。不正な
	//     設定はここで明確なメッセージとともに中止する。
	let config;
	try {
		config = loadConfig();
	} catch ( err ) {
		process.stderr.write( `071-env: ${ err.message }\n` );
		return 1;
	}

	// EN: `destroy` removes the database volume; require explicit confirmation
	//     before doing anything. Anything other than `y`/`yes` aborts.
	// JA: `destroy` はデータベースボリュームを削除する。実行前に明示的な確認を
	//     必須とする。`y`/`yes` 以外はすべて中止する。
	if ( command === 'destroy' ) {
		process.stdout.write(
			'071-env destroy will run `docker compose down -v`.\n' +
				'This permanently DELETES the database volume and all its data.\n'
		);
		const confirmed = await confirm( 'Are you sure you want to destroy the environment?' );
		if ( ! confirmed ) {
			process.stdout.write( 'Aborted. The environment was left untouched.\n' );
			return 0;
		}

		// EN: `beforeDestroy` runs after confirmation but before Compose tears
		//     the environment down -- so the hook can still reach a live stack
		//     (for example to back the database up). A failing hook aborts the
		//     destroy.
		// JA: `beforeDestroy` は確認後、Compose が環境を破棄する前に走る --
		//     フックがまだ稼働中のスタックに到達できる (例えば DB のバック
		//     アップが取れる)。フックが失敗したら destroy を中止する。
		const beforeCode = runLifecycleScript( config, 'beforeDestroy' );
		if ( beforeCode !== 0 ) {
			process.stderr.write( '071-env: beforeDestroy script failed; aborting destroy.\n' );
			return beforeCode;
		}
	}

	// EN: Generate (or remove) the runtime `mappings` Compose override. When
	//     `mappings` has entries the returned path is appended as an extra
	//     `-f` so the extra bind mounts take effect.
	// JA: 実行時の `mappings` Compose オーバーライドを生成 (または削除) する。
	//     `mappings` にエントリがあれば、返されたパスを追加の `-f` として
	//     付加し、追加のバインドマウントを有効にする。
	let extraFiles = [];
	try {
		const mappingsFile = writeMappingsOverride( config.mappings );
		if ( mappingsFile !== null ) {
			extraFiles = [ mappingsFile ];
		}
	} catch ( err ) {
		process.stderr.write( `071-env: could not write the mappings override: ${ err.message }\n` );
		return 1;
	}

	let dockerArgs;
	try {
		dockerArgs = buildComposeArgs( command, args, extraFiles );
	} catch ( err ) {
		process.stderr.write( `071-env: ${ err.message }\n` );
		return 1;
	}

	// EN: Pass WP_PORT / DB_PORT / PHP_VERSION so docker-compose.yml's variable
	//     substitution picks up the configured values.
	// JA: WP_PORT / DB_PORT / PHP_VERSION を渡し、docker-compose.yml の変数
	//     置換が設定値を拾うようにする。
	const code = runDocker( dockerArgs, deriveEnv( config ) );

	// EN: `afterStart` runs only after a successful `start`, so the hook can
	//     rely on the containers being up.
	// JA: `afterStart` は `start` 成功後にのみ走るため、フックはコンテナが
	//     起動済みであることに依存できる。
	if ( command === 'start' && code === 0 && lifecycleCommand( config, 'afterStart' ) !== null ) {
		return runLifecycleScript( config, 'afterStart' );
	}

	return code;
}

export { COMMANDS };
