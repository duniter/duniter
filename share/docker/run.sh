#!/bin/sh

echo "Setup first"
sh setup.sh

echo "Then run..."
ucoind start \
    --mhost $MONGO_PORT_27017_TCP_ADDR \
    --mport $MONGO_PORT_27017_TCP_PORT \
    --mdb $MONGO_DB_NAME
