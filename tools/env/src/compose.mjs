/*
 * EN: Docker Compose argv construction for 071-env.
 *
 *     071-env wraps the repository's existing Docker Compose environment. It
 *     never replaces tools/env/docker-compose.yml; it layers
 *     tools/env/docker-compose.071.yml on top so the 071-cli package is
 *     reachable inside the `web` container (see docs/071-tooling.md
 *     section 4.3).
 *
 *     The functions here are pure: they take the parsed command and return the
 *     argument vector that would be passed to `docker`. They do not spawn
 *     anything -- that is run.mjs's job -- which keeps the argv construction
 *     unit-testable without Docker.
 *
 * JA: 071-env のための Docker Compose 引数ベクタ構築。
 *
 *     071-env はリポジトリの既存 Docker Compose 環境をラップする。
 *     tools/env/docker-compose.yml を置き換えることはなく、その上に
 *     tools/env/docker-compose.071.yml を重ねて、`web` コンテナ内で 071-cli
 *     パッケージに到達できるようにする (docs/071-tooling.md セクション 4.3)。
 *
 *     ここの関数は純粋関数である: 解析済みコマンドを受け取り、`docker` に
 *     渡される引数ベクタを返す。何も起動しない (それは run.mjs の役割) ため、
 *     引数ベクタの構築は Docker 無しで単体テストできる。
 */

import { baseComposeFile, overrideComposeFile, repoRoot } from './paths.mjs';

/**
 * EN: The path to the 071-cli PHP entry point as seen *inside* the `web`
 *     container. tools/env/docker-compose.071.yml bind-mounts the repo's
 *     `tools/cli/` directory at /opt/071-cli, so the CLI script is at this
 *     fixed path.
 * JA: `web` コンテナ*内*から見た 071-cli の PHP エントリポイントのパス。
 *     tools/env/docker-compose.071.yml がリポジトリの `tools/cli/` を
 *     /opt/071-cli にバインドマウントするため、CLI スクリプトはこの固定パスに
 *     ある。
 */
export const CLI_PHP_IN_CONTAINER = '/opt/071-cli/php/071-cli.php';

/**
 * EN: The WordPress 0.71 install path inside the `web` container.
 *     tools/env/docker-compose.yml mounts `./src` as the Apache document root
 *     at /var/www/html, so 071-cli is pointed there with `--path`.
 * JA: `web` コンテナ内の WordPress 0.71 インストールパス。
 *     tools/env/docker-compose.yml が `./src` を Apache ドキュメントルート
 *     /var/www/html にマウントするため、071-cli は `--path` でそこを指す。
 */
export const WP_PATH_IN_CONTAINER = '/var/www/html';

/**
 * EN: The Compose service that runs Apache + PHP 8.3. `run` commands exec in
 *     this service.
 * JA: Apache + PHP 8.3 を実行する Compose サービス。`run` コマンドはこの
 *     サービス内で exec する。
 */
export const WEB_SERVICE = 'web';

/**
 * EN: The `--project-directory` argument that pins Compose's project
 *     directory to the repository root. The Compose files live in tools/env/
 *     but their in-file relative paths (`./src`, `./tools/cli`, the build
 *     context `.`, and the runtime mappings override's host paths) are
 *     repository-root-relative. Compose otherwise resolves them against the
 *     first `-f` file's directory (tools/env/), so this argument is what
 *     keeps every path resolving correctly.
 * JA: Compose のプロジェクトディレクトリをリポジトリルートに固定する
 *     `--project-directory` 引数。Compose ファイルは tools/env/ に置かれるが、
 *     ファイル内の相対パス (`./src`、`./tools/cli`、ビルドコンテキスト `.`、
 *     実行時 mappings オーバーライドのホストパス) はリポジトリルート基準で
 *     ある。Compose はさもなくば最初の `-f` ファイルのディレクトリ
 *     (tools/env/) から解決するため、この引数がすべてのパスを正しく
 *     解決させる。
 */
export const projectDirArgs = [ '--project-directory', repoRoot ];

/**
 * EN: The leading arguments common to every `docker` invocation 071-env makes:
 *     the `compose` subcommand, the `--project-directory` pin, then the
 *     Compose files. Passing the base file and the cli/ override on every
 *     call is what makes the `cli/` bind mount take effect.
 *
 *     `extraFiles` carries any additional override files appended in order
 *     after the cli/ override -- in practice the runtime `mappings` override
 *     when `.071-env.json` configures extra bind mounts. Compose appends
 *     `volumes` cleanly across `-f` files, so the extra mounts add on without
 *     disturbing the existing ones.
 *
 * JA: 071-env が行うすべての `docker` 呼び出しに共通する先頭の引数:
 *     `compose` サブコマンド、`--project-directory` の固定、続けて Compose
 *     ファイル群。すべての呼び出しでベースファイルと cli/ オーバーライドを
 *     渡すことが、`cli/` バインドマウントを有効にする。
 *
 *     `extraFiles` は、cli/ オーバーライドの後ろに順に追加される追加の
 *     上書きファイルを運ぶ -- 実際には `.071-env.json` が追加のバインド
 *     マウントを設定するときの実行時 `mappings` オーバーライドである。
 *     Compose は `-f` ファイル間で `volumes` をきれいに追記するため、追加の
 *     マウントは既存のものを乱さずに加わる。
 *
 * @param {string[]} extraFiles Additional Compose override file paths.
 * @returns {string[]} the shared `docker` argument prefix.
 */
