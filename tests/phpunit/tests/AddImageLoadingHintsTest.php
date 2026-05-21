<?php
/**
 * Tests for add_image_loading_hints() (Issue #237).
 *
 * The helper adds browser loading hints to every <img> in post
 * content: decoding="async" on every tag, loading="lazy" on every
 * tag except the first (the most likely LCP candidate; lazy on the
 * LCP image pushes LCP later). Each attribute is only added when
 * missing -- a manually authored loading="eager" or decoding="auto"
 * is preserved verbatim.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class AddImageLoadingHintsTest extends TestCase
{
    public function testReturnsUnchangedWhenNoImgTag(): void
    {
        $content = '<p>just text, no images.</p>';
        $this->assertSame($content, add_image_loading_hints($content));
    }

    public function testFirstImageGetsDecodingButNotLoading(): void
    {
        // a single-image post -- the only image is the LCP candidate and
        //     must not be lazy.
        $content = '<img src="a.png" alt="" />';
        $out     = add_image_loading_hints($content);
        $this->assertStringContainsString(' decoding="async"', $out);
        $this->assertStringNotContainsString('loading=', $out);
        $this->assertStringContainsString(' decoding="async" />', $out);
    }

    public function testSubsequentImagesGetBothLazyAndAsync(): void
    {
        $content =
            '<img src="a.png" alt="" />'
            . '<p>between</p>'
            . '<img src="b.png" alt="" />'
            . '<img src="c.png" alt="" />';
        $out = add_image_loading_hints($content);

        // first img: decoding only, no loading.
        $this->assertSame(
            1,
            preg_match('~<img src="a\.png"[^>]* decoding="async" />~', $out),
            'first image gets decoding but not loading'
        );
        $this->assertSame(
            0,
            preg_match('~<img src="a\.png"[^>]*\bloading=~', $out)
        );
        // second + third img: both attributes.
        $this->assertSame(
            1,
            preg_match('~<img src="b\.png"[^>]* loading="lazy" decoding="async" />~', $out)
        );
        $this->assertSame(
            1,
            preg_match('~<img src="c\.png"[^>]* loading="lazy" decoding="async" />~', $out)
        );
    }

    public function testPreservesExistingLoadingAttribute(): void
    {
        // a manually authored loading="eager" is preserved verbatim --
        //     the helper only adds what is missing.
        $content =
            '<img src="a.png" alt="" />'
            . '<img src="b.png" loading="eager" alt="" />';
        $out = add_image_loading_hints($content);
        $this->assertSame(
            1,
            preg_match('~<img src="b\.png" loading="eager" alt=""[^>]* decoding="async" />~', $out),
            'existing loading="eager" is preserved; only decoding gets added'
        );
        $this->assertSame(
            0,
            substr_count($out, 'loading="lazy"'),
            'no loading="lazy" added when loading is already present'
        );
    }

    public function testPreservesExistingDecodingAttribute(): void
    {
        $content = '<img src="a.png" decoding="auto" alt="" />';
        $out     = add_image_loading_hints($content);
        $this->assertSame($content, $out, 'tag already complete -- no change');
    }

    public function testHandlesUnclosedImgTag(): void
    {
        // HTML5 tolerates `<img ... >` without the self-closing slash;
        //     the injection must land before the closing `>` either way.
        $content = '<img src="a.png" alt=""><img src="b.png" alt="">';
        $out     = add_image_loading_hints($content);
        $this->assertSame(
            1,
            preg_match('~<img src="a\.png" alt="" decoding="async">~', $out)
        );
        $this->assertSame(
            1,
            preg_match('~<img src="b\.png" alt="" loading="lazy" decoding="async">~', $out)
        );
    }

    public function testIsCaseInsensitiveForExistingAttributes(): void
    {
        // existing attribute detection is case-insensitive so an
        //     uppercase LOADING= is also respected.
        $content =
            '<img src="a.png" alt="" />'
            . '<img src="b.png" LOADING="eager" alt="" />';
        $out = add_image_loading_hints($content);
        $this->assertSame(
            0,
            substr_count($out, 'loading="lazy"'),
            'uppercase LOADING= is treated as existing -- no lazy added'
        );
    }
}
