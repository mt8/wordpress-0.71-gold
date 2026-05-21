<?php
/**
 * Tests for generate_webp_resized() (Issue #247).
 *
 * The width-variant encoder takes an absolute path to a PNG / JPEG
 * and a target pixel width, and writes "<source>.<width>.webp" next
 * to the original at that width (aspect ratio preserved). Used by
 * the CLI backfill (and the later upload-time hook) to produce the
 * responsive width variants the render-side wrapper lists in srcset.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class GenerateWebpResizedTest extends TestCase
{
    /** @var string|null */
    private $tempDir;

    protected function setUp(): void
    {
        if (!function_exists('imagewebp')) {
            $this->markTestSkipped('GD with WebP support is not available.');
        }
        $this->tempDir = sys_get_temp_dir() . '/webp-resized-test-' . uniqid('', true);
        mkdir($this->tempDir, 0755, true);
    }

    protected function tearDown(): void
    {
        if (null !== $this->tempDir && is_dir($this->tempDir)) {
            foreach (glob($this->tempDir . '/*') ?: [] as $f) {
                unlink($f);
            }
            rmdir($this->tempDir);
        }
    }

    public function testEncodesResizedPng(): void
    {
        // a 1000x500 source resized to 480 w must produce a 480x240 webp
        //     (aspect-ratio preserved).
        $png = $this->tempDir . '/img.png';
        $im  = imagecreatetruecolor(1000, 500);
        $bg  = imagecolorallocate($im, 200, 0, 0);
        imagefilledrectangle($im, 0, 0, 1000, 500, $bg);
        imagepng($im, $png);
        imagedestroy($im);

        $this->assertTrue(generate_webp_resized($png, 480));
        $variant = $png . '.480.webp';
        $this->assertFileExists($variant);

        $info = getimagesize($variant);
        $this->assertIsArray($info);
        $this->assertSame(480, $info[0]);
        $this->assertSame(240, $info[1]);
        $this->assertSame('image/webp', $info['mime']);
    }

    public function testReturnsFalseWhenSourceNarrowerThanTarget(): void
    {
        // no upscaling -- a 200 w source asked for a 480 w variant
        //     returns false and writes no file.
        $png = $this->tempDir . '/small.png';
        $im  = imagecreatetruecolor(200, 100);
        imagepng($im, $png);
        imagedestroy($im);

        $this->assertFalse(generate_webp_resized($png, 480));
        $this->assertFileDoesNotExist($png . '.480.webp');
    }

    public function testReturnsFalseWhenSourceEqualToTarget(): void
    {
        // equal width -- already the right size, no variant needed.
        $png = $this->tempDir . '/exact.png';
        $im  = imagecreatetruecolor(480, 200);
        imagepng($im, $png);
        imagedestroy($im);

        $this->assertFalse(generate_webp_resized($png, 480));
        $this->assertFileDoesNotExist($png . '.480.webp');
    }

    public function testReturnsFalseForMissingSource(): void
    {
        $this->assertFalse(generate_webp_resized($this->tempDir . '/missing.png', 480));
    }

    public function testReturnsFalseForUnsupportedExtension(): void
    {
        $gif = $this->tempDir . '/img.gif';
        $im  = imagecreate(800, 400);
        imagecolorallocate($im, 255, 255, 255);
        imagegif($im, $gif);
        imagedestroy($im);

        $this->assertFalse(generate_webp_resized($gif, 480));
        $this->assertFileDoesNotExist($gif . '.480.webp');
    }

    public function testReturnsFalseForZeroOrNegativeWidth(): void
    {
        $png = $this->tempDir . '/img.png';
        $im  = imagecreatetruecolor(1000, 500);
        imagepng($im, $png);
        imagedestroy($im);

        $this->assertFalse(generate_webp_resized($png, 0));
        $this->assertFalse(generate_webp_resized($png, -100));
    }
}
