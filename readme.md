# uCoin [![Build Status](https://api.travis-ci.org/ucoin-io/ucoin.png)](https://api.travis-ci.org/ucoin-io/ucoin.png)

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

uCoin uses [Human Dividend Currency format](https://github.com/ucoin-io/ucoin/blob/master/doc/HDC.md) to describe the monetary system, where money is issued directly and exclusively **by** individuals of the Community to themselves. Individuals are the only ones who may issue new money, and choose the unities they desire : this is a monetary system where **U** coin.

**Democratic**

In a uCoin currency, money is legitimated by collectively signed documents. *De facto*, uCoin implies a democratical process in money issuance and community membership.

**Humanity scale compliant**

uCoin uses a distribution system for its transactions database, allowing for potentially humanity scale currencies. Indeed, billions of people making together millions of transactions per second is not likely to be handled by every unit of a PC made network. That is why uCoin transactions database is distributed.

## Specifications

You can get more in uCoin project reading the following documents:
* [Concepts](https://github.com/ucoin-io/ucoin/blob/master/doc/concepts.md)
* [Technical specifications](https://github.com/ucoin-io/ucoin/blob/master/doc/architecture.md)

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
### uCoin from npm repository (recommended)

This fetches ucoin using npm. Fast & easy to do:

```bash
$ sudo npm install ucoin -g
```

### uCoin from git repository

This just fetch & install uCoin (development state):

```bash
$ git clone git@github.com:ucoin-io/ucoin.git
$ sudo npm install ./ucoin -g
```

## Configure uCoin (required)

All uCoin configuration is stored in its database, i.e. MongoDB.

To start configuring your node, use following command:

```bash
ucoind wizard
```

This will start a command prompt asking for parameters value & validate all of them at the end. Thus, you won't forget one:

```bash
$ ucoind wizard
[?] Currency name: beta_brousouf
[?] Which OpenPGP implementation to use: gpg - Fast but must be installed on your system
[?] IPv4 interface: wlan1 192.168.1.14
[?] IPv6 interface: wlan1 2a01:e35:8a37:f2b0:dd48:5620:5d3c:ce2c
[?] Port: 8080
[?] Remote IPv4 88.163.127.43
[?] Remote IPv6 None
[?] Remote port: 9101
[?] Private key: cgeek (ubot1;udid2;c;MOREAU;CEDRIC;1988-04-29;e+47.47-000.56;0) <cgeek@yopmail.com>
[?] Key's passphrase: ************************
[?] Autovoting: Yes
[?] Amendment start: 1398895200
[?] Amendment frequency: 86400
[?] Dividend frequency: 172800
[?] Consensus %required: 0.67
[?] Initial dividend: 3
[?] Universal Dividend %growth: 0.007376575
[?] Membership validity duration: 15778800
[?] Voting request validity duration: 2629800
[2014-05-19 17:29:21.139] [DEBUG] ucoind - Configuration saved.
```

### Target only few wizard's steps

Wizard is composed of 4 steps: `currency`, `openpgp`, `network`, `key`. By adding one of those words to `wizard` command, you will only do the attached steps:

```bash
$ ucoind wizard network
[?] IPv4 interface: wlan1 192.168.1.14
[?] IPv6 interface: wlan1 2a01:e35:8a37:f2b0:dd48:5620:5d3c:ce2c
[?] Port: 8080
[?] Remote IPv4 88.163.127.43
[?] Remote IPv6 None
[?] Remote port: 9101
[2014-05-19 17:32:46.799] [DEBUG] ucoind - Configuration saved.
```

### Launching the node

Finally, you just need to use `start` command to launch the node:

```bash
$ ucoind start
[2014-05-19 17:42:33.494] [DEBUG] service - Loaded service: Contract
...
[2014-05-19 17:42:33.613] [DEBUG] ucoind - Server ready!
```

### Change of database

The default database name is "ucoin_default". Thus, when using any command, the targeted database is "ucoin_default".

To deal with another database, just add `--mdb` parameter:

```bash
$ ucoind --mdb mycurrency wizard
```
This will launch wizard on `mycurrency` database *only*.

### Manual configuration

You might also want to do your configuration manually, using CLI options. [Here is a document](./doc/manual-config.md) on how to achieve this.

### Initial data

Once your server is running, it is already usable. However, at this step, you have 2 choices: you might either want to create your brand new currency with fresh new data, or just want to add your node to an already existing currency. Below are how to do each.

#### Brand new currency

You should follow [this gist](https://gist.github.com/c-geek/6343172) which explains how to use [ucoin-cli](https://github.com/ucoin-io/ucoin-cli) software, allowing to add your first keys, create your initial Monetary Contract and make transactions.

#### Existing currency

In this cas, you need to synchronize with existing peers to fetch existing:

* Public keys
* Monetary Contract
* Transactions
* Peers
* Trust Hash Table

This is easily done with:

```bash
$ ucoind sync <host_name> <port>
```

For example, to synchronise with [ucoin.twiced.fr:9101](http://ucoin.twiced.fr:9101/network/peering):

```bash
$ ucoind sync ucoin.twiced.fr 9101
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
Usage: ucoind <command> [options]

Commands:

  sync [host] [port]     Tries to synchronise data with remote uCoin node
  allow-key [key]        Add given key to authorized keys of this node
  manage-key [key]       Add given key to stack of managed keys of this node
  forget-key [key]       Remove given key of the managed keys' stack of this node
  config                 Register configuration in database
  reset [config|data]    Reset configuration or data in database
  start                  Start uCoin server using given --currency

Options:

  -h, --help                output usage information
  -V, --version             output the version number
  -p, --port <port>         Port to listen for requests
  -c, --currency <name>     Name of the currency managed by this node.
  --mhost <host>            MongoDB host.
  --mport <port>            MongoDB port.
  -d, --mdb <name>          MongoDB database name (defaults to "ucoin_default").
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

* visit official website [ucoin.io](http://ucoin.io)
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

This software is provided under [GPLv3](https://raw.github.com/ucoin-io/ucoin/master/LICENSE).
