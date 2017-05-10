#!/bin/bash

TAG="v$1"
TOKEN=`cat $HOME/.config/duniter/.github`
# Check that the tag exists remotely

if [[ -z $TAG ]]; then
  echo "Wrong call to the command, syntax is:"
  echo ""
  echo "  set_release.sh <tag>"
  echo ""
  echo "Examples:"
  echo ""
  echo "  set_release.sh 1.2.3"
  echo "  set_release.sh 1.4.0"
  echo "  set_release.sh 1.4.1"
  echo ""
  exit 1
fi

node ./release/scripts/create-release.js $TOKEN $TAG set $2
