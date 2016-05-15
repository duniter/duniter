#!/bin/bash

##########################
#    UCOIN EXECUTABLE
#
# Wraps bin/ucoind.js that is called with Node.js
#

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

	if [[ $VERSION != v5* ]]; then
	  echo "$NODE v5 is required";
	else

		case "$1" in

		#---------------------------------
		#  UCOIN DAEMON MANAGEMENT
		#---------------------------------

		webstart|webstop|webrestart|start|stop|restart)
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

# If the script was launched with parameters, try to launch the uCoin command
if [ ! -z $1 ]; then
	duniter $*
fi
