#!/bin/bash

# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm


# Prepare
NODE_VERSION=10.20.1
ARCH="`uname -m | sed -e \"s/86_//\"`"
NVER="v$NODE_VERSION"
DUNITER_TAG=$1
DUNITER_UI_VER="1.7.x"

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

# Build Duniter with GUI
echo "Build Duniter with GUI..."
export NEON_BUILD_RELEASE="true"
npm add "duniter-ui@${DUNITER_UI_VER}" || exit 1
npm i || exit 1
npm prune --production || exit 1

SRC=`pwd`
echo $SRC

# Clean unused UI modules
rm -Rf node_modules/duniter-ui/node_modules

# Remove non production folders
rm -rf coverage test

# Remove unused rust intermediate binaries
rm -rf target
rm -rf neon/native/target

# Remove typescript files
find ./ \( -name "*.js.map" -o -name "*.d.ts" -o -name "*.ts" \) -delete

cd ..
mkdir -p duniter_release
cp -R ${SRC}/* duniter_release/

# Creating DEB packaging
mv duniter_release/release/extra/debian/package duniter-${ARCH}
mkdir -p duniter-${ARCH}/opt/duniter/
mkdir -p duniter-${ARCH}/etc/bash_completion.d/
chmod 755 duniter-${ARCH}/DEBIAN/post*
chmod 755 duniter-${ARCH}/DEBIAN/pre*
sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" duniter-${ARCH}/DEBIAN/control
echo "Extra..."
mv duniter_release/release/extra/completion/duniter_completion.bash duniter-${ARCH}/etc/bash_completion.d/duniter_completion.bash
echo "Zipping..."
cd duniter_release
pwd
rm -Rf .git
zip -qr ../duniter.zip *
cd ../
mv duniter.zip duniter-${ARCH}/opt/duniter/
echo "Making package package"
fakeroot dpkg-deb --build duniter-${ARCH}
mv duniter-${ARCH}.deb "$INITIAL_DIRECTORY/duniter-server-v${DUNITER_VER}-linux-${ARCH}.deb"
