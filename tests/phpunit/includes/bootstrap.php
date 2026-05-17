<?php
/**
 * PHPUnit bootstrap. WordPress 0.71 is 2003-era procedural code; the
 * suite tests the pure helpers in b2functions.php / b2template.functions.php,
 * the textile formatter, and -- via a fake $wpdb stub (tests/Support/) --
 * the database-dependent helpers. A minimal CLI environment is set up
 * first so the legacy files load without fatal errors.
 */

declare(strict_types=1);

// wptexturize() inspects the user-agent string; b2vars.php inspects
// SERVER_SOFTWARE. Provide dummy values for both.
if (!isset($_SERVER['HTTP_USER_AGENT'])) {
    $_SERVER['HTTP_USER_AGENT'] = 'PHPUnit';
}
if (!isset($_SERVER['SERVER_SOFTWARE'])) {
    $_SERVER['SERVER_SOFTWARE'] = 'PHPUnit';
}

// b2vars.php builds the smilies table from $smilies_directory; define it
// so the file loads standalone.
$smilies_directory = '/smilies';

// Load the legacy code under test. Order matters: b2vars.php calls
// add_filter() (defined in b2template.functions.php), so the template
// functions must be loaded first. None of these three files opens a
// database connection, so they are safe to require here.
require __DIR__ . '/../../../src/b2-include/b2functions.php';
require __DIR__ . '/../../../src/b2-include/b2template.functions.php';

// b2vars.php is a Latin-1 file that emits notices/deprecations as it
// builds its translation tables from an incomplete CLI environment;
// silence them just for the require so the suite output stays clean.
// The file itself is never modified.
// It is loaded inside a closure so its file-scope variables ($b2_bbcode,
// $b2_smiliessearch, ...) do not leak as locals of the PHPUnit bootstrap
// method scope; the closure then promotes exactly those tables into
// $GLOBALS, which is where the legacy convert_*() helpers read them via
// `global`. In the real application b2vars.php is included at true global
// scope, so this just reproduces that for the test runner.
(static function () use ($smilies_directory): void {
    $previous_reporting = error_reporting(0);
    require __DIR__ . '/../../../src/b2-include/b2vars.php';
    error_reporting($previous_reporting);

    foreach (
        [
            'b2_bbcode',
            'b2_gmcode',
            'b2_htmltrans',
            'b2_htmltranswinuni',
            'b2_smiliessearch',
            'b2_smiliesreplace',
        ] as $table
    ) {
        if (isset($$table)) {
            $GLOBALS[$table] = $$table;
        }
    }
})();

// The textile formatter is a standalone string-in / HTML-out library.
require __DIR__ . '/../../../src/b2-include/textile.php';

// Test-support classes (the fake $wpdb and the shared base TestCase).
require __DIR__ . '/Support/FakeWpdb.php';
require __DIR__ . '/Support/DatabaseTestCase.php';
