#!/bin/sh
if [ "$1" != --home ]; then
  set -- --home /var/lib/duniter "$@"
fi
exec /duniter/bin/dex "$@"
