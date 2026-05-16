<?php
/**
 * EN: Tests for the pure functions in b2-include/textile.php -- the Textile
 *     1.0 humane-text formatter (string in, HTML out) plus its small helpers.
 *     textile() wraps each block in a leading tab and a trailing "\n ", so the
 *     assertions match on the meaningful HTML fragment rather than the exact
 *     surrounding whitespace where that whitespace is incidental.
 * JA: b2-include/textile.php の純粋な関数のテスト -- Textile 1.0 の人に優しい
 *     テキストフォーマッタ(文字列入力・HTML 出力)と、その小さなヘルパー群。
 *     textile() は各ブロックを先頭タブと末尾 "\n " で包むため、その空白が
 *     付随的な箇所では、囲みの空白そのものではなく意味のある HTML 断片に対して
 *     アサートする。
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class TextileTest extends TestCase
{
    public function testPlainLineBecomesAParagraph(): void
    {
        $this->assertStringContainsString('<p>Just a line</p>', textile('Just a line'));
    }

    public function testStrongAndEmphasisPhraseModifiers(): void
    {
        $output = textile('This is *strong* and _emphasis_ text');
        $this->assertStringContainsString('<strong>strong</strong>', $output);
        $this->assertStringContainsString('<em>emphasis</em>', $output);
    }

    public function testBoldAndItalicPhraseModifiers(): void
    {
        $output = textile('Here is **bold** and __italic__ text');
        $this->assertStringContainsString('<b>bold</b>', $output);
        $this->assertStringContainsString('<i>italic</i>', $output);
    }

    public function testCodeAndSuperscriptPhraseModifiers(): void
    {
        $this->assertStringContainsString('<code>x</code>', textile('use @x@ here'));
        $this->assertStringContainsString('<sup>2</sup>', textile('e=mc^2^ formula'));
    }

    public function testHeaderBlockModifier(): void
    {
        $this->assertStringContainsString('<h1>Title</h1>', textile('h1. Title'));
    }

    public function testHeaderBlockModifierWithCssClass(): void
    {
        $this->assertStringContainsString(
            '<h2 class="intro">Heading</h2>',
            textile('h2(intro). Heading')
        );
    }

    public function testParagraphBlockModifierWithCssClass(): void
    {
        $this->assertStringContainsString(
            '<p class="lead">Para</p>',
            textile('p(lead). Para')
        );
    }

    public function testBlockquoteBlockModifier(): void
    {
        $this->assertStringContainsString(
            '<blockquote>quoted</blockquote>',
            textile('bq. quoted')
        );
    }

    public function testBulletedListBlockModifier(): void
    {
        $output = textile("* one\n* two");
        $this->assertStringContainsString('<ul>', $output);
        $this->assertStringContainsString('<li>one</li>', $output);
        $this->assertStringContainsString('<li>two</li>', $output);
        $this->assertStringContainsString('</ul>', $output);
    }

    public function testNumericListBlockModifier(): void
    {
        $output = textile("# one\n# two");
        $this->assertStringContainsString('<ol>', $output);
        $this->assertStringContainsString('<li>one</li>', $output);
        $this->assertStringContainsString('</ol>', $output);
    }

    public function testHyperlinkQuickTag(): void
    {
        $this->assertStringContainsString(
            '<a href="http://example.com" title="">Example</a>',
            textile('see "Example":http://example.com now')
        );
    }

    public function testImageQuickTag(): void
    {
        $this->assertStringContainsString(
            '<img src="http://img.png" alt="" border="0" />',
            textile('!http://img.png!')
        );
    }

    public function testAcronymQuickTag(): void
    {
        $this->assertStringContainsString(
            '<acronym title="Always Be Closing">ABC</acronym>',
            textile('ABC(Always Be Closing) rocks')
        );
    }

    public function testNotextileEscapesItsContent(): void
    {
        // EN: ==...== marks a notextile span. The current implementation does
        //     NOT pass the inner text through untouched -- it escapes the
        //     angle brackets it produced (a regression guard on real output).
        // JA: ==...== は notextile 範囲を示す。現在の実装は内側のテキストを
        //     そのまま通さず、生成した山括弧をエスケープする(実際の出力に
        //     対する回帰ガード)。
        $this->assertStringContainsString(
            '&lt;strong&gt;this&lt;/strong&gt;',
            textile('notext ==leave *this*== alone')
        );
    }

    public function testEllipsisGlyphReplacement(): void
    {
        $this->assertStringContainsString('&#8230;', textile('wait... for it'));
    }

    public function testCallbackUrlBuildsAnAnchorWithTitle(): void
    {
        $this->assertSame(
            'a href="http://u" title="Ttl">$text</a>',
            callback_url('text', 'Ttl', 'http://u')
        );
    }

    public function testCallbackUrlOmitsTitleWhenEmpty(): void
    {
        $this->assertSame(
            'a href="http://u">$text</a>',
            callback_url('text', '', 'http://u')
        );
    }

    public function testLinkitEscapesAmpersandsInTheUrl(): void
    {
        $this->assertStringContainsString(
            'http://u?a=1&amp;b=2',
            linkit('text', 'Title', 'http://u?a=1&b=2')
        );
    }

    public function testCmapReturnsTheUnicodeCharacterMap(): void
    {
        $cmap = cmap();
        $this->assertIsArray($cmap);
        // EN: the map is a flat list of 4-tuples (start, end, offset, mask).
        // JA: マップは 4 要素組(start, end, offset, mask)の平坦なリスト。
        $this->assertSame(0, count($cmap) % 4);
        $this->assertSame(264, count($cmap));
    }

    public function testEncodeAndDecodeHighRoundTripHighCharacters(): void
    {
        // EN: encode_high() -> numeric entities, decode_high() -> back again.
        // JA: encode_high() で数値実体参照へ、decode_high() で元へ戻す。
        $entity = encode_high("\u{00e9}");
        $this->assertSame('&#233;', $entity);
        $this->assertSame("\u{00e9}", decode_high($entity));
    }
}
