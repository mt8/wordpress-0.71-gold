/*
 * EN: Unit tests for tools/env/src/prompt.mjs -- the affirmative-answer logic of the
 *     destroy confirmation prompt. `confirm()` itself reads a TTY, so only its
 *     pure `isAffirmative` helper is exercised here.
 * JA: tools/env/src/prompt.mjs の単体テスト -- destroy 確認プロンプトの肯定回答
 *     ロジック。`confirm()` 自体は TTY を読むため、ここでは純粋な
 *     `isAffirmative` ヘルパーのみを検証する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { isAffirmative } from '../src/prompt.mjs';

test( 'isAffirmative: `y` and `yes` confirm', () => {
	assert.equal( isAffirmative( 'y' ), true );
	assert.equal( isAffirmative( 'yes' ), true );
} );

test( 'isAffirmative: confirmation is case-insensitive and trimmed', () => {
	for ( const answer of [ 'Y', 'YES', ' yes ', ' Y\t', 'Yes' ] ) {
		assert.equal( isAffirmative( answer ), true, `${ JSON.stringify( answer ) } should confirm` );
	}
} );

test( 'isAffirmative: an empty line does NOT confirm (default is no)', () => {
	assert.equal( isAffirmative( '' ), false );
	assert.equal( isAffirmative( '   ' ), false );
} );

test( 'isAffirmative: anything other than y/yes does not confirm', () => {
	for ( const answer of [ 'n', 'no', 'nope', 'yeah', 'yep', 'sure', '1', 'true' ] ) {
		assert.equal( isAffirmative( answer ), false, `${ answer } should not confirm` );
	}
} );
