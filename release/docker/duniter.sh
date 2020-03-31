#!/bin/sh

# Without parameters, start with web interface
if [[ -z ${1} ]]; then
	set -- direct_webstart
fi

# Options
DUNITER_OPTS=
DUNITER_OPTS="${DUNITER_OPTS} --webmhost 0.0.0.0"
DUNITER_OPTS="${DUNITER_OPTS} --home /var/lib/duniter"
DUNITER_OPTS="${DUNITER_OPTS} --mdb duniter_default"

# Key file found
if [[ -f /etc/duniter/key.yml ]]; then
	DUNITER_OPTS="${DUNITER_OPTS} --keyfile /etc/duniter/keys.yml"
fi

# Start duniter
cd /duniter/duniter/
bin/duniter ${DUNITER_OPTS} "$@"
