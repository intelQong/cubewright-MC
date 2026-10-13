#!/bin/sh
# deploy/install.sh: copies the bridge to /srv/idealcraft and installs the service. Run with sudo from the repo root.
set -e
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
NODE_BIN="${NODE_BIN:-$(command -v node)}"
id idealcraft >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin idealcraft
mkdir -p /srv/idealcraft/bin
cp -r src package.json /srv/idealcraft/
cp -r addon /srv/idealcraft/        # src/addon.js imports addon/scripts/protocol.js
cp -r node_modules /srv/idealcraft/
cp "$NODE_BIN" /srv/idealcraft/bin/node
chown -R root:root /srv/idealcraft && chmod -R go-w /srv/idealcraft
if [ ! -f /etc/idealcraft.env ]; then
  umask 077
  printf 'WS_HOST=10.100.0.1\nBRIDGE_TOKEN=%s\n# AI_MODEL=\n# AI_BASE_URL=\n# AI_API_KEY=\n' "$(openssl rand -hex 16)" > /etc/idealcraft.env
fi
chmod 600 /etc/idealcraft.env && chown root:root /etc/idealcraft.env
cp deploy/idealcraft-bridge.service /etc/systemd/system/
systemctl daemon-reload
echo "installed. start: sudo systemctl start idealcraft-bridge   settings: sudo nano /etc/idealcraft.env"
