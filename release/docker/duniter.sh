#!/bin/sh

# Without parameters, start with web interface
if [[ -z ${1} ]]; then
	set -- direct_webstart
fi

# Define DUNITER_WEB_UI_HOST
DUNITER_WEB_UI_HOST="0.0.0.0"
export DUNITER_WEB_UI_HOST

# Define DUNITER_CONF_HOME
DUNITER_CONF_HOME="/etc/duniter"
export DUNITER_CONF_HOME

# Key file found
if [[ -f /etc/duniter/key.yml ]]; then
	DUNITER_KEYFILE="/etc/duniter/keys.yml"
	export DUNITER_KEYFILE
fi

# Start duniter
cd /duniter/duniter/
bin/duniter --home /var/lib/duniter "$@"
