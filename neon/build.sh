#!/bin/sh

cd neon

if [ "${NEON_BUILD_RELEASE}" = "true" ] || [ "${NODE_ENV}" = "production" ]; then
    neon build --release
else
    neon build
fi
