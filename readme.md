# uCoin [![Build Status](https://api.travis-ci.org/c-geek/ucoin.png)](https://api.travis-ci.org/c-geek/ucoin.png)

uCoin is a free server-side software allowing to create new P2P crypto-currencies based on individuals and Universal Dividend.

It is mainly inspired from [OpenUDC project](https://github.com/Open-UDC/open-udc) for that purpose, but differs defining its own open currency protocol called UCP (UCoin Protocol).

## Development state

Software is still under development, and is not used yet. **This means no currency using uCoin exists for now**.

However, it is hoped to build a new currency in a near future according to the following roadmap:

1. uCoin has to be tested, thus a beta currency will be planned
2. If beta is convincing, and in a collective agreement process, a brand new money will be started
3. New softwares will need to be coded:
  * A ready-to-be-signed amendments generator
  * Siblings of uCoin in other programming languages
  * Clients and GUIs to interact with uCoin servers
  * Analysis softwares
  * ...

So, there is still lot of work. *But*, all this is not required in short-term.

## Features

**Peer-to-peer crypto-currency**

uCoin fully relies on OpenPGP standard to describe crypto-currencies, provide P2P synchronization mecanisms and allow data distribution.

**Universal Dividend - by people, for people**

uCoin uses [Human Dividend Currency format](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md) to describe the monetary system, where money is issued directly and exclusively **by** individuals of the Community to themselves. Individuals are the only ones who may issue new money, and choose the unities they desire : this is a monetary system where **U** coin.

**Democratic**

In a uCoin currency, money is legitimated by collectively signed documents. *De facto*, uCoin implies a democratical process in money issuance and community membership.

**Humanity scale compliant**

uCoin uses a distribution system for its transactions database, allowing for potentially humanity scale currencies. Indeed, billions of people making together millions of transactions per second is not likely to be handled by every unit of a PC made network. That is why uCoin transactions database is distributed.

## Specifications

You can get more in uCoin project reading the following documents:
* [Concepts](https://github.com/c-geek/ucoin/blob/master/doc/concepts.md)
* [Technical specifications](https://github.com/c-geek/ucoin/blob/master/doc/architecture.md)

## Installation

### Environment

uCoin was already tested and should be working on majority of Debian-based systems. To work, it requires the following softwares:

* nodejs (0.10+)
* gnupg
* mongodb

### Node.js

uCoin is powered by Node.js v0.10+, so you need it installed first. Here is an example for Ubuntu installation:

```bash
$ sudo apt-get update
$ sudo apt-get install python-software-properties python g++ make
$ sudo add-apt-repository ppa:chris-lea/node.js
$ sudo apt-get update
$ sudo apt-get install nodejs
```

You can find the installation of Node.js for other distribution [on this GitHub document](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager).

### GnuPG + MongoDB

It's that simple:

```bash
$ sudo apt-get install mongodb gnupg
```

### uCoin from git repository

And then, just install uCoin:

```bash
$ git clone git@github.com:c-geek/ucoin.git
$ sudo npm install ./ucoin -g
```

## Get uCoin run

Launch it using the following command:

```bash
$ ucoind --currency beta_brousouf start

uCoin server listening on localhost port 8081
```

Ok, this is cool, but several features may be turned on. Let's configure uCoin.

## Get uCoin configured

All uCoin configuration is stored in its database, i.e. MongoDB.
The database name is the currency name given to uCoin when started.

Thus, when using:

```bash
$ ucoind --currency beta_brousouf start
```
... the targeted database is "beta_brousouf".

To configure "beta_brousouf" database, just run uCoin with the `config` command, instead of `start` parameter:

```bash
$ ucoind --currency beta_brousouf config
```

All the parameters given after this will be stored in the database.

### Network parameters

By default, ucoin runs on port 8081. You may change it using the --port parameter:

```bash
$ ucoind --currency beta_brousouf config --port 80
```

(may require root access to launch on port 80)

It is also possible to specify the IPv4 interface:

```bash
$ ucoind --currency beta_brousouf config -p 8888 --ipv4 127.0.0.1
```

Or IPv6 interface:

```bash
$ ucoind --currency beta_brousouf config -p 8888 --ipv6 ::1
```

Or both:

```bash
$ ucoind --currency beta_brousouf config -p 8888 --ipv4 127.0.0.1 --ipv6 ::1
```

Launching uCoin will results:

```bash
$ ucoind --currency beta_brousouf start

uCoin server listening on 127.0.0.1 port 8888
uCoin server listening on ::1 port 8888
```

Note too that listening to multiple interfaces doesn't imply mutiple program instances: only *one* is running on multiple interfaces.

### Remote parameters

#### Peering informations

uCoin protocol uses peering mecanisms, hence needs to any ucoin node to be reachable through the network.

As the server may be behind a reverse proxy, or because hosts may change of address, remote informations are likely to be different from listening host and port parameters. ucoin software defines 4 remote parameters you need to precise for your ucoin instance to be working:

* `--remoteh`
* `--remote4`
* `--remote6`
* `--remotep`

You must define at least `--remote4` and `--remotep` not to have any error. Here is an example:

```bash
$ ucoind --currency beta_brousouf config --remoteh "some.remote.url" --remotep "8844" --remote4 "11.11.11.11" --remote6 "::1"
```

Note that this is not required and may be removed in the future, as uCoin protocol already include peering mecanisms giving network informations.

#### Authentication

uCoin protocol requires your responses to be signed in order to be interpreted. Such a feature is very important to authenticate nodes messages. To use this feature, just configure uCoin using `--pgpkey` parameter:

```bash
$ ucoind --currency beta_brousouf config --pgpkey /path/to/private/key
```

Eventually, you might need to give a password, otherwise uCoin will crash:

```bash
$ ucoind --currency beta_brousouf config --pgppasswd "ultr[A]!%HiGhly-s3cuR3-p4ssw0d"
```

Resulting in:

```bash
$ ucoind --currency beta_brousouf start

Signed requests with PGP: enabled.
uCoin server listening on 127.0.0.1 port 8888
uCoin server listening on ::1 port 8888
```

### Initial data

Once your server is running, it is already usable. However, at this step, you have 2 choices: you might either want to create your brand new currency with fresh new data, or just want to add your node to an already existing currency. Below are how to do each.

#### Brand new currency

You should follow [this gist](https://gist.github.com/c-geek/6343172) which explains how to use [ucoin-cli](https://github.com/c-geek/ucoin-cli) software, allowing to add your first keys, create your initial Monetary Contract and make transactions.

#### Existing currency

In this cas, you need to synchronize with existing peers to fetch existing:

* Public keys
* Monetary Contract
* Transactions
* Peers
* Trust Hash Table

This is easily done with:

```bash
$ ucoind --currency beta_brousouf sync <host_name> <port>
```

For example, to synchronise with [ucoin.twiced.fr:9101](http://ucoin.twiced.fr:9101/ucg/peering):

```bash
$ ucoind --currency beta_brousouf sync ucoin.twiced.fr 9101
[2014-01-07 23:21:52.571] [INFO] sync - Sync started.
...
[2014-01-07 23:21:52.997] [INFO] sync - Sync finished.
```

Your node is then ready to be started, making it contact all known peers to introduce itself and exchange peering informations.

### Help

For more more details on the ucoin command, run:

    ucoind --help

Which displays:

```
Usage: ucoind --currency <name> [options] <command> [options]

Commands:

  sync [host] [port]     Tries to synchronise data with remote uCoin node
  manage-keys            Update managed keys configuration and send corresponding forwards to other peers
  manage-key [key]       Add given key to stack of managed keys of this node
  forget-key [key]       Remove given key of the managed keys' stack of this node
  config                 Register configuration in database
  reset [config|data]    Reset configuration or data in database
  update-merkles         Reset Merkle trees and computes them again according to stored data.
  start                  Start uCoin server using given --currency

Options:

  -h, --help                output usage information
  -V, --version             output the version number
  -p, --port <port>         Port to listen for requests
  -c, --currency <name>     Name of the currency managed by this node.
  --mhost <host>            MongoDB host.
  --mport <port>            MongoDB port.
  --pgpkey <keyPath>        Path to the private key used for signing HTTP responses.
  --pgppasswd <password>    Password for the key provided with --httpgp-key option.
  --ipv4 <address>          IPV4 interface to listen for requests
  --ipv6 <address>          IPV6 interface to listen for requests
  --remoteh <host>          Remote interface others may use to contact this node
  --remote4 <host>          Remote interface for IPv4 access
  --remote6 <host>          Remote interface for IPv6 access
  --remotep <port>          Remote port others may use to contact this node
  --kmanagement <ALL|KEYS>  Define key management policy
  --kaccept <ALL|KEYS>      Define key acceptance policy
```

## Talk about/get involved in uCoin project

For the moment uCoin is developed only by its author. If you wish to participate/debate on it, you can:

* join XMPP chatroom [ucoin@muc.jappix.com](https://jappix.com/)
* join diffusion list [https://groups.google.com/forum/?hl=fr#!forum/ucoin](https://groups.google.com/forum/?hl=fr#!forum/ucoin)
* contact me directly at cem.moreau@gmail.com

# References

## Theoretical

* [Relative Money Theory v2.718, Stephane Laborde - Nov. 2012](http://wiki.creationmonetaire.info/index.php?title=Main_Page)

## OpenUDC

* Official OpenUDC project website: <http://www.openudc.org>
* Official OpenUDC repository: <https://github.com/Open-UDC/open-udc>
* Other project trying to implement OpenUDC in python: <https://github.com/canercandan/django-openudc>

# License

This software is provided under [GPLv3](https://raw.github.com/c-geek/ucoin/master/LICENSE).
