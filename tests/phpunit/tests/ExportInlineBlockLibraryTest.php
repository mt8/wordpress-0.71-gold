<?php
/**
 * Tests for cli_export_inline_block_library_in_html() (Issue #261).
 *
 * The pure string transform that replaces the front-end's
 * <link rel="stylesheet" ... href=".../block-library.css?v=...">
 * tag with a <style> block carrying the file body, so the export
 * tree has no render-blocking external <link> on the critical
 * path. The on-disk walker that drives this transform is exercised
 * end-to-end by the manual export test in the PR plan; this unit
 * test pins the substitution logic itself.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../../tools/cli/php/commands/export.php';

final class ExportInlineBlockLibraryTest extends TestCase
{
    public function testReplacesLinkWithInlineStyle(): void
    {
        $html =
            '<head>'
            . '<link rel="stylesheet" type="text/css" media="screen" href="block-editor/assets/block-library.css?v=1700000000" />'
            . '</head>';
        $out = cli_export_inline_block_library_in_html($html, '.x{color:red}');
        $this->assertSame(
            '<head><style type="text/css">.x{color:red}</style></head>',
            $out
        );
    }

    public function testHandlesAbsoluteUrlInHref(): void
    {
        // when --publish or the Docker site emit an absolute URL,
        //     the match should still anchor on the recognisable suffix.
        $html =
            '<link rel="stylesheet" type="text/css" media="screen" href="https://071.mt8.biz/block-editor/assets/block-library.css?v=1700000000" />';
        $out = cli_export_inline_block_library_in_html($html, '.y{color:blue}');
        $this->assertSame(
            '<style type="text/css">.y{color:blue}</style>',
            $out
        );
    }

    public function testHandlesLinkWithoutVersionQuery(): void
    {
        // a future deploy without ?v= (a stripped install) still
        //     gets the inline swap.
        $html =
            '<link rel="stylesheet" type="text/css" media="screen" href="block-editor/assets/block-library.css" />';
        $out = cli_export_inline_block_library_in_html($html, '.z{color:green}');
        $this->assertStringContainsString('<style type="text/css">.z{color:green}</style>', $out);
        $this->assertStringNotContainsString('<link', $out);
    }

    public function testIsNoOpWhenLinkNotPresent(): void
    {
        // a page with no block-library link is left untouched -- the
        //     transform never fails the export.
        $html = '<head><meta charset="UTF-8" /></head>';
        $this->assertSame($html, cli_export_inline_block_library_in_html($html, 'css'));
    }

    public function testIsNoOpForUnrelatedLink(): void
    {
        $html =
            '<link rel="stylesheet" type="text/css" media="screen" href="layout2b.css?v=1700000000" />';
        $this->assertSame($html, cli_export_inline_block_library_in_html($html, 'css'));
    }

    public function testLeavesBlockPresetsLinkAlone(): void
    {
        // block-presets.css is deferred via media="print" onload and is
        //     not inlined; the transform must not touch it.
        $html =
            '<link rel="stylesheet" type="text/css" media="screen" href="block-editor/assets/block-library.css?v=1700000000" />'
            . '<link rel="stylesheet" type="text/css" media="print" href="block-editor/assets/block-presets.css?v=1700000000" onload="this.media=\'all\'" />';
        $out = cli_export_inline_block_library_in_html($html, '.b{}');
        // library link is gone, replaced.
        $this->assertStringNotContainsString('block-library.css', $out);
        $this->assertStringContainsString('<style type="text/css">.b{}</style>', $out);
        // presets link is untouched.
        $this->assertStringContainsString('block-editor/assets/block-presets.css', $out);
        $this->assertStringContainsString('media="print"', $out);
    }

    public function testReplacesOnlyTheFirstMatch(): void
    {
        // defensive: even if the same link appears twice (it should not),
        //     only one swap happens -- limit=1 keeps the transform
        //     deterministic and avoids ballooning the page if the inline
        //     CSS is large.
        $tag =
            '<link rel="stylesheet" type="text/css" media="screen" href="block-editor/assets/block-library.css?v=1" />';
        $html = $tag . $tag;
        $out  = cli_export_inline_block_library_in_html($html, '.x{}');
        $this->assertSame(
            1,
            substr_count($out, '<style type="text/css">.x{}</style>'),
            'only one <style> is inserted'
        );
        $this->assertSame(
            1,
            substr_count($out, '<link rel="stylesheet"'),
            'the second link survives (it should never appear in practice)'
        );
    }

    public function testPreservesSurroundingHtml(): void
    {
        $before = "<!DOCTYPE html>\n<html><head>\n<title>Memo</title>\n";
        $link   =
            '<link rel="stylesheet" type="text/css" media="screen" href="block-editor/assets/block-library.css?v=1700000000" />';
        $after  = "\n</head><body>...</body></html>";
        $out    = cli_export_inline_block_library_in_html($before . $link . $after, '.a{}');
        $this->assertStringStartsWith($before, $out);
        $this->assertStringEndsWith($after, $out);
        $this->assertStringContainsString('<style type="text/css">.a{}</style>', $out);
    }
}
