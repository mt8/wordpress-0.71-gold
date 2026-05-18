// 071 repository setup -- one command to install all tooling after a
//     fresh clone (Issue #191).
//
//     A fresh clone needs three separate installs across two
//     directories before the dev environment works, and there was no
//     single command for it. This is that command, wired to
//     `npm run setup`:
//
//       1. `npm install` at the repo root -- the tools/ workspace
//          packages (071-cli / 071-env / 071-now), Playwright, and
//          husky (its `prepare` script installs the git hooks).
//       2. `npm install` in tools/block-editor -- a separate npm
//          package, deliberately not a root workspace.
//       3. `npm run build` in tools/block-editor -- writes the editor
//          bundle to src/block-editor/assets/, which the blog serves.
//       4. `composer install` -- the PHP dev tooling (phpcs, phpstan,
//          phpunit, behat).
//
//     It installs and builds tooling only. Starting the Docker blog is
//     a separate runtime step: `npx 071-env start`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// This file is scripts/setup.mjs, so the repo root is one level up.
const repoRoot = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const blockEditorDir = join( repoRoot, 'tools', 'block-editor' );

/**
 * Run a command in a directory, inheriting stdio so its own progress
 *     output reaches the terminal.
 *
 * @param {string}   command The executable to run.
 * @param {string[]} args    Its arguments.
 * @param {string}   cwd     The working directory.
 * @return {boolean} True when the command exited 0.
 */
function run( command, args, cwd ) {
	console.log( `\n[setup] ${ command } ${ args.join( ' ' ) }` );
	const result = spawnSync( command, args, {
		cwd,
		stdio: 'inherit',
		// npm / composer are .cmd / .bat shims on Windows; a shell run
		//     resolves them.
		shell: process.platform === 'win32',
	} );
	return result.status === 0;
}

// The post-clone steps, in order.
const steps = [
	{
		label: 'repo-root npm packages (tools/ workspaces, Playwright, husky)',
		command: 'npm',
		args: [ 'install' ],
		cwd: repoRoot,
	},
	{
		label: 'block editor npm packages',
		command: 'npm',
		args: [ 'install' ],
		cwd: blockEditorDir,
	},
	{
		label: 'block editor build (src/block-editor/assets/)',
		command: 'npm',
		args: [ 'run', 'build' ],
		cwd: blockEditorDir,
	},
	{
		label: 'PHP dev tooling via Composer (phpcs, phpstan, phpunit, behat)',
		command: 'composer',
		args: [ 'install' ],
		cwd: repoRoot,
	},
];

for ( let i = 0; i < steps.length; i++ ) {
	const step = steps[ i ];
	console.log(
		`\n[setup] step ${ i + 1 }/${ steps.length }: ${ step.label }`
	);
	if ( ! run( step.command, step.args, step.cwd ) ) {
		console.error(
			`\n[setup] FAILED at step ${ i + 1 }: ${ step.label }\n` +
				`[setup] '${ step.command }' did not complete -- ` +
				'is it installed and on PATH?'
		);
		process.exit( 1 );
	}
}

console.log(
	'\n[setup] done -- all tooling installed.\n' +
		'[setup] next: start the local blog with  npx 071-env start'
);
