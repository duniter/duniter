#!/bin/bash

### Control that the script is run on `dev` branch
branch=`git rev-parse --abbrev-ref HEAD`
if [[ ! "$branch" = "dev" ]];
then
  echo ">> This script must be run under \`dev\` branch"
  exit
fi

### Releasing
current=`grep -P "version\": \"\d+.\d+.\d+(\w*)" package.json | grep -oP "\d+.\d+.\d+(\w*)"`
echo "Current version: $current"

if [[ $1 =~ ^[0-9]+.[0-9]+.[0-9]+((a|b)[0-9]+)?$ ]]; then
  echo "Changing to version: $1"
  # Change the version in package.json and test file
  sed -i "s/version\": .*/version\": \"$1\",/g" package.json
  sed -i "s/Version: .*/Version: $1/g" release/arch/debian/package/DEBIAN/control
  sed -i "s/version').equal('.*/version').equal('$1');/g" test/integration/branches.js
  sed -i "s/ release: .*/ release: v$1/g" appveyor.yml

  # GUI containers version
  sed -i "s/name\": .*/name\": \"v$1\",/g" gui/package.json
  sed -i "s/title\": .*/title\": \"v$1\",/g" gui/package.json
  sed -i "s/<title>Duniter.*<\/title>/<title>Duniter $1<\/title>/g" gui/index.html

  # Bump the install.sh
  sed -i "s/echo \"v.*\"/echo \"v$1\"/g" install.sh

  # Commit
  git reset HEAD
  git add install.sh package.json test/integration/branches.js gui/package.json gui/index.html release/arch/debian/package/DEBIAN/control install.sh
  git commit -m "v$1"
  git tag "v$1"
else
  echo "Wrong version format"
fi
