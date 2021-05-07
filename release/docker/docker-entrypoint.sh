#!/bin/sh
set -u

home=/var/lib/duniter
config=/etc/duniter
home_default=$home/duniter_default

function boolean () {
  echo "$1" | sed -E 's/^(true|yes|1)$/true/i'
}

manual_config="$(boolean "${DUNITER_MANUAL_CONFIG:-false}")"
auto_sync="$(boolean "${DUNITER_AUTO_SYNC:-false}")"

# Use path /etc/duniter/conf.json
if ! [ -f "$config/conf.json" ] && [ -f "$home_default/conf.json" ]; then
  mv "$home_default/conf.json" "$config/conf.json"
fi
mkdir -p "$home/duniter_default"
ln -fs "$config/conf.json" "$home_default/conf.json"

# Manual config when enabled
if [ "$manual_config" = true ]; then
  # Do not start until a configuration file was initialized
  while ! [ -f "$config/conf.json.orig" ]; do
    echo "Waiting for initial configuration file... Please copy your configuration file to '$config/conf.json.orig'"
    sleep 10
  done
  echo "Configuration file found. Continuing..."
  # Use new conf.json.orig when changed
  md5_file="$config/conf.json.orig.md5"
  if ! md5sum -c "$md5_file"; then
    if [ -f "$config/conf.json" ]; then
      echo "Backing up old configuration file to '$config/conf.json.old'..."
      mv $config/conf.json $config/conf.json.old
    fi
    echo "Installing new configuration file..."
    cp "$config/conf.json.orig" "$config/conf.json"
    md5sum "$config/conf.json.orig" >"$md5_file"
  fi
  # Log differences between initial, old and current conf file
  jq --sort-keys -r . "$config/conf.json.orig" >"$config/conf.json.orig.sorted"
  jq --sort-keys -r . "$config/conf.json" >"$config/conf.json.sorted"
  if [ -f "$config/conf.json.old" ]; then
    jq --sort-keys -r . "$config/conf.json.old" >"$config/conf.json.old.sorted"
    if ! diff -q "$config/conf.json.old.sorted" "$config/conf.json.orig.sorted"; then
      diff -u "$config/conf.json.old.sorted" "$config/conf.json.orig.sorted"
    fi
  fi
  if ! diff -q "$config/conf.json.orig.sorted" "$config/conf.json.sorted"; then
    diff -u "$config/conf.json.orig.sorted" "$config/conf.json.sorted"
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
      /usr/bin/duniter --home "$home" sync "$DUNITER_SYNC_HOST"
    fi
  fi
fi

# Start duniter
echo Starting duniter with:
echo /usr/bin/duniter "$@"
/usr/bin/duniter "$@"
