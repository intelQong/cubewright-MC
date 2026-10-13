#!/bin/sh
# scripts/pack-addon.sh: builds dist/IdealCraft.mcpack from addon/
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/IdealCraft.mcpack
(cd addon && zip -qr ../dist/IdealCraft.mcpack manifest.json scripts)
echo dist/IdealCraft.mcpack
