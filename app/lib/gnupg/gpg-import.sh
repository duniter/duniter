#!/bin/bash
gpg --batch --no-default-keyring --secret-keyring $1 --delete-secret-key $3
gpg --batch --no-default-keyring --secret-keyring $1 --import $2
