#!/bin/bash

case "$1" in
make)
  case "$2" in
  deb)
    cd vagrant/ubuntu
    [[ $? -eq 0 ]] && echo ">> Starting Vagrant Ubuntu VM..."
    [[ $? -eq 0 ]] && vagrant up
    [[ $? -eq 0 ]] && echo ">> VM: building Duniter..."
    [[ $? -eq 0 ]] && vagrant ssh -- 'bash -s' < ./build-deb.sh
    if [ ! $? -eq 0 ]; then
      echo ">> Something went wrong. Stopping build."
    else
      echo ">> Tests succeed! Continuing build."
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
