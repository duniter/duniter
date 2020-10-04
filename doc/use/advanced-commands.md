Title: Advanced commands
Order: 9
Date: 2022-10-04
Slug: advanced_commands
Authors: elois

# Advanced commands

Before reading this page, first read the on-board help in Duniter, it meets the most common needs:

```bash
duniter help
```

If you are new to Duniter, or/and you just want to configure your network properly, read this page instead: [Configure Duniter server variant](./configure.md).

This page is intended for advanced users, advanced testers and developers.

Some advanced options are hidden in the embedded help (duniter help) because they are rarely used and/or are mainly intended for advanced testers and developers.

Some commands are not available via the Duniter binary and need to call directly the NodeJs part.

## Hidden options

This part lists the options accessible via the Duniter binary but hidden in the help.

### Hidden `sync` options

These options must be used with the `sync` sub command.

#### `--cautious`

Check all DUPB rules (very long).

#### `--localsync`

Allow to synchronize on nodes with local network IP address.

### Hidden `config` options

These options must be used with the `config` sub command.

#### `--nb-cores`

Number of cores uses for proof-of-work computation

### `---addep`

Add given endpoint to the list of endpoints of this node.

### `---remep`

Remove given endpoint to the list of endpoints of this node.

### WS2P preferred/privileged options

These options are described in a dedicated page: [WS2P: preferred and privileged nodes](./ws2p_preferred_privileged.md)

#### `--ws2p-no-private`

Disable WS2P Private.

#### `--ws2p-private`

Enable WS2P Private.

#### `--ws2p-socks-proxy <host:port>`

Use Socks Proxy for WS2P Private

#### `--rm-proxies`

Remove all proxies options

### WS2P TOR options

To have your Duniter node use Tor for outgoing connections it makes with other nodes, just set up a Tor proxy and choose a policy for normal ws2p access points (the `--reaching-clear-ep` option):

```bash
duniter config --tor-proxy localhost:9050 --reaching-clear-ep tor
```

You will also need to install the *Tor Browser* or *Tor Standalone* on the same machine. By default, Tor listens on localhost on port 9050. If you change your Tor configuration you will obviously need to change the Duniter configuration accordingly.

You can also choose a mixed node, which will contact the regular access points in plain text, so it will only use Tor to contact .onion access points:

```bash
duniter config --tor-proxy localhost:9050 --reaching-clear-ep clear
```

Finally 3rd choice, you can choose to contact only the .onion access points, the clear access points will never be contacted:

```bash
duniter config --tor-proxy localhost:9050 --reaching-clear-ep none
```

/!\ Each time you change one of these two options you must repeat the other one at the same time or it will be reset!

Finally, to remove your Tor configuration and return to a classic node:

```bash
duniter --rm-proxies
```

You can also decide to encapsulate Duniter in a Tor VM as whonix, in which case you will need to inform Duniter that it will be able to contact .onion access points by enabling the `--force-tor' option:

```bash
duniter config --force-tor --reaching-clear-ep tor|none
```

#### Hidden service

Just enter the .onion address of your hidden service in the `--ws2p-remote-host` option.

## Hidden commands and more hidden options

The following commands and options are not accessible via the `duniter` binary. The NodeJs code must be called directly for them.

For this use the embedded NodeJs :

```bash
/opt/duniter/node/bin/node duniter_js <hidden-command>
```

If you compiled Duniter yourself, you don't have any NodeJs embedded, then use the version of NodeJs you used to compile Duniter.

Not all commands and options are listed here, if you don't find what you need:

1. Search in `duniter_js --help`.

2. Search into the Duniter's code itself.

3. Ask for help on the [Duniter forum](https://forum.duniter.org).

### sync `--memory`

Perform synchronization in memory only. Synchronization will not be stored on the hard disk. This option is useful for a quick blockchain integrity check when combined with the --cautious option.

`duniter_js sync g1.duniter.org 443 --cautious --memory`

### Generate a block manually

Generates the next block from the pool data and the current block, performs the working proof for the requested difficulty and then submits the resulting block to a node.

`duniter_js gen-next g1.duniter.org 10901 74`

This command generates the next block, sends it to node `g1.duniter.org:10901` and calculates the working proof with 74 trouble (footprint beginning with 4 zeros).

#### Option `--show`

Displays the calculated block **before** the proof of work and submission to the network. Controls its contents.

`duniter_js gen-next g1.duniter.org 10901 74 --show`

#### Option `--check`

Modifies the behaviour of the command: it no longer produces proof of work nor submits the block to the network. Instead, it generates the block and checks if it is acceptable by a node.

`duniter_js gen-next --show --check`

### Generate genesis block

Generates block #0 automatically, including a maximum number of members:

`duniter_js gen-root duniter.org 10901 74`

Generates block #0 by manually selecting members to include:

```bash
duniter_js gen-root-choose duniter.org 10901 74
? Newcomers to add:
 ◯ john
 ◯ dude404
 ◉ sinogeek
❯◉ deviantime
 ◯ kernel
 ◯
```

## Not listed

Not all commands and options are listed on this page, if you don't find what you need:

1. Search in `duniter_js --help`.

2. Search into the Duniter's code itself.

3. Ask for help on the [Duniter forum](https://forum.duniter.org).
