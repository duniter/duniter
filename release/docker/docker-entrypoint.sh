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
config=/etc/duniter
home_default=$home/duniter_default

manual_config="$(boolean "${DUNITER_MANUAL_CONFIG:-false}")"
auto_sync="$(boolean "${DUNITER_AUTO_SYNC:-false}")"

# Use new path /etc/duniter/conf.json
if ! [ -f "$config/conf.json" ]; then
  if [ "$(readlink "$home_default/conf.json")" = "$config/conf.json" ]; then
    # The configuration file was moved already but the link is dangling
    # It is likely that '/etc/duniter' is an anonymous volume
    echo -e "$big_fat_warning Your configuration file didn't survive the restart!"
    echo -e "$big_fat_warning Make sure that '/etc/duniter' is explicitely mounted as a persistent volume or you'll lose it again."
    if [ -f "$home_default/conf.json.backup" ]; then
      echo -e "$big_fat_warning Found backup file '$home_default/conf.json.backup'; using it..."
      mv "$home_default/conf.json.backup" "$home_default/conf.json"
    fi
  fi
  if [ -f "$home_default/conf.json" ]; then
    echo "Moving existing configuration file '$home_default/conf.json' to its new location: '$config/conf.json'"
    echo "A backup is kept at '$home_default/conf.json.backup'"
    cp "$home_default/conf.json" "$home_default/conf.json.backup"
    mv "$home_default/conf.json" "$config/conf.json"
  fi
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
      /usr/bin/duniter sync --no-interactive "$DUNITER_SYNC_HOST"
    fi
  fi
fi

# Start duniter
echo Starting duniter with:
echo /usr/bin/duniter "$@"
/usr/bin/duniter "$@"
