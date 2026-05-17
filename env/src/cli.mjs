/*
 * EN: Command-line parsing and help text for 071-env.
 *
 *     This module holds the pure parsing logic -- it turns a raw argv into a
 *     recognised command plus its positional arguments, and produces the help
 *     text. It performs no I/O and spawns no processes, so it is fully
 *     unit-testable.
 *
 * JA: 071-env のコマンドライン解析とヘルプテキスト。
 *
 *     本モジュールは純粋な解析ロジックを保持する -- 生の argv を、認識された
 *     コマンドとその位置引数へ変換し、ヘルプテキストを生成する。I/O を行わず、
 *     プロセスを起動しないため、完全に単体テスト可能である。
 */

/**
 * EN: The subcommands 071-env recognises, mapped to a one-line description.
 * JA: 071-env が認識するサブコマンドと、その 1 行説明の対応。
 */
export const COMMANDS = {
	start: 'Build and start the environment (docker compose up -d --build)',
	stop: 'Stop the environment without removing it (docker compose stop)',
	destroy: 'Stop and remove the environment AND its database volume (docker compose down -v)',
	status: 'Show the status of the environment (docker compose ps)',
	logs: 'Follow the environment logs (docker compose logs -f [service])',
	run: 'Run a command in the web container (run cli <args> | run <command...>)',
};

/**
 * EN: Parse the raw argv (excluding `node` and the script path) into a
 *     structured command.
 *
 *     The result's `help` flag is set when no command is given or when
 *     `-h` / `--help` appears before the command -- `071-env`, `071-env -h`
 *     and `071-env --help` all show usage. A `--help` *after* a command (for
 *     example `071-env run cli --help`) is left in `args` so it can be passed
 *     through to the underlying tool.
 *
 * JA: 生の argv (`node` とスクリプトパスを除く) を構造化コマンドへ解析する。
 *
 *     コマンドが無い場合、またはコマンドの前に `-h` / `--help` がある場合に
 *     結果の `help` フラグが立つ -- `071-env`・`071-env -h`・`071-env --help`
 *     はいずれも使い方を表示する。コマンドの*後ろ*の `--help` (例
 *     `071-env run cli --help`) は `args` に残し、下位ツールへ渡せるように
 *     する。
 *
 * @param {string[]} argv Raw argument vector, excluding node and script path.
 * @returns {{ command: string|null, args: string[], help: boolean }}
 */
export function parseArgs( argv ) {
	// EN: No arguments at all -> show help.
	// JA: 引数が一切無い -> ヘルプを表示する。
	if ( argv.length === 0 ) {
		return { command: null, args: [], help: true };
	}

	const first = argv[ 0 ];

	// EN: A help flag before any command -> show help.
	// JA: コマンドの前のヘルプフラグ -> ヘルプを表示する。
	if ( first === '-h' || first === '--help' || first === 'help' ) {
		return { command: null, args: [], help: true };
	}

	return {
		command: first,
		args: argv.slice( 1 ),
		help: false,
	};
}

/**
 * EN: Report whether a string is a recognised 071-env subcommand.
 * JA: 文字列が認識済みの 071-env サブコマンドかどうかを返す。
 *
 * @param {string|null} command The candidate command.
 * @returns {boolean}
 */
export function isKnownCommand( command ) {
	return command !== null && Object.prototype.hasOwnProperty.call( COMMANDS, command );
}

/**
 * EN: Build the usage / help text.
 * JA: 使い方 / ヘルプテキストを構築する。
 *
 * @returns {string} the help text (no trailing newline).
 */
export function helpText() {
	const lines = [
		'071-env -- wp-env-style environment manager for WordPress 0.71-gold',
		'',
		'Usage:',
		'  071-env <command> [arguments]',
		'',
		'Commands:',
	];

	for ( const [ name, description ] of Object.entries( COMMANDS ) ) {
		lines.push( `  ${ name.padEnd( 9 ) } ${ description }` );
	}

	lines.push(
		'',
		'Examples:',
		'  071-env start                 Build and start the containers',
		'  071-env run cli post list     Run `071 post list` inside the web container',
		'  071-env run php -v            Run an arbitrary command in the web container',
		'  071-env logs web              Follow the web service logs',
		'  071-env destroy               Tear down the environment (prompts first)',
	);

	return lines.join( '\n' );
}
