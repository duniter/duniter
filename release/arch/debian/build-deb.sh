#!/bin/bash

# NVM
export NVM_DIR="$HOME/.nvm"
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

nvm install ${NVER}
nvm use ${NVER}
npm install -g node-pre-gyp
npm install -g nw-gyp
# Folders
ROOT=`pwd`
DOWNLOADS="$ROOT/downloads"
RELEASES="$ROOT/releases"

mkdir -p "$DOWNLOADS"

# -----------
# Clean sources + releases
# -----------
rm -rf "$DOWNLOADS/duniter"
rm -rf "$RELEASES"
rm -rf /vagrant/*.deb
rm -rf /vagrant/*.tar.gz

# -----------
# Downloads
# -----------

cd "$DOWNLOADS"

if [ ! -d "$DOWNLOADS/duniter" ]; then
  mv /vagrant/duniter-source duniter
  cd duniter
  git checkout "v${DUNITER_TAG}"
  cd ..
fi

DUNITER_DEB_VER=" $DUNITER_TAG"
DUNITER_TAG="v$DUNITER_TAG"

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

# Duniter UI
[[ $? -eq 0 ]] && yarn add duniter-ui@1.6.x

[[ $? -eq 0 ]] && npm prune --production


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

# FIX: bug of nw.js, we need to patch first.
# TODO: remove this patch once a correct version of Nw.js is out (NodeJS 8 or 9 if the above modules are compliant)
cp /vagrant/0.24.4_common.gypi ~/.nw-gyp/0.24.4/common.gypi

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
#rm -rf node_modules/naclb/build
#rm -rf node_modules/wotb/build
#rm -rf node_modules/scryptb/build

## Install Nw.js
mkdir -p "$RELEASES/desktop_release"

# -------------------------------------------------
# Build Desktop version .tar.gz
# -------------------------------------------------

cp -r $DOWNLOADS/${NW}/* "$RELEASES/desktop_release/"
# Embed Node.js with Nw.js to make Duniter modules installable
cp -r ${DOWNLOADS}/node-${NVER}-linux-x64/lib "$RELEASES/desktop_release/"
cp -r ${DOWNLOADS}/node-${NVER}-linux-x64/include "$RELEASES/desktop_release/"
cp -r ${DOWNLOADS}/node-${NVER}-linux-x64/bin "$RELEASES/desktop_release/"
# Add some specific files for GUI
cp ${RELEASES}/desktop_/gui/* "$RELEASES/desktop_release/"
# Add Duniter sources
cp -R $RELEASES/desktop_/* "$RELEASES/desktop_release/"
## Insert Nw specific fields while they do not exist (1.3.3)
sed -i "s/\"main\": \"index.js\",/\"main\": \"index.html\",/" "$RELEASES/desktop_release/package.json"
# Add links for Node.js + NPM
cd "$RELEASES/desktop_release/bin"
ln -s ../lib/node_modules/npm/bin/npm-cli.js ./npm -f
cd ..
ln -s ./bin/node node -f
ln -s ./bin/npm npm -f
#sed -i "s/\"node-main\": \"\.\.\/sources\/bin\/duniter\",/\"node-main\": \".\/bin\/duniter\",/" "$RELEASES/desktop_release/package.json"
# Create a copy for TGZ binary
cp -R "$RELEASES/desktop_release" "$RELEASES/desktop_release_tgz"
#cd "$RELEASES/desktop_release_tgz/"
#rm -rf node_modules/sqlite3/lib/binding/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/wotb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/naclb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/scryptb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
cd "$RELEASES/desktop_release_tgz"
tar czf /vagrant/duniter-desktop-${DUNITER_TAG}-linux-x64.tar.gz * --exclude ".git" --exclude "coverage" --exclude "test"

# -------------------------------------------------
# Build Desktop version .deb
# -------------------------------------------------

# Create .deb tree + package it
#cp -r "$RELEASES/desktop_release/release/arch/debian/package" "$RELEASES/duniter-x64"
cp -r "/vagrant/package" "$RELEASES/duniter-x64"
mkdir -p "$RELEASES/duniter-x64/opt/duniter/"
chmod 755 ${RELEASES}/duniter-x64/DEBIAN/post*
chmod 755 ${RELEASES}/duniter-x64/DEBIAN/pre*
sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" ${RELEASES}/duniter-x64/DEBIAN/control
cd ${RELEASES}/desktop_release/
#rm -rf node_modules/sqlite3/lib/binding/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/wotb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/naclb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/scryptb/lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64
#rm -rf node_modules/sqlite3/lib/binding/node-v$ADDON_VERSION-linux-x64
#rm -rf node_modules/wotb/lib/binding/Release/node-v$ADDON_VERSION-linux-x64
#rm -rf node_modules/naclb/lib/binding/Release/node-v$ADDON_VERSION-linux-x64
#rm -rf node_modules/scryptb/lib/binding/Release/node-v$ADDON_VERSION-linux-x64
zip -qr ${RELEASES}/duniter-x64/opt/duniter/duniter-desktop.nw *

sed -i "s/Package: .*/Package: duniter-desktop/g" ${RELEASES}/duniter-x64/DEBIAN/control
cd ${RELEASES}/
fakeroot dpkg-deb --build duniter-x64
mv duniter-x64.deb /vagrant/duniter-desktop-${DUNITER_TAG}-linux-x64.deb

# -------------------------------------------------
# Build Server version (Node.js is embedded, not Nw.js)
# -------------------------------------------------

cd ${RELEASES}
rm -rf duniter-server-x64
cp -r duniter-x64 duniter-server-x64

# Remove Nw.js
rm -rf duniter-server-x64/opt/duniter/duniter-desktop.nw*

cd ${RELEASES}/server_
cp -r ${DOWNLOADS}/node-${NVER}-linux-x64 node
zip -qr ${RELEASES}/duniter-server-x64/opt/duniter/duniter-desktop.nw *
cd ${RELEASES}
sed -i "s/Package: .*/Package: duniter/g" ${RELEASES}/duniter-server-x64/DEBIAN/control
rm -rf ${RELEASES}/duniter-server-x64/usr
mkdir -p ${RELEASES}/duniter-server-x64/lib/systemd/system
cp "${RELEASES}/duniter/release/contrib/systemd/duniter.service" ${RELEASES}/duniter-server-x64/lib/systemd/system
fakeroot dpkg-deb --build duniter-server-x64
mv duniter-server-x64.deb /vagrant/duniter-server-${DUNITER_TAG}-linux-x64.deb
