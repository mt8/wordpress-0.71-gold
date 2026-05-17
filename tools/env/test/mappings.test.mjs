/*
 * EN: Unit tests for tools/env/src/mappings.mjs -- rendering the runtime Compose
 *     override that adds the configured `mappings` as extra `web` volumes.
 *     The pure `renderMappingsOverride` is tested directly; the filesystem
 *     `writeMappingsOverride` is covered for its return contract by
 *     round-tripping through the real (git-ignored) target path.
 * JA: tools/env/src/mappings.mjs の単体テスト -- 設定された `mappings` を `web` の
 *     追加 `volumes` として加える実行時 Compose オーバーライドの描画。純粋な
 *     `renderMappingsOverride` を直接テストし、ファイルシステムの
 *     `writeMappingsOverride` は実際の (git 管理外の) ターゲットパスを往復
 *     させてその返り値契約を検証する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';

import { renderMappingsOverride, writeMappingsOverride } from '../src/mappings.mjs';
import { mappingsOverrideFile } from '../src/paths.mjs';

test( 'renderMappingsOverride: no mappings renders null', () => {
	assert.equal( renderMappingsOverride( {} ), null );
	assert.equal( renderMappingsOverride( undefined ), null );
} );

test( 'renderMappingsOverride: one mapping renders a web/volumes override', () => {
	const yaml = renderMappingsOverride( { '/var/www/html/wp-content/x': './x' } );
	assert.match( yaml, /^services:/m );
	assert.match( yaml, /^ {2}web:/m );
	assert.match( yaml, /^ {4}volumes:/m );
	assert.match( yaml, /"\.\/x:\/var\/www\/html\/wp-content\/x"/ );
} );

test( 'renderMappingsOverride: a mapping is written host:container (not reversed)', () => {
	// EN: The config maps container path -> host path; the volume line is
	//     host:container, the order Compose expects.
	// JA: 設定はコンテナパス -> ホストパスを対応付け、volume 行は host:container
	//     -- Compose が期待する順序である。
	const yaml = renderMappingsOverride( { '/container/path': '/host/path' } );
	assert.match( yaml, /"\/host\/path:\/container\/path"/ );
} );

test( 'renderMappingsOverride: multiple mappings each become a volume line', () => {
	const yaml = renderMappingsOverride( {
		'/c/a': './a',
		'/c/b': './b',
	} );
	assert.match( yaml, /"\.\/a:\/c\/a"/ );
	assert.match( yaml, /"\.\/b:\/c\/b"/ );
} );

test( 'renderMappingsOverride: output is deterministic (sorted by container path)', () => {
	const a = renderMappingsOverride( { '/c/z': './z', '/c/a': './a' } );
	const b = renderMappingsOverride( { '/c/a': './a', '/c/z': './z' } );
	assert.equal( a, b );
	// EN: /c/a sorts before /c/z.
	// JA: /c/a は /c/z より前に並ぶ。
	assert.ok( a.indexOf( '/c/a' ) < a.indexOf( '/c/z' ) );
} );

test( 'renderMappingsOverride: host paths with spaces are double-quoted', () => {
	const yaml = renderMappingsOverride( { '/c/x': './my themes' } );
	assert.match( yaml, /"\.\/my themes:\/c\/x"/ );
} );

test( 'renderMappingsOverride: ends with a trailing newline', () => {
	const yaml = renderMappingsOverride( { '/c/x': './x' } );
	assert.ok( yaml.endsWith( '\n' ) );
} );

test( 'writeMappingsOverride: with mappings writes the file and returns its path', () => {
	// EN: Clean up first in case a previous run left the file.
	// JA: 前回の実行でファイルが残っている場合に備え、先に掃除する。
	if ( existsSync( mappingsOverrideFile ) ) {
		rmSync( mappingsOverrideFile );
	}
	try {
		const path = writeMappingsOverride( { '/c/x': './x' } );
		assert.equal( path, mappingsOverrideFile );
		assert.ok( existsSync( mappingsOverrideFile ) );
		assert.match( readFileSync( mappingsOverrideFile, 'utf8' ), /"\.\/x:\/c\/x"/ );
	} finally {
		if ( existsSync( mappingsOverrideFile ) ) {
			rmSync( mappingsOverrideFile );
		}
	}
} );

test( 'writeMappingsOverride: with no mappings removes a stale file and returns null', () => {
	try {
		// EN: Seed a stale file, then assert an empty-mappings call clears it.
		// JA: 古いファイルを作り、空マッピングの呼び出しがそれを消すことを確認。
		writeMappingsOverride( { '/c/x': './x' } );
		assert.ok( existsSync( mappingsOverrideFile ) );
		const path = writeMappingsOverride( {} );
		assert.equal( path, null );
		assert.ok( ! existsSync( mappingsOverrideFile ) );
	} finally {
		if ( existsSync( mappingsOverrideFile ) ) {
			rmSync( mappingsOverrideFile );
		}
	}
} );

test( 'mappingsOverrideFile: lives at the repository root, git-ignored name', () => {
	assert.match( mappingsOverrideFile, /\/docker-compose\.071-mappings\.yml$/ );
	assert.doesNotMatch( mappingsOverrideFile, /\/env\// );
} );
