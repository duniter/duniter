#!/bin/sh

echo "Setup first"
sh setup.sh

echo "Then run..."
ucoind start \
    --mdb $MONGO_DB_NAME
