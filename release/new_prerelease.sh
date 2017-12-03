#!/bin/bash

TAG="v$1"
TOKEN=`cat $HOME/.config/duniter/.github`
ARCH=`uname -m`
ASSETS=
# Check that the tag exists remotely

if [[ ! -z $1 ]]; then
  echo "Checking that $TAG has been pushed to 'origin'..."

  REMOTE_TAG=`git ls-remote --tags origin | grep -Fo "$TAG"`

  if [[ -z $REMOTE_TAG ]]; then
    echo "The '$TAG' tag does not exist on 'origin' repository. Use command ./release/new_version.sh to create a new version and use 'git push origin --tags' to share the tag."
    exit 2
  fi

  echo "Remote tag: $REMOTE_TAG"

  echo "Creating the pre-release..."
  ASSETS=`node ./release/scripts/create-release.js $TOKEN $TAG create`
fi

EXPECTED_ASSETS="duniter-desktop-$TAG-linux-x64.deb
duniter-desktop-$TAG-linux-x64.tar.gz
duniter-server-$TAG-linux-x64.deb
duniter-desktop-$TAG-windows-x64.exe
duniter-server-$TAG-linux-armv7l.deb"
for asset in $EXPECTED_ASSETS; do
  if [[ -z `echo $ASSETS | grep -F "$asset"` ]]; then

    echo "Missing asset: $asset"

    # Debian
    if [[ $asset == *"linux-x64.deb" ]] || [[ $asset == *"linux-x64.tar.gz" ]]; then
      if [[ $ARCH == "x86_64" ]]; then
        echo "Starting Debian build..."
        ./release/scripts/build.sh make deb $TAG
        if [[ ! -z $1 ]]; then
          DEB_PATH="$PWD/release/arch/debian/$asset"
          node ./release/scripts/upload-release.js $TOKEN $TAG $DEB_PATH
        fi
      else
        echo "This computer cannot build this asset, required architecture is 'x86_64'. Skipping."
      fi
    fi

    # Windows
    if [[ $asset == *".exe" ]]; then
      if [[ $ARCH == "x86_64" ]]; then
        echo "Starting Windows build..."
        ./release/scripts/build.sh make win $TAG
        if [[ ! -z $1 ]]; then
          WIN_PATH="$PWD/release/arch/windows/$asset"
          node ./release/scripts/upload-release.js $TOKEN $TAG $WIN_PATH
        fi
      else
        echo "This computer cannot build this asset, required architecture is 'x86_64'. Skipping."
      fi
    fi

    # ARM
    if [[ $asset == *"armv7"* ]]; then
      if [[ $ARCH == "armv7l" ]]; then
        echo "Starting ARM build..."
        ./release/scripts/build.sh make arm $TAG
        if [[ ! -z $1 ]]; then
          ARM_PATH="$PWD/release/arch/arm/$asset"
          node ./release/scripts/upload-release.js $TOKEN $TAG $ARM_PATH
        fi
      else
        echo "This computer cannot build this asset, required architecture is 'armv7l'. Skipping."
      fi
    fi
  fi
done
