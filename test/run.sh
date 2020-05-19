#!/bin/sh

if [ "${1}" = "rs" ]
then
	$HOME/.cargo/bin/cargo test --all
elif [ "${1}" = "ts" ]
then
    nyc --reporter html mocha
else
    $HOME/.cargo/bin/cargo test --all && nyc --reporter html mocha
fi
