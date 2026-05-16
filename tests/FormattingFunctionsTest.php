<?php
/**
 * EN: Tests for the pure formatting / conversion helpers in b2functions.php.
 *     These take a string and return a transformed string with no database
 *     access; the assertions are regression guards on the observed output.
 * JA: b2functions.php の純粋な整形/変換ヘルパーのテスト。これらは文字列を
 *     受け取り DB アクセス無しで変換後の文字列を返す。アサーションは観測した
 *     出力に対する回帰ガードである。
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class FormattingFunctionsTest extends TestCase
{
    public function testWpautopWrapsBlocksInParagraphs(): void
    {
        $this->assertSame(
            "<p>line one</p>\n<p>line two</p>\n",
            wpautop("line one\n\nline two")
        );
    }

    public function testWpautopLeavesBlockTagsUnwrapped(): void
    {
        // EN: <ul> is a block-level tag, so wpautop does not wrap it in <p>.
        // JA: <ul> はブロックレベルタグのため wpautop は <p> で包まない。
        $this->assertStringContainsString('<ul>', wpautop("<ul><li>x</li></ul>"));
        $this->assertStringNotContainsString('<p><ul>', wpautop("<ul><li>x</li></ul>"));
    }

    public function testAutobrizeConvertsNewlinesToBreaks(): void
    {
        $this->assertSame("a<br />\nb", autobrize("a\r\nb"));
        $this->assertSame("a<br />\nb", autobrize("a\nb"));
    }

    public function testUnautobrizeRemovesBreakBeforeNewline(): void
    {
        $this->assertSame("a\nb", unautobrize("a<br />\nb"));
        $this->assertSame("a\nb", unautobrize("a<br>\nb"));
    }

    public function testBackslashitEscapesLetters(): void
    {
        $this->assertSame('\\a\\b1\\c', backslashit('ab1c'));
        $this->assertSame('123', backslashit('123'));
    }

    public function testFormatToEditStripsSlashesAndEscapesHtml(): void
    {
        $GLOBALS['autobr'] = 0;
        $this->assertSame('a&lt;b&gt;&quot;x&quot;', format_to_edit('a<b>\\"x\\"'));
    }

    public function testFormatToPostAddsSlashes(): void
    {
        $GLOBALS['post_autobr']    = 0;
        $GLOBALS['comment_autobr'] = 0;
        $this->assertSame('a\\"x\\"', format_to_post('a"x"'));
    }

    public function testPopuplinksAddsTargetAndRel(): void
    {
        $this->assertSame(
            "<a href=\"x\" target='_blank' rel='external'>y</a>",
            popuplinks('<a href="x">y</a>')
        );
    }

    public function testMakeClickableLinksBareUrls(): void
    {
        $this->assertSame(
            'visit <a href="http://example.com" target="_blank">http://example.com</a> now',
            make_clickable('visit http://example.com now')
        );
    }

    public function testMakeClickableLinksEmailAddresses(): void
    {
        $this->assertSame(
            'mail <a href="mailto:me@example.com">me@example.com</a> ok',
            make_clickable('mail me@example.com ok')
        );
    }

    public function testStripAllButOneLinkKeepsOnlyTheNamedLink(): void
    {
        $html = '<a href="http://keep.com">k</a> and <a href="http://drop.com">d</a>';
        $this->assertSame(
            '<a href="http://keep.com">k</a> and d',
            strip_all_but_one_link($html, 'keep.com')
        );
    }

    public function testMakeUrlFootnoteMovesLinksToFootnotes(): void
    {
        $GLOBALS['siteurl'] = 'http://s';
        $this->assertSame(
            "see link [1] here\n\n[1] http://x.com",
            make_url_footnote('see <a href="http://x.com">link</a> here')
        );
    }

    public function testConvertBbcodeIsANoOpWhenDisabled(): void
    {
        $GLOBALS['use_bbcode'] = 0;
        $this->assertSame('[b]plain[/b]', convert_bbcode('[b]plain[/b]'));
    }

    public function testConvertBbcodeReplacesTagsWhenEnabled(): void
    {
        $GLOBALS['use_bbcode'] = 1;
        $this->assertSame('<strong>bold</strong>', convert_bbcode('[b]bold[/b]'));
    }

    public function testConvertGmcodeIsANoOpWhenDisabled(): void
    {
        $GLOBALS['use_gmcode'] = 0;
        $this->assertSame('**text**', convert_gmcode('**text**'));
    }

    public function testConvertGmcodeReplacesMarkupWhenEnabled(): void
    {
        $GLOBALS['use_gmcode'] = 1;
        $this->assertSame('a <strong>bold</strong> b', convert_gmcode('a **bold** b'));
    }

    public function testConvertSmiliesIsANoOpWhenDisabled(): void
    {
        $GLOBALS['use_smilies'] = 0;
        $this->assertSame('hi :)', convert_smilies('hi :)'));
    }

    public function testConvertSmiliesEmitsAnImageWhenEnabled(): void
    {
        $GLOBALS['use_smilies'] = 1;
        $output = convert_smilies(':D');
        $this->assertStringContainsString('<img src=', $output);
        $this->assertStringContainsString('/smilies/', $output);
    }

    public function testConvertCharsStripsTitleAndCategoryTags(): void
    {
        $GLOBALS['use_htmltrans'] = 1;
        $this->assertSame('beforeafter', convert_chars('before<title>X</title>after'));
        $this->assertSame('xy', convert_chars('x<category>C</category>y'));
    }

    public function testConvertBbcodeEmailBuildsAnObfuscatedMailtoLink(): void
    {
        // EN: convert_bbcode_email() obfuscates the address with antispambot(),
        //     which is randomised, so assert the link structure, not the bytes.
        // JA: convert_bbcode_email() は antispambot() で住所を難読化する。これは
        //     乱数を使うため、バイト列ではなくリンク構造を検証する。
        $output = convert_bbcode_email('contact [email]a@b.com[/email] now');
        $this->assertStringStartsWith('contact <a href="mailto:', $output);
        $this->assertStringContainsString('</a> now', $output);
    }

    public function testAntispambotAvoidsTheLiteralAtSign(): void
    {
        // EN: antispambot() is randomised; its one invariant is that a literal
        //     '@' is never emitted (it becomes the entity &#64;).
        // JA: antispambot() は乱数を使う。唯一の不変条件は、リテラルの '@' を
        //     決して出力しないこと(エンティティ &#64; になる)。
        $this->assertStringNotContainsString('@', antispambot('user@example.com'));
    }
}
