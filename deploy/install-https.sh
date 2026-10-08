#!/usr/bin/env bash
set -euo pipefail

ip=201.34.158.52
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y nginx python3-venv python3-pip
install -d -m 755 /var/www/quake-friends-acme

cat >/etc/nginx/sites-available/quake-friends <<EOF
server {
    listen 80;
    server_name $ip;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/quake-friends-acme;
    }
    location / { return 404; }
}
EOF
ln -sfn /etc/nginx/sites-available/quake-friends /etc/nginx/sites-enabled/quake-friends
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

if ! test -x /opt/quake-friends-certbot/bin/certbot; then
  python3 -m venv /opt/quake-friends-certbot
  /opt/quake-friends-certbot/bin/pip install --disable-pip-version-check 'certbot>=5.4'
fi
/opt/quake-friends-certbot/bin/certbot --version

/opt/quake-friends-certbot/bin/certbot certonly \
  --webroot --webroot-path /var/www/quake-friends-acme \
  --ip-address "$ip" --preferred-profile shortlived \
  --non-interactive --agree-tos --register-unsafely-without-email

cat >/etc/nginx/sites-available/quake-friends <<EOF
server {
    listen 80;
    server_name $ip;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/quake-friends-acme;
    }
    location / { return 308 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $ip;
    ssl_certificate /etc/letsencrypt/live/$ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$ip/privkey.pem;

    location /game {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
    }
    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
EOF
nginx -t
systemctl reload nginx

cat >/etc/systemd/system/quake-friends-certbot.service <<'EOF'
[Unit]
Description=Renew short-lived HTTPS certificate for Quake Friends

[Service]
Type=oneshot
ExecStart=/opt/quake-friends-certbot/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF
cat >/etc/systemd/system/quake-friends-certbot.timer <<'EOF'
[Unit]
Description=Check Quake Friends HTTPS certificate daily

[Timer]
OnCalendar=*-*-* 03:30:00 UTC
RandomizedDelaySec=3h
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now quake-friends-certbot.timer
if systemctl is-active --quiet quake-friends.service; then
  curl --fail --silent --show-error "https://$ip/" -o /dev/null
fi
