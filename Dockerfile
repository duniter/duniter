FROM node
MAINTAINER Caner Candan <caner@candan.fr>

ENV PGP_KEY_TYPE        default
ENV PGP_KEY_LENGTH      default
ENV PGP_SUBKEY_TYPE     default
ENV PGP_SUBKEY_LENGTH   default
ENV PGP_REAL_NAME       docker_node
ENV PGP_COMMENT         udid2;c;INSTANCE;DOCKER;1980-08-02;e+48.85+002.35;0;
ENV PGP_EMAIL           docker@docker
ENV PGP_EXPIRE_DATE     0
ENV PGP_PASSPHRASE      abc

ENV PORT_NUMBER               8033
ENV REMOTE_HOST               ucoin-test.xyz
ENV REMOTE_IPV4               0.0.0.0
ENV REMOTE_PORT               8033

ENV CURRENCY_NAME			        testcoin
ENV KEYCHAIN_SIG_DELAY        157680000
ENV KEYCHAIN_SIG_VALIDITY     31536000
ENV KEYCHAIN_POW_ZERO_MIN     4
ENV KEYCHAIN_POW_PERIOD       1

ENV UNIVERSAL_DIVIDEND_FREQUENCY	86400
ENV FIRST_UNIVERSAL_DIVIDEND_VALUE	100
ENV MONETARY_MASS_GROWTH_PERCENT	0.007376575

ENV MONGO_DB_NAME	ucoin_default

COPY share/docker/run.sh /usr/src/app/
COPY share/docker/setup.sh /usr/src/app/

ADD . /usr/src/app
WORKDIR /usr/src/app

RUN npm install . -g

EXPOSE 8033

CMD [ "sh", "run.sh" ]
