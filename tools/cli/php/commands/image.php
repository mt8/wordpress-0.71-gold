<?php
/**
 * 071-cli -- `image` command group.
 *
 * Manage on-disk image assets that the front-end serves via <picture>.
 *     Verb: backfill-webp (the default) -- walks the uploads directory and
 *     generates a `.webp` sibling for every `.png` / `.jpg` / `.jpeg` that
 *     does not yet have one. The encoder lives in src/b2-include/b2functions.php
 *     (generate_webp_sibling()) so the same code path is shared with the
 *     later upload-time hook; this CLI is the one-shot backfill for existing
 *     uploads (Issue #245).
 * @package 071-cli
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
// generate_webp_sibling() lives in b2functions.php so the same function is
//     shared with the later upload-time hook in the front-end PHP context.
require_once __DIR__ . '/../../../../src/b2-include/b2functions.php';

/**
 * Resolve the uploads directory the backfill walks.
 *
 * The --uploads flag wins; otherwise the IMAGE_UPLOADS_DIR environment
 *     variable; otherwise <install-path>/wp-content/uploads (the default
 *     $fileupload_realpath shape from b2config.php).
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return string The uploads directory, without a trailing slash.
 */
function cli_image_uploads_dir( array $flags ): string {
	if ( isset( $flags['uploads'] ) && is_string( $flags['uploads'] ) && '' !== $flags['uploads'] ) {
		return rtrim( $flags['uploads'], '/' );
	}

	$env = getenv( 'IMAGE_UPLOADS_DIR' );
	if ( false !== $env && '' !== $env ) {
		return rtrim( $env, '/' );
	}

	return cli_resolve_path( $flags ) . '/wp-content/uploads';
}

/**
 * Walk $uploads_dir and generate a .webp sibling for every .png / .jpg /
 * .jpeg that lacks one. Returns 0 when every conversion succeeded (or there
 * was nothing to convert), 1 when at least one conversion failed.
 *
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_image_backfill_webp( array $flags ): int {
	$uploads_dir = cli_image_uploads_dir( $flags );
	if ( ! is_dir( $uploads_dir ) ) {
		cli_fail( "uploads directory not found: $uploads_dir" );
	}

	if ( ! function_exists( 'imagewebp' ) ) {
		cli_fail( 'GD with WebP support is not available in this PHP build -- rebuild the Docker image.' );
	}

	fwrite( STDOUT, "WebP backfill / WebP バックフィル\n" );
	fwrite( STDOUT, "  uploads: $uploads_dir\n\n" );

	$generated   = 0;
	$skipped     = 0;
	$failed      = array();
	$source_exts = array( 'png', 'jpg', 'jpeg' );
	// Responsive width variants to produce next to every PNG / JPG
	//     (Issue #247). 480 w matches the phone column (full viewport
	//     under the 782 px breakpoint); 1024 w matches a tablet / small
	//     desktop. The full-width sibling is the original `.webp`.
	$widths = array( 480, 1024 );

	$iter = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $uploads_dir, RecursiveDirectoryIterator::SKIP_DOTS )
	);
	foreach ( $iter as $file ) {
		if ( ! $file->isFile() ) {
			continue;
		}
		$path = $file->getPathname();
		$ext  = strtolower( $file->getExtension() );
		if ( ! in_array( $ext, $source_exts, true ) ) {
			continue;
		}
		$rel = substr( $path, strlen( $uploads_dir ) + 1 );
		// full-width sibling.
		$sibling = $path . '.webp';
		if ( is_file( $sibling ) ) {
			++$skipped;
		} elseif ( generate_webp_sibling( $path ) ) {
			++$generated;
			fwrite( STDOUT, "  generated: $rel.webp\n" );
		} else {
			$failed[] = $sibling;
		}
		// resized width variants.
		foreach ( $widths as $w ) {
			$variant = $path . '.' . $w . '.webp';
			if ( is_file( $variant ) ) {
				++$skipped;
				continue;
			}
			if ( generate_webp_resized( $path, $w ) ) {
				++$generated;
				fwrite( STDOUT, "  generated: $rel.$w.webp\n" );
			} else {
				// generate_webp_resized() returns false when the source is
				//     narrower than the target -- a legitimate no-op, not a
				//     failure. Probe the source width once and skip when so.
				$info = @getimagesize( $path );
				if ( is_array( $info ) && isset( $info[0] ) && (int) $info[0] <= $w ) {
					++$skipped;
				} else {
					$failed[] = $variant;
				}
			}
		}
	}

	fwrite( STDOUT, "\n" );
	fwrite( STDOUT, "  generated: $generated\n" );
	fwrite( STDOUT, "  skipped (already had .webp): $skipped\n" );
	if ( ! empty( $failed ) ) {
		fwrite( STDOUT, '  failed: ' . count( $failed ) . "\n" );
		foreach ( $failed as $f ) {
			fwrite( STDERR, "    $f\n" );
		}
		return 1;
	}

	cli_success( 'WebP backfill complete. Run `071 export` to publish the new variants.' );
	return 0;
}

/**
 * Route an `image` verb to its implementation.
 *
 * The bare `071 image` and `071 image backfill-webp` both run the backfill;
 *     `help` prints usage.
 * @param string                     $verb  The verb.
 * @param array<int, string>         $args  Positional arguments after the verb.
 * @param array<string, string|bool> $flags Parsed global flags.
 * @return int Process exit code.
 */
function cli_cmd_image( string $verb, array $args, array $flags ): int {
	switch ( $verb ) {
		case '':
		case 'backfill-webp':
			return cli_image_backfill_webp( $flags );

		case 'help':
			fwrite( STDOUT, "071 image [backfill-webp]\n" );
			fwrite( STDOUT, "  Generate .webp siblings for every .png / .jpg / .jpeg under uploads/.\n" );
			fwrite( STDOUT, "  Flags: --uploads=<dir> (default <install-path>/wp-content/uploads)\n" );
			fwrite( STDOUT, "         --path=<dir>    (WordPress 0.71 install path; default ./src)\n" );
			return 0;

		default:
			cli_fail( "unknown verb 'image $verb'." );
	}

	return 0;
}
