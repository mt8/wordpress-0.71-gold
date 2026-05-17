/*
 * EN: Unit tests for env/src/main.mjs -- the dispatcher's non-Docker paths.
 *     `main()` only reaches `runDocker` for commands that actually operate the
 *     environment; the help and unknown-command paths return without spawning
 *     Docker and can be tested directly. stdout / stderr are captured so the
 *     tests stay quiet.
 * JA: env/src/main.mjs の単体テスト -- ディスパッチャの Docker 非経由パス。
 *     `main()` が `runDocker` に到達するのは実際に環境を操作するコマンドの
 *     ときのみであり、ヘルプと未知コマンドのパスは Docker を起動せずに復帰
 *     するため直接テストできる。テストを静かに保つため stdout / stderr を
 *     捕捉する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../src/main.mjs';

/**
 * EN: Run `main` with stdout / stderr captured. Returns the exit code plus the
 *     captured streams.
 * JA: stdout / stderr を捕捉して `main` を実行する。終了コードと捕捉した
 *     ストリームを返す。
 *
 * @param {string[]} argv The argv to pass to main.
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
async function runCaptured( argv ) {
	const originalOut = process.stdout.write;
	const originalErr = process.stderr.write;
	let stdout = '';
	let stderr = '';
	process.stdout.write = ( chunk ) => {
		stdout += chunk;
		return true;
	};
	process.stderr.write = ( chunk ) => {
		stderr += chunk;
		return true;
	};
	try {
		const code = await main( argv );
		return { code, stdout, stderr };
	} finally {
		process.stdout.write = originalOut;
		process.stderr.write = originalErr;
	}
}

test( 'main: no arguments prints help and exits 0', async () => {
	const { code, stdout } = await runCaptured( [] );
	assert.equal( code, 0 );
	assert.match( stdout, /Usage:/ );
} );

test( 'main: --help prints help and exits 0', async () => {
	const { code, stdout } = await runCaptured( [ '--help' ] );
	assert.equal( code, 0 );
	assert.match( stdout, /071-env/ );
} );

test( 'main: an unknown command exits 1 and reports the command', async () => {
	const { code, stderr } = await runCaptured( [ 'frobnicate' ] );
	assert.equal( code, 1 );
	assert.match( stderr, /unknown command 'frobnicate'/ );
} );

test( 'main: `run` with no command exits 1 with a helpful error', async () => {
	const { code, stderr } = await runCaptured( [ 'run' ] );
	assert.equal( code, 1 );
	assert.match( stderr, /command is required/ );
} );
