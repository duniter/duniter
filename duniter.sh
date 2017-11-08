#!/bin/sh

##########################
#    DUNITER EXECUTABLE
#
# Wraps bin/duniter that is called with Node.js
#

DEB_PACKAGING=

if [ -n "$DEB_PACKAGING" ]; then
  DUNITER_DIR=/opt/duniter/
fi

duniter() {

	local NODE
	local LOGS_FILE

	if [ -z "$DEV_MODE" ]; then

		### Production mode
		if [[ -d $DUNITER_DIR/node ]]; then
			NODE=$DUNITER_DIR/node/bin/node
	  else
	    echo "Node.js is not embedded in this version of Duniter"
	    return
		fi;
	else

		### Cheating with DEV mode
		DUNITER_DIR=`pwd`
		NODE=node
	fi

	VERSION=`$NODE -v`

	if [[ $VERSION != v6* ]]; then
	  echo "$NODE v6 is required";
	else

	  # Calls duniter JS command
	  cd $DUNITER_DIR
	  $NODE "$DUNITER_DIR/bin/duniter" "$@"

	fi;
}

# If the script was launched with parameters, try to launch the Duniter command
if [ ! -z $1 ]; then
	duniter "$@"
fi
