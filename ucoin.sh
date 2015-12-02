#!/bin/bash

##########################
#    UCOIN EXECUTABLE
#
# Wraps bin/ucoind.js that is called with Node.js
#

ucoind() {

	NODE=node

	if [[ -d $UCOIN_DIR/node ]]; then
	  NODE=$UCOIN_DIR/node/bin/node
	fi;

	VERSION=`$NODE -v`

	if [[ $VERSION != v0.12* ]]; then
	  echo "Node.js v0.12 is not available";
	else
	  $NODE --harmony $UCOIN_DIR/bin/ucoind $*
	fi;
}
