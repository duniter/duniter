#!/usr/bin/env bash

if [[ ! -f before_deploy ]]; then

  # Process this only once
  touch before_deploy

  # Prepare
  NVER=`node -v`
  DUNITER_VER=0.60.0
  DUNITER_DEB_VER=" $DUNITER_VER"
  ADDON_VERSION=48
  NW_VERSION=0.17.6
  NW_RELEASE="v${NW_VERSION}"
  NW="nwjs-${NW_RELEASE}-linux-x64"
  NW_GZ="${NW}.tar.gz"

  # Clean testing packages
  npm prune --production

  SRC=`pwd`

  cd ..
  cp -r $SRC npm_ # This one should no more be touched

  # Install UI (common to desktop and server)
  cd $SRC/web-ui
  git submodule init
  git submodule update
  npm install
  rm -Rf node_modules
  rm -Rf bower_components
  cd ..

  cd ..
  cp -r $SRC desktop_

  # Remove git files
  rm -Rf .git

  # -------------------------------------------------
  # Build Desktop version (Nw.js is embedded)
  # -------------------------------------------------

  cd desktop_
  SRC=`pwd`
  echo $SRC
  echo $NW_RELEASE

  npm install -g nw-gyp node-pre-gyp
  cd node_modules/wotb
  npm install --build-from-source
  node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure
  node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build
  cp lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64/wotb.node lib/binding/Release/node-v$ADDON_VERSION-linux-x64/wotb.node
  cd ../..
  cd node_modules/naclb
  npm install --build-from-source
  node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure
  node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build
  cp lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64/naclb.node lib/binding/Release/node-v$ADDON_VERSION-linux-x64/naclb.node
  cd ../..
  cd node_modules/scryptb
  npm install --build-from-source
  node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure
  node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build
  cp lib/binding/Release/node-webkit-$NW_RELEASE-linux-x64/scryptb.node lib/binding/Release/node-v$ADDON_VERSION-linux-x64/scryptb.node
  cd ../..
  cd node_modules/sqlite3
  npm install --build-from-source
  node-pre-gyp --runtime=node-webkit --target=$NW_VERSION configure
  node-pre-gyp --runtime=node-webkit --target=$NW_VERSION build
  cp lib/binding/node-webkit-$NW_RELEASE-linux-x64/node_sqlite3.node lib/binding/node-v$ADDON_VERSION-linux-x64/node_sqlite3.node
  cd ../..
  cd ..

  # Install Nw.js
  mkdir desktop_release

  PWD=`pwd`
  SRC="$PWD/desktop_"
  wget http://dl.nwjs.io/${NW_RELEASE}/${NW_GZ}
  tar xvzf ${NW_GZ}
  mv ${NW} desktop_release/nw
  cp ${SRC}/gui/* desktop_release/nw/
  cp -R ${SRC}/ desktop_release/sources/
  cd desktop_release
  tar czf ../../duniter-desktop-${TRAVIS_TAG}-${TRAVIS_OS_NAME}-x64.tar.gz * --exclude ".git" --exclude "coverage" --exclude "test"
  cd ..

  # -------------------------------------------------
  # Build Desktop version (Node.js is embedded, not Nw.js)
  # -------------------------------------------------

  # Create .deb tree + package it
  mv desktop_release/sources/ci/travis/debian duniter-x64
  mkdir -p duniter-x64/opt/duniter/
  chmod 755 duniter-x64/DEBIAN/post*
  chmod 755 duniter-x64/DEBIAN/pre*
  sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" duniter-x64/DEBIAN/control
  cd desktop_release/sources
  zip -qr ../duniter-desktop.nw *
  cd ../nw
  zip -qr ../nw.nwb *
  cd ../..
  mv desktop_release/duniter-desktop.nw duniter-x64/opt/duniter/
  mv desktop_release/nw.nwb duniter-x64/opt/duniter/

  # Server TGZ release
  sed -i "s/Package: .*/Package: duniter-desktop/g" duniter-x64/DEBIAN/control
  fakeroot dpkg-deb --build duniter-x64
  mv duniter-x64.deb ../duniter-desktop-${TRAVIS_TAG}-${TRAVIS_OS_NAME}-x64.deb

  # -------------------------------------------------
  # Build Desktop version (Node.js is embedded, not Nw.js)
  # -------------------------------------------------

  # Remove Nw.js
  rm -rf duniter-x64/opt/duniter/nw*

  # Rebuild node addons
  cd desktop_release/sources/
  rm -rf node_modules
  npm install --production

  # Download Node.js and package it with the sources
  wget http://nodejs.org/dist/${NVER}/node-${NVER}-linux-x64.tar.gz
  tar xzf node-${NVER}-linux-x64.tar.gz
  mv node-${NVER}-linux-x64 node
  rm node-${NVER}-linux-x64.tar.gz
  rm -rf ../duniter-desktop.nw
  zip -qr ../duniter-desktop.nw *
  cd ../..
  rm -rf duniter-x64/opt/duniter/duniter-desktop.nw
  mv desktop_release/duniter-desktop.nw duniter-x64/opt/duniter/
  sed -i "s/Package: .*/Package: duniter/g" duniter-x64/DEBIAN/control
  rm -rf duniter-x64/DEBIAN/usr
  fakeroot dpkg-deb --build duniter-x64
  mv duniter-x64.deb ../duniter-server-${TRAVIS_TAG}-${TRAVIS_OS_NAME}-x64.deb

  pwd
  ls -al

  ###### NPM release
  cd duniter
fi
