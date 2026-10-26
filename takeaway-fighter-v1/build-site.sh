#!/bin/sh
# Builds site/: a standalone copy for hosting (e.g. itsdone.nz/takeaway), with a full HTML document
# around index.html so Android Chrome treats it as an installable app.
set -e
cd "$(dirname "$0")"
rm -rf site && mkdir -p site/icons
{ printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'; cat index.html; printf '\n</html>\n'; } > site/index.html
cp game.js manifest.webmanifest sw.js site/ && cp icons/*.png site/icons/
echo "site/ ready"