export function composePrefix( extraFiles = [] ) {
	const prefix = [
		'compose',
		...projectDirArgs,
		'-f',
		baseComposeFile,
		'-f',
		overrideComposeFile,
	];
	for ( const file of extraFiles ) {
		prefix.push( '-f', file );
	}
	return prefix;
}

/**
 * EN: Build the full `docker` argv for a 071-env subcommand.
 *
 *     `run` is special: `run cli <args>` execs the 071-cli PHP CLI inside the
 *     `web` container, and `run <command...>` execs an arbitrary command.
 *     Everything else maps directly onto a `docker compose` subcommand.
 *
 * JA: 071-env のサブコマンドに対応する完全な `docker` 引数ベクタを構築する。
 *
 *     `run` は特別である: `run cli <args>` は `web` コンテナ内で 071-cli の
 *     PHP CLI を exec し、`run <command...>` は任意のコマンドを exec する。
 *     それ以外はすべて `docker compose` サブコマンドへ直接対応する。
 *
 * @param {string} command The 071-env subcommand (start/stop/destroy/...).
 * @param {string[]} args  The positional arguments after the subcommand.
 * @param {string[]} extraFiles Additional Compose override file paths.
 * @returns {string[]} the argument vector to pass to the `docker` binary.
 * @throws {Error} if the command is not recognised.
 */
export function buildComposeArgs( command, args = [], extraFiles = [] ) {
	const prefix = composePrefix( extraFiles );

	switch ( command ) {
		case 'start':
			// EN: Build images if needed, then start detached.
			// JA: 必要ならイメージをビルドし、デタッチで起動する。
			return [ ...prefix, 'up', '-d', '--build' ];

		case 'stop':
			return [ ...prefix, 'stop' ];

		case 'destroy':
			// EN: `-v` removes named volumes -- including the database volume.
			//     The confirmation prompt is enforced by the caller, not here.
			// JA: `-v` は名前付きボリューム (DB ボリュームを含む) を削除する。
			//     確認プロンプトは呼び出し側で強制し、ここでは行わない。
			return [ ...prefix, 'down', '-v' ];

		case 'status':
			return [ ...prefix, 'ps' ];

		case 'logs': {
			// EN: Follow logs; an optional service name narrows the output.
			// JA: ログを追従する。サービス名を省略可能で渡すと出力を絞れる。
			const logsArgs = [ ...prefix, 'logs', '-f' ];
			if ( args.length > 0 ) {
				logsArgs.push( ...args );
			}
			return logsArgs;
		}

		case 'run':
			return buildRunArgs( args, extraFiles );

		default:
			throw new Error( `Unknown command: ${ command }` );
	}
}

/**
 * EN: Build the `docker` argv for `071-env run ...`.
 *
 *     `run cli <args>`        -> exec the 071-cli PHP CLI in the `web`
 *                                container, with `--path` already pointing at
 *                                the in-container WordPress install. Inside
 *                                the container the DB host `db` resolves, so
 *                                no `--dbhost` is needed.
 *     `run <command...>`      -> exec an arbitrary command in the `web`
 *                                container.
 *
 * JA: `071-env run ...` のための `docker` 引数ベクタを構築する。
 *
 *     `run cli <args>`        -> `web` コンテナ内で 071-cli の PHP CLI を
 *                                exec する。`--path` は既にコンテナ内の
 *                                WordPress インストールを指している。
 *                                コンテナ内では DB ホスト `db` が解決される
 *                                ため `--dbhost` は不要。
 *     `run <command...>`      -> `web` コンテナ内で任意のコマンドを exec する。
 *
 * @param {string[]} args The arguments after `run`.
 * @param {string[]} extraFiles Additional Compose override file paths.
 * @returns {string[]} the argument vector to pass to the `docker` binary.
 * @throws {Error} if no command is given to run.
 */
export function buildRunArgs( args, extraFiles = [] ) {
	if ( args.length === 0 ) {
		throw new Error( 'run: a command is required (try `run cli post list`)' );
	}

	const prefix = composePrefix( extraFiles );

	if ( args[ 0 ] === 'cli' ) {
		// EN: `run cli <cli-args>` -> php /opt/071-cli/php/071-cli.php <cli-args>
		//     --path=/var/www/html. The `--path` flag is appended so 071-cli
		//     finds the WordPress 0.71 source mounted in the container.
		// JA: `run cli <cli-args>` -> php /opt/071-cli/php/071-cli.php
		//     <cli-args> --path=/var/www/html。`--path` フラグを付加し、
		//     071-cli がコンテナにマウントされた WordPress 0.71 ソースを
		//     見つけられるようにする。
		const cliArgs = args.slice( 1 );
		return [
			...prefix,
			'exec',
			WEB_SERVICE,
			'php',
			CLI_PHP_IN_CONTAINER,
			...cliArgs,
			`--path=${ WP_PATH_IN_CONTAINER }`,
		];
	}

	// EN: `run <command...>` -> exec the command verbatim in the `web` service.
	// JA: `run <command...>` -> `web` サービス内でコマンドをそのまま exec する。
	return [ ...prefix, 'exec', WEB_SERVICE, ...args ];
}
