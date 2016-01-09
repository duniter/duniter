#!/bin/bash

{ # this ensures the entire script is downloaded #

ucoin_has() {
  type "$1" > /dev/null 2>&1
}

if [ -z "$UCOIN_DIR" ]; then
  UCOIN_DIR="$HOME/.ucoin"
fi

ucoin_latest_version() {
  echo "v0.13.3"
}

ucoin_repo_url() {
  echo "https://github.com/ucoin-io/ucoin.git"
}

ucoin_download() {
  if ucoin_has "curl"; then
    curl -qkL $*
  elif ucoin_has "wget"; then
    # Emulate curl with wget
    ARGS=$(echo "$*" | command sed -e 's/--progress-bar /--progress=bar /' \
                           -e 's/-L //' \
                           -e 's/-I /--server-response /' \
                           -e 's/-s /-q /' \
                           -e 's/-o /-O /' \
                           -e 's/-C - /-c /')
    wget $ARGS
  fi
}

ucoin_is_ubuntu_install() {
  local distribution
  distribution=`cat /etc/*-release file 2>/dev/null | grep "Ubuntu"`
  if [[ "$distribution" = *Ubuntu* ]]; then
    return 0
  else
    return 1
  fi
}

ucoin_is_debian_install() {
  local distribution
  distribution=`cat /etc/*-release file 2>/dev/null | grep "Debian"`
  if [[ "$distribution" = *Debian* ]]; then
    return 0
  else
    return 1
  fi
}

ucoin_is_fedora_install() {
  local distribution
  distribution=`cat /etc/*-release file 2>/dev/null | grep "Fedora"`
  if [[ "$distribution" = *Fedora* ]]; then
    return 0
  else
    return 1
  fi
}

install_ucoin_from_git() {

  if ! ucoin_has "make"; then
    if ucoin_is_ubuntu_install; then
      echo "=> make is not available. Please install 'build-essential' package with 'sudo apt-get install build-essential' command, then retry uCoin installation."
      exit 1
    fi
    if ucoin_is_debian_install; then
      echo "=> make is not available. Please install 'build-essentials' package with 'apt-get install build-essential' command as root, then retry uCoin installation."
      exit 1
    fi
  fi
  if ! ucoin_has "g++"; then
    if ucoin_is_ubuntu_install; then
      echo "=> g++ is not available. Please install 'build-essential' package with 'sudo apt-get install build-essential' command, then retry uCoin installation."
      exit 1
    elif ucoin_is_debian_install; then
      echo "=> g++ is not available. Please install 'build-essentials' package with 'apt-get install build-essential' command as root, then retry uCoin installation."
      exit 1
    else
      echo "=> g++ is not available"
    fi
    return 11
  fi
  if ! ucoin_has "python"; then
    if ucoin_is_ubuntu_install; then
      echo "=> python is not available. Please install 'build-essential' package with 'sudo apt-get install build-essential' command, then retry uCoin installation."
      exit 1
    elif ucoin_is_debian_install; then
      echo "=> python is not available. Please install 'build-essentials' package with 'apt-get install build-essential' command as root, then retry uCoin installation."
      exit 1
    else
      echo "=> python is not available"
    fi
    return 11
  fi

  local PREVIOUS_PATH
  PREVIOUS_PATH=$PATH
  if ucoin_has "git"; then
    # Git is here: clone repository
    if [ -d "$UCOIN_DIR/.git" ]; then
      echo "=> ucoin is already installed in $UCOIN_DIR, trying to update using git"
      printf "\r=> "
      cd "$UCOIN_DIR" && (command git fetch 2> /dev/null || {
        echo >&2 "Failed to update ucoin, run 'git fetch' in $UCOIN_DIR yourself." && exit 1
      })
    else
      # Cloning to $UCOIN_DIR
      echo "=> Downloading ucoin from git to '$UCOIN_DIR'"
      printf "\r=> "
      mkdir -p "$UCOIN_DIR"
      command git clone "$(ucoin_repo_url)" "$UCOIN_DIR"
    fi
    cd "$UCOIN_DIR" && command git checkout --quiet $(ucoin_latest_version)
    if [ ! -z "$(cd "$UCOIN_DIR" && git show-ref refs/heads/master)" ]; then
      if git branch --quiet 2>/dev/null; then
        cd "$UCOIN_DIR" && command git branch --quiet -D master >/dev/null 2>&1
      else
        echo >&2 "Your version of git is out of date. Please update it!"
        cd "$UCOIN_DIR" && command git branch -D master >/dev/null 2>&1
      fi
    fi
  else
    # Fallback: git is not available, we download sources tarball
    local UCOIN_SRC_TARBALL=https://github.com/ucoin-io/ucoin/archive/$(ucoin_latest_version).tar.gz
    local UCOIN_SRC_ARCHIVE=$UCOIN_DIR/ucoin_$(ucoin_latest_version).tar.gz
    local UCOIN_SRC_FOLDER=$UCOIN_DIR/ucoin-$(ucoin_latest_version | sed -e s/^v//)
    echo "=> Downloading '$UCOIN_SRC_TARBALL' to '$UCOIN_SRC_ARCHIVE'"
    mkdir -p "$UCOIN_DIR"
    ucoin_download "$UCOIN_SRC_TARBALL" -o "$UCOIN_SRC_ARCHIVE" || {
      echo >&2 "Failed to download '$UCOIN_SRC_TARBALL'"
      return 7
    }
    echo "=> Extracting..."
    cd "$UCOIN_DIR" && tar xzf $UCOIN_SRC_ARCHIVE || {
      echo >&2 "Failed to extract '$UCOIN_SRC_ARCHIVE'"
      return 8
    }
    echo "=> Moving..."
    mv $UCOIN_SRC_FOLDER/* $UCOIN_DIR || {
      echo >&2 "Failed to move files from '$UCOIN_SRC_FOLDER'"
      return 9
    }
    echo "=> Cleaning ucoin sources..."
    rm -Rf $UCOIN_ARCHIVE $UCOIN_SRC_ARCHIVE $UCOIN_SRC_FOLDER || {
      echo >&2 "Failed to clean ucoin sources"
      return 10
    }
  fi

  # Download Nodejs
  local NVER="4.2.0";
  local ARCH="86"
  local X64=`uname -a | grep "x86_64"`
  if [ ! -z "$X64" ]; then
    ARCH="64"
  fi
  local NODEJS_FILENAME=node-v${NVER}-linux-x${ARCH}
  local NODEJS_TARBALL=http://nodejs.org/dist/v${NVER}/${NODEJS_FILENAME}.tar.gz
  local NODEJS_ARCHIVE=$UCOIN_DIR/node.tar.gz
  local NODEJS_EXTRACTED=$UCOIN_DIR/$NODEJS_FILENAME
  if [ ! -d "$UCOIN_DIR/node" ]; then
    echo "=> Downloading '$NODEJS_TARBALL' to '$NODEJS_ARCHIVE'"
    ucoin_download "$NODEJS_TARBALL" -o "$NODEJS_ARCHIVE" || {
      echo >&2 "Failed to download '$NODEJS_TARBALL'"
      return 4
    }
    tar xzf $NODEJS_ARCHIVE || {
      echo >&2 "Failed to extract '$NODEJS_ARCHIVE'"
      return 5
    }
    mv $NODEJS_FILENAME "node" || {
      echo >&2 "Failed to extract '$NODEJS_ARCHIVE'"
      return 6
    }
  fi

  # Install uCoin dependencies (NPM modules)
  export PATH=$PATH:$UCOIN_DIR/node/bin/
  npm install
  export PATH=$PREVIOUS_PATH
  return
}

install_ucoin_as_script() {
  local ARCH="32"
  local X64=`uname -a | grep "x86_64"`
  if [ ! -z "$X64" ]; then
    ARCH="64"
  fi
  local UCOIN_SOURCE_LOCAL
  UCOIN_SOURCE_LOCAL=https://github.com/ucoin-io/ucoin/releases/download/$(ucoin_latest_version)/ucoin-x${ARCH}.tar.gz
  local UCOIN_ARCHIVE
  UCOIN_ARCHIVE=$UCOIN_DIR/ucoin.tar.gz

  # Downloading to $UCOIN_DIR
  mkdir -p "$UCOIN_DIR"
  if [ -d "$UCOIN_DIR/ucoin" ]; then
    echo "=> ucoin is already installed in $UCOIN_DIR, trying to update"
  else
    echo "=> Downloading ucoin binary to '$UCOIN_DIR'"
  fi
  ucoin_download "$UCOIN_SOURCE_LOCAL" -o "$UCOIN_ARCHIVE" || {
    echo >&2 "Failed to download '$UCOIN_SOURCE_LOCAL'"
    return 1
  }
  echo "=> Extracting ucoin sources..."
  tar xzf $UCOIN_ARCHIVE -C $UCOIN_DIR || {
    echo >&2 "Failed to extract $UCOIN_ARCHIVE to $UCOIN_DIR"
    return 2
  }
  echo "=> Cleaning..."
  rm $UCOIN_ARCHIVE || {
    echo >&2 "Failed to remove $UCOIN_ARCHIVE"
    return 2
  }
}

#
# Detect profile file if not specified as environment variable
# (eg: PROFILE=~/.myprofile)
# The echo'ed path is guaranteed to be an existing file
# Otherwise, an empty string is returned
#
ucoin_detect_profile() {

  local DETECTED_PROFILE
  DETECTED_PROFILE=''
  local SHELLTYPE
  SHELLTYPE="$(basename /$SHELL)"

  if [ $SHELLTYPE = "bash" ]; then
    if [ -f "$HOME/.bashrc" ]; then
      DETECTED_PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.bash_profile" ]; then
      DETECTED_PROFILE="$HOME/.bash_profile"
    fi
  elif [ $SHELLTYPE = "zsh" ]; then
    DETECTED_PROFILE="$HOME/.zshrc"
  fi

  if [ -z $DETECTED_PROFILE ]; then
    if [ -f "$PROFILE" ]; then
      DETECTED_PROFILE="$PROFILE"
    elif [ -f "$HOME/.profile" ]; then
      DETECTED_PROFILE="$HOME/.profile"
    elif [ -f "$HOME/.bashrc" ]; then
      DETECTED_PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.bash_profile" ]; then
      DETECTED_PROFILE="$HOME/.bash_profile"
    elif [ -f "$HOME/.zshrc" ]; then
      DETECTED_PROFILE="$HOME/.zshrc"
    fi
  fi

  if [ ! -z $DETECTED_PROFILE ]; then
    echo "$DETECTED_PROFILE"
  fi
}

ucoin_is_available_for_distribution() {
  local distribution
  local distribution_deb
  local distribution_fedora

  distribution=`cat /etc/*-release file 2>/dev/null | grep "Ubuntu"`
  distribution_deb=`cat /etc/*-release file 2>/dev/null | grep "Debian"`
  distribution_fedora=`cat /etc/*-release file 2>/dev/null | grep "Fedora"`

  if [[ "$distribution" = *Ubuntu\ 14* ]] || [[ "$distribution" = *Ubuntu\ 15* ]] || [[ "$distribution_deb" = *Debian*8*jessie* ]] || [[ "$distribution_fedora" = *Fedora\ 23* ]]; then
    local X64=`uname -a | grep "x86_64"`
    if [ ! -z "$X64" ]; then
      return 0
    fi
    echo "=> 32-bit OS, requires to build"
    return 1
  else
    echo "=> No binary for this system, requires to build"
    return 1
  fi
}

ucoin_do_install() {

  # Autodetect install method

  if [ "_$1" == "_git" ]; then
    install_ucoin_from_git
  elif ucoin_is_available_for_distribution; then
    install_ucoin_as_script
  elif ucoin_has "git"; then
    install_ucoin_from_git
  elif ucoin_has "curl"; then
    install_ucoin_from_git
  elif ucoin_has "wget"; then
    install_ucoin_from_git
  else
    echo >&2 "You need git, curl, or wget to install ucoin"
    exit 1
  fi

  echo

  local UCOIN_PROFILE
  UCOIN_PROFILE=$(ucoin_detect_profile)

  SOURCE_STR="\nexport UCOIN_DIR=\"$UCOIN_DIR\"\n[ -s \"\$UCOIN_DIR/ucoin.sh\" ] && . \"\$UCOIN_DIR/ucoin.sh\"  # This loads ucoin.sh"

  if [ -z "$UCOIN_PROFILE" ] ; then
    echo "=> Profile not found. Tried $UCOIN_PROFILE (as defined in \$PROFILE), ~/.bashrc, ~/.bash_profile, ~/.zshrc, and ~/.profile."
    echo "=> Create one of them and run this script again"
    echo "=> Create it (touch $UCOIN_PROFILE) and run this script again"
    echo "   OR"
    echo "=> Append the following lines to the correct file yourself:"
    printf "$SOURCE_STR"
    echo
  else
    if ! command grep -qc '/ucoin.sh' "$UCOIN_PROFILE"; then
      echo "=> Appending source string to $UCOIN_PROFILE"
      printf "$SOURCE_STR\n" >> "$UCOIN_PROFILE"
    else
      echo "=> Source string already in $UCOIN_PROFILE"
    fi
  fi

  echo "=> ------------------------------------------------------"
  echo "=> !                                                     !"
  echo "=> ! CLOSE and REOPEN YOUR TERMINAL to start using ucoin !"
  echo "=> !                                                     !"
  echo "=> ------------------------------------------------------"
  ucoin_reset
}

#
# Unsets the various functions defined
# during the execution of the install script
#
ucoin_reset() {
  unset -f ucoin_reset ucoin_has ucoin_latest_version \
    ucoin_download install_ucoin_as_script install_ucoin_from_git \
    ucoin_detect_profile ucoin_do_install \
    ucoin_is_available_for_distribution
}

[ "_$UCOIN_ENV" = "_testing" ] || ucoin_do_install $1

} # this ensures the entire script is downloaded #
