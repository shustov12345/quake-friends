#!/usr/bin/env bash
set -euo pipefail
version=v24.18.0
filename="node-${version}-linux-x64.tar.xz"
if ! test -x /opt/node24/bin/node; then
  install -d -m 755 /opt/node24
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  curl -fsSL "https://nodejs.org/dist/${version}/${filename}" -o "$work/$filename"
  curl -fsSL "https://nodejs.org/dist/${version}/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
  ( cd "$work" && grep -F "  $filename" SHASUMS256.txt | sha256sum -c - )
  tar -xJf "$work/$filename" -C /opt/node24 --strip-components=1
fi
test "$(/opt/node24/bin/node --version)" = "$version"
/opt/node24/bin/node --version
