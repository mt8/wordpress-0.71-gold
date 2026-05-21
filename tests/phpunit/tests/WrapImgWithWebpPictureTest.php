<?php
/**
 * Tests for wrap_img_with_webp_picture() (Issue #245).
 *
 * The helper wraps every <img> whose on-disk source has a .webp
 * sibling in a <picture><source srcset="..webp" type="image/webp">
 * ...<img...></picture>. A WebP-supporting browser fetches the
 * smaller variant via <source>; older browsers fall back to the
 * original <img> automatically.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class WrapImgWithWebpPictureTest extends TestCase
{
    /** @var string|null */
    private $tempRoot;

    /** @var string */
    private $pngRel = 'wp-content/uploads/test/img.png';

    /** @var string */
    private $jpgRel = 'wp-content/uploads/test/photo.jpg';

    protected function setUp(): void
    {
        $this->tempRoot = sys_get_temp_dir() . '/webp-wrap-test-' . uniqid('', true);
        mkdir($this->tempRoot . '/wp-content/uploads/test', 0755, true);

        // png + sibling .webp
        file_put_contents($this->tempRoot . '/' . $this->pngRel, 'png-bytes');
        file_put_contents($this->tempRoot . '/' . $this->pngRel . '.webp', 'webp-bytes');
        // jpg WITHOUT sibling, to exercise the "no sibling" path
        file_put_contents($this->tempRoot . '/' . $this->jpgRel, 'jpg-bytes');

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

    public function testReturnsUnchangedWhenNoImgTag(): void
    {
        $content = '<p>just text, no images.</p>';
        $this->assertSame($content, wrap_img_with_webp_picture($content));
    }

    public function testWrapsImgWhenWebpSiblingExists(): void
    {
        $content = '<img src="http://example.test/' . $this->pngRel . '" alt="" />';
        $out = wrap_img_with_webp_picture($content);
        $expected =
            '<picture><source srcset="http://example.test/' . $this->pngRel . '.webp" type="image/webp" />'
            . '<img src="http://example.test/' . $this->pngRel . '" alt="" />'
            . '</picture>';
        $this->assertSame($expected, $out);
    }

    public function testResolvesRelativeSrcAgainstAbspath(): void
    {
        // a relative src is resolved against $abspath; the wrap uses
        //     the same (relative) URL form for the WebP href, so the
        //     static export keeps both consistently relative.
        $content = '<img src="' . $this->pngRel . '" alt="" />';
        $out = wrap_img_with_webp_picture($content);
        $this->assertStringContainsString(
            '<source srcset="' . $this->pngRel . '.webp" type="image/webp" />',
            $out
        );
        $this->assertStringContainsString('<picture>', $out);
        $this->assertStringContainsString('</picture>', $out);
    }

    public function testLeavesImgAloneWhenSiblingMissing(): void
    {
        $content = '<img src="http://example.test/' . $this->jpgRel . '" alt="" />';
        $this->assertSame($content, wrap_img_with_webp_picture($content));
    }

    public function testLeavesSvgGifWebpUntouched(): void
    {
        foreach (array('icon.svg', 'spin.gif', 'pic.webp') as $name) {
            $content = '<img src="http://example.test/wp-content/uploads/test/' . $name . '" alt="" />';
            $this->assertSame(
                $content,
                wrap_img_with_webp_picture($content),
                "$name should not be wrapped"
            );
        }
    }

    public function testLeavesRemoteSrcUntouched(): void
    {
        $content = '<img src="https://cdn.other.test/img.png" alt="" />';
        $this->assertSame($content, wrap_img_with_webp_picture($content));
    }

    public function testWrapsMultipleImagesIndependently(): void
    {
        // first img has a sibling (gets wrapped); second does not
        //     (stays bare).
        $content =
            '<img src="' . $this->pngRel . '" alt="" />'
            . '<p>between</p>'
            . '<img src="' . $this->jpgRel . '" alt="" />';
        $out = wrap_img_with_webp_picture($content);
        $this->assertSame(1, substr_count($out, '<picture>'));
        $this->assertStringContainsString('<source srcset="' . $this->pngRel . '.webp"', $out);
        // the jpg without sibling stays as a bare <img>.
        $this->assertStringContainsString('<img src="' . $this->jpgRel . '" alt="" />', $out);
    }

    public function testIgnoresQueryStringWhenDetectingExtension(): void
    {
        // a ?v=<mtime> cache-bust on the src must not fool the
        //     extension check -- the helper resolves the .webp sibling
        //     on the unversioned filesystem path.
        $content = '<img src="' . $this->pngRel . '?v=1700000000" alt="" />';
        $out = wrap_img_with_webp_picture($content);
        // the wrap still happens because the sibling exists; the
        //     srcset URL inherits the original src with ".webp"
        //     appended.
        $this->assertStringContainsString('<picture>', $out);
    }
}
