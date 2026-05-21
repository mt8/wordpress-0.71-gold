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

    public function testFirstImageGetsFetchpriorityAndDecodingButNotLoading(): void
    {
        // a single-image post -- the only image is the LCP candidate so
        //     it must NOT be lazy, gets decoding="async" off the main
        //     thread, and gets fetchpriority="high" (Issue #257) so the
        //     browser knows it is the LCP target.
        $content = '<img src="a.png" alt="" />';
        $out     = add_image_loading_hints($content);
        $this->assertStringContainsString(' fetchpriority="high"', $out);
        $this->assertStringContainsString(' decoding="async"', $out);
        $this->assertStringNotContainsString('loading=', $out);
        $this->assertStringContainsString(
            ' fetchpriority="high" decoding="async" />',
            $out
        );
    }

    public function testSubsequentImagesGetBothLazyAndAsyncWithoutFetchpriority(): void
    {
        $content =
            '<img src="a.png" alt="" />'
            . '<p>between</p>'
            . '<img src="b.png" alt="" />'
            . '<img src="c.png" alt="" />';
        $out = add_image_loading_hints($content);

        // first img: fetchpriority + decoding only, no loading.
        $this->assertSame(
            1,
            preg_match('~<img src="a\.png"[^>]* fetchpriority="high" decoding="async" />~', $out),
            'first image gets fetchpriority + decoding but not loading'
        );
        $this->assertSame(
            0,
            preg_match('~<img src="a\.png"[^>]*\bloading=~', $out)
        );
        // second + third img: both lazy + decoding, but NOT fetchpriority
        //     (only the LCP candidate gets the high priority hint).
        $this->assertSame(
            1,
            preg_match('~<img src="b\.png"[^>]* loading="lazy" decoding="async" />~', $out)
        );
        $this->assertSame(
            0,
            preg_match('~<img src="b\.png"[^>]*\bfetchpriority=~', $out)
        );
        $this->assertSame(
            1,
            preg_match('~<img src="c\.png"[^>]* loading="lazy" decoding="async" />~', $out)
        );
        $this->assertSame(
            0,
            preg_match('~<img src="c\.png"[^>]*\bfetchpriority=~', $out)
        );
    }

    public function testPreservesExistingFetchpriority(): void
    {
        // a manually authored fetchpriority is preserved verbatim --
        //     the helper only adds the high hint when missing.
        $content = '<img src="a.png" fetchpriority="low" alt="" />';
        $out     = add_image_loading_hints($content);
        $this->assertStringContainsString('fetchpriority="low"', $out);
        $this->assertStringNotContainsString('fetchpriority="high"', $out);
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
        // a first-image tag that already has decoding still gets
        //     fetchpriority="high" injected (Issue #257) -- the LCP
        //     hint is independent of decoding. A tag that carries all
        //     three of fetchpriority / loading / decoding stays
        //     verbatim, but a missing fetchpriority is added.
        $content = '<img src="a.png" decoding="auto" alt="" />';
        $out     = add_image_loading_hints($content);
        $this->assertStringContainsString('decoding="auto"', $out);
        $this->assertStringContainsString('fetchpriority="high"', $out);
        $this->assertStringNotContainsString('decoding="async"', $out);
    }

    public function testHandlesUnclosedImgTag(): void
    {
        // HTML5 tolerates `<img ... >` without the self-closing slash;
        //     the injection must land before the closing `>` either way.
        $content = '<img src="a.png" alt=""><img src="b.png" alt="">';
        $out     = add_image_loading_hints($content);
        $this->assertSame(
            1,
            preg_match('~<img src="a\.png" alt="" fetchpriority="high" decoding="async">~', $out)
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
