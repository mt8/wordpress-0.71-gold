// 071-now blueprint support (Issue #209).
//
//     The official WordPress Playground provisions an environment from
//     a declarative blueprint.json. 071-now supports a focused subset
//     that fits WordPress 0.71 -- which has no plugins, themes or
//     theme.json, so most of the official step types do not apply.
//
//     A blueprint is delivered via a `?blueprint=<url>` query
//     parameter. Its steps run once, on a fresh boot, after the
//     database is seeded and before the blog is shown; on a boot that
//     restored a persisted environment the blueprint is skipped, so a
//     reload never re-applies it (and never duplicates inserted rows).
//
//     Supported keys:
//       - landingPage: the blog-relative path to open instead of
//         /index.php.
//       - steps: an array of { step, ... } objects --
//           - { step: 'runSql', sql: <string | string[]> }  run SQL
//             against the SQLite database;
//           - { step: 'runPHP', code: '<?php ...' }          run PHP;
//           - { step: 'setOption', option: <name>, value: <v> }  set a
//             WordPress 0.71 setting (a b2settings column).
//
//     Each step runs as a real request through the same request
//     handler the blog uses: the step's PHP is written into the
//     document root and requested, so its database writes land in the
//     environment the blog serves -- exactly like a post created
//     through the admin -- and are picked up by the persistence layer.

/**
 * The WordPress 0.71 settings a `setOption` step may write. b2settings
 *     is a single row (ID = 1) whose columns are the settings; the ID
 *     column itself is not a setting and is excluded.
 */
const SETTABLE_OPTIONS = [
	'posts_per_page',
	'what_to_show',
	'archive_mode',
	'time_difference',
	'AutoBR',
	'time_format',
	'date_format',
];

/**
 * Document-root path and blog-relative URL of the temporary PHP file a
 *     blueprint step is executed through. A step's PHP is written here,
 *     requested, and removed again.
 */
const STEP_FILE = '/wordpress/wp-071-blueprint-step.php';
const STEP_URL = '/wp-071-blueprint-step.php';

/**
 * Render a string as a single-quoted PHP string literal.
 *
 * Only a backslash and a single quote are special inside a PHP
 *     single-quoted string, so escaping those two is sufficient and
 *     safe -- it lets blueprint data be embedded into a generated PHP
 *     snippet without any interpolation surprise.
 *
 * @param {string} value The string to quote.
 * @return {string} A PHP single-quoted literal.
 */
function phpQuote( value ) {
	return (
		"'" +
		String( value ).replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" ) +
		"'"
	);
}

/**
 * Read the blueprint named by the `?blueprint=<url>` query parameter.
 *
 * The URL is resolved against the app base, fetched and parsed. Returns
 *     null when no `?blueprint=` parameter is present.
 *
 * @param {string} appBase The app base path (import.meta.env.BASE_URL).
 * @return {Promise<object|null>} The parsed blueprint, or null.
 */
export async function loadBlueprint( appBase ) {
	const url = new URLSearchParams( location.search ).get( 'blueprint' );
	if ( ! url ) {
		return null;
	}
	const resolved = new URL( url, location.origin + appBase ).href;
	const response = await fetch( resolved );
	if ( ! response.ok ) {
		throw new Error(
			`could not fetch the blueprint (HTTP ${ response.status }).`
		);
	}
	return response.json();
}

/**
 * Return the landing page a blueprint asks for, normalised to a
 * blog-relative path, or '/index.php' when it names none.
 *
 * @param {object|null} blueprint The parsed blueprint.
 * @return {string} The blog-relative landing path.
 */
export function blueprintLandingPage( blueprint ) {
	const page = blueprint && blueprint.landingPage;
	if ( typeof page !== 'string' || page === '' ) {
		return '/index.php';
	}
	return page.startsWith( '/' ) ? page : `/${ page }`;
}

/**
 * Run a PHP snippet as a request through the request handler.
 *
 * The snippet is written into the document root and requested, so it
 * runs in the same context the blog's own requests do, then removed.
 *
 * @param {PHP}                php            The php-wasm instance.
 * @param {PHPRequestHandler}  requestHandler The blog request handler.
 * @param {string}             code           The PHP code to run.
 * @return {Promise<string>} The response body.
 */
