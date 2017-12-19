#!/bin/bash

# NVM
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

# Prepare
NODE_VERSION=8.9.1
NVER="v$NODE_VERSION"
DUNITER_TAG=$1
ADDON_VERSION=57
NW_VERSION=0.24.4
NW_RELEASE="v${NW_VERSION}"
NW="nwjs-${NW_RELEASE}-linux-x64"
NW_GZ="${NW}.tar.gz"
DUNITER_SRC=/dunidata/duniter-source

nvm install ${NVER}
nvm use ${NVER}
npm install -g node-pre-gyp
npm install -g nw-gyp
# Folders
ROOT=`pwd`
DOWNLOADS="$ROOT/downloads"
RELEASES="$ROOT/releases"

mkdir -p "$DOWNLOADS" || exit 1

# -----------
# Clean up
# -----------
rm -rf /dunidata/*.deb
rm -rf /dunidata/*.tar.gz

# -----------
# Sources and downloads
# -----------

DUNITER_DEB_VER=" $DUNITER_TAG"
DUNITER_TAG="v$DUNITER_TAG"

cd "${DUNITER_SRC}"
git checkout "${DUNITER_TAG}" || exit 1

cd "$DOWNLOADS"
curl -O https://dl.nwjs.io/${NW_RELEASE}/${NW_GZ} || exit 1
tar xzf ${NW_GZ} || exit 1
# Download Node.js and package it with the sources
curl -O http://nodejs.org/dist/${NVER}/node-${NVER}-linux-x64.tar.gz || exit 1
tar xzf node-${NVER}-linux-x64.tar.gz || exit 1

# -----------
# Releases
# -----------

mkdir -p "$RELEASES" || exit 1
cp -r "${DUNITER_SRC}" "$RELEASES/duniter" || exit 1

# Releases builds
cd ${RELEASES}/duniter
# Remove git files
rm -Rf .git
[[ $? -eq 0 ]] && echo ">> VM: building modules..."
[[ $? -eq 0 ]] && npm install

# Duniter UI
[[ $? -eq 0 ]] && npm install duniter-ui@1.6.x
[[ $? -eq 0 ]] && npm prune --production

[[ $? -eq 0 ]] || exit 1

cp -r "$RELEASES/duniter" "$RELEASES/desktop_" || exit 1
cp -r "$RELEASES/duniter" "$RELEASES/server_" || exit 1

# -------------------------------------------------
# Build Desktop version (Nw.js is embedded)
# -------------------------------------------------

echo "$NW_RELEASE"

# FIX: bug of nw.js, we need to patch first.
# TODO: remove this patch once a correct version of Nw.js is out (NodeJS 8 or 9 if the above modules are compliant)
cd "$RELEASES/desktop_/node_modules/wotb"
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure \
  || echo "This failure is expected"
cp /dunidata/0.24.4_common.gypi ~/.nw-gyp/0.24.4/common.gypi || exit 1

cd "$RELEASES/desktop_/node_modules/wotb"
#yarn --build-from-source
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure || exit 1
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build || exit 1
cp lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64/wotb.node \
  lib/binding/Release/node-v$ADDON_VERSION-linux-x64/wotb.node || exit 1
cd "$RELEASES/desktop_/node_modules/naclb"
#npm install --build-from-source
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure || exit 1
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build || exit 1
cp lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64/naclb.node \
  lib/binding/Release/node-v$ADDON_VERSION-linux-x64/naclb.node || exit 1
cd "$RELEASES/desktop_/node_modules/scryptb"
#npm install --build-from-source
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure || exit 1
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build || exit 1
cp lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64/scryptb.node \
  lib/binding/Release/node-v$ADDON_VERSION-linux-x64/scryptb.node || exit 1
cd "$RELEASES/desktop_/node_modules/sqlite3"
#npm install --build-from-source
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure || exit 1
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build || exit 1
cp lib/binding/node-webkit-$NW_RELEASE-linux-x64/node_sqlite3.node \
  lib/binding/node-v$ADDON_VERSION-linux-x64/node_sqlite3.node || exit 1

# Unused binaries
cd "$RELEASES/desktop_/"
rm -rf node_modules/sqlite3/build
#rm -rf node_modules/naclb/build
#rm -rf node_modules/wotb/build
#rm -rf node_modules/scryptb/build

## Install Nw.js
mkdir -p "$RELEASES/desktop_release" || exit 1

# -------------------------------------------------
# Build Desktop version .tar.gz
# -------------------------------------------------

cp -r $DOWNLOADS/${NW}/* "$RELEASES/desktop_release/" || exit 1
# Embed Node.js with Nw.js to make Duniter modules installable
cp -r ${DOWNLOADS}/node-${NVER}-linux-x64/lib "$RELEASES/desktop_release/" || exit 1
cp -r ${DOWNLOADS}/node-${NVER}-linux-x64/include "$RELEASES/desktop_release/" || exit 1
cp -r ${DOWNLOADS}/node-${NVER}-linux-x64/bin "$RELEASES/desktop_release/" || exit 1
# Add some specific files for GUI
cp ${RELEASES}/desktop_/gui/* "$RELEASES/desktop_release/" || exit 1
# Add Duniter sources
cp -R $RELEASES/desktop_/* "$RELEASES/desktop_release/" || exit 1
## Insert Nw specific fields while they do not exist (1.3.3)
sed -i "s/\"main\": \"index.js\",/\"main\": \"index.html\",/" "$RELEASES/desktop_release/package.json" || exit 1
# Add links for Node.js + NPM
cd "$RELEASES/desktop_release/bin"
ln -s ../lib/node_modules/npm/bin/npm-cli.js ./npm -f || exit 1
cd ..
ln -s ./bin/node node -f || exit 1
ln -s ./bin/npm npm -f || exit 1
#sed -i "s/\"node-main\": \"\.\.\/sources\/bin\/duniter\",/\"node-main\": \".\/bin\/duniter\",/" "$RELEASES/desktop_release/package.json"
# Create a copy for TGZ binary
cp -R "$RELEASES/desktop_release" "$RELEASES/desktop_release_tgz" || exit 1
#cd "$RELEASES/desktop_release_tgz/"
#rm -rf node_modules/sqlite3/lib/binding/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/wotb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/naclb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/scryptb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
cd "$RELEASES/desktop_release_tgz"
tar czf /duniter/duniter-desktop-${DUNITER_TAG}-linux-x64.tar.gz * --exclude "coverage" --exclude "test" || exit 1

# -------------------------------------------------
# Build Desktop version .deb
# -------------------------------------------------

# Create .deb tree + package it
#cp -r "$RELEASES/desktop_release/release/arch/debian/package" "$RELEASES/duniter-x64"
cp -r "/dunidata/package" "$RELEASES/duniter-x64" || exit 1
mkdir -p "$RELEASES/duniter-x64/opt/duniter/" || exit 1
chmod 755 ${RELEASES}/duniter-x64/DEBIAN/post*
chmod 755 ${RELEASES}/duniter-x64/DEBIAN/pre*
sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" ${RELEASES}/duniter-x64/DEBIAN/control || exit 1
cd ${RELEASES}/desktop_release/
#rm -rf node_modules/sqlite3/lib/binding/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/wotb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/naclb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/scryptb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/sqlite3/lib/binding/node-v$ADDON_VERSION-linux-x64
#rm -rf node_modules/wotb/lib/binding/Release/node-v$ADDON_VERSION-linux-x64
#rm -rf node_modules/naclb/lib/binding/Release/node-v$ADDON_VERSION-linux-x64
#rm -rf node_modules/scryptb/lib/binding/Release/node-v$ADDON_VERSION-linux-x64
zip -qr ${RELEASES}/duniter-x64/opt/duniter/duniter-desktop.nw * || exit 1

sed -i "s/Package: .*/Package: duniter-desktop/g" ${RELEASES}/duniter-x64/DEBIAN/control || exit 1
cd ${RELEASES}/
fakeroot dpkg-deb --build duniter-x64 || exit 1
mv duniter-x64.deb /duniter/duniter-desktop-${DUNITER_TAG}-linux-x64.deb || exit 1

# -------------------------------------------------
# Build Server version (Node.js is embedded, not Nw.js)
# -------------------------------------------------

cd ${RELEASES}
rm -rf duniter-server-x64
cp -r duniter-x64 duniter-server-x64 || exit 1

# Remove Nw.js
rm -rf duniter-server-x64/opt/duniter/duniter-desktop.nw*

cd ${RELEASES}/server_
cp -r ${DOWNLOADS}/node-${NVER}-linux-x64 node || exit 1
zip -qr ${RELEASES}/duniter-server-x64/opt/duniter/duniter-desktop.nw * || exit 1
cd ${RELEASES}
sed -i "s/Package: .*/Package: duniter/g" ${RELEASES}/duniter-server-x64/DEBIAN/control || exit 1
rm -rf ${RELEASES}/duniter-server-x64/usr
fakeroot dpkg-deb --build duniter-server-x64 || exit 1
mv duniter-server-x64.deb /duniter/duniter-server-${DUNITER_TAG}-linux-x64.deb || exit 1
