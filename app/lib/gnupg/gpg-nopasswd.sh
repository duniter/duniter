#!/bin/bash
gpg --batch --no-default-keyring --secret-keyring $1 --local-user $2 $3 < <(echo -n "$MESSAGE")