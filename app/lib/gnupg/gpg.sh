#!/bin/bash
gpg --batch --no-default-keyring --secret-keyring $1 --local-user $2 $3 --passphrase-fd 3 3<&0 < <(echo -n "$MESSAGE")