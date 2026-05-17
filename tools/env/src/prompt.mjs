/*
 * Interactive yes/no confirmation prompt for 071-env.
 *
 *     Used by `071-env destroy`, which runs `docker compose down -v` and so
 *     deletes the database volume and all its data. The user must explicitly
 *     confirm before that happens.
 */

import { createInterface } from 'node:readline';

/**
 * Decide whether a typed answer counts as an affirmative. Only `y` and
 *     `yes` (case-insensitive, trimmed) confirm; anything else -- including an
 *     empty line -- is treated as "no". This is exported so it can be unit
 *     tested without a TTY.
 * @param {string} answer The raw line typed by the user.
 * @returns {boolean} true when the answer is affirmative.
 */
export function isAffirmative( answer ) {
	const normalised = String( answer ).trim().toLowerCase();
	return normalised === 'y' || normalised === 'yes';
}

/**
 * Ask the user a yes/no question on stdin and resolve to their decision.
 *     The default answer is "no" -- the user must type `y` / `yes`.
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
