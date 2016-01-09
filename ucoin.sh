#!/bin/bash

##########################
#    UCOIN EXECUTABLE
#
# Wraps bin/ucoind.js that is called with Node.js
#

ucoind() {

	local NODE

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

	if [[ $VERSION != v4* ]]; then
	  echo "$NODE v4+ is required";
	else

		case "$1" in

		#---------------------------------
		#  UCOIN DAEMON MANAGEMENT
		#---------------------------------

		start|stop|restart|logs)
		$NODE "$UCOIN_DIR/bin/daemon" $*
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
	ucoind $*
fi
