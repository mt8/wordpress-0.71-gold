<?php
/**
 * Tests for the asset_url() cache-busting helper (Issue #229).
 *
 * asset_url() returns "<siteurl>/<rel>?v=<filemtime>" so a CDN keyed on
 * the full URL pulls a fresh copy from origin whenever the on-disk
 * asset changes. The helper reads $siteurl and $abspath from globals
 * just like the other URL helpers in b2functions.php.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class AssetUrlTest extends TestCase
{
    /** @var string|null */
    private $tempRoot;

    protected function setUp(): void
    {
        $this->tempRoot = sys_get_temp_dir() . '/asset-url-test-' . uniqid('', true);
        mkdir($this->tempRoot . '/sub', 0755, true);

        $GLOBALS['siteurl'] = 'http://example.test';
        $GLOBALS['abspath'] = $this->tempRoot . '/';
    }

    protected function tearDown(): void
    {
        if (null !== $this->tempRoot && is_dir($this->tempRoot)) {
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($this->tempRoot, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($files as $file) {
                $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
            }
            rmdir($this->tempRoot);
        }

        unset($GLOBALS['siteurl'], $GLOBALS['abspath']);
    }

    public function testReturnsSiteurlSlashRelWithMtimeQuery(): void
    {
        $css = $this->tempRoot . '/layout2b.css';
        file_put_contents($css, 'body{}');
        // pin a known mtime so the assertion does not depend on filesystem clock skew.
        touch($css, 1700000000);

        $this->assertSame(
            'http://example.test/layout2b.css?v=1700000000',
            asset_url('layout2b.css')
        );
    }

    public function testStripsLeadingSlashFromRel(): void
    {
        $css = $this->tempRoot . '/layout2b.css';
        file_put_contents($css, 'body{}');
        touch($css, 1700000000);

        // a leading slash on $rel must not produce a double slash in the URL,
        // and the on-disk path resolution must still find the file.
        $this->assertSame(
            'http://example.test/layout2b.css?v=1700000000',
            asset_url('/layout2b.css')
        );
    }

    public function testResolvesNestedAssetPath(): void
    {
        $nested = $this->tempRoot . '/sub/asset.css';
        file_put_contents($nested, 'a{}');
        touch($nested, 1710000000);

        $this->assertSame(
            'http://example.test/sub/asset.css?v=1710000000',
            asset_url('sub/asset.css')
        );
    }

    public function testFallsBackToZeroWhenAssetMissing(): void
    {
        // a missing file must not raise -- the URL stays well-formed so the
        // crawler / browser surface the 404 instead of a fatal here.
        $this->assertSame(
            'http://example.test/missing.css?v=0',
            @asset_url('missing.css')
        );
    }

    public function testVersionChangesWhenFileTouched(): void
    {
        $css = $this->tempRoot . '/layout2b.css';
        file_put_contents($css, 'body{}');
        touch($css, 1700000000);
        $first = asset_url('layout2b.css');

        // a real edit bumps mtime; the URL must change so the CDN treats it
        // as a fresh asset.
        touch($css, 1700000001);
        clearstatcache(true, $css);
        $second = asset_url('layout2b.css');

        $this->assertNotSame($first, $second);
        $this->assertSame('http://example.test/layout2b.css?v=1700000001', $second);
    }
}
