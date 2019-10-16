#!/bin/bash

BUILDER_TAG="v1.0.1"

TAG="$3"
ORIGIN="$4"
IS_LOCAL_TAG=0

if [[ -z "${TAG}" ]]; then
  # Default tag = YEARMONTHDAY.HOURMINUTE.SECONDS
  TAG="`date +\"%Y%m%d\"`.`date +\"%H%M\"`.`date +\"%S\"`"
  IS_LOCAL_TAG=1
fi

if [[ -z "${ORIGIN}" ]]; then
  # Default tag = local branch name
  ORIGIN="$(cd ./; pwd)"
fi

case "$1" in
make)
  case "$2" in
  arm)
    cd release/arch/arm

    #### PREPARE SOURCE CODE ####
    rm -rf duniter-source
    # Clone from remote
    echo ">> VM: Cloning sources from ${ORIGIN}..."
    git clone "${ORIGIN}" duniter-source
    if [ ${IS_LOCAL_TAG} -eq 1 ]; then
      cd duniter-source
      echo ">> git tag v${TAG}..."
      ./release/new_version.sh "$TAG"
      cd ..
    fi

    ./build-arm.sh ${TAG}

    if [ ! $? -eq 0 ]; then
      echo ">> Something went wrong. Stopping build."
    else
      echo ">> Build success."
    fi
    ;;
  lin)
    cd release/arch/linux
    if [[ ! -f "duniter-desktop-$TAG-linux-x64.deb" ]]; then

      #### PREPARE SOURCE CODE ####
      # Clone from remote
      echo ">> VM: Cloning sources from ${ORIGIN}..."
      git clone "${ORIGIN}" duniter-source
      cd duniter-source
      [[ ${IS_LOCAL_TAG} -eq 1 ]] && ./release/new_version.sh "${TAG}"
      git checkout "v${TAG}"
      cd ..

      docker pull duniter/release-builder:${BUILDER_TAG}
cat <<EOF |
      cd /builds/duniter-source
      bash "release/arch/linux/build-lin.sh" "${TAG}" || exit 1
      exit 0
EOF
      docker run --rm -i -v ${PWD}/duniter-source:/builds/duniter-source duniter/release-builder:${BUILDER_TAG}
      if [ ! $? -eq 0 ]; then
        echo ">> Something went wrong. Stopping build."
      else
        mv duniter-source/work/bin/* .
        echo ">> Build success. Shutting the VM down."
      fi
      rm -rf duniter-source
      echo ">> VM closed."
    else
      echo "Linux binaries already built. Ready for upload."
    fi
    ;;
  win)
    cd release/arch/windows
    if [[ ! -f "duniter-desktop-$TAG-windows-x64.exe" ]]; then

      #### PREPARE SOURCE CODE ####
      rm -rf duniter-source
      # Clone from remote
      echo ">> VM: Cloning sources from ${ORIGIN}..."
      git clone "${ORIGIN}" duniter-source
      echo "${TAG}" > duniter_tag.txt
      if [ ${IS_LOCAL_TAG} -eq 1 ]; then
        cd duniter-source
        ./release/new_version.sh "$TAG"
        cd ..
      fi

      [[ $? -eq 0 ]] && echo ">> Starting Vagrant Windows VM..."
      [[ $? -eq 0 ]] && vagrant up

      rm -f duniter_tag.txt
      if [ ! $? -eq 0 ]; then
        echo ">> Something went wrong. Stopping build."
      fi
      rm -rf ./duniter-source
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
