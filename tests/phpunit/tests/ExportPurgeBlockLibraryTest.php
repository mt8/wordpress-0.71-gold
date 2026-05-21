<?php
/**
 * Tests for the block-library.css purge step (Issue #249).
 *
 * cli_export_collect_used_blocks() walks HTML and returns the
 * `wp-block-NAME` classes actually referenced. cli_export_rule_is_alive()
 * decides whether a single CSS rule (its selector list) is alive given
 * a used-blocks set. cli_export_purge_block_library_css() walks the full
 * CSS, drops dead rules, and recurses into @media / @supports.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../../tools/cli/php/commands/export.php';

final class ExportPurgeBlockLibraryTest extends TestCase
{
    public function testCollectUsedBlocksReturnsSortedDedupedList(): void
    {
        $html =
            '<div class="wp-block-image"><img></div>'
            . '<div class="wp-block-columns is-not-stacked"></div>'
            . '<div class="wp-block-image"></div>'; // duplicate
        $this->assertSame(
            array('columns', 'image'),
            cli_export_collect_used_blocks($html)
        );
    }

    public function testCollectUsedBlocksIgnoresNonBlockClasses(): void
    {
        $html =
            '<div class="container has-text-align-center">just text</div>'
            . '<a class="wp-block-button__link">link</a>';
        $this->assertSame(
            array('button__link'),
            cli_export_collect_used_blocks($html)
        );
    }

    public function testCollectUsedBlocksReturnsEmptyOnNoClasses(): void
    {
        $this->assertSame(array(), cli_export_collect_used_blocks('<p>plain</p>'));
    }

    public function testRuleIsAliveWhenSelectorReferencesUsedBlock(): void
    {
        $this->assertTrue(
            cli_export_rule_is_alive('.wp-block-image', array('image'))
        );
    }

    public function testRuleIsDeadWhenSelectorReferencesOnlyUnusedBlocks(): void
    {
        $this->assertFalse(
            cli_export_rule_is_alive('.wp-block-cover', array('image'))
        );
    }

    public function testRuleListIsAliveWhenAnyOneSelectorIsAlive(): void
    {
        // .wp-block-cover is dead, but .wp-block-image is alive -- the
        //     whole rule stays.
        $this->assertTrue(
            cli_export_rule_is_alive(
                '.wp-block-image, .wp-block-cover',
                array('image')
            )
        );
    }

    public function testRuleIsAliveWhenNoBlockClassInSelector(): void
    {
        // General styling without any .wp-block-* selector is always
        //     kept -- it is base styling, not block-specific.
        $this->assertTrue(
            cli_export_rule_is_alive('body', array())
        );
        $this->assertTrue(
            cli_export_rule_is_alive('.has-text-align-center', array())
        );
    }

    public function testPurgeKeepsAliveRules(): void
    {
        $css =
            '.wp-block-image { display: block }'
            . '.wp-block-cover { background: red }';
        $out = cli_export_purge_block_library_css($css, array('image'));
        $this->assertStringContainsString('.wp-block-image', $out);
        $this->assertStringNotContainsString('.wp-block-cover', $out);
    }

    public function testPurgeKeepsGeneralRules(): void
    {
        $css =
            'body { margin: 0 }'
            . '.wp-block-cover { color: red }';
        $out = cli_export_purge_block_library_css($css, array('image'));
        $this->assertStringContainsString('body', $out);
        $this->assertStringNotContainsString('.wp-block-cover', $out);
    }

    public function testPurgeRecursesIntoMediaQuery(): void
    {
        $css =
            '@media (min-width: 800px) {'
            . '.wp-block-image { width: 100% }'
            . '.wp-block-cover { display: none }'
            . '}';
        $out = cli_export_purge_block_library_css($css, array('image'));
        $this->assertStringContainsString('.wp-block-image', $out);
        $this->assertStringNotContainsString('.wp-block-cover', $out);
        $this->assertStringContainsString('@media', $out);
    }

    public function testPurgeDropsMediaQueryWithOnlyDeadRules(): void
    {
        // every inner rule is dead -> the wrapping @media goes too.
        $css =
            '@media (min-width: 800px) {'
            . '.wp-block-cover { display: none }'
            . '.wp-block-gallery { display: flex }'
            . '}';
        $out = cli_export_purge_block_library_css($css, array('image'));
        $this->assertStringNotContainsString('@media', $out);
        $this->assertStringNotContainsString('.wp-block-cover', $out);
        $this->assertStringNotContainsString('.wp-block-gallery', $out);
    }

    public function testPurgeKeepsKeyframesVerbatim(): void
    {
        // @keyframes inner "0% { ... }" steps do not carry .wp-block-*
        //     selectors and must not be wrongly dropped.
        $css = '@keyframes spin { 0% { transform: rotate(0) } 100% { transform: rotate(360deg) } }';
        $out = cli_export_purge_block_library_css($css, array());
        $this->assertStringContainsString('@keyframes spin', $out);
        $this->assertStringContainsString('0%', $out);
        $this->assertStringContainsString('100%', $out);
    }

    public function testPurgeKeepsComments(): void
    {
        $css =
            '/* head comment */'
            . '.wp-block-image { color: red }'
            . '/* between */'
            . '.wp-block-cover { color: blue }';
        $out = cli_export_purge_block_library_css($css, array('image'));
        $this->assertStringContainsString('/* head comment */', $out);
        $this->assertStringContainsString('/* between */', $out);
    }

    public function testPurgeHandlesPseudoAndCombinatorSelectors(): void
    {
        $css =
            '.wp-block-image:hover { opacity: .8 }'
            . '.wp-block-image > figure { margin: 0 }'
            . '.wp-block-cover:hover { background: blue }';
        $out = cli_export_purge_block_library_css($css, array('image'));
        $this->assertStringContainsString('.wp-block-image:hover', $out);
        $this->assertStringContainsString('.wp-block-image > figure', $out);
        $this->assertStringNotContainsString('.wp-block-cover', $out);
    }

    public function testPurgeShrinksRealisticBlockLibrarySample(): void
    {
        $css =
            '.wp-block-image { display: block }'
            . '.wp-block-cover { background: red }'
            . '.wp-block-button { padding: 10px }'
            . '.wp-block-button__link { color: white }'
            . '.wp-block-buttons { display: flex }'
            . '.wp-block-list { margin: 1em 0 }'
            . '.wp-block-gallery { display: grid }'
            . '.wp-block-cover-image { background: blue }';
        $used = array('image', 'button', 'button__link', 'buttons', 'list');
        $out  = cli_export_purge_block_library_css($css, $used);
        $this->assertStringContainsString('.wp-block-image', $out);
        $this->assertStringContainsString('.wp-block-button', $out);
        $this->assertStringContainsString('.wp-block-button__link', $out);
        $this->assertStringContainsString('.wp-block-buttons', $out);
        $this->assertStringContainsString('.wp-block-list', $out);
        $this->assertStringNotContainsString('.wp-block-cover ', $out);
        $this->assertStringNotContainsString('.wp-block-gallery', $out);
        $this->assertStringNotContainsString('.wp-block-cover-image', $out);
    }
}
