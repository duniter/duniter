#!/bin/sh

cd neon

if [ -z "${DUNITER_FAST_BUILD}" ]
then
    if [ -e "${HOME}/.cargo/bin/rustup" ]
    then
        rustup update stable
    else
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        export PATH="$HOME/.cargo/bin:$PATH"
    fi

    rustup show
    rustc --version
    cargo --version
else
    echo "WARNING: you have disabled the automatic update of Rust, remember to update Rust regularly with command \"rustup update\"."
fi

if [ "${NEON_BUILD_RELEASE}" = "true" ] || [ "${NODE_ENV}" = "production" ]
then
	neon build --release
else
    neon build
fi

cd ..