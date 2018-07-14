#!/bin/bash

TAG="v$1"
ARCH=`uname -m`
# Check that the tag exists remotely

if [[ -z $TAG ]]; then
  echo "Wrong call to the command, syntax is:"
  echo ""
  echo "  new_prerelease.sh <tag>"
  echo ""
  echo "Examples:"
  echo ""
  echo "  new_prerelease.sh 1.2.3"
  echo "  new_prerelease.sh 1.4.0"
  echo "  new_prerelease.sh 1.4.1"
  echo ""
  exit 1
fi

echo "Checking that $TAG has been pushed to 'origin'..."

REMOTE_TAG=`git ls-remote --tags origin | grep -Fo "$TAG"`

if [[ -z $REMOTE_TAG ]]; then
  echo "The '$TAG' tag does not exist on 'origin' repository. Use command ./release/new_version.sh to create a new version and use 'git push origin --tags' to share the tag."
  exit 2
fi

echo "Remote tag: $REMOTE_TAG"

echo "Creating the pre-release..."
EXPECTED_ASSETS="duniter-desktop-$TAG-windows-x64.exe
duniter-server-$TAG-linux-armv7l.deb"
for asset in $EXPECTED_ASSETS; do
  if [[ -z `echo $ASSETS | grep -F "$asset"` ]]; then

    echo "Missing asset: $asset"

    # Windows
    if [[ $asset == *".exe" ]]; then
      if [[ $ARCH == "x86_64" ]]; then
        echo "Starting Windows build..."
        ./release/scripts/build.sh make win $TAG
        echo "Windows asset has been successfully built, it is available here : $PWD/release/arch/windows/$asset"
      else
        echo "This computer cannot build this asset, required architecture is 'x86_64'. Skipping."
      fi
    fi

    # ARM
    if [[ $asset == *"armv7"* ]]; then
      if [[ $ARCH == "armv7l" ]]; then
        echo "Starting ARM build..."
        ./release/scripts/build.sh make arm $TAG
        echo "Arm asset has been successfully built, it is available here : $PWD/release/arch/arm/$asset"
      else
        echo "This computer cannot build this asset, required architecture is 'armv7l'. Skipping."
      fi
    fi
  fi
done
