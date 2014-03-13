#!/bin/bash
gpg --batch --no-default-keyring --secret-keyring $1 --import $2 > /dev/null 2> /dev/null
