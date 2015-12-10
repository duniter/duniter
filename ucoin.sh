#!/bin/bash

##########################
#    UCOIN EXECUTABLE
#
# Wraps bin/ucoind.js that is called with Node.js
#

ucoind() {

	local UCOIN_DATABASE
	local UCOIN_LOG_FILE
	local UCOIN_DATA_HOME
	local NODE
	local PM2

	if [[ -d $UCOIN_DIR/node ]]; then
	  NODE=$UCOIN_DIR/node/bin/node
	fi;

	VERSION=`$NODE -v`

	if [[ $VERSION != v0.12* ]]; then
	  echo "$NODE v0.12 is required";
	else

		# OK, execute command
		PM2=$UCOIN_DIR/node_modules/pm2/bin/pm2
		UCOIN_DATA_HOME=$HOME/.config/ucoin

		case "$1" in

		#---------------------------------
		#  UCOIN DAEMON MANAGEMENT: START
		#---------------------------------

		start)
		local test
		local UCOIN_LOG_FILE
		local UCOIN_ERR_FILE
		UCOIN_DATABASE=$2
		if [ -z $UCOIN_DATABASE ]; then
			UCOIN_DATABASE="$UCOIN_DB"
		fi
		if [ -z $UCOIN_DATABASE ]; then
			UCOIN_DATABASE="ucoin_default"
		fi
		UCOIN_LOG_FILE=$UCOIN_DATA_HOME/$UCOIN_DATABASE/ucoin.log
		UCOIN_ERR_FILE=$UCOIN_DATA_HOME/$UCOIN_DATABASE/ucoin.err.log
		test=`$NODE $PM2 list | grep "$UCOIN_DATABASE.*online"`
		if [ -z "$test" ]; then
		echo $UCOIN_LOG_FILE
			$NODE $PM2 start -f "$UCOIN_DIR/bin/ucoind" --name "$UCOIN_DATABASE" --interpreter="$NODE" --node-args="--harmony" --log $UCOIN_LOG_FILE --error $UCOIN_ERR_FILE --merge-logs -- start --mdb "$UCOIN_DATABASE" --httplogs 2>/dev/null
			echo "uCoin with DB '$UCOIN_DATABASE' started. Use 'ucoind logs' to see interactive logs."
		else
			echo 1>&2 "uCoin '$UCOIN_DATABASE' already started."
		fi
	  ;;


		#---------------------------------
		#  UCOIN DAEMON MANAGEMENT: STOP & OTHERS
		#---------------------------------

		list|info|logs|stop|restart|monit|delete)
		UCOIN_DATABASE=$2
		if [ -z $UCOIN_DATABASE ]; then
			UCOIN_DATABASE="$UCOIN_DB"
		fi
		if [ -z $UCOIN_DATABASE ]; then
			UCOIN_DATABASE="ucoin_default"
		fi
	  $NODE $PM2 $1 $UCOIN_DATABASE
		;;

		delete-all)
	  $NODE $PM2 delete all
		;;

		#---------------------------------
		#  UCOIN NORMAL COMMANDS
		#---------------------------------

		*)
	  $NODE --harmony "$UCOIN_DIR/bin/ucoind" --mdb "$UCOIN_DATABASE" $*
		;;

		esac
	fi;
}

# If the script was launched with parameters, try to launch the uCoin command
if [ ! -z $1 ]; then
	ucoind $*
fi
