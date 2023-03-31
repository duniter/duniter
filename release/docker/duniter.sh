#!/bin/sh

# Terminate gracefully on SIGTERM by propagating it to the 'node' process
sigterm () {
  echo "Received SIGTERM. Terminating..." >&2
  pkill node
  wait %1
}
trap 'sigterm' TERM

# Main
cd /duniter
if [ "$1" != --home ]; then
  set -- --home /var/lib/duniter "$@"
fi

# Launch in background and wait
# This way we can catch SIGTERM
bin/duniter "$@" &
wait %1
