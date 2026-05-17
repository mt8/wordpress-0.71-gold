/*
 * EN: Unit tests for env/src/compose.mjs -- the `docker compose` argument
 *     vector each 071-env subcommand constructs. These tests are Docker-free:
 *     they assert on the argv only, never spawning anything.
 * JA: env/src/compose.mjs の単体テスト -- 071-env の各サブコマンドが構築する
 *     `docker compose` 引数ベクタ。これらのテストは Docker 不要である:
 *     argv のみをアサートし、何も起動しない。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	composePrefix,
	buildComposeArgs,
	buildRunArgs,
	CLI_PHP_IN_CONTAINER,
	WP_PATH_IN_CONTAINER,
	WEB_SERVICE,
} from '../src/compose.mjs';
import { baseComposeFile, overrideComposeFile } from '../src/paths.mjs';

test( 'composePrefix: is `compose` followed by both Compose files', () => {
	assert.deepEqual( composePrefix(), [
		'compose',
		'-f',
		baseComposeFile,
		'-f',
		overrideComposeFile,
	] );
} );

test( 'composePrefix: the base file is the repo-root docker-compose.yml', () => {
	assert.match( baseComposeFile, /\/docker-compose\.yml$/ );
	assert.doesNotMatch( baseComposeFile, /\/env\// );
} );

test( 'composePrefix: the override file is env/docker-compose.071.yml', () => {
	assert.match( overrideComposeFile, /\/env\/docker-compose\.071\.yml$/ );
} );

test( 'every Compose invocation passes both -f files', () => {
	// EN: This is what makes the cli/ bind mount take effect on every call.
	//     Each call must start with the shared prefix and reference both
	//     Compose files. (`logs` carries a second, unrelated `-f` -- the
	//     follow flag -- so the prefix is checked positionally, not by count.)
	// JA: これがすべての呼び出しで cli/ バインドマウントを有効にする。
	//     各呼び出しは共通プレフィックスで始まり、両 Compose ファイルを参照
	//     しなければならない。(`logs` は無関係な 2 つ目の `-f` -- 追従フラグ
	//     -- を持つため、プレフィックスは個数ではなく位置で検査する。)
	const prefix = composePrefix();
	for ( const command of [ 'start', 'stop', 'destroy', 'status', 'logs' ] ) {
		const args = buildComposeArgs( command );
		assert.deepEqual(
			args.slice( 0, prefix.length ),
			prefix,
			`${ command } should start with the shared Compose prefix`
		);
		assert.ok( args.includes( baseComposeFile ) );
		assert.ok( args.includes( overrideComposeFile ) );
	}
} );

test( 'start: docker compose up -d --build', () => {
	const args = buildComposeArgs( 'start' );
	assert.deepEqual( args.slice( -3 ), [ 'up', '-d', '--build' ] );
} );

test( 'stop: docker compose stop', () => {
	const args = buildComposeArgs( 'stop' );
	assert.equal( args.at( -1 ), 'stop' );
} );

test( 'destroy: docker compose down -v', () => {
	const args = buildComposeArgs( 'destroy' );
	assert.deepEqual( args.slice( -2 ), [ 'down', '-v' ] );
} );

test( 'status: docker compose ps', () => {
	const args = buildComposeArgs( 'status' );
	assert.equal( args.at( -1 ), 'ps' );
} );

test( 'logs: docker compose logs -f with no service', () => {
	const args = buildComposeArgs( 'logs', [] );
	assert.deepEqual( args.slice( -2 ), [ 'logs', '-f' ] );
} );

test( 'logs: docker compose logs -f <service> when a service is given', () => {
	const args = buildComposeArgs( 'logs', [ 'web' ] );
	assert.deepEqual( args.slice( -3 ), [ 'logs', '-f', 'web' ] );
} );

test( 'logs: a service name is appended after -f, not before', () => {
	const args = buildComposeArgs( 'logs', [ 'db' ] );
	const fIndex = args.lastIndexOf( '-f' );
	assert.equal( args[ fIndex + 1 ], 'db' );
} );

test( 'buildComposeArgs: an unknown command throws', () => {
	assert.throws( () => buildComposeArgs( 'frobnicate' ), /Unknown command/ );
} );

test( 'run cli: execs the 071-cli PHP CLI in the web container', () => {
	const args = buildComposeArgs( 'run', [ 'cli', 'post', 'list' ] );
	// EN: docker compose -f .. -f .. exec web php /opt/071-cli/php/071-cli.php
	//     post list --path=/var/www/html
	// JA: docker compose -f .. -f .. exec web php /opt/071-cli/php/071-cli.php
	//     post list --path=/var/www/html
	const execIndex = args.indexOf( 'exec' );
	assert.notEqual( execIndex, -1, 'should contain exec' );
	assert.deepEqual( args.slice( execIndex ), [
		'exec',
		WEB_SERVICE,
		'php',
		CLI_PHP_IN_CONTAINER,
		'post',
		'list',
		`--path=${ WP_PATH_IN_CONTAINER }`,
	] );
} );

test( 'run cli: appends --path so 071-cli finds the in-container WordPress', () => {
	const args = buildRunArgs( [ 'cli', 'post', 'list' ] );
	assert.equal( args.at( -1 ), `--path=${ WP_PATH_IN_CONTAINER }` );
} );

test( 'run cli: the in-container CLI path matches the bind-mount target', () => {
	// EN: docker-compose.071.yml mounts cli/ at /opt/071-cli.
	// JA: docker-compose.071.yml は cli/ を /opt/071-cli にマウントする。
	assert.equal( CLI_PHP_IN_CONTAINER, '/opt/071-cli/php/071-cli.php' );
} );

test( 'run cli: does NOT add --dbhost (the `db` host resolves in-container)', () => {
	const args = buildRunArgs( [ 'cli', 'post', 'list' ] );
	assert.ok( ! args.some( ( a ) => a.startsWith( '--dbhost' ) ) );
} );

test( 'run cli: forwards 071-cli flags such as --format and --fields', () => {
	const args = buildRunArgs( [ 'cli', 'post', 'list', '--format=json', '--fields=ID' ] );
	assert.ok( args.includes( '--format=json' ) );
	assert.ok( args.includes( '--fields=ID' ) );
} );

test( 'run cli: with no further args still execs the CLI entry point', () => {
	const args = buildRunArgs( [ 'cli' ] );
	assert.deepEqual( args.slice( args.indexOf( 'exec' ) ), [
		'exec',
		WEB_SERVICE,
		'php',
		CLI_PHP_IN_CONTAINER,
		`--path=${ WP_PATH_IN_CONTAINER }`,
	] );
} );

test( 'run <command>: execs an arbitrary command verbatim in the web container', () => {
	const args = buildComposeArgs( 'run', [ 'php', '-v' ] );
	assert.deepEqual( args.slice( args.indexOf( 'exec' ) ), [
		'exec',
		WEB_SERVICE,
		'php',
		'-v',
	] );
} );

test( 'run <command>: does not append --path (only `run cli` does)', () => {
	const args = buildRunArgs( [ 'ls', '-la' ] );
	assert.ok( ! args.some( ( a ) => a.startsWith( '--path' ) ) );
} );

test( 'run: with no command throws a helpful error', () => {
	assert.throws( () => buildRunArgs( [] ), /command is required/ );
	assert.throws( () => buildComposeArgs( 'run', [] ), /command is required/ );
} );

test( 'run: still passes both Compose files', () => {
	const args = buildComposeArgs( 'run', [ 'cli', 'post', 'list' ] );
	assert.ok( args.includes( baseComposeFile ) );
	assert.ok( args.includes( overrideComposeFile ) );
} );
