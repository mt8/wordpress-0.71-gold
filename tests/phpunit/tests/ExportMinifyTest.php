<?php
/**
 * Tests for the export-time minify helpers (Issue #255).
 *
 *   - cli_export_minify_css(): strips block comments, collapses
 *     whitespace around CSS punctuation, drops the optional `;`
 *     before `}`.
 *   - cli_export_minify_js(): strips block + line comments and
 *     per-line whitespace; preserves line breaks between
 *     statements so ASI still works.
 *   - cli_export_minify_inline_assets(): rewrites a page body
 *     applying the CSS / JS minifiers to inline <style> /
 *     <script> blocks.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../../tools/cli/php/commands/export.php';

final class ExportMinifyTest extends TestCase
{
    // ------------------ CSS ------------------

    public function testCssStripsBlockComments(): void
    {
        $css = "/* head */ body { /* inside */ margin: 0 }";
        $this->assertSame('body{margin:0}', cli_export_minify_css($css));
    }

    public function testCssCollapsesWhitespaceAroundPunctuation(): void
    {
        $css = "body  {  margin :  0  ;  padding :  1em  }";
        $this->assertSame('body{margin:0;padding:1em}', cli_export_minify_css($css));
    }

    public function testCssDropsTrailingSemicolonBeforeClose(): void
    {
        $css = "p { color: red; }";
        $this->assertSame('p{color:red}', cli_export_minify_css($css));
    }

    public function testCssHandlesCombinatorSelectors(): void
    {
        $css = ".a > .b , .c + .d , .e ~ .f { display: block }";
        $this->assertSame('.a>.b,.c+.d,.e~.f{display:block}', cli_export_minify_css($css));
    }

    public function testCssMinifyIsIdempotent(): void
    {
        $css  = "body { margin: 0; padding: 0 }";
        $once = cli_export_minify_css($css);
        $this->assertSame($once, cli_export_minify_css($once));
    }

    public function testCssEmptyInputReturnsEmpty(): void
    {
        $this->assertSame('', cli_export_minify_css(''));
        $this->assertSame('', cli_export_minify_css("   \n\t  "));
    }

    public function testCssHandlesMediaQuery(): void
    {
        $css = "@media ( min-width: 800px ) { .x { color: red } .y { color: blue } }";
        $this->assertSame('@media(min-width:800px){.x{color:red}.y{color:blue}}', cli_export_minify_css($css));
    }

    // ------------------ JS ------------------

    public function testJsStripsBlockComments(): void
    {
        $js  = "/* file header */\nvar a = 1;";
        $out = cli_export_minify_js($js);
        $this->assertStringNotContainsString('file header', $out);
        $this->assertStringContainsString('var a = 1;', $out);
    }

    public function testJsStripsLeadingLineComments(): void
    {
        $js  = "// the script\nvar a = 1;\n// another\nvar b = 2;";
        $out = cli_export_minify_js($js);
        $this->assertStringNotContainsString('the script', $out);
        $this->assertStringNotContainsString('another', $out);
        $this->assertStringContainsString('var a = 1;', $out);
        $this->assertStringContainsString('var b = 2;', $out);
    }

    public function testJsStripsTrailingLineCommentsAfterCode(): void
    {
        $js  = "var a = 1; // initialise\nvar b = 2;";
        $out = cli_export_minify_js($js);
        $this->assertStringNotContainsString('initialise', $out);
        $this->assertStringContainsString('var a = 1;', $out);
    }

    public function testJsTrimsPerLineWhitespace(): void
    {
        $js  = "    var a = 1;    \n        var b = 2;    ";
        $out = cli_export_minify_js($js);
        $this->assertSame("var a = 1;\nvar b = 2;", $out);
    }

    public function testJsPreservesLineBreaksBetweenStatements(): void
    {
        // Line breaks must survive so ASI does the right thing -- a
        //     conservative minifier never merges adjacent statements
        //     onto the same line.
        $js  = "var a = 1\nvar b = 2";
        $out = cli_export_minify_js($js);
        $this->assertStringContainsString("\n", $out);
    }

    public function testJsPreservesMenuToggleScriptSemantics(): void
    {
        // The real Issue #226 menu-toggle script (slightly
        //     abbreviated) must survive the minify pass with every
        //     identifier and call site intact.
        $js =
            "// Sync the menu disclosure's [open] state to the viewport (Issue #226).\n"
            . "( function () {\n"
            . "    var menu = document.getElementById( 'menu-toggle' );\n"
            . "    if ( ! menu || ! window.matchMedia ) {\n"
            . "        return;\n"
            . "    }\n"
            . "    var phone = window.matchMedia( '(max-width: 782px)' );\n"
            . "    function sync() {\n"
            . "        menu.open = ! phone.matches;\n"
            . "    }\n"
            . "    sync();\n"
            . "    if ( phone.addEventListener ) {\n"
            . "        phone.addEventListener( 'change', sync );\n"
            . "    }\n"
            . "} )();\n";
        $out = cli_export_minify_js($js);
        // Comments gone.
        $this->assertStringNotContainsString('Issue #226', $out);
        // Identifiers and calls survive.
        $this->assertStringContainsString("getElementById( 'menu-toggle' )", $out);
        $this->assertStringContainsString("window.matchMedia", $out);
        $this->assertStringContainsString("'(max-width: 782px)'", $out);
        $this->assertStringContainsString("function sync()", $out);
        $this->assertStringContainsString("menu.open = ! phone.matches;", $out);
        $this->assertStringContainsString("addEventListener( 'change', sync );", $out);
    }

    // ------------------ Inline assets ------------------

    public function testInlineAssetsMinifiesStyleBlock(): void
    {
        $html = "<style type=\"text/css\">/* x */ body { margin: 0 }</style>";
        $out  = cli_export_minify_inline_assets($html);
        $this->assertStringContainsString('<style type="text/css">body{margin:0}</style>', $out);
    }

    public function testInlineAssetsMinifiesScriptBlock(): void
    {
        $html = "<script>\n// comment\nvar a = 1;\n</script>";
        $out  = cli_export_minify_inline_assets($html);
        $this->assertStringNotContainsString('// comment', $out);
        $this->assertStringContainsString('var a = 1;', $out);
        $this->assertStringContainsString('<script>', $out);
        $this->assertStringContainsString('</script>', $out);
    }

    public function testInlineAssetsLeavesOtherHtmlUntouched(): void
    {
        $html = "<p>before</p><script>var x=1;</script><p>after</p>";
        $out  = cli_export_minify_inline_assets($html);
        $this->assertStringContainsString('<p>before</p>', $out);
        $this->assertStringContainsString('<p>after</p>', $out);
    }
}
