#!/usr/bin/env bash
set -euo pipefail

archive=${1:-/root/quake-friends-deploy.tar}
test -f "$archive"
test "$(uname -m)" = x86_64

if ! id quakefriends >/dev/null 2>&1; then
  useradd --system --home-dir /opt/quake-friends --shell /usr/sbin/nologin quakefriends
fi
install -d -m 755 /opt/quake-friends
tar -xf "$archive" -C /opt/quake-friends --no-same-owner
install -m 644 /root/server.mjs /opt/quake-friends/server.mjs
chown -R quakefriends:quakefriends /opt/quake-friends
chmod 600 /opt/quake-friends/runtime/settings.json

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

install -m 644 /root/quake-friends.service /etc/systemd/system/quake-friends.service
systemctl daemon-reload
systemctl enable --now quake-friends.service
sleep 3
curl --fail --silent --show-error http://127.0.0.1:8088/ -o /dev/null
systemctl --no-pager --full status quake-friends.service | head -n 18
