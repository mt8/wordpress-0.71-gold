/*
 * Unit tests for tools/env/src/output.mjs -- the friendly, wp-env-style
 *     terminal output. Every function under test is pure (data in, string
 *     out), so the whole module is testable without Docker.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	ADMIN_PATH,
	siteUrl,
	adminUrl,
	progressMessage,
	startSummary,
	successMessage,
	statusReport,
	failureMessage,
} from '../src/output.mjs';

const defaults = { port: 8080, dbPort: 3306 };
const custom = { port: 9000, dbPort: 3399 };

test( 'siteUrl: builds http://localhost:<port> from the config', () => {
	assert.equal( siteUrl( defaults ), 'http://localhost:8080' );
	assert.equal( siteUrl( custom ), 'http://localhost:9000' );
} );

test( 'adminUrl: appends the WordPress 0.71 admin path', () => {
	assert.equal( adminUrl( defaults ), `http://localhost:8080${ ADMIN_PATH }` );
	assert.match( adminUrl( defaults ), /wp-admin/ );
} );

test( 'progressMessage: start/stop/destroy have a line, status does not', () => {
	assert.match( progressMessage( 'start' ), /starting/ );
	assert.match( progressMessage( 'stop' ), /stopping/ );
	assert.match( progressMessage( 'destroy' ), /destroying/ );
	assert.equal( progressMessage( 'status' ), null );
} );

test( 'startSummary: lists the WordPress URL, admin URL and MySQL port', () => {
	const summary = startSummary( custom );
	assert.match( summary, /WordPress 0\.71 environment started/ );
	assert.match( summary, /http:\/\/localhost:9000/ );
	assert.match( summary, /http:\/\/localhost:9000\/wp-admin\// );
	assert.match( summary, /localhost:3399/ );
	// No raw Docker noise leaks into the summary.
	assert.doesNotMatch( summary, /Container|Building|Pulling/ );
} );

test( 'successMessage: stop and destroy each get a clear one-liner', () => {
	assert.match( successMessage( 'stop' ), /stopped/ );
	assert.match( successMessage( 'destroy' ), /destroyed/ );
	assert.equal( successMessage( 'start' ), null );
} );

test( 'statusReport: a running stack keeps the ps table and adds URLs', () => {
	const ps = [
		'NAME            IMAGE             STATUS',
		'repo-web-1      repo-web          Up 2 minutes',
		'repo-db-1       mysql:8.0         Up 2 minutes',
	].join( '\n' );
	const report = statusReport( ps, custom );
	assert.match( report, /environment status/ );
	assert.match( report, /repo-web-1/ );
	assert.match( report, /http:\/\/localhost:9000/ );
	assert.match( report, /localhost:3399/ );
} );

test( 'statusReport: a stopped stack keeps the table but hides the URLs', () => {
	const ps = [
		'NAME            IMAGE             STATUS',
		'repo-web-1      repo-web          Exited (0) 1 minute ago',
		'repo-db-1       mysql:8.0         Exited (137) 1 minute ago',
	].join( '\n' );
	const report = statusReport( ps, custom );
	assert.match( report, /repo-web-1/ );
	assert.match( report, /stopped/ );
	assert.doesNotMatch( report, /http:\/\/localhost:9000/ );
} );

test( 'statusReport: an empty ps table reports the env does not exist', () => {
	const headerOnly = 'NAME            IMAGE             STATUS';
	const report = statusReport( headerOnly, defaults );
	assert.match( report, /does not exist/ );
	assert.match( report, /071-env start/ );
} );

test( 'statusReport: completely empty output reports the env does not exist', () => {
	const report = statusReport( '', defaults );
	assert.match( report, /does not exist/ );
} );

test( 'failureMessage: surfaces the captured docker output', () => {
	const captured = { stdout: 'build step output\n', stderr: 'Error: port is allocated\n' };
	const message = failureMessage( 'start', captured );
	assert.match( message, /`start` failed/ );
	assert.match( message, /build step output/ );
	assert.match( message, /port is allocated/ );
} );

test( 'failureMessage: handles docker producing no output', () => {
	const message = failureMessage( 'stop', { stdout: '', stderr: '' } );
	assert.match( message, /`stop` failed/ );
	assert.match( message, /no output/ );
} );
