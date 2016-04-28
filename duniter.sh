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
		if [[ -d $UCOIN_DIR/node ]]; then
			NODE=$UCOIN_DIR/node/bin/node
		fi;
	else

		### Cheating with DEV mode
		UCOIN_DIR=`pwd`
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

		start|stop|restart)
		$NODE "$UCOIN_DIR/bin/daemon" $*
		;;

		logs)
		LOGS_FILE=`$NODE "$UCOIN_DIR/bin/daemon" $*`
		tail -f -n 500 "$LOGS_FILE"
		;;

		#---------------------------------
		#  UCOIN CLI COMMANDS
		#---------------------------------

		*)
	  $NODE "$UCOIN_DIR/bin/ucoind" $*
		;;

		esac
	fi;
}

# If the script was launched with parameters, try to launch the uCoin command
if [ ! -z $1 ]; then
	duniter $*
fi
