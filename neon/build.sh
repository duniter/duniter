#!/bin/sh

cd neon

if  [ "${NODE_ENV}" = "production" ]
then
	neon build --release
else
    neon build
fi

cd ..