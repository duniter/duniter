#!/bin/bash
gpg --batch --no-use-agent --no-default-keyring --secret-keyring $1 --local-user $2 $3 $4 0<&0