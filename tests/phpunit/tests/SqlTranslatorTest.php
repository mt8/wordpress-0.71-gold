<?php
/**
 * Tests for the 071-now MySQL -> SQLite translator
 * (tools/playground/db/sql-translator.php).
 *
 * The focus is the double-quote -> single-quote conversion: WordPress
 * 0.71 emits double-quoted SQL string literals (post_status = "publish")
 * and SQLite reads "..." as an identifier, so the translator converts
 * them. The conversion must NOT reach double quotes inside a
 * single-quoted value -- a block-editor post body with an image block
 * holds <img src="..."> -- or it terminates the value early and breaks
 * the statement (Issue #203).
 */

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../../tools/playground/db/sql-translator.php';

final class SqlTranslatorTest extends TestCase {

	public function testConvertsADoubleQuotedLiteralOutsideStrings(): void {
		// 0.71's blog.header.php emits post_status = "publish"; SQLite
		// needs the single-quoted form.
		$out = WP071_SqlTranslator::translate(
			'SELECT ID FROM b2posts WHERE post_status = "publish"'
		);
		$this->assertStringContainsString( "post_status = 'publish'", $out );
		$this->assertStringNotContainsString( '"publish"', $out );
	}

	public function testKeepsDoubleQuotesInsideASingleQuotedValue(): void {
		// A block-editor save: the post body has an image block whose
		// markup contains <img src="..."/>. Those double quotes are
		// inside the single-quoted post_content value and must survive
		// the translation untouched.
		$content = '<!-- wp:image --><img src="/wp-content/uploads/x.jpg" alt=""/>';
		$out     = WP071_SqlTranslator::translate(
			"UPDATE b2posts SET post_content = '$content' WHERE ID = 1"
		);
		$this->assertStringContainsString( $content, $out );
	}

	public function testHandlesBothFormsInOneStatement(): void {
		// A code-level "publish" is converted; the double quotes inside
		// the post_content value are left alone.
		$out = WP071_SqlTranslator::translate(
			'UPDATE b2posts SET post_content = \'<img src="/a.jpg"/>\', '
			. 'post_status = "publish" WHERE ID = 1'
		);
		$this->assertStringContainsString( '<img src="/a.jpg"/>', $out );
		$this->assertStringContainsString( "post_status = 'publish'", $out );
	}

	public function testKeepsDoubleQuotesInAValueWithEscapedSingleQuotes(): void {
		// wpdb::escape() doubles a single quote ('' ); a value mixing
		// an escaped quote and double quotes must still round-trip.
		$value = "it''s an <img alt=\"x\"/>";
		$out   = WP071_SqlTranslator::translate(
			"UPDATE b2posts SET post_content = '$value' WHERE ID = 1"
		);
		$this->assertStringContainsString( $value, $out );
	}
}
