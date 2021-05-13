#!/bin/sh
cd /duniter
if [ "$1" != --home ]; then
  set -- --home /var/lib/duniter "$@"
fi
exec bin/duniter "$@"

