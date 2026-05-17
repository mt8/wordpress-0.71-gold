/*
 * EN: 071-env command dispatcher.
 *
 *     Ties the pure modules together: parse argv (cli.mjs), build the `docker`
 *     argv (compose.mjs), prompt for destructive actions (prompt.mjs), and run
 *     `docker` (docker.mjs). bin/071-env.mjs is a thin wrapper around `main`.
 *
 * JA: 071-env のコマンドディスパッチャ。
 *
 *     純粋モジュールを結びつける: argv を解析し (cli.mjs)、`docker` の引数
 *     ベクタを構築し (compose.mjs)、破壊的操作を確認し (prompt.mjs)、`docker`
 *     を実行する (docker.mjs)。bin/071-env.mjs は `main` の薄いラッパである。
 */

import { parseArgs, isKnownCommand, helpText, COMMANDS } from './cli.mjs';
import { buildComposeArgs } from './compose.mjs';
import { confirm } from './prompt.mjs';
import { runDocker } from './docker.mjs';

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
	}

	let dockerArgs;
	try {
		dockerArgs = buildComposeArgs( command, args );
	} catch ( err ) {
		process.stderr.write( `071-env: ${ err.message }\n` );
		return 1;
	}

	return runDocker( dockerArgs );
}

export { COMMANDS };
