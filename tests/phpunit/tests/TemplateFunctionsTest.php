<?php
/**
 * Tests for the value-returning template helpers in
 * b2-include/b2template.functions.php that do not touch the database:
 * get_bloginfo(), get_the_title(), get_the_content(), get_the_excerpt(),
 * single_month_title(), is_new_day() and the filter API.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class TemplateFunctionsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // the filter API reads the global $b2_filter registry; start empty.
        $GLOBALS['b2_filter'] = [];
    }

    public function testGetBloginfoReturnsTheBlogName(): void
    {
        $GLOBALS['blogname'] = 'My Blog';
        $this->assertSame('My Blog', get_bloginfo('name'));
        // an unknown key defaults to the blog name.
        $this->assertSame('My Blog', get_bloginfo(''));
    }

    public function testGetBloginfoBuildsTheBlogUrl(): void
    {
        $GLOBALS['siteurl']      = 'http://example.com';
        $GLOBALS['blogfilename'] = 'index.php';
        $this->assertSame('http://example.com/index.php', get_bloginfo('url'));
    }

    public function testGetBloginfoReturnsFeedUrls(): void
    {
        $GLOBALS['siteurl'] = 'http://example.com';
        $this->assertSame('http://example.com/b2rss.php', get_bloginfo('rss_url'));
        $this->assertSame('http://example.com/b2rss2.php', get_bloginfo('rss2_url'));
        $this->assertSame('http://example.com/b2rdf.php', get_bloginfo('rdf_url'));
    }

    public function testGetBloginfoReturnsDescriptionAndAdminEmail(): void
    {
        $GLOBALS['blogdescription'] = 'A description';
        $GLOBALS['admin_email']     = 'admin@example.com';
        $this->assertSame('A description', get_bloginfo('description'));
        $this->assertSame('admin@example.com', get_bloginfo('admin_email'));
    }

    public function testGetTheTitleStripsSlashesFromThePostTitle(): void
    {
        $GLOBALS['post']             = new stdClass();
        $GLOBALS['post']->post_title = 'Hello \\"World\\"';
        $this->assertSame('Hello "World"', get_the_title());
    }

    public function testGetTheContentReturnsTheCurrentPageBody(): void
    {
        $this->primeLoopGlobals('Body text', ['Body text']);
        $this->assertSame('Body text', get_the_content());
    }

    public function testGetTheContentAppendsAMoreLinkWhenNotExpanded(): void
    {
        $this->primeLoopGlobals('Teaser<!--more-->Rest', ['Teaser<!--more-->Rest']);
        $GLOBALS['more'] = 0;
        $output          = get_the_content('READMORE');
        $this->assertStringStartsWith('Teaser ', $output);
        $this->assertStringContainsString('>READMORE</a>', $output);
    }

    public function testGetTheContentShowsTheRestWhenExpanded(): void
    {
        $this->primeLoopGlobals('Teaser<!--more-->Rest', ['Teaser<!--more-->Rest']);
        $GLOBALS['more'] = 1;
        $this->assertSame('Teaser<a name="more5"></a>Rest', get_the_content());
    }

    public function testGetTheExcerptReturnsTheStoredExcerpt(): void
    {
        $GLOBALS['post']               = new stdClass();
        $GLOBALS['post']->post_excerpt = 'Short excerpt';
        $GLOBALS['preview']            = 0;
        $this->assertSame('Short excerpt', get_the_excerpt());
    }

    public function testGetTheExcerptFakesOneFromTheContentWhenEmpty(): void
    {
        $this->primeLoopGlobals('Body text here', ['Body text here']);
        $GLOBALS['post']->post_excerpt = '';
        // with $fakeit = true and no stored excerpt it derives one from the
        // post content (stripped of tags, space-padded per word).
        $this->assertSame('Body text here ', get_the_excerpt(true));
    }

    public function testSingleMonthTitleReturnsTheArchiveKeyWhenNotDisplaying(): void
    {
        $GLOBALS['m']     = '200305';
        $GLOBALS['month'] = ['05' => 'May'];
        $this->assertSame('200305', single_month_title('/', false));
    }

    public function testIsNewDayReportsWhetherTheDayChanged(): void
    {
        $GLOBALS['day']         = '15';
        $GLOBALS['previousday'] = '15';
        $this->assertSame(0, is_new_day());

        $GLOBALS['previousday'] = '14';
        $this->assertSame(1, is_new_day());
    }

    public function testApplyFiltersReturnsInputUnchangedWithNoFilters(): void
    {
        $this->assertSame('untouched', apply_filters('nothing', 'untouched'));
    }

    public function testAddFilterRegistersAFilterThatApplyFiltersRuns(): void
    {
        add_filter('shout', 'strtoupper');
        $this->assertSame('LOUD', apply_filters('shout', 'loud'));
    }

    public function testAddFilterDoesNotRegisterTheSameCallbackTwice(): void
    {
        add_filter('once', 'strtoupper');
        add_filter('once', 'strtoupper');
        $this->assertSame(['strtoupper'], $GLOBALS['b2_filter']['once']);
    }

    public function testApplyFiltersRunsRegisteredFiltersInOrder(): void
    {
        add_filter('chain', 'trim');
        add_filter('chain', 'strtoupper');
        $this->assertSame('HI', apply_filters('chain', '  hi  '));
    }

    /**
     * Prime the b2-loop globals get_the_content() / get_the_excerpt() read.
     *
     * @param array<int, string> $pages
     */
    private function primeLoopGlobals(string $content, array $pages): void
    {
        $GLOBALS['post']               = new stdClass();
        $GLOBALS['post']->post_content = $content;
        $GLOBALS['page']               = 1;
        $GLOBALS['pages']              = $pages;
        $GLOBALS['more']               = 1;
        $GLOBALS['multipage']          = 0;
        $GLOBALS['preview']            = 0;
        $GLOBALS['pagenow']            = 'index.php';
        $GLOBALS['id']                 = 5;
    }
}
