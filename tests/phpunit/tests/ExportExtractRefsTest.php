<?php
/**
 * Tests for cli_export_extract_refs() (Issue #245).
 *
 * The crawler used to extract only `href` and `src`; once the
 * front-end started emitting <picture><source srcset="x.webp">...
 * (Issue #245), the crawler must also pick up `srcset` so the WebP
 * files are fetched and written into the static export tree.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../../tools/cli/php/commands/export.php';

final class ExportExtractRefsTest extends TestCase
{
    public function testExtractsHrefAndSrc(): void
    {
        $html = '<a href="a.html"><img src="b.png"></a>';
        $refs = cli_export_extract_refs($html);
        $this->assertContains('a.html', $refs);
        $this->assertContains('b.png', $refs);
    }

    public function testExtractsImportUrl(): void
    {
        $html = '<style>@import url(layout.css);</style>';
        $this->assertContains('layout.css', cli_export_extract_refs($html));
    }

    public function testExtractsSingleUrlSrcset(): void
    {
        // the <picture><source srcset="x.webp"> form added by Issue #245
        //     -- a single URL with no descriptor.
        $html = '<source srcset="img.png.webp" type="image/webp">';
        $this->assertContains('img.png.webp', cli_export_extract_refs($html));
    }

    public function testExtractsMultiWidthSrcset(): void
    {
        // future-proofing for the multi-width form (B-8 on the
        //     improvement list); the width descriptors must be stripped.
        $html =
            '<img src="x.png" '
            . 'srcset="x-300.webp 300w, x-600.webp 600w, x-1200.webp 2x" />';
        $refs = cli_export_extract_refs($html);
        $this->assertContains('x.png', $refs);
        $this->assertContains('x-300.webp', $refs);
        $this->assertContains('x-600.webp', $refs);
        $this->assertContains('x-1200.webp', $refs);
        // the descriptors themselves are not stored as refs.
        $this->assertNotContains('300w', $refs);
        $this->assertNotContains('2x', $refs);
    }

    public function testReturnsEmptyForBlankInput(): void
    {
        $this->assertSame([], cli_export_extract_refs(''));
    }
}
