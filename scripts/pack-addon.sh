#!/bin/sh
# scripts/pack-addon.sh: builds dist/Cubewright.mcpack from addon/
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/Cubewright.mcpack
(cd addon && zip -qr ../dist/Cubewright.mcpack manifest.json scripts)
echo dist/Cubewright.mcpack
