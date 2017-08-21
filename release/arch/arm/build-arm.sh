#!/bin/bash

# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

# Prepare
ARCH="`uname -m | sed -e \"s/86_//\"`"
NVER="v6.11.2"

# Folders
INITIAL_DIRECTORY=`pwd`
ROOT="/tmp/build_duniter"
DOWNLOADS="$ROOT/downloads"
RELEASES="$ROOT/releases"

# -----------
# Clean sources + releases
# -----------
rm -rf "$ROOT"

mkdir -p "$DOWNLOADS"

# -----------
# Downloads
# -----------

cd "$DOWNLOADS"

if [ ! -d "$DOWNLOADS/duniter" ]; then
  git clone https://github.com/duniter/duniter.git
  cd duniter
  COMMIT=`git rev-list --tags --max-count=1`
  DUNITER_TAG=`echo $(git describe --tags $COMMIT) | sed 's/^v//'`
  git checkout "v${DUNITER_TAG}"
  cd ..
fi

DUNITER_VER="$DUNITER_TAG"
DUNITER_DEB_VER=" $DUNITER_TAG"
DUNITER_TAG="v$DUNITER_TAG"

echo "$ARCH"
echo "$NVER"
echo "$DUNITER_VER"
echo "$DUNITER_DEB_VER"

if [ ! -f "$DOWNLOADS/node-${NVER}-linux-${ARCH}.tar.gz" ]; then
  # Download Node.js and package it with the sources
  wget http://nodejs.org/dist/${NVER}/node-${NVER}-linux-${ARCH}.tar.gz
  tar xzf node-${NVER}-linux-${ARCH}.tar.gz
fi

rm -rf "$RELEASES"
mkdir -p "$RELEASES"

cp -r "$DOWNLOADS/duniter" "$RELEASES/duniter"
cd ${RELEASES}/duniter

echo "Copying Nodejs"
cp -R "$DOWNLOADS/node-${NVER}-linux-${ARCH}" node

echo "yarn"
yarn
yarn add duniter-ui@1.4.x --save --production
sed -i "s/duniter\//..\/..\/..\/..\//g" node_modules/duniter-ui/server/controller/webmin.js
SRC=`pwd`
echo $SRC

# Clean unused UI modules
rm -Rf node_modules/duniter-ui/node_modules

# Because we are building in a VM, Node.js could not detect that the target is ARM. So we move the modules' binaries accordingly.
#mv node_modules/naclb/lib/binding/Release/node-v48-linux-x64 node_modules/naclb/lib/binding/Release/node-v48-linux-arm
#mv node_modules/wotb/lib/binding/Release/node-v48-linux-x64 node_modules/wotb/lib/binding/Release/node-v48-linux-arm
#mv node_modules/scryptb/lib/binding/Release/node-v48-linux-x64 node_modules/scryptb/lib/binding/Release/node-v48-linux-arm
#mv node_modules/sqlite3/lib/binding/Release/node-v48-linux-x64 node_modules/sqlite3/lib/binding/Release/node-v48-linux-arm

cd ..
mkdir -p duniter_release
cp -R ${SRC}/* duniter_release/

# Creating DEB packaging
mv duniter_release/release/arch/debian/package duniter-${ARCH}
mkdir -p duniter-${ARCH}/opt/duniter/
chmod 755 duniter-${ARCH}/DEBIAN/post*
chmod 755 duniter-${ARCH}/DEBIAN/pre*
sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" duniter-${ARCH}/DEBIAN/control
cd duniter_release
pwd
rm -Rf .git
echo "Zipping..."
zip -qr ../duniter-desktop.nw *
cd ../
mv duniter-desktop.nw duniter-${ARCH}/opt/duniter/
echo "Making package package"
fakeroot dpkg-deb --build duniter-${ARCH}
mv duniter-${ARCH}.deb "$INITIAL_DIRECTORY/duniter-server-v${DUNITER_VER}-linux-${ARCH}.deb"