async function runStep( php, requestHandler, code ) {
	php.writeFile( STEP_FILE, code );
	try {
		const response = await requestHandler.request( { url: STEP_URL } );
		if ( response.httpStatusCode !== 200 ) {
			throw new Error(
				`the step returned HTTP ${ response.httpStatusCode }.`
			);
		}
		return response.text;
	} finally {
		if ( php.fileExists( STEP_FILE ) ) {
			php.unlink( STEP_FILE );
		}
	}
}

/**
 * Run a database statement inside a guarded snippet and throw with the
 * PDO error message when it fails.
 *
 * @param {PHP}               php            The php-wasm instance.
 * @param {PHPRequestHandler} requestHandler The blog request handler.
 * @param {string}            body           The PHP body operating on $pdo.
 * @return {Promise<void>}
 */
async function runGuardedSql( php, requestHandler, body ) {
	// WP071_DB_PATH is defined by the boot shim (auto_prepend_file),
	//     which runs ahead of this requested snippet.
	const code =
		'<?php\n' +
		'try {\n' +
		"\t$pdo = new PDO( 'sqlite:' . WP071_DB_PATH );\n" +
		'\t$pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );\n' +
		`\t${ body }\n` +
		"\techo 'BLUEPRINT_OK';\n" +
		'} catch ( Throwable $e ) {\n' +
		"\techo 'BLUEPRINT_ERR ' . $e->getMessage();\n" +
		'}\n';
	const out = await runStep( php, requestHandler, code );
	if ( out.indexOf( 'BLUEPRINT_OK' ) !== -1 ) {
		return;
	}
	const marker = out.indexOf( 'BLUEPRINT_ERR ' );
	throw new Error(
		marker === -1
			? 'the step produced no result.'
			: out.slice( marker + 'BLUEPRINT_ERR '.length ).trim()
	);
}

/**
 * Apply one blueprint step.
 *
 * @param {PHP}               php            The php-wasm instance.
 * @param {PHPRequestHandler} requestHandler The blog request handler.
 * @param {object}            step           The step object.
 * @return {Promise<void>}
 */
async function applyStep( php, requestHandler, step ) {
	const name = step && step.step;

	if ( name === 'runPHP' ) {
		await runStep( php, requestHandler, String( ( step && step.code ) || '' ) );
		return;
	}

	if ( name === 'runSql' ) {
		const list = Array.isArray( step.sql ) ? step.sql : [ step.sql ];
		for ( const sql of list ) {
			await runGuardedSql(
				php,
				requestHandler,
				`$pdo->exec( ${ phpQuote( String( sql || '' ) ) } );`
			);
		}
		return;
	}

	if ( name === 'setOption' ) {
		if ( ! SETTABLE_OPTIONS.includes( step && step.option ) ) {
			throw new Error(
				`setOption: unknown option '${ step && step.option }'. ` +
					`Accepted: ${ SETTABLE_OPTIONS.join( ', ' ) }.`
			);
		}
		// The option name is from the allow-list above, so it is safe
		//     to interpolate into the column position; the value is
		//     still passed as a bound parameter.
		await runGuardedSql(
			php,
			requestHandler,
			'$stmt = $pdo->prepare( ' +
				phpQuote(
					`UPDATE b2settings SET ${ step.option } = ? WHERE ID = 1`
				) +
				' );\n\t$stmt->execute( array( ' +
				phpQuote( String( step.value ) ) +
				' ) );'
		);
		return;
	}

	throw new Error( `unknown blueprint step '${ name }'.` );
}

/**
 * Apply every step of a blueprint to the running environment.
 *
 * @param {PHP}               php            The php-wasm instance.
 * @param {PHPRequestHandler} requestHandler The blog request handler.
 * @param {object}            blueprint      The parsed blueprint.
 * @return {Promise<void>}
 */
export async function applyBlueprint( php, requestHandler, blueprint ) {
	const steps = Array.isArray( blueprint && blueprint.steps )
		? blueprint.steps
		: [];
	for ( const step of steps ) {
		await applyStep( php, requestHandler, step );
	}
}
