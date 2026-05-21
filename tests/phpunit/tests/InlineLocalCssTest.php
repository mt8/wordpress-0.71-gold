<?php
/**
 * Tests for inline_local_css() (Issue #251).
 *
 * Reads a project-relative file from $abspath verbatim, returns '' on
 * a missing / unreadable file. Used to inline layout2b.css into the
 * front-end <style> block so the baseline page styles apply before
 * any external stylesheet downloads.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class InlineLocalCssTest extends TestCase
{
    /** @var string|null */
    private $tempRoot;

    protected function setUp(): void
    {
        $this->tempRoot = sys_get_temp_dir() . '/inline-css-test-' . uniqid('', true);
        mkdir($this->tempRoot . '/sub', 0755, true);
        $GLOBALS['abspath'] = $this->tempRoot . '/';
    }

    protected function tearDown(): void
    {
        if (null !== $this->tempRoot && is_dir($this->tempRoot)) {
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($this->tempRoot, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($files as $file) {
                $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
            }
            rmdir($this->tempRoot);
        }

        unset($GLOBALS['abspath']);
    }

    public function testReturnsContentsVerbatim(): void
    {
        $css = "body { margin: 0 }\n#header { background: #808080 }\n";
        file_put_contents($this->tempRoot . '/layout2b.css', $css);

        $this->assertSame($css, inline_local_css('layout2b.css'));
    }

    public function testStripsLeadingSlashFromRel(): void
    {
        file_put_contents($this->tempRoot . '/layout2b.css', '/* css */');
        // a leading slash on $rel must not produce a double slash in the
        //     resolved path (which would fail to read).
        $this->assertSame('/* css */', inline_local_css('/layout2b.css'));
    }

    public function testResolvesNestedPath(): void
    {
        file_put_contents($this->tempRoot . '/sub/inner.css', '.x { color: red }');
        $this->assertSame('.x { color: red }', inline_local_css('sub/inner.css'));
    }

    public function testReturnsEmptyForMissingFile(): void
    {
        $this->assertSame('', inline_local_css('does-not-exist.css'));
    }

    public function testReturnsEmptyForEmptyRel(): void
    {
        $this->assertSame('', inline_local_css(''));
        $this->assertSame('', inline_local_css('/'));
    }

    public function testReturnsEmptyWhenAbspathUnset(): void
    {
        unset($GLOBALS['abspath']);
        $this->assertSame('', inline_local_css('layout2b.css'));
    }

    public function testWorksWithoutTrailingSlashOnAbspath(): void
    {
        // the helper normalises $abspath -- a trailing slash or not must
        //     not change behaviour.
        file_put_contents($this->tempRoot . '/layout2b.css', '/* trimmed */');
        $GLOBALS['abspath'] = $this->tempRoot;
        $this->assertSame('/* trimmed */', inline_local_css('layout2b.css'));
    }

    public function testPreservesMultibyteContent(): void
    {
        // CSS files in this project can carry Japanese characters in
        //     comments; the read must be byte-identical so the CSS
        //     bytes survive intact.
        $css = "/* 日本語コメント */\n.x { content: \"あ\" }";
        file_put_contents($this->tempRoot . '/jp.css', $css);
        $this->assertSame($css, inline_local_css('jp.css'));
    }
}
