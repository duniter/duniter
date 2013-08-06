# uCoin [![Build Status](https://api.travis-ci.org/c-geek/ucoin.png)](https://api.travis-ci.org/c-geek/ucoin.png)

uCoin is a free server-side software which allows to create new P2P crypto-currencies based on individuals and implementing Universal Dividend.

It is mainly inspired from [OpenUDC project](https://github.com/Open-UDC/open-udc) for that purpose, but differs defining its own open currency protocol called UCP (UCoin Protocol).

You can get more in uCoin project reading the following documents:
* [Concepts](https://github.com/c-geek/ucoin/blob/master/doc/concepts.md)
* [Architecture](https://github.com/c-geek/ucoin/blob/master/doc/architecture.md)
  * [Protocol](https://github.com/c-geek/ucoin/blob/master/doc/UCP.md)
  * [HTTP API](https://github.com/c-geek/ucoin/blob/master/doc/HTTP_API.md)
  * [Peering](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md)
  * [Human Dividend Currency](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md)

## Installation

uCoin is powered by Node.js v0.10+, so you need it installed first. Here is an example for Ubuntu installation:

    $ sudo apt-get update
    $ sudo apt-get install python-software-properties python g++ make
    $ sudo add-apt-repository ppa:chris-lea/node.js
    $ sudo apt-get update
    $ sudo apt-get install mongodb nodejs

You can find the installation of Node.js for other distribution [on this GitHub document](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager).

And then, just install uCoin:

    sudo npm install -g ucoin

## Get uCoin run

Launch it using the following command:

    $ ucoin

By default, ucoin runs on port 8081. You may change it using the --port parameter:

    $ ucoin --port 80

(may require root access to launch on port 80)

It is also possible to specify the IPv4 interface:

    $ ucoin -p 8888 --ipv4 127.0.0.1

    uCoin server listening on 127.0.0.1 port 8888

Or IPv6 interface:

    $ ucoin -p 8888 --ipv6 ::1

    uCoin server listening on ::1 port 8888

Or both:

    $ ucoin -p 8888 --ipv4 127.0.0.1 --ipv6 ::1

    uCoin server listening on 127.0.0.1 port 8888
    uCoin server listening on ::1 port 8888

Note too that listening to multiple interfaces doesn't imply mutiple program instances: only *one* is running on multiple interfaces.

### Currency parameters

uCoin should be launched with a few more parameters to be part of a currency community.

First, it is required to tell the name of the currency:

    $ ucoin --currency beta_brousouf

    uCoin server listening on port 8081
    Currency name: beta_brousouf

Second, initial public keys of the first members of the community must be given:

    $ ucoin --currency beta_brousouf --initKeys /path/to/key1.pub,/path/to/key2.pub

    uCoin server listening on port 8081
    Currency name: beta_brousouf
    Initkeys loaded.

This will tell uCoin where to find the initial keys. More keys can be given using the comma separator.

Note: initial keys are a prerequisite for Monetary Contract: uCoin will only accept as first amendment the one that matches thoses keys.

### PGP-signed HTTP requests

This is one of the great features coming with uCoin: [connect-pgp](https://github.com/c-geek/connect-pgp) is a NPM module which *signs HTTP responses*. Such a feature is very important to authentify incoming responses over the network.

To use this feature, just launch uCoin using `--pgpkey` and `--pgppasswd` parameters:

    ucoin --pgpkey "/path/to/some/private.key" --pgppasswd "ultr[A]!%HiGhly-s3cuR3-p4ssw0d"

    Signed requests with PGP: **enabled**.
    uCoin server listening on port 8081

### Help

For more more details on the ucoin command, run:

    ucoin --help

Which displays:

    Usage: ucoin [options]

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

uCoin *is not* an implementation of the OpenUDC protocol. Firstly because OpenUDC protocol is still a in drafting state, and secondly because uCoin have some divergences in its mecanisms.
Consequently, uCoin proposes its own protocol called UCP.

## Talk about/get involved in uCoin project

For the moment uCoin is developed only by its author. If you wish to participate/debate on it, you can:

* join XMPP chatroom [ucoin@muc.jappix.com](https://jappix.com/)
* join diffusion list [https://groups.google.com/forum/?hl=fr#!forum/ucoin](https://groups.google.com/forum/?hl=fr#!forum/ucoin)
* contact me directly at cem.moreau@gmail.com

# References

## Theoretical

* [Relativity Theory of Money v2.718, Stephane Laborde - Nov. 2012](http://wiki.creationmonetaire.info/index.php?title=Main_Page)

## OpenUDC

* Official OpenUDC project website: <http://www.openudc.org>
* Official OpenUDC repository: <https://github.com/Open-UDC/open-udc>
* Other project trying to implement OpenUDC in python: <https://github.com/canercandan/django-openudc>

# License

This software is provided under [MIT license](https://raw.github.com/c-geek/ucoin/master/LICENSE).