#!/bin/bash

ARCH=$1
DUNITER_VER=$2
NVER="v5.9.1"
DUNITER_DEB_VER=" $DUNITER_VER"
echo "$ARCH"
echo "$NVER"
echo "$DUNITER_VER"
echo "$DUNITER_DEB_VER"

echo "Downloading Nodejs"
wget http://nodejs.org/dist/${NVER}/node-${NVER}-linux-${ARCH}.tar.gz
echo "Extracting Nodejs"
tar xzf node-${NVER}-linux-${ARCH}.tar.gz
mv node-${NVER}-linux-${ARCH} node
rm node-${NVER}-linux-${ARCH}.tar.gz

echo "npm install"
node/bin/npm install
node/bin/npm prune --production
SRC=`pwd`
echo $SRC
cd ..
mkdir -p duniter_release/sources
cp -R ${SRC}/* duniter_release/sources/
rm -Rf duniter_release/sources/web-ui/node_modules
rm -Rf duniter_release/sources/web-ui/bower_components

# Creating DEB packaging
mv duniter_release/sources/ci/travis/debian duniter-${ARCH}
mkdir -p duniter-${ARCH}/opt/duniter/
chmod 755 duniter-${ARCH}/DEBIAN/post*
chmod 755 duniter-${ARCH}/DEBIAN/pre*
sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" duniter-${ARCH}/DEBIAN/control
cd duniter_release/sources
pwd
rm -Rf .git
echo "Zipping..."
zip -qr ../duniter-desktop.nw *
cd ../..
mv duniter_release/duniter-desktop.nw duniter-${ARCH}/opt/duniter/
echo "Making deb package"
fakeroot dpkg-deb --build duniter-${ARCH}
mv duniter-${ARCH}.deb duniter-v${DUNITER_VER}-linux-${ARCH}.deb
echo "Uploading release..."
./github-release upload -u duniter -r duniter --tag v${DUNITER_VER} --name duniter-v${DUNITER_VER}-linux-${ARCH}.deb --file ./duniter-v${DUNITER_VER}-linux-${ARCH}.deb
