#!/bin/bash

##########################
#    UCOIN EXECUTABLE
#
# Wraps bin/ucoind.js that is called with Node.js
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

	if [[ $VERSION != v5* && $VERSION != v6* ]]; then
	  echo "$NODE v5 or v6 is required";
	else

		case "$1" in

		#---------------------------------
		#  UCOIN DAEMON MANAGEMENT
		#---------------------------------

		webwait|webstart|webstop|webrestart|start|stop|restart)
		$NODE "$DUNITER_DIR/bin/daemon" $*
		;;

		direct_start)
		$NODE "$DUNITER_DIR/bin/ucoind" start ${@:2}
		;;

		logs)
		LOGS_FILE=`$NODE "$DUNITER_DIR/bin/daemon" $*`
		tail -f -n 500 "$LOGS_FILE"
		;;

		#---------------------------------
		#  UCOIN CLI COMMANDS
		#---------------------------------

		*)
	  $NODE "$DUNITER_DIR/bin/ucoind" $*
		;;

		esac
	fi;
}

# If the script was launched with parameters, try to launch the Duniter command
if [ ! -z $1 ]; then
	duniter $*
fi
