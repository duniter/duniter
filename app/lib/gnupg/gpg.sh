#!/bin/bash
rm f.asc
echo "$MESSAGE" > f
gpg --batch --no-default-keyring --secret-keyring $1 -sba --passphrase-fd 3 3<&0 f
cat f.asc
# gpg --batch --no-default-keyring --secret-keyring $1 -sba --passphrase-fd 3 3<&0 < <(echo "$MESSAGE")
# | sed -e "s/\\\\r\\\\n/\r\n/g" | sed -e "s/\\\\s/ /g" | sed -e "s/\\\\\\\\r\\\\\\\\n/\\\\r\\\\n/g"