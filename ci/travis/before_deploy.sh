#!/usr/bin/env bash

if [[ ! -f before_deploy ]]; then

  # Process this only once
  touch before_deploy

  # Clean testing packages
  npm prune --production

  cd ..
  cp -R duniter gh_duniter

  #### GitHub release
  cd gh_duniter

  # Install UI
  cd web-ui
  git submodule init
  git submodule update
  npm install
  cd ..

  # Download Node.js
  NVER=`node -v`
  DUNITER_VER=`git describe --exact-match --tags $(git log -n1 --pretty='%h') | grep -Po "\d.*"`
  DUNITER_DEB_VER=" $DUNITER_VER"
  wget http://nodejs.org/dist/${NVER}/node-${NVER}-linux-x64.tar.gz
  tar xzf node-${NVER}-linux-x64.tar.gz
  mv node-${NVER}-linux-x64 node
  rm node-${NVER}-linux-x64.tar.gz

  tar czf ../../ucoin-x64.tar.gz ./ --exclude ".git" --exclude "coverage" --exclude "test"
  SRC=`pwd`
  cd ..

  # Install Nw.js
  mkdir ucoin_release
  NW_RELEASE="v0.17.6"
  NW="nwjs-${NW_RELEASE}-linux-x64"
  NW_GZ="${NW}.tar.gz"
  wget http://dl.nwjs.io/${NW_RELEASE}/${NW_GZ}
  tar xvzf ${NW_GZ}
  mv ${NW} ucoin_release/nw
  cp ${SRC}/gui/* ucoin_release/nw/
  cp -R ${SRC}/ ucoin_release/sources/
  rm -Rf ucoin_release/sources/web-ui/node_modules
  rm -Rf ucoin_release/sources/web-ui/bower_components
  cd ucoin_release
  tar czf ../duniter-x64.tar.gz * --exclude ".git" --exclude "coverage" --exclude "test"
  cd ..

  # Create .deb tree + package it
  mv ucoin_release/sources/ci/travis/debian duniter-x64
  mkdir -p duniter-x64/opt/duniter/
  chmod 755 duniter-x64/DEBIAN/post*
  chmod 755 duniter-x64/DEBIAN/pre*
  sed -i "s/Version:.*/Version:$DUNITER_DEB_VER/g" duniter-x64/DEBIAN/control
  cd ucoin_release/sources
  rm -Rf .git
  zip -qr ../duniter-desktop.nw *
  cd ../nw
  zip -qr ../nw.nwb *
  cd ../..
  mv ucoin_release/duniter-desktop.nw duniter-x64/opt/duniter/
  mv ucoin_release/nw.nwb duniter-x64/opt/duniter/
  fakeroot dpkg-deb --build duniter-x64
  mv duniter-x64.deb ../duniter-${TRAVIS_TAG}-${TRAVIS_OS_NAME}-x64.deb
  mv duniter-x64.tar.gz ../duniter-${TRAVIS_TAG}-${TRAVIS_OS_NAME}-x64.tar.gz
  pwd
  ls -al
  pwd
  ls -al ../

  ###### NPM release
  cd ../duniter
fi
