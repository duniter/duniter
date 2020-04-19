#!/bin/bash

# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm


# Prepare
NODE_VERSION=10.19.0
ARCH="`uname -m | sed -e \"s/86_//\"`"
NVER="v$NODE_VERSION"
DUNITER_TAG=$1

# Folders
INITIAL_DIRECTORY=`pwd`
ROOT="/tmp/build_duniter"
DOWNLOADS="$ROOT/downloads"
RELEASES="$ROOT/releases"

nvm install ${NODE_VERSION}
nvm use ${NODE_VERSION}
curl https://sh.rustup.rs -sSf | sh -s -- -y
export PATH="$HOME/.cargo/bin:$PATH"

echo "Version de NodeJS : `node -v`"

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
  mv "$INITIAL_DIRECTORY/duniter-source" duniter
  cd duniter
  git checkout "v${DUNITER_TAG}"
  cd ..
fi

DUNITER_VER="$DUNITER_TAG"
DUNITER_DEB_VER=" $DUNITER_TAG"
DUNITER_TAG="v$DUNITER_TAG"

echo "Arch: $ARCH"
echo "Nver: $NVER"
echo "DuniterVer: $DUNITER_VER"
echo "DebianVer: $DUNITER_DEB_VER"

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

yarn

yarn add duniter-ui@1.7.x --production
SRC=`pwd`
echo $SRC

# Clean unused UI modules
rm -Rf node_modules/duniter-ui/node_modules

# Remove non production folders
rm -rf coverage test

# Remove unused duniteroxyde intermediate binaries
rm -rf node_modules/duniteroxyde/target
rm -rf node_modules/duniteroxyde/native/target

cd ..
mkdir -p duniter_release
cp -R ${SRC}/* duniter_release/

# Creating DEB packaging
mv duniter_release/release/extra/debian/package duniter-${ARCH}
mkdir -p duniter-${ARCH}/opt/duniter/
chmod 755 duniter-${ARCH}/DEBIAN/post*
chmod 755 duniter-${ARCH}/DEBIAN/pre*
sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" duniter-${ARCH}/DEBIAN/control
cd duniter_release
pwd
rm -Rf .git
echo "Zipping..."
zip -qr ../duniter.zip *
cd ../
mv duniter.zip duniter-${ARCH}/opt/duniter/
echo "Making package package"
fakeroot dpkg-deb --build duniter-${ARCH}
mv duniter-${ARCH}.deb "$INITIAL_DIRECTORY/duniter-server-v${DUNITER_VER}-linux-${ARCH}.deb"
