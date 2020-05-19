#!/bin/sh

if [ "${1}" = "check" ]
then
    $HOME/.cargo/bin/cargo fmt -- --check && prettier --list-different "app/**/*.{ts,json}"
elif [ "${1}" = "all" ]
then
    $HOME/.cargo/bin/cargo fmt && prettier --write "app/**/*.{ts,json}"
else
    echo  "first argument must be \"check\" or \"all\"."
fi
