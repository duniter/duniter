#!/bin/bash

TAG="$3"

case "$1" in
make)
  case "$2" in
  arm)
    cd release/arch/arm
    ./build-deb.sh
    if [ ! $? -eq 0 ]; then
      echo ">> Something went wrong. Stopping build."
    else
      echo ">> Build success."
    fi
    ;;
  deb)
    cd release/arch/debian
    if [[ ! -f "duniter-desktop-$TAG-linux-x64.deb" ]]; then
      [[ $? -eq 0 ]] && echo ">> Starting Vagrant Ubuntu VM..."
      [[ $? -eq 0 ]] && vagrant up
      [[ $? -eq 0 ]] && echo ">> VM: building Duniter..."
      [[ $? -eq 0 ]] && vagrant ssh -- 'bash -s' < ./build-deb.sh
      if [ ! $? -eq 0 ]; then
        echo ">> Something went wrong. Stopping build."
      else
        echo ">> Build success. Shutting the VM down."
      fi
      vagrant halt
      echo ">> VM closed."
    else
      echo "Debian binaries already built. Ready for upload."
    fi
    ;;
  win)
    cd release/arch/windows
    if [[ ! -f "duniter-desktop-$TAG-windows-x64.exe" ]]; then
      [[ $? -eq 0 ]] && echo ">> Starting Vagrant Windows VM..."
      [[ $? -eq 0 ]] && vagrant up
      if [ ! $? -eq 0 ]; then
        echo ">> Something went wrong. Stopping build."
      fi
      vagrant halt
      echo ">> VM closed."
    else
      echo "Windows binary already built. Ready for upload."
    fi
    ;;
  *)
    echo "Unknown binary « $2 »."
    ;;
  esac
    ;;
*)
  echo "Unknown task « $1 »."
  ;;
esac
