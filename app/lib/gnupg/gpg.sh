#!/bin/bash
gpg --batch --no-default-keyring --secret-keyring $1 $2 --passphrase-fd 3 3<&0 < <(echo -n "$MESSAGE")