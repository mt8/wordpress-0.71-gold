<?php
/**
 * Tests for cli_export_absolutify_ogp() (Issue #231).
 *
 * After cli_export_rewrite() strips the blog URL prefix from every
 * absolute URL in a page body, og:image ends up as the bare
 * "wp-content/.../img.png" -- which OGP scrapers (Facebook, Twitter,
 * Slack) may not resolve reliably against the page URL. The
 * absolutify step takes a publish base URL (supplied via the
 * --publish flag on `071 export`) and re-prepends it so og:image
 * carries the canonical absolute URL on the published site.
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../../tools/cli/php/commands/export.php';

final class ExportAbsolutifyOgpTest extends TestCase
{
    public function testReturnsBodyUnchangedWhenPublishUrlEmpty(): void
    {
        $body = '<meta property="og:image" content="wp-content/uploads/a.png" />';
        $this->assertSame($body, cli_export_absolutify_ogp($body, ''));
    }

    public function testReturnsBodyUnchangedWhenNoOgImageTag(): void
    {
        $body = '<title>just text</title>';
        $this->assertSame(
            $body,
            cli_export_absolutify_ogp($body, 'https://071.mt8.biz')
        );
    }

    public function testPrependsPublishUrlToRelativeOgImage(): void
    {
        $body = '<meta property="og:image" content="wp-content/uploads/a.png" />';
        $this->assertSame(
            '<meta property="og:image" content="https://071.mt8.biz/wp-content/uploads/a.png" />',
            cli_export_absolutify_ogp($body, 'https://071.mt8.biz')
        );
    }

    public function testNormalizesTrailingSlashOnPublishUrl(): void
    {
        // a publish URL with a trailing slash must not produce a double slash.
        $body = '<meta property="og:image" content="wp-content/uploads/a.png" />';
        $this->assertSame(
            '<meta property="og:image" content="https://071.mt8.biz/wp-content/uploads/a.png" />',
            cli_export_absolutify_ogp($body, 'https://071.mt8.biz/')
        );
    }

    public function testNormalizesLeadingSlashOnOgImage(): void
    {
        // a leading slash on the og:image value must not produce a double slash.
        $body = '<meta property="og:image" content="/wp-content/uploads/a.png" />';
        $this->assertSame(
            '<meta property="og:image" content="https://071.mt8.biz/wp-content/uploads/a.png" />',
            cli_export_absolutify_ogp($body, 'https://071.mt8.biz')
        );
    }

    public function testLeavesAlreadyAbsoluteOgImageAlone(): void
    {
        // an og:image already pointing at an absolute URL must not be touched.
        $body =
            '<meta property="og:image" content="https://cdn.example.com/a.png" />';
        $this->assertSame(
            $body,
            cli_export_absolutify_ogp($body, 'https://071.mt8.biz')
        );
    }

    public function testLeavesHttpAbsoluteOgImageAlone(): void
    {
        $body =
            '<meta property="og:image" content="http://other.test/a.png" />';
        $this->assertSame(
            $body,
            cli_export_absolutify_ogp($body, 'https://071.mt8.biz')
        );
    }

    public function testLeavesProtocolRelativeOgImageAlone(): void
    {
        // "//cdn..." is protocol-relative; it is already an absolute reference.
        $body = '<meta property="og:image" content="//cdn.example.com/a.png" />';
        $this->assertSame(
            $body,
            cli_export_absolutify_ogp($body, 'https://071.mt8.biz')
        );
    }

    public function testLeavesEmptyOgImageAlone(): void
    {
        // an empty content is degenerate but defensive: do not invent a URL.
        $body = '<meta property="og:image" content="" />';
        $this->assertSame(
            $body,
            cli_export_absolutify_ogp($body, 'https://071.mt8.biz')
        );
    }

    public function testLeavesOgTitleAndOgTypeUnchanged(): void
    {
        // only og:image is absolutified -- og:title / og:type carry plain
        // text, not URLs.
        $body =
            '<meta property="og:title" content="Hello" />' . "\n"
            . '<meta property="og:type" content="article" />' . "\n"
            . '<meta property="og:image" content="wp-content/a.png" />';
        $out = cli_export_absolutify_ogp($body, 'https://071.mt8.biz');

        $this->assertStringContainsString(
            '<meta property="og:title" content="Hello" />',
            $out
        );
        $this->assertStringContainsString(
            '<meta property="og:type" content="article" />',
            $out
        );
        $this->assertStringContainsString(
            '<meta property="og:image" content="https://071.mt8.biz/wp-content/a.png" />',
            $out
        );
    }

    public function testCaseInsensitiveMetaTagName(): void
    {
        // hand-authored or older markup may use uppercase tag names.
        $body = '<META property="og:image" content="wp-content/a.png" />';
        $this->assertSame(
            '<META property="og:image" content="https://071.mt8.biz/wp-content/a.png" />',
            cli_export_absolutify_ogp($body, 'https://071.mt8.biz')
        );
    }
}
