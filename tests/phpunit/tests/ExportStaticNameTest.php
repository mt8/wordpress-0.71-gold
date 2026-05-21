<?php
/**
 * Tests for cli_export_static_name() (Issue #229).
 *
 * The static-export crawler maps a blog-relative URL to a static
 * filename on disk. Once the front-end adds "?v=<mtime>" cache-busting
 * query strings to its asset references (Issue #229), the mapping must:
 *   - recognise "layout2b.css?v=123" as the CSS asset,
 *   - return the path-only filename ("layout2b.css") for on-disk write,
 *   - keep deduping by the path so each asset is fetched and written
 *     exactly once regardless of the "?v=" suffix.
 *
 * Page mappings (?p=, ?cat=, ?m=, b2rss2.php) are unchanged.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../../tools/cli/php/commands/export.php';

final class ExportStaticNameTest extends TestCase
{
    /** @var array<int, string> */
    private $assetExtensions = ['css', 'js', 'gif', 'png', 'jpg', 'jpeg', 'ico', 'svg'];

    public function testHomeMapsToIndexHtml(): void
    {
        $this->assertSame('index.html', cli_export_static_name('', $this->assetExtensions));
        $this->assertSame('index.html', cli_export_static_name('index.php', $this->assetExtensions));
    }

    public function testPostPermalinkMapsToPNHtml(): void
    {
        $this->assertSame('p-5.html', cli_export_static_name('?p=5', $this->assetExtensions));
        $this->assertSame('p-5.html', cli_export_static_name('index.php?p=5', $this->assetExtensions));
    }

    public function testCategoryMapsToCatNHtml(): void
    {
        $this->assertSame('cat-1.html', cli_export_static_name('?cat=1', $this->assetExtensions));
    }

    public function testMonthMapsToMNHtml(): void
    {
        $this->assertSame('m-202605.html', cli_export_static_name('?m=202605', $this->assetExtensions));
    }

    public function testRssMapsToRss2Xml(): void
    {
        $this->assertSame('rss2.xml', cli_export_static_name('b2rss2.php', $this->assetExtensions));
    }

    public function testPlainCssAssetReturnsItsPath(): void
    {
        $this->assertSame('layout2b.css', cli_export_static_name('layout2b.css', $this->assetExtensions));
    }

    public function testVersionedCssStripsQueryForFilename(): void
    {
        // the "?v=<mtime>" cache-bust must not leak into the on-disk
        // filename ("?" is not a portable filename character).
        $this->assertSame(
            'layout2b.css',
            cli_export_static_name('layout2b.css?v=1700000000', $this->assetExtensions)
        );
    }

    public function testVersionedNestedAssetStripsQueryForFilename(): void
    {
        $this->assertSame(
            'block-editor/assets/block-library.css',
            cli_export_static_name(
                'block-editor/assets/block-library.css?v=1700000000',
                $this->assetExtensions
            )
        );
    }

    public function testDifferentVersionsMapToSameTarget(): void
    {
        // dedup by target -- the crawler keys $done on the static
        // filename, so all "?v=*" variants of layout2b.css must resolve
        // to the same target.
        $a = cli_export_static_name('layout2b.css?v=1700000000', $this->assetExtensions);
        $b = cli_export_static_name('layout2b.css?v=1800000000', $this->assetExtensions);
        $this->assertSame($a, $b);
        $this->assertSame('layout2b.css', $a);
    }

    public function testUnknownExtensionReturnsNull(): void
    {
        $this->assertNull(cli_export_static_name('foo.txt', $this->assetExtensions));
    }
}
