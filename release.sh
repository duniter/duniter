#!/bin/bash

current=`grep -P "version\": \"\d+.\d+.\d+(\w*)" package.json | grep -oP "\d+.\d+.\d+(\w*)"`
echo "Current version: $current"

if [[ $2 =~ ^[0-9]+.[0-9]+.[0-9]+((a|b)[0-9]+)?$ ]]; then
  echo "build $2"
  case "$1" in
    rel|pre)
      # Change the version in package.json and test file
      sed -i "s/version\": \"$current/version\": \"$2/g" package.json
      sed -i "s/version').equal('.*/version').equal('$2');/g" test/integration/branches.js
      sed -i "s/ release: .*/ release: v$2/g" appveyor.yml

      # GUI containers version
      sed -i "s/name\": .*/name\": \"v$2\",/g" gui/package.json
      sed -i "s/title\": .*/title\": \"v$2\",/g" gui/package.json
      sed -i "s/<title>Duniter<\/title>/<title>Duniter v$2<\/title>/g" gui/index.html

      # (pre)-release management
      if [[ "$1" =~ ^rel$ ]]; then
        # This is RELEASE: change the version in public installer + add the RELEASE flag
        sed -i "s/echo \"v.*\"/echo \"v$2\"/g" install.sh
        sed -i "s/.*prerelease: true/#  prerelease: true/g" .travis.yml appveyor.yml
      fi
      if [[ "$1" =~ ^pre$ ]]; then
        # This is RELEASE: just change the RELEASE flag to PRERELEASE
        sed -i "s/#  prerelease: true/  prerelease: true/g" .travis.yml appveyor.yml
      fi
      ;;
    *)
      echo "No task given"
      ;;
  esac

  # Commit
  git reset HEAD
  case "$1" in
    rel)
      git add package.json .travis.yml appveyor.yml test/integration/branches.js gui/package.json gui/index.html install.sh
      ;;
    pre)
      git add package.json .travis.yml appveyor.yml test/integration/branches.js gui/package.json gui/index.html
      ;;
  esac
  git commit -m "v$2"
  git tag "v$2"
else
  echo "Wrong version format"
fi
