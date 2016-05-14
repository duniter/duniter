#!/bin/bash

export GITHUB_TOKEN=92472757742be0862c0020197ce7896b66043742
rm -Rf ucoin*
rm -Rf duniter*
git clone https://github.com/duniter/duniter
cd duniter
echo "Fetching tags..."
git fetch --tags
COMMIT=`git rev-list --tags --max-count=1`
DUNITER_VER=`echo $(git describe --tags $COMMIT) | sed 's/^v//'`
ARCH=`uname -m | sed "s/86_//"`
url="https://github.com/duniter/duniter/releases/download/v${DUNITER_VER}/duniter-v${DUNITER_VER}-linux-${ARCH}.deb"
echo $DUNITER_VER
echo "Checking if release exists..."
if curl --output /dev/null --silent --head --fail "$url"; then
  echo "Artifact already published."
else
  echo "Checkout to last tag..."
  echo ">> Release v$DUNITER_VER"
  git checkout v$DUNITER_VER
  NVER="v5.9.1"
  DUNITER_DEB_VER=" $DUNITER_VER"
  echo "$ARCH"
  echo "$NVER"
  echo "$DUNITER_VER"
  echo "$DUNITER_DEB_VER"
  wget http://nodejs.org/dist/${NVER}/node-${NVER}-linux-${ARCH}.tar.gz
  tar xzf node-${NVER}-linux-${ARCH}.tar.gz
  mv node-${NVER}-linux-${ARCH} node
  rm node-${NVER}-linux-${ARCH}.tar.gz
  node/bin/npm install
  node/bin/npm prune --production
  SRC=`pwd`
  echo $SRC
  cd ..
  mkdir -p duniter_release
  cp -R ${SRC}/ duniter_release/sources/
  mv duniter_release/sources/node duniter_release
  rm -Rf duniter_release/sources/ui/package/node_modules
  rm -Rf duniter_release/sources/ui/package/bower_components
  git clone https://github.com/ucoin-io/debpkg.git duniter-${ARCH}
  rm -Rf duniter-${ARCH}/.git
  mkdir -p duniter-${ARCH}/opt/duniter/
  chmod 755 duniter-${ARCH}/DEBIAN/post*
  chmod 755 duniter-${ARCH}/DEBIAN/pre*
  sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" duniter-${ARCH}/DEBIAN/control
  cd duniter_release/sources
  pwd
  rm -Rf .git
  zip -qr ../duniter-desktop.nw *
  cd ../..
  mv duniter_release/duniter-desktop.nw duniter-${ARCH}/opt/duniter/
  mv duniter_release/node duniter-${ARCH}/opt/duniter/
  fakeroot dpkg-deb --build duniter-${ARCH}
  mv duniter-${ARCH}.deb duniter-v${DUNITER_VER}-linux-${ARCH}.deb
  ./github-release upload -u ucoin-io -r ucoin --tag v${DUNITER_VER} --name duniter-v${DUNITER_VER}-linux-${ARCH}.deb --file ~/dev/duniter-v${DUNITER_VER}-linux-${ARCH}.deb
fi
