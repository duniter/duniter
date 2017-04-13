#!/bin/bash

# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

# Prepare
NVER=`node -v`
DUNITER_VER=1.2.2
DUNITER_DEB_VER=" $DUNITER_VER"
ADDON_VERSION=48
NW_VERSION=0.17.6
NW_RELEASE="v${NW_VERSION}"
NW="nwjs-${NW_RELEASE}-linux-x64"
NW_GZ="${NW}.tar.gz"

# Folders
ROOT=`pwd`
DOWNLOADS="$ROOT/downloads"
RELEASES="$ROOT/releases"

mkdir -p "$DOWNLOADS"

# -----------
# Downloads
# -----------

cd "$DOWNLOADS"

if [ ! -d "$DOWNLOADS/duniter" ]; then
  git clone https://github.com/duniter/duniter.git
  cd duniter
  git checkout dev # TODO: remove dev
  cd ..
fi

if [ ! -f "$DOWNLOADS/$NW_GZ" ]; then
  wget https://dl.nwjs.io/${NW_RELEASE}/${NW_GZ}
  tar xvzf ${NW_GZ}
fi

if [ ! -f "$DOWNLOADS/node-${NVER}-linux-x64.tar.gz" ]; then
  # Download Node.js and package it with the sources
  wget http://nodejs.org/dist/${NVER}/node-${NVER}-linux-x64.tar.gz
  tar xzf node-${NVER}-linux-x64.tar.gz
fi

# -----------
# Releases
# -----------

rm -rf "$RELEASES"
mkdir -p "$RELEASES"

cp -r "$DOWNLOADS/duniter" "$RELEASES/duniter"
cd "$RELEASES"

# NPM build
cp -r duniter _npm

# Releases builds
cd ${RELEASES}/duniter
# Remove git files
rm -Rf .git
[[ $? -eq 0 ]] && echo ">> VM: building modules..."
[[ $? -eq 0 ]] && yarn
#[[ $? -eq 0 ]] && echo ">> VM: running tests..."
#[[ $? -eq 0 ]] && yarn test

# Clean test and UI packages
[[ $? -eq 0 ]] && echo ">> VM: removing duniter dev modules..."
yarn remove duniter-bma duniter-crawler duniter-keypair duniter-prover --save
[[ $? -eq 0 ]] && echo ">> VM: adding duniter modules..."
yarn add duniter-ui duniter-bma duniter-crawler duniter-keypair duniter-prover --save --production
rm -rf node_modules yarn.lock
yarn --production

# Specific modules that are not needed in a release
rm -rf node_modules/materialize-css
rm -rf node_modules/duniter-ui/app
rm -rf node_modules/duniter-ui/vendor
rm -rf node_modules/scryptb/node_modules/node-pre-gyp
rm -rf node_modules/naclb/node_modules/node-pre-gyp
rm -rf node_modules/wotb/node_modules/node-pre-gyp
rm -rf node_modules/sqlite3/build

cp -r "$RELEASES/duniter" "$RELEASES/desktop_"
cp -r "$RELEASES/duniter" "$RELEASES/server_"

# -------------------------------------------------
# Build Desktop version (Nw.js is embedded)
# -------------------------------------------------

cd "$RELEASES/desktop_"
echo "$NW_RELEASE"

cd "$RELEASES/desktop_/node_modules/wotb"
#yarn --build-from-source
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build
cp lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64/wotb.node lib/binding/Release/node-v$ADDON_VERSION-linux-x64/wotb.node
cd "$RELEASES/desktop_/node_modules/naclb"
#npm install --build-from-source
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build
cp lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64/naclb.node lib/binding/Release/node-v$ADDON_VERSION-linux-x64/naclb.node
cd "$RELEASES/desktop_/node_modules/scryptb"
#npm install --build-from-source
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build
cp lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64/scryptb.node lib/binding/Release/node-v$ADDON_VERSION-linux-x64/scryptb.node
cd "$RELEASES/desktop_/node_modules/sqlite3"
#npm install --build-from-source
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure
node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build
cp lib/binding/node-webkit-$NW_RELEASE-linux-x64/node_sqlite3.node lib/binding/node-v$ADDON_VERSION-linux-x64/node_sqlite3.node

