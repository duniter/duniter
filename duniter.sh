#!/bin/bash

##########################
#    DUNITER EXECUTABLE
#
# Wraps bin/duniter.js that is called with Node.js
#

DEB_PACKAGING=

if [[ $DEB_PACKAGING ]]; then
  DUNITER_DIR=/opt/duniter/sources/
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

	if [[ $VERSION != v6* && $VERSION != v5* && $VERSION != v4* ]]; then
	  echo "$NODE v5 or v4 is required";
	else

		case "$1" in

		#---------------------------------
		#  DUNITER DAEMON MANAGEMENT
		#---------------------------------

		reset|start|stop|restart|webstart|webrestart)
		$NODE "$DUNITER_DIR/bin/daemon" $*
		;;

		direct_start)
		$NODE "$DUNITER_DIR/bin/duniter" start ${@:2}
		;;

		logs)
		LOGS_FILE=`$NODE "$DUNITER_DIR/bin/daemon" $*`
		tail -f -n 500 "$LOGS_FILE"
		;;

		#---------------------------------
		#  DUNITER CLI COMMANDS
		#---------------------------------

		*)
	  $NODE "$DUNITER_DIR/bin/duniter" "$@"
		;;

		esac
	fi;
}

# If the script was launched with parameters, try to launch the Duniter command
if [ ! -z $1 ]; then
	duniter "$@"
fi
