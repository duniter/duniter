#!/bin/bash

# Yarn
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list

# System tools
apt-get update
apt-get install --yes git curl build-essential yarn python-minimal zip

# User installation
sudo su vagrant -c "bash /vagrant/user-bootstrap.sh"
