# NodeCoin [![Build Status](https://api.travis-ci.org/c-geek/nodecoin.png)](https://api.travis-ci.org/c-geek/nodecoin.png)

NodeCoin aims to be a free implementation of the [OpenUDC protocol](https://github.com/Open-UDC/open-udc), which allows to create new P2P crypto-currencies based on individuals and Universal Dividend.

If you want to learn more on its concepts, go to [concepts page](https://github.com/c-geek/nodecoin/blob/master/concepts.md).

## Installation

NodeCoin is powered by Node.js v0.10+, so you need it installed first. Here is an example for Ubuntu installation:

    $ sudo apt-get update
    $ sudo apt-get install python-software-properties python g++ make
    $ sudo add-apt-repository ppa:chris-lea/node.js
    $ sudo apt-get update
    $ sudo apt-get install nodejs

You can find the installation of Node.js for other distribution [on this GitHub document](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager).

And then, just install NodeCoin:

    sudo npm install -g nodecoin

## Get NodeCoin run

Just launch it using the following command:

    $ nodecoin

By default, nodecoin runs on port 8081. You may change it using the --port parameter:

    $ nodecoin --port 80

Note that your system may require root access to launch on port 80.
For more more details on the nodecoin command, run:

    nodecoin -h

Which displays:

    Usage: nodecoin [options]

    Options:

      -h, --help         output usage information
      -V, --version      output the version number
      -p, --port <port>  Port to listen for requests

## Disclaimer

NodeCoin only *aims* to be an implementation of the OpenUDC protocol, but it is not. Firstly because OpenUDC protocol is still a in drafting state, and secondly because NodeCoin have some divergences in its mecanisms.
Consequently, NodeCoin proposes its own protocol which differs with OpenUDC. However, we hope that those protocols will join at some point.

## Get involved in NodeCoin project

For the moment NodeCoin is developed only by its author. If you wish to participate/debate on it, you may join OpenUDC XMPP chatroom (open-udc@muc.jappix.com) on [OpenUDC blog](http://www.openudc.org/) (chat is available on the bottom-right corner of the blog) and contact *cgeek*.

# License

Copyright (c) 2013 The nodecoin team.

This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program; if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.