# Unused binaries
cd "$RELEASES/desktop_/"
rm -rf node_modules/sqlite3/build

## Install Nw.js
mkdir -p "$RELEASES/desktop_release"

# -------------------------------------------------
# Build Desktop version .tar.gz
# -------------------------------------------------

cp -r "$DOWNLOADS/${NW}" "$RELEASES/desktop_release/nw"
cp ${RELEASES}/desktop_/gui/* "$RELEASES/desktop_release/nw/"
cp -R "$RELEASES/desktop_/" "$RELEASES/desktop_release/sources/"
cp -R "$RELEASES/desktop_release" "$RELEASES/desktop_release_tgz"
#cd "$RELEASES/desktop_release_tgz/sources/"
#rm -rf node_modules/sqlite3/lib/binding/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/wotb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/naclb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/scryptb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
cd "$RELEASES/desktop_release_tgz"
tar czf /vagrant/duniter-desktop-${DUNITER_VER}-linux-x64.tar.gz * --exclude ".git" --exclude "coverage" --exclude "test"

# -------------------------------------------------
# Build Desktop version .deb
# -------------------------------------------------

# Create .deb tree + package it
cp -r "$RELEASES/desktop_release/sources/ci/travis/debian" "$RELEASES/duniter-x64"
mkdir -p "$RELEASES/duniter-x64/opt/duniter/"
chmod 755 ${RELEASES}/duniter-x64/DEBIAN/post*
chmod 755 ${RELEASES}/duniter-x64/DEBIAN/pre*
sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" ${RELEASES}/duniter-x64/DEBIAN/control
cd ${RELEASES}/desktop_release/sources
#rm -rf node_modules/sqlite3/lib/binding/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/wotb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/naclb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/scryptb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/sqlite3/lib/binding/node-v$ADDON_VERSION-linux-x64
#rm -rf node_modules/wotb/lib/binding/Release/node-v$ADDON_VERSION-linux-x64
#rm -rf node_modules/naclb/lib/binding/Release/node-v$ADDON_VERSION-linux-x64
#rm -rf node_modules/scryptb/lib/binding/Release/node-v$ADDON_VERSION-linux-x64
zip -qr ${RELEASES}/duniter-x64/opt/duniter/duniter-desktop.nw *
cd ${RELEASES}/desktop_release/nw
zip -qr ${RELEASES}/duniter-x64/opt/duniter/nw.nwb *

sed -i "s/Package: .*/Package: duniter-desktop/g" ${RELEASES}/duniter-x64/DEBIAN/control
cd ${RELEASES}/
fakeroot dpkg-deb --build duniter-x64
mv duniter-x64.deb /vagrant/duniter-desktop-${DUNITER_VER}-linux-x64.deb

# -------------------------------------------------
# Build Server version (Node.js is embedded, not Nw.js)
# -------------------------------------------------

cd ${RELEASES}
rm -rf duniter-server-x64
cp -r duniter-x64 duniter-server-x64

# Remove Nw.js
rm -rf duniter-server-x64/opt/duniter/nw*

cd ${RELEASES}/server_
cp -r ${DOWNLOADS}/node-${NVER}-linux-x64 node
zip -qr ${RELEASES}/duniter-server-x64/opt/duniter/duniter-desktop.nw *
cd ${RELEASES}
sed -i "s/Package: .*/Package: duniter/g" ${RELEASES}/duniter-server-x64/DEBIAN/control
rm -rf ${RELEASES}/duniter-server-x64/usr
fakeroot dpkg-deb --build duniter-server-x64
mv duniter-server-x64.deb /vagrant/duniter-server-${DUNITER_VER}-linux-x64.deb
