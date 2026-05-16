<?php
/**
 * EN: PHPUnit bootstrap. WordPress 0.71 is 2003-era procedural code; the
 *     suite tests the pure helpers in b2functions.php / b2template.functions.php,
 *     the textile formatter, and -- via a fake $wpdb stub (tests/Support/) --
 *     the database-dependent helpers. A minimal CLI environment is set up
 *     first so the legacy files load without fatal errors.
 * JA: PHPUnit ブートストラップ。WordPress 0.71 は 2003 年当時の手続き型コード。
 *     本スイートは b2functions.php / b2template.functions.php の純粋なヘルパー、
 *     textile フォーマッタ、そして偽の $wpdb スタブ(tests/Support/)を介して
 *     DB 依存ヘルパーをテストする。レガシーファイルが致命的エラー無しで読み
 *     込めるよう、先に最小限の CLI 環境を整える。
 */

declare(strict_types=1);

// EN: wptexturize() inspects the user-agent string; b2vars.php inspects
//     SERVER_SOFTWARE. Provide dummy values for both.
// JA: wptexturize() はユーザーエージェント文字列を、b2vars.php は
//     SERVER_SOFTWARE を参照する。両方にダミー値を与える。
if (!isset($_SERVER['HTTP_USER_AGENT'])) {
    $_SERVER['HTTP_USER_AGENT'] = 'PHPUnit';
}
if (!isset($_SERVER['SERVER_SOFTWARE'])) {
    $_SERVER['SERVER_SOFTWARE'] = 'PHPUnit';
}

// EN: b2vars.php builds the smilies table from $smilies_directory; define it
//     so the file loads standalone.
// JA: b2vars.php は $smilies_directory から smilies テーブルを組み立てる。
//     単独で読み込めるよう定義しておく。
$smilies_directory = '/smilies';

// EN: Load the legacy code under test. Order matters: b2vars.php calls
//     add_filter() (defined in b2template.functions.php), so the template
//     functions must be loaded first. None of these three files opens a
//     database connection, so they are safe to require here.
// JA: テスト対象のレガシーコードを読み込む。順序が重要: b2vars.php は
//     add_filter()(b2template.functions.php で定義)を呼ぶため、テンプレート
//     関数を先に読み込む必要がある。この 3 ファイルはいずれも DB 接続を
//     張らないため、ここで require して安全である。
require __DIR__ . '/../../../src/b2-include/b2functions.php';
require __DIR__ . '/../../../src/b2-include/b2template.functions.php';

// EN: b2vars.php is a Latin-1 file that emits notices/deprecations as it
//     builds its translation tables from an incomplete CLI environment;
//     silence them just for the require so the suite output stays clean.
//     The file itself is never modified.
//     It is loaded inside a closure so its file-scope variables ($b2_bbcode,
//     $b2_smiliessearch, ...) do not leak as locals of the PHPUnit bootstrap
//     method scope; the closure then promotes exactly those tables into
//     $GLOBALS, which is where the legacy convert_*() helpers read them via
//     `global`. In the real application b2vars.php is included at true global
//     scope, so this just reproduces that for the test runner.
// JA: b2vars.php は Latin-1 ファイルで、不完全な CLI 環境から変換テーブルを
//     組み立てる際に notice / deprecation を出す。スイート出力を綺麗に保つ
//     ため require の間だけ抑止する。ファイル自体は一切変更しない。
//     クロージャ内で読み込み、そのファイルスコープ変数($b2_bbcode・
//     $b2_smiliessearch ほか)が PHPUnit ブートストラップのメソッドスコープの
//     ローカルとして漏れないようにする。クロージャは続けてそれらのテーブルを
//     $GLOBALS へ昇格させる。レガシーな convert_*() ヘルパーは `global` 経由で
//     そこから読む。実アプリでは b2vars.php は真のグローバルスコープで
//     include されるため、これはテストランナー向けにそれを再現するだけである。
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

// EN: The textile formatter is a standalone string-in / HTML-out library.
// JA: textile フォーマッタは単独の「文字列入力 / HTML 出力」ライブラリ。
require __DIR__ . '/../../../src/b2-include/textile.php';

// EN: Test-support classes (the fake $wpdb and the shared base TestCase).
// JA: テスト補助クラス(偽の $wpdb と共有ベース TestCase)。
require __DIR__ . '/Support/FakeWpdb.php';
require __DIR__ . '/Support/DatabaseTestCase.php';
