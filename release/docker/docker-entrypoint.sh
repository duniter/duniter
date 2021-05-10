#!/bin/sh
set -u

function boolean () {
  echo "$1" | sed -E 's/^(true|yes|1)$/true/i'
}
big_fat_warning='\033[01;31m**WARNING**:\033[0m'

DEBUG_ENTRYPOINT="$(boolean "${DEBUG_ENTRYPOINT:-false}")"
if [ "$DEBUG_ENTRYPOINT" = true ]; then
  set -x
fi

home=/var/lib/duniter
home_default=$home/duniter_default

manual_config="$(boolean "${DUNITER_MANUAL_CONFIG:-false}")"
auto_sync="$(boolean "${DUNITER_AUTO_SYNC:-false}")"

mkdir -p "$home/duniter_default"

# Manual config when enabled
if [ "$manual_config" = true ]; then
  # Do not start until a configuration file was initialized
  while ! [ -f "$home_default/conf.json.orig" ]; do
    echo "Waiting for initial configuration file... Please copy your configuration file to '$home_default/conf.json.orig'"
    sleep 10
  done
  echo "Configuration file found. Continuing..."
  # Use new conf.json.orig when changed
  md5_file="$home_default/conf.json.orig.md5"
  if ! md5sum -c "$md5_file"; then
    if [ -f "$home_default/conf.json" ]; then
      echo "Backing up old configuration file to '$home_default/conf.json.old'..."
      mv $home_default/conf.json $home_default/conf.json.old
    fi
    echo "Installing new configuration file..."
    cp "$home_default/conf.json.orig" "$home_default/conf.json"
    md5sum "$home_default/conf.json.orig" >"$md5_file"
  fi
  # Log differences between initial, old and current conf file
  jq --sort-keys -r . "$home_default/conf.json.orig" >"$home_default/conf.json.orig.sorted"
  jq --sort-keys -r . "$home_default/conf.json" >"$home_default/conf.json.sorted"
  if [ -f "$home_default/conf.json.old" ]; then
    jq --sort-keys -r . "$home_default/conf.json.old" >"$home_default/conf.json.old.sorted"
    if ! diff -q "$home_default/conf.json.old.sorted" "$home_default/conf.json.orig.sorted"; then
      diff -u "$home_default/conf.json.old.sorted" "$home_default/conf.json.orig.sorted"
    fi
  fi
  if ! diff -q "$home_default/conf.json.orig.sorted" "$home_default/conf.json.sorted"; then
    diff -u "$home_default/conf.json.orig.sorted" "$home_default/conf.json.sorted"
  fi
fi

# Auto start synchronization when enabled and starting from scratch
if [ "$auto_sync" = true ]; then
  if ! [ -d "$home_default/data" ]; then
    echo "No 'data' folder. "
    if [ -z "$DUNITER_SYNC_HOST:-" ]; then
      echo "DUNITER_SYNC_HOST undefined. Can't start synchronization!"
    else
      echo "Starting synchronization..."
      /usr/bin/duniter sync "$DUNITER_SYNC_HOST" --no-interactive
    fi
  fi
fi

# Network interface to listen to
export DUNITER_WEB_UI_HOST="0.0.0.0"

# Key file found
if [ -f /etc/duniter/key.yml ]; then
  export DUNITER_KEYFILE="/etc/duniter/keys.yml"
fi

# Without parameters, start with web interface
if [ $# = 0 ]; then
  set -- direct_webstart
fi

# Set --home option
set -- --home "$home" "$@"

# Start duniter
echo Starting duniter with:
echo /usr/bin/duniter "$@"
exec /usr/bin/duniter "$@"
