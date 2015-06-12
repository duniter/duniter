#!/bin/sh

echo "(1) Create new pgp secret key thanks to the environment variables provided to docker run cmd"

cat >key <<EOF
%echo Generating a basic OpenPGP key
Key-Type: $PGP_KEY_TYPE
Key-Length: $PGP_KEY_LENGTH
Subkey-Type: $PGP_SUBKEY_TYPE
Subkey-Length: $PGP_SUBKEY_LENGTH
Name-Real: $PGP_REAL_NAME
Name-Comment: $PGP_COMMENT
Name-Email: $PGP_EMAIL
Expire-Date: $PGP_EXPIRE_DATE
Passphrase: $PGP_PASSPHRASE
%pubring key.pub
%secring key.sec
%commit
%echo done
EOF

gpg2 --batch --gen-key key

gpg2 --no-default-keyring --secret-keyring ./key.sec \
     --keyring ./key.pub --list-secret-keys

gpg2 --no-default-keyring --secret-keyring ./key.sec \
     --keyring ./key.pub --export-secret-keys -a > ./key.sec.asc

echo "(2) Configure ucoind thanks to the new created pgp secret key and the provided environment variables"

ucoind config \
    --currency $CURRENCY_NAME \
    --port $PORT_NUMBER \
    --ipv4 `hostname -i` \
    --remote4 $REMOTE_IPV4 \
    --remoteh $REMOTE_HOST \
    --remotep $REMOTE_PORT \
    --amdaemon $AMENDMENTS_DAEMON \
    --amstart $AMENDMENTS_START \
    --amfreq $AMENDMENTS_FREQUENCY \
    --udfreq $UNIVERSAL_DIVIDEND_FREQUENCY \
    --consensus $AMENDMENTS_CONSENSUS \
    --ud0 $FIRST_UNIVERSAL_DIVIDEND_VALUE \
    --udpercent $MONETARY_MASS_GROWTH_PERCENT \
    --algorithm $COMMUNITY_CHANGES_ALGORITHM \
    --pgpkey ./key.sec.asc --pgppasswd $PGP_PASSPHRASE

echo "Setup done"
