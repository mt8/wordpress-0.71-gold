/*
 * EN: Interactive yes/no confirmation prompt for 071-env.
 *
 *     Used by `071-env destroy`, which runs `docker compose down -v` and so
 *     deletes the database volume and all its data. The user must explicitly
 *     confirm before that happens.
 *
 * JA: 071-env のための対話的な yes/no 確認プロンプト。
 *
 *     `071-env destroy` が使用する。`docker compose down -v` を実行し、
 *     データベースボリュームとその全データを削除するため、実行前にユーザーの
 *     明示的な確認が必須である。
 */

import { createInterface } from 'node:readline';

/**
 * EN: Decide whether a typed answer counts as an affirmative. Only `y` and
 *     `yes` (case-insensitive, trimmed) confirm; anything else -- including an
 *     empty line -- is treated as "no". This is exported so it can be unit
 *     tested without a TTY.
 * JA: 入力された回答が肯定かどうかを判定する。`y` と `yes` (大文字小文字を
 *     無視、トリム済み) のみ確認とし、空行を含むそれ以外はすべて「いいえ」と
 *     する。TTY 無しで単体テストできるよう export している。
 *
 * @param {string} answer The raw line typed by the user.
 * @returns {boolean} true when the answer is affirmative.
 */
export function isAffirmative( answer ) {
	const normalised = String( answer ).trim().toLowerCase();
	return normalised === 'y' || normalised === 'yes';
}

/**
 * EN: Ask the user a yes/no question on stdin and resolve to their decision.
 *     The default answer is "no" -- the user must type `y` / `yes`.
 * JA: 標準入力で yes/no を尋ね、その判断に解決する。既定の回答は「いいえ」
 *     であり、ユーザーは `y` / `yes` を入力しなければならない。
 *
 * @param {string} question The question to display (a `[y/N]` is appended).
 * @returns {Promise<boolean>} resolves true when the user confirms.
 */
export function confirm( question ) {
	return new Promise( ( resolve ) => {
		const rl = createInterface( {
			input: process.stdin,
			output: process.stdout,
		} );

		rl.question( `${ question } [y/N] `, ( answer ) => {
			rl.close();
			resolve( isAffirmative( answer ) );
		} );
	} );
}
