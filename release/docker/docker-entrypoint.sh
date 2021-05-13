#!/bin/sh
set -uo pipefail

function boolean () {
  echo "$1" | sed -E 's/^(true|yes|1)$/true/i'
}
big_fat_warning='\033[01;31m**WARNING**:\033[0m'

DEBUG_ENTRYPOINT="$(boolean "${DEBUG_ENTRYPOINT:-false}")"
if [ "$DEBUG_ENTRYPOINT" = true ]; then
  set -x
fi

# Initialize vars
home=/var/lib/duniter
profile_default=$home/duniter_default
manual_config="$(boolean "${DUNITER_MANUAL_CONFIG:-false}")"
auto_sync="$(boolean "${DUNITER_AUTO_SYNC:-false}")"
DUNITER_PEER_HOST="${DUNITER_PEER_HOST:-${DUNITER_SYNC_HOST:-}}"

# Create default profile path
mkdir -p "$home/duniter_default"

# Manual config when enabled
if [ "$manual_config" = true ]; then
  # Do not start until a configuration file was initialized
  while ! [ -f "$profile_default/conf.json.orig" ]; do
    echo "Waiting for initial configuration file... Please copy your configuration file to '$profile_default/conf.json.orig'"
    sleep 10
  done
  echo "Configuration file found. Continuing..."
  # Use new conf.json.orig when changed
  md5_file="$profile_default/conf.json.orig.md5"
  if ! md5sum -c "$md5_file"; then
    if [ -f "$profile_default/conf.json" ]; then
      echo "Backing up old configuration file to '$profile_default/conf.json.old'..."
      mv $profile_default/conf.json $profile_default/conf.json.old
    fi
    echo "Installing new configuration file..."
    cp "$profile_default/conf.json.orig" "$profile_default/conf.json"
    md5sum "$profile_default/conf.json.orig" >"$md5_file"
  fi
  # Log differences between initial, old and current conf file
  jq --sort-keys -r . "$profile_default/conf.json.orig" >"$profile_default/conf.json.orig.sorted"
  jq --sort-keys -r . "$profile_default/conf.json" >"$profile_default/conf.json.sorted"
  if [ -f "$profile_default/conf.json.old" ]; then
    jq --sort-keys -r . "$profile_default/conf.json.old" >"$profile_default/conf.json.old.sorted"
    if ! diff -q "$profile_default/conf.json.old.sorted" "$profile_default/conf.json.orig.sorted"; then
      diff -u "$profile_default/conf.json.old.sorted" "$profile_default/conf.json.orig.sorted"
    fi
  fi
  if ! diff -q "$profile_default/conf.json.orig.sorted" "$profile_default/conf.json.sorted"; then
    diff -u "$profile_default/conf.json.orig.sorted" "$profile_default/conf.json.sorted"
  fi
fi

# If conf.json doesn't exist and we have DUNITER_PEER_HOST, then initialise it with
# the currency parameters
host_regex='[a-zA-Z0-9](([a-zA-Z0-9]|-)*[a-zA-Z0-9]+)?(\.[a-zA-Z0-9](([a-zA-Z0-9]|-)*[a-zA-Z0-9]+)?)*'
ipv6_regex='((([0–9A-Fa-f]{1,4}:){7}[0–9A-Fa-f]{1,4})|(([0–9A-Fa-f]{1,4}:){6}:[0–9A-Fa-f]{1,4})|(([0–9A-Fa-f]{1,4}:){5}:([0–9A-Fa-f]{1,4}:)?[0–9A-Fa-f]{1,4})|(([0–9A-Fa-f]{1,4}:){4}:([0–9A-Fa-f]{1,4}:){0,2}[0–9A-Fa-f]{1,4})|(([0–9A-Fa-f]{1,4}:){3}:([0–9A-Fa-f]{1,4}:){0,3}[0–9A-Fa-f]{1,4})|(([0–9A-Fa-f]{1,4}:){2}:([0–9A-Fa-f]{1,4}:){0,4}[0–9A-Fa-f]{1,4})|(([0–9A-Fa-f]{1,4}:){6}((b((25[0–5])|(1d{2})|(2[0–4]d)|(d{1,2}))b).){3}(b((25[0–5])|(1d{2})|(2[0–4]d)|(d{1,2}))b))|(([0–9A-Fa-f]{1,4}:){0,5}:((b((25[0–5])|(1d{2})|(2[0–4]d)|(d{1,2}))b).){3}(b((25[0–5])|(1d{2})|(2[0–4]d)|(d{1,2}))b))|(::([0–9A-Fa-f]{1,4}:){0,5}((b((25[0–5])|(1d{2})|(2[0–4]d)|(d{1,2}))b).){3}(b((25[0–5])|(1d{2})|(2[0–4]d)|(d{1,2}))b))|([0–9A-Fa-f]{1,4}::([0–9A-Fa-f]{1,4}:){0,5}[0–9A-Fa-f]{1,4})|(::([0–9A-Fa-f]{1,4}:){0,6}[0–9A-Fa-f]{1,4})|(([0–9A-Fa-f]{1,4}:){1,7}:))'

if ! [ -f "$profile_default/conf.json" ] && echo "${DUNITER_PEER_HOST}" | grep -E "^($host_regex|$ipv6_regex)(:[0-9]+)?$"; then
  echo "No config file - Initializing currency from '$DUNITER_PEER_HOST'..."
  port="${DUNITER_PEER_HOST#*:}"
  if [ "${port:-443}" = 443 ]; then
    scheme=https://
  else
    scheme=http://
  fi
  if wget -q -O- "$scheme$DUNITER_PEER_HOST/blockchain/parameters" >"$profile_default/conf.json.new"; then
    mv "$profile_default/conf.json.new" "$profile_default/conf.json"
  else
    echo -e "$big_fat_warning Failed."
  fi
fi

# If peers.db is missing and DUNITER_PEER_HOST is set, bootstrap it using
# 'sync --only-peers'
# Working into a temporary Duniter home to avoid side effects on the current
# database
if ! [ -f "$profile_default/peers.db" ] && [ -n "${DUNITER_PEER_HOST:-}" ]; then
  echo "No peers database - Initializing from '$DUNITER_PEER_HOST'..."
  rm -fr /tmp/duniter-bootstrap
  (
    cd /duniter
    if bin/duniter --home /tmp/duniter-bootstrap sync "$DUNITER_PEER_HOST" --no-interactive --only-peers; then
      mv /tmp/duniter-bootstrap/duniter_default/peers.db "$profile_default/"
    else
      echo -e "$big_fat_warning Failed."
    fi
  )
  rm -fr /tmp/duniter-bootstrap
fi

# Auto start synchronization when enabled and starting from scratch
if [ "$auto_sync" = true ]; then
  if ! [ -d "$profile_default/data" ]; then
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

# Start duniter
echo Starting duniter with:
echo /usr/bin/duniter "$@"
exec /usr/bin/duniter "$@"
