# NodeCoin [![Build Status](https://api.travis-ci.org/c-geek/nodecoin.png)](https://api.travis-ci.org/c-geek/nodecoin.png)

NodeCoin is a free server-side software which allows to create new P2P crypto-currencies based on individuals and implementing Universal Dividend.

It is mainly inspired from [OpenUDC project](https://github.com/Open-UDC/open-udc) for that purpose, but differs defining its own open currency protocol called NCP (Nodecoin Currency Protocol). You can learn more on it going to the [concepts page](https://github.com/c-geek/nodecoin/blob/master/concepts.md).

## Installation

NodeCoin is powered by Node.js v0.10+, so you need it installed first. Here is an example for Ubuntu installation:

    $ sudo apt-get update
    $ sudo apt-get install python-software-properties python g++ make
    $ sudo add-apt-repository ppa:chris-lea/node.js
    $ sudo apt-get update
    $ sudo apt-get install mongodb nodejs

You can find the installation of Node.js for other distribution [on this GitHub document](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager).

And then, just install NodeCoin:

    sudo npm install -g nodecoin

## Get NodeCoin run

Launch it using the following command:

    $ nodecoin

By default, nodecoin runs on port 8081. You may change it using the --port parameter:

    $ nodecoin --port 80

(may require root access to launch on port 80)

It is also possible to specify the IPv4 interface:

    $ nodecoin -p 8888 --ipv4 127.0.0.1

    NodeCoin server listening on 127.0.0.1 port 8888

Or IPv6 interface:

    $ nodecoin -p 8888 --ipv6 ::1

    NodeCoin server listening on ::1 port 8888

Or both:

    $ nodecoin -p 8888 --ipv4 127.0.0.1 --ipv6 ::1

    NodeCoin server listening on 127.0.0.1 port 8888
    NodeCoin server listening on ::1 port 8888

Note too that listening to multiple interfaces doesn't imply mutiple program instances: only *one* is running on multiple interfaces.

### Currency parameters

Nodecoin should be launched with a few more parameters to be part of a currency community.

First, it is required to tell the name of the currency:

    $ nodecoin --currency beta_brousouf

    NodeCoin server listening on port 8081
    Currency name: beta_brousouf

Second, initial public keys of the first members of the community must be given:

    $ nodecoin --currency beta_brousouf --initKeys /path/to/key1.pub,/path/to/key2.pub

    NodeCoin server listening on port 8081
    Currency name: beta_brousouf
    Initkeys loaded.

This will tell Nodecoin where to find the initial keys. More keys can be given using the comma separator.

Note: initial keys are a prerequisite for Monetary Contract: Nodecoin will only accept as first amendment the one that matches thoses keys.

### Help

For more more details on the nodecoin command, run:

    nodecoin --help

Which displays:

    Usage: nodecoin [options]

    Options:

      -h, --help                output usage information
      -V, --version             output the version number
      -p, --port <port>         Port to listen for requests
      -k, --initKeys <keylist>  List of public key pathes, comma separated.
      -c, --currency <name>     Name of the currency managed by this node.
      --mhost <host>            MongoDB host.
      --mport <port>            MongoDB port.
      --mdb <name>              MongoDB database name.
      --ipv4 <address>          IPV4 interface to listen for requests
      --ipv6 <address>          IPV6 interface to listen for requests


## Disclaimer

NodeCoin *is not* an implementation of the OpenUDC protocol. Firstly because OpenUDC protocol is still a in drafting state, and secondly because NodeCoin have some divergences in its mecanisms.
Consequently, NodeCoin proposes its own protocol called NCP.

## Get involved in NodeCoin project

For the moment NodeCoin is developed only by its author. If you wish to participate/debate on it, you contact me directly at cem.moreau@gmail.com.

# References

## Theoretical

* [Relativity Theory of Money v2.718, Stephane Laborde - Nov. 2012](http://wiki.creationmonetaire.info/index.php?title=Main_Page)

## OpenUDC

* Official OpenUDC project website: <http://www.openudc.org>
* Official OpenUDC repository: <https://github.com/Open-UDC/open-udc>
* Other project trying to implement OpenUDC in python: <https://github.com/canercandan/django-openudc>

# License

Copyright (c) 2013 The nodecoin team.

This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program; if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
