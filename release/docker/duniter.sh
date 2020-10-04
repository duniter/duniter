#!/bin/sh

# Without parameters, start with web interface
if [[ -z ${1} ]]; then
	set -- direct_webstart
fi

# Options
export DUNITER_WEB_UI_HOST = "0.0.0.0"


# Key file found
if [[ -f /etc/duniter/key.yml ]]; then
	export DUNITER_KEYFILE="/etc/duniter/keys.yml"
fi

# Start duniter
cd /duniter/duniter/
bin/duniter --home /var/lib/duniter "$@"
