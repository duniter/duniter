# ------------------------------------------------------------------------------
# Build Stage
# ------------------------------------------------------------------------------

FROM node:10-alpine as build

LABEL maintainer="elois <elois@duniter.org>"
LABEL version="0.1.0"
LABEL description="Duniter server (Crypto-currency software to manage libre currency such as Ğ1)"

ARG DUNITER_UI_VER="1.7.x"
ARG INSTALL_DEX="no"

RUN apk update && \
	apk add ca-certificates curl && \
	update-ca-certificates && \
	apk add --update cmake g++ python make

WORKDIR /duniter

# copy source tree
COPY ./ ./

# install latest stable rust
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y

# build duniter
RUN PATH=${HOME}/.cargo/bin:${PATH} \
	RUSTFLAGS="-C target-feature=-crt-static -L/usr/lib" \
	make -C release ADD_DEBUG=N INSTALL_DEX=${INSTALL_DEX} server-gui clean \
	&& rm -rf work/extra

# ------------------------------------------------------------------------------
# Final Stage
# ------------------------------------------------------------------------------

FROM node:10-alpine

ARG INSTALL_DEX="no"

# install jq
RUN apk add jq

# create group and user duniter
RUN addgroup -S -g 1111 duniter && \
	adduser -SD -h /duniter -G duniter -u 1111 duniter
RUN mkdir -p /var/lib/duniter /etc/duniter && chown duniter:duniter /var/lib/duniter /etc/duniter

# copy the build artifact from the build stage
COPY --from=build --chown=duniter:duniter /duniter/work /duniter

# copy wrappers
COPY release/docker/duniter.sh /usr/bin/duniter
COPY release/docker/dex.sh /usr/bin/dex
RUN [ "$INSTALL_DEX" = yes ] || rm /usr/bin/dex

# copy entrypoint
COPY release/docker/docker-entrypoint.sh /

# create volumes
VOLUME /var/lib/duniter
VOLUME /etc/duniter

# expose ports
EXPOSE 9220 10901 20901 30901

# use duniter user
USER duniter
WORKDIR /var/lib/duniter

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD []
