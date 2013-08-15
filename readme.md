# uCoin [![Build Status](https://api.travis-ci.org/c-geek/ucoin.png)](https://api.travis-ci.org/c-geek/ucoin.png)

uCoin is a free server-side software allowing to create new P2P crypto-currencies based on individuals and Universal Dividend.

It is mainly inspired from [OpenUDC project](https://github.com/Open-UDC/open-udc) for that purpose, but differs defining its own open currency protocol called UCP (UCoin Protocol).

## Features

**Peer-to-peer crypto-currency**

uCoin fully relies on PGP to describe crypto-currencies and provide P2P synchronization mecanisms to allow data decentralization.

**Universal Dividend - for people**

uCoin uses [Human Dividend Currency format](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md) to describe the monetary system, where money is issued directly and exclusively to individuals of the monetary community.

**Universal Dividend - by people**

Even better, money of Universal Dividend is issued **BY** people. This is a currency where **U** coin. Individuals are the only ones who may issue money, and choose the unities they desire.

**Democratic**

In a uCoin currency, money is legitimated by collectively signed documents. *De facto*, uCoin implies a democratical process in money issuance and community members.

**Humanity scale compliant**

uCoin uses a distribution system for its transactions database, allowing for humanity scale currencies. Indeed, billions of people making millions of transactions per second is likely to saturate the network or people's server if they had to manage every transaction. uCoin comes with a solution for that.

## Specifications

You can get more in uCoin project reading the following documents:
* [Concepts](https://github.com/c-geek/ucoin/blob/master/doc/concepts.md)
* [Architecture](https://github.com/c-geek/ucoin/blob/master/doc/architecture.md)
  * [Protocol](https://github.com/c-geek/ucoin/blob/master/doc/UCP.md)
  * [HTTP API](https://github.com/c-geek/ucoin/blob/master/doc/HTTP_API.md)
  * [uCoin Gossip](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md)
  * [Human Dividend Currency](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md)

## Installation

### Node.js

uCoin is powered by Node.js v0.10+, so you need it installed first. Here is an example for Ubuntu installation:

```bash
$ sudo apt-get update
$ sudo apt-get install python-software-properties python g++ make
$ sudo add-apt-repository ppa:chris-lea/node.js
$ sudo apt-get update
$ sudo apt-get install mongodb nodejs
```

You can find the installation of Node.js for other distribution [on this GitHub document](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager).

### uCoin from git repository

And then, just install uCoin:

```bash
$ git clone git@github.com:c-geek/ucoin.git
$ sudo npm install ./ucoin -g
```

## Get uCoin run

Launch it using the following command:

```bash
$ ucoin --currency beta_brousoufs

uCoin server listening on localhost port 8081
```

Ok, this is cool, but several features may be turned on. Let's configure uCoin.

## Get uCoin configured

All uCoin configuration is stored in its database, i.e. MongoDB.
The database name is the currency name given to uCoin when started.

Thus, when using:

```bash
$ ucoin --currency beta_brousoufs
```
... the targeted database is "beta_brousoufs".

To configure "beta_brousoufs" database, just run uCoin with the --config parameter:

```bash
$ ucoin --config beta_brousoufs
```

All the parameters given after this will be stored in the database.

### Network parameters

By default, ucoin runs on port 8081. You may change it using the --port parameter:

```bash
$ ucoin --config beta_brousoufs --port 80
```

(may require root access to launch on port 80)

It is also possible to specify the IPv4 interface:

```bash
$ ucoin --config beta_brousoufs -p 8888 --ipv4 127.0.0.1
```

Or IPv6 interface:

```bash
$ ucoin --config beta_brousoufs -p 8888 --ipv6 ::1
```

Or both:

```bash
$ ucoin --config beta_brousoufs -p 8888 --ipv4 127.0.0.1 --ipv6 ::1
```

Launching uCoin will results:

```bash
$ ucoin --currency beta_brousoufs

uCoin server listening on 127.0.0.1 port 8888
uCoin server listening on ::1 port 8888
```

Note too that listening to multiple interfaces doesn't imply mutiple program instances: only *one* is running on multiple interfaces.

### Remote parameters

#### Peering informations

As the server may be behind a reverse proxy, or because hosts may change of address, it might be useful to provide some remote informations like remote `host` and `port` telling where is really located the node:

```bash
$ ucoin --config beta_brousoufs --remoteh "some.remote.url" --remotep "8844"
```

#### Authentication

This is one of the great features coming with uCoin: [connect-pgp](https://github.com/c-geek/connect-pgp) is a Node.js module which *signs HTTP responses*. Such a feature is very important to authentify incoming responses over the network.

To use this feature, just configure uCoin using `--pgpkey` parameter:

```bash
$ ucoin --config beta_brousoufs --pgpkey /path/to/private/key
```

Eventually, you might need to give a password, otherwise uCoin will crash:

```bash
$ ucoin --config beta_brousoufs --pgppasswd "ultr[A]!%HiGhly-s3cuR3-p4ssw0d"
```

Resulting in:

```bash
$ ucoin --currency beta_brousoufs

Signed requests with PGP: enabled.
uCoin server listening on 127.0.0.1 port 8888
uCoin server listening on ::1 port 8888
```

### Help

For more more details on the ucoin command, run:

    ucoin --help

Which displays:

      Usage: ucoin [options]

      Options:

        -h, --help              output usage information
        -V, --version           output the version number
        -p, --port <port>       Port to listen for requests
        -c, --currency <name>   Name of the currency managed by this node.
        -C, --config <name>     Name of the currency to configure.
        --mhost <host>          MongoDB host.
        --mport <port>          MongoDB port.
        --pgpkey <keyPath>      Path to the private key used for signing HTTP responses.
        --pgppasswd <password>  Password for the key provided with --httpgp-key option.
        --ipv4 <address>        IPV4 interface to listen for requests
        --ipv6 <address>        IPV6 interface to listen for requests
        --remoteh <host>        Remote interface others may use to contact this node
        --remotep <port>        Remote port others may use to contact this node


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
