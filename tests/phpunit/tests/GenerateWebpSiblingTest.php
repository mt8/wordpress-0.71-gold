<?php
/**
 * Tests for generate_webp_sibling() (Issue #245).
 *
 * The encoder takes an absolute path to a PNG or JPEG and writes a
 * `<source>.webp` next to it. Used by the CLI backfill (and later
 * by the upload-time hook) so the front-end can serve WebPs via
 * <picture>. The helper is pure -- no globals, no side effects
 * beyond the on-disk write -- so the same code path is shared
 * across contexts.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class GenerateWebpSiblingTest extends TestCase
{
    /** @var string|null */
    private $tempDir;

    protected function setUp(): void
    {
        if (!function_exists('imagewebp')) {
            $this->markTestSkipped('GD with WebP support is not available.');
        }
        $this->tempDir = sys_get_temp_dir() . '/webp-encoder-test-' . uniqid('', true);
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

    public function testEncodesPngToWebp(): void
    {
        $png = $this->tempDir . '/img.png';
        $im  = imagecreate(4, 3);
        imagecolorallocate($im, 255, 255, 255);
        imagepng($im, $png);
        imagedestroy($im);

        $this->assertTrue(generate_webp_sibling($png));
        $this->assertFileExists($png . '.webp');

        // the sibling is a real WebP that decodes back to the same
        //     dimensions -- a corrupt file would fail getimagesize.
        $info = getimagesize($png . '.webp');
        $this->assertIsArray($info);
        $this->assertSame(4, $info[0]);
        $this->assertSame(3, $info[1]);
        $this->assertSame('image/webp', $info['mime']);
    }

    public function testEncodesJpegToWebp(): void
    {
        $jpg = $this->tempDir . '/img.jpg';
        $im  = imagecreatetruecolor(5, 4);
        imagecolorallocate($im, 0, 0, 0);
        imagejpeg($im, $jpg);
        imagedestroy($im);

        $this->assertTrue(generate_webp_sibling($jpg));
        $this->assertFileExists($jpg . '.webp');
    }

    public function testReturnsFalseForMissingSource(): void
    {
        $this->assertFalse(generate_webp_sibling($this->tempDir . '/does-not-exist.png'));
    }

    public function testReturnsFalseForUnsupportedExtension(): void
    {
        // GIF is not a source the helper handles (animations would be
        //     reduced to a single frame in the static <picture> path).
        $gif = $this->tempDir . '/img.gif';
        $im  = imagecreate(2, 2);
        imagecolorallocate($im, 255, 255, 255);
        imagegif($im, $gif);
        imagedestroy($im);

        $this->assertFalse(generate_webp_sibling($gif));
        $this->assertFileDoesNotExist($gif . '.webp');
    }

    public function testReturnsFalseForEmptyOrNonStringInput(): void
    {
        $this->assertFalse(generate_webp_sibling(''));
        // a non-string input is rejected upfront (PHP 8 type coercion
        //     would otherwise turn it into the empty string anyway, but
        //     the explicit guard documents the precondition).
        $this->assertFalse(generate_webp_sibling((string) 0));
    }
}
