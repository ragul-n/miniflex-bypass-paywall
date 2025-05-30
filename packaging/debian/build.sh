#!/bin/sh

set -e  # Exit on errors

PKG_ARCH=$(dpkg --print-architecture)
PKG_DATE=$(date -R)
PKG_VERSION=$(cd /src && git describe --tags --abbrev=0 | sed 's/^v//')

PKG_VERSION=$(cd /src && git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//')
if [ -z "$PKG_VERSION" ]; then
  PKG_VERSION="0.0.1"
fi

echo "Building Miniflux $PKG_VERSION for $PKG_ARCH"

cd /src

if [ "$PKG_ARCH" = "armhf" ]; then
    make miniflux-no-pie
else
    CGO_ENABLED=0 make miniflux
fi

# Prepare build directory
mkdir -p /build/debian
cd /build
cp /src/miniflux /build/
cp /src/miniflux.1 /build/
cp /src/LICENSE /build/
cp /src/packaging/miniflux.conf /build/
cp /src/packaging/systemd/miniflux.service /build/debian/
cp /src/packaging/debian/* /build/debian/

# Generate changelog
dch --create --package miniflux --newversion "$PKG_VERSION" --distribution unstable \
    --urgency=medium "Miniflux version $PKG_VERSION"

# Replace architecture placeholder
sed "s/__PKG_ARCH__/${PKG_ARCH}/g" /src/packaging/debian/control > /build/debian/control

# Build package
dpkg-buildpackage -us -uc -b
lintian --check --color always ../*.deb
cp ../*.deb /pkg/