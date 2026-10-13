#!/bin/sh
# deploy/install.sh: copies the bridge to /srv/cubewright and installs the service. Run with sudo from the repo root.
set -e
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
NODE_BIN="${NODE_BIN:-$(command -v node)}"
id cubewright >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin cubewright
mkdir -p /srv/cubewright/bin
cp -r src package.json /srv/cubewright/
cp -r addon /srv/cubewright/        # src/addon.js imports addon/scripts/protocol.js
cp -r node_modules /srv/cubewright/
cp "$NODE_BIN" /srv/cubewright/bin/node.new && mv -f /srv/cubewright/bin/node.new /srv/cubewright/bin/node  # mv: works while the service runs it
chown -R root:root /srv/cubewright && chmod -R go-w /srv/cubewright
if [ ! -f /etc/cubewright.env ]; then
  umask 077
  printf 'WS_HOST=10.100.0.1\nBRIDGE_TOKEN=%s\n# AI_MODEL=\n# AI_BASE_URL=\n# AI_API_KEY=\n' "$(openssl rand -hex 16)" > /etc/cubewright.env
fi
chmod 600 /etc/cubewright.env && chown root:root /etc/cubewright.env
cp deploy/cubewright-bridge.service /etc/systemd/system/
systemctl daemon-reload
echo "installed. start: sudo systemctl start cubewright-bridge   settings: sudo nano /etc/cubewright.env"
