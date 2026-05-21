<?php
/**
 * Tests for first_image_url() (Issue #231).
 *
 * The OGP block in src/index.php is suppressed when first_image_url()
 * returns the empty string, so a social card without an image is never
 * emitted. The helper has to recognise the common shapes of <img>
 * markup that appear in WordPress 0.71 post_content: classic XHTML
 * self-closing tags, HTML5 unclosed tags, single- or double-quoted
 * src attributes, and the block-editor markup that wraps the <img>
 * inside <!-- wp:image --><figure>...</figure><!-- /wp:image -->.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class FirstImageUrlTest extends TestCase
{
    public function testReturnsEmptyForEmptyContent(): void
    {
        $this->assertSame('', first_image_url(''));
    }

    public function testReturnsEmptyWhenNoImgTag(): void
    {
        $this->assertSame('', first_image_url('<p>just some text, no images.</p>'));
    }

    public function testMatchesDoubleQuotedSrc(): void
    {
        $content = '<p>before</p><img src="http://example.test/a.jpg" /><p>after</p>';
        $this->assertSame('http://example.test/a.jpg', first_image_url($content));
    }

    public function testMatchesSingleQuotedSrc(): void
    {
        $content = "<p>x</p><img src='http://example.test/a.jpg' alt='' /><p>y</p>";
        $this->assertSame('http://example.test/a.jpg', first_image_url($content));
    }

    public function testMatchesBlockEditorImageMarkup(): void
    {
        // shape produced by the @wordpress/block-editor Image block:
        // a wp:image comment wrapper around a <figure> containing the <img>.
        $content =
            '<!-- wp:image {"id":42,"sizeSlug":"large"} -->'
            . '<figure class="wp-block-image size-large">'
            . '<img src="http://example.test/uploads/2026/05/photo.jpg" '
            . 'alt="" class="wp-image-42" />'
            . '</figure>'
            . '<!-- /wp:image -->';
        $this->assertSame(
            'http://example.test/uploads/2026/05/photo.jpg',
            first_image_url($content)
        );
    }

    public function testReturnsFirstOfSeveralImages(): void
    {
        $content =
            '<p>intro</p>'
            . '<img src="http://example.test/first.png" />'
            . '<p>middle</p>'
            . '<img src="http://example.test/second.png" />'
            . '<p>outro</p>';
        $this->assertSame(
            'http://example.test/first.png',
            first_image_url($content)
        );
    }

    public function testCaseInsensitiveTagAndAttribute(): void
    {
        // older HTML and some hand-authored markup use uppercase tags.
        $content = '<P>x</P><IMG SRC="http://example.test/cap.gif"><P>y</P>';
        $this->assertSame('http://example.test/cap.gif', first_image_url($content));
    }

    public function testIgnoresSrcsetOnAnotherTag(): void
    {
        // a non-<img> tag with srcset must not be picked up -- the
        // regex is anchored on `<img`, not on the bare attribute.
        $content =
            '<source srcset="http://example.test/source.jpg" />'
            . '<img src="http://example.test/img.jpg" />';
        $this->assertSame('http://example.test/img.jpg', first_image_url($content));
    }

    public function testRelativeSrcReturnedAsIs(): void
    {
        // the helper does not transform the URL; callers may resolve
        // it against $siteurl if they need an absolute form.
        $content = '<img src="wp-content/uploads/2026/05/a.jpg" />';
        $this->assertSame(
            'wp-content/uploads/2026/05/a.jpg',
            first_image_url($content)
        );
    }
}
