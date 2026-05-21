# WordPress 0.71-gold development image
#
# Based on the official PHP + Apache image. Per CLAUDE.md, customization is
#     kept to the necessary minimum. The PHP version is parameterised with a
#     build ARG defaulting to 8.3, so a plain `docker build` is unchanged while
#     071-env can pass PHP_VERSION (from `.071-env.json`'s `phpVersion`).
ARG PHP_VERSION=8.3
FROM php:${PHP_VERSION}-apache

# Install the mysqli extension. WordPress 0.71's wpdb class originally uses
#     the ext/mysql API, which was removed in PHP 7.0; mysqli is the migration
#     target. The base image ships with neither extension.
RUN docker-php-ext-install mysqli

# Install GD with WebP support so the front end can serve a WebP variant
#     next to every uploaded PNG / JPG (Issue #245). The php:8.3-apache base
#     image ships no GD; building it with --with-webp pulls in the libwebp
#     codec that imagewebp() needs. libpng / libjpeg are the dependencies
#     GD always needs; libwebp-dev is the WebP-specific addition. Without
#     this the CLI backfill (071 image backfill-webp) cannot encode WebPs
#     and the front-end <picture> wrapper has nothing to point at.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		libpng-dev libjpeg-dev libwebp-dev \
	&& rm -rf /var/lib/apt/lists/* \
	&& docker-php-ext-configure gd --with-jpeg --with-webp \
	&& docker-php-ext-install gd

# Raise PHP's upload limits. The php:8.3-apache defaults
#     (upload_max_filesize 2M, post_max_size 8M) are too small for the block
#     editor's image uploads; WordPress 0.71's own $fileupload_maxk is raised
#     to match in src/b2config.php (Issue #102).
RUN printf 'upload_max_filesize = 16M\npost_max_size = 20M\n' \
	> /usr/local/etc/php/conf.d/uploads.ini
