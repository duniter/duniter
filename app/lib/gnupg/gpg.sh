#!/bin/bash
gpg --batch --no-default-keyring --secret-keyring $1 --clearsign -a --passphrase-fd 3 3<&0 < <(echo $MESSAGE | sed -e "s/\\\\r\\\\n/\r\n/g" | sed -e "s/\\\\s/ /g" | sed -e "s/\\\\\\\\r\\\\\\\\n/\\\\r\\\\n/g")
