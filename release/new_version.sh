#!/bin/bash

### Releasing
current=`grep -P "version\": \"\d+.\d+.\d+(-\w*)" package.json | grep -oP "\d+.\d+.\d+(-\w*)"`
echo "Current version: $current"

if [[ $1 =~ ^[0-9]+.[0-9]+.[0-9]+(-(alpha|beta|rc)[0-9]*)?$ ]]; then
  echo "Changing to version: $1"
  # Change the version in package.json and package-lock.json
  sed -i "s/version\": .*/version\": \"$1\",/" package.json
  sed -i "3 s/version\": .*/version\": \"$1\",/" package-lock.json

  # Debian file
  sed -i "s/Version: .*/Version: $1/" release/extra/debian/package/DEBIAN/control

  # Duniter.iss (Windows installer)
  sed -i "s/define MyAppVerStr.*/define MyAppVerStr \"v$1\"/" release/arch/windows/duniter.iss

  # GUI containers version
  sed -i "s/title\": .*/title\": \"v$1\",/" package.json
  sed -i "s/<title>Duniter.*<\/title>/<title>Duniter $1<\/title>/" gui/index.html

  # Commit
  git reset HEAD
  git add package.json package-lock.json gui/index.html release/extra/debian/package/DEBIAN/control release/arch/windows/duniter.iss
  git commit -m "v$1"
  git tag "v$1"
else
  echo "Wrong version format"
fi
