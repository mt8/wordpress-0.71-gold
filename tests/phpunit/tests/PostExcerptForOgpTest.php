<?php
/**
 * Tests for post_excerpt_for_ogp() (Issue #231).
 *
 * The og:description meta tag is built from post_excerpt when present,
 * falling back to post_content stripped down to plain text. The helper
 * normalises whitespace, strips block-editor comments and HTML, decodes
 * entities, and truncates at a character boundary (multibyte-aware) so
 * the produced string is suitable as an OGP description.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class PostExcerptForOgpTest extends TestCase
{
    public function testReturnsEmptyWhenBothFieldsEmpty(): void
    {
        $this->assertSame('', post_excerpt_for_ogp('', ''));
    }

    public function testReturnsEmptyWhenBothFieldsOnlyWhitespace(): void
    {
        $this->assertSame('', post_excerpt_for_ogp("\t\n  ", "<p></p><!-- wp:paragraph --><!-- /wp:paragraph -->"));
    }

    public function testUsesExcerptWhenNonEmpty(): void
    {
        $this->assertSame(
            'A short summary.',
            post_excerpt_for_ogp('A short summary.', '<p>Longer content body.</p>')
        );
    }

    public function testFallsBackToContentWhenExcerptEmpty(): void
    {
        $this->assertSame(
            'Longer content body.',
            post_excerpt_for_ogp('', '<p>Longer content body.</p>')
        );
    }

    public function testStripsBlockEditorComments(): void
    {
        // <!-- wp:* --> are HTML comments; strip_tags() does not remove
        // them, so the helper strips comments first.
        $content =
            '<!-- wp:paragraph --><p>Hello world.</p><!-- /wp:paragraph -->';
        $this->assertSame(
            'Hello world.',
            post_excerpt_for_ogp('', $content)
        );
    }

    public function testStripsTagsAndDecodesEntities(): void
    {
        // entities must be decoded so the truncated text contains real
        // characters; htmlspecialchars() at the point of output re-encodes
        // for the attribute value.
        $content = '<p>Hello &amp; goodbye &#8212; the end.</p>';
        $this->assertSame(
            'Hello & goodbye — the end.',
            post_excerpt_for_ogp('', $content)
        );
    }

    public function testCollapsesWhitespace(): void
    {
        $content = "<p>line 1</p>\n\n<p>line\t2</p>";
        $this->assertSame(
            'line 1 line 2',
            post_excerpt_for_ogp('', $content)
        );
    }

    public function testStripsSlashes(): void
    {
        // 0.71 stores escaped quotes via addslashes() in some paths;
        // the excerpt produced for OGP must be the un-escaped form.
        $this->assertSame(
            "It's fine.",
            post_excerpt_for_ogp("It\\'s fine.", '')
        );
    }

    public function testTruncatesAtMaxLengthWithEllipsis(): void
    {
        $long = str_repeat('a', 250);
        $out  = post_excerpt_for_ogp('', $long, 200);
        $this->assertSame(
            str_repeat('a', 199) . "\u{2026}",
            $out
        );
        $this->assertSame(200, mb_strlen($out, 'UTF-8'));
    }

    public function testCountsMultibyteByCharacter(): void
    {
        // 100 Japanese characters; with max_len 50 the result must be
        // 50 characters (not 50 bytes), ending in the ellipsis.
        $jp  = str_repeat('あ', 100);
        $out = post_excerpt_for_ogp('', $jp, 50);
        $this->assertSame(50, mb_strlen($out, 'UTF-8'));
        $this->assertStringEndsWith("\u{2026}", $out);
        $this->assertStringStartsWith(str_repeat('あ', 49), $out);
    }

    public function testShortContentReturnedWithoutEllipsis(): void
    {
        $out = post_excerpt_for_ogp('', '<p>short.</p>', 200);
        $this->assertSame('short.', $out);
        $this->assertStringEndsNotWith("\u{2026}", $out);
    }
}
