<?php
/**
 * Tests for add_image_dimensions() (Issue #235).
 *
 * The helper injects HTML width / height attributes on every <img>
 * tag that lacks them, reading the actual pixel dimensions from the
 * on-disk image file. PageSpeed's "Image elements do not have
 * explicit width and height" audit measures exactly that early-paint
 * CLS, and the block-editor Image block saves only
 * style="aspect-ratio:..." without HTML attributes.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class AddImageDimensionsTest extends TestCase
{
    /** @var string|null */
    private $tempRoot;

    /** @var string */
    private $pngRel = 'wp-content/uploads/test/img.png';

    protected function setUp(): void
    {
        // build a temp document root with one known-dimension PNG (a
        //     4x3 pixel image) under wp-content/uploads/test/.
        $this->tempRoot = sys_get_temp_dir() . '/img-dim-test-' . uniqid('', true);
        mkdir($this->tempRoot . '/wp-content/uploads/test', 0755, true);
        // header for a 4x3 RGB PNG -- $img is a minimal valid PNG produced
        //     by imagecreate / imagepng below if GD is loaded; the test
        //     uses a real PNG so getimagesize() returns the actual pixels.
        $im = imagecreate(4, 3);
        imagecolorallocate($im, 255, 255, 255);
        imagepng($im, $this->tempRoot . '/' . $this->pngRel);
        imagedestroy($im);

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
        $content = '<p>just text.</p>';
        $this->assertSame($content, add_image_dimensions($content));
    }

    public function testInjectsWidthAndHeightFromOnDiskFile(): void
    {
        $content = '<img src="http://example.test/' . $this->pngRel . '" alt="" />';
        $out = add_image_dimensions($content);

        $this->assertStringContainsString(' width="4"', $out);
        $this->assertStringContainsString(' height="3"', $out);
        // the injection sits immediately before the closing `/>`.
        $this->assertStringContainsString(' width="4" height="3" />', $out);
    }

    public function testResolvesRelativeSrcAgainstAbspath(): void
    {
        // a relative src (no host) is resolved against $abspath directly.
        $content = '<img src="' . $this->pngRel . '" alt="" />';
        $out = add_image_dimensions($content);
        $this->assertStringContainsString(' width="4"', $out);
        $this->assertStringContainsString(' height="3"', $out);
    }

    public function testPreservesExistingDimensionAttributes(): void
    {
        // a tag that already carries both width=" and height=" HTML
        //     attributes must be left untouched (a manually authored
        //     dimension wins).
        $content =
            '<img src="http://example.test/' . $this->pngRel . '" '
            . 'width="320" height="200" alt="" />';
        $this->assertSame($content, add_image_dimensions($content));
    }

    public function testIgnoresCssWidthInStyleAttribute(): void
    {
        // the block-editor markup -- style="width:600px" without HTML
        //     width / height attributes -- must still be detected as
        //     "missing dimensions" so they are injected. The CSS form uses
        //     `:`, the HTML attribute form uses `=`.
        $content =
            '<img src="http://example.test/' . $this->pngRel . '" '
            . 'style="aspect-ratio:1.33;width:600px;height:auto" alt="" />';
        $out = add_image_dimensions($content);
        $this->assertStringContainsString(' width="4" height="3"', $out);
        // the original style attribute is preserved.
        $this->assertStringContainsString('style="aspect-ratio:1.33;width:600px;height:auto"', $out);
    }

    public function testLeavesRemoteSrcUntouched(): void
    {
        // a src on a different host cannot be resolved on disk; leave
        //     the tag alone rather than emitting a wrong size.
        $content = '<img src="https://cdn.other.test/img.png" alt="" />';
        $this->assertSame($content, add_image_dimensions($content));
    }

    public function testLeavesTagAloneWhenFileMissing(): void
    {
        // a src that points at a path with no file on disk leaves the
        //     tag alone -- best-effort, never fatal, never guesses.
        $content = '<img src="wp-content/uploads/missing.png" alt="" />';
        $this->assertSame($content, add_image_dimensions($content));
    }

    public function testHandlesMultipleImagesInOneContent(): void
    {
        $content =
            '<img src="' . $this->pngRel . '" alt="" />'
            . '<p>between</p>'
            . '<img src="' . $this->pngRel . '" alt="" />';
        $out   = add_image_dimensions($content);
        $count = substr_count($out, ' width="4" height="3"');
        $this->assertSame(2, $count);
    }

    public function testHandlesUnclosedImgTag(): void
    {
        // HTML5 tolerates `<img ... >` without the self-closing `/`.
        $content = '<img src="http://example.test/' . $this->pngRel . '" alt="">';
        $out = add_image_dimensions($content);
        $this->assertStringContainsString(' width="4" height="3">', $out);
    }
}
