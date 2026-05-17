<?php
/**
 * Tests for the text-formatting helpers wptexturize() and balanceTags().
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class TextFormattingTest extends TestCase
{
    public function testWptexturizeConvertsQuotesDashesAndEllipsis(): void
    {
        // straight quotes -> curly, "--" -> en dash, "..." -> ellipsis.
        $this->assertSame(
            '&#8220;quoted&#8221; &#8211; dash&#8230; it&#8217;s',
            wptexturize('"quoted" -- dash... it\'s')
        );
    }

    public function testBalanceTagsClosesUnclosedTags(): void
    {
        $GLOBALS['use_balanceTags'] = 1;
        $this->assertSame('<b>unclosed</b>', balanceTags('<b>unclosed'));
        $this->assertSame('<p>a<p>b</p></p>', balanceTags('<p>a<p>b'));
    }

    public function testBalanceTagsLeavesBalancedInputUnchanged(): void
    {
        $GLOBALS['use_balanceTags'] = 1;
        $this->assertSame('<em>ok</em>', balanceTags('<em>ok</em>'));
        $this->assertSame('plain text', balanceTags('plain text'));
    }

    public function testBalanceTagsIsANoOpWhenDisabled(): void
    {
        // with $use_balanceTags = 0 the input is returned untouched.
        $GLOBALS['use_balanceTags'] = 0;
        $this->assertSame('<b>unclosed', balanceTags('<b>unclosed'));
    }
}
