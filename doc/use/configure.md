Title: Configure Duniter server variant
Order: 9
Date: 2017-09-22
Slug: configurer
Authors: elois

# Configure Duniter server variant

Here is a short tutorial to configure your newly installed Duniter server node.  
Warning: this tutorial is for server variant users only and in **version 2.0.x or higher**.

This tutorial shows how to configure duniter on **command line**.
It is also possible to [configure duniter via environment variables](./conf_env_var.md).

## Configuring the cryptographic keypair

All duniter nodes have a cryptographic keypair, which they use to sign the information they transmit over the network. There are two types of duniter nodes:

**1. member nodes:** If the node's keypair corresponds to a member identity, then the node is a "member" node, and
will automatically take part in the calculation of the blocks.

**2. Mirror nodes:** If the node's keypair does not match a member identity, then the node is "mirror" type, it will not be able to write a block, but will still be useful for network resilience and for responding to client requests.

By default this keypair is random, so the duniter node is a mirror node. You can change the node's keypair with this command:

```bash
duniter wizard key
```

Please note that the keypair filled in with this command will be stored in clear on the disk!
To avoid this you can choose to set the keypair to be inserted only at the start of the node so that your keypair will be stored only in RAM, so add the option `--keyprompt` to the node start command.

### Having several nodes with the same keypair

It is possible to have several member nodes with your member keypair but in this case you must assign a unique identifier to each of your nodes, this unique identifier is named **prefix** because its unique role is to prefix the nonce of the blocks you are calculating in order to prevent two of your nodes from calculating the same proof.
  
On your 1st node: You don't have to do anything, the prefix is `1` by default.

On your second node:

```bash
duniter config --prefix 2
```

On your third node:

```bash
duniter config --prefix 3
```

etc

The prefix must be an integer between `1` and `899`.

## Configuring the network

### The APIs

  In version `2.0.x` there are two APIs (Application Programming Interface) allowing your node to communicate with other programs.

1. WS2P (WebSocketToPeer): this API is dedicated to inter-node communication, i.e. between your duniter node and other nodes of the same currency. **WS2P is enabled by default** on your duniter node.
2. GVA (Graphql Verification Api): this API is dedicated to the communication with client software (Ğecko, Tikka, ğcli, etc), it can also be used by any external program wishing to request the network (a website that would like to check the presence of a blockchain transaction for example). **GVA is disabled by default** on your duniter node.

### Configuring WS2P

#### Notion of WS2P Public and WS2P Private

WS2P Private = outgoing WS2P connections.
WS2P public = incoming WS2P connections.

A WS2P connection between two duniter nodes always has a direction, it is initiated by one of the nodes which is therefore the initiator and the other is the acceptor. Connections that your duniter node initiates with other duniter nodes are outbound, depending on your private WS2P configuration. On the other hand, connections that your duniter node accepts from another node are incoming, depending on your public WS2P configuration.

#### WS2P Private

This mode is enabled by default and configured automatically.

To change the maximum number of simultaneous outgoing WS2P connections:

```bash
duniter config --ws2p-max-private <count>
```

#### WS2P Public

This mode is disabled by default, in order for it to work you must configure a WS2P endpoint that other duniter nodes will be able to use to reach you.

First enable the public WS2P mode:

```bash
duniter config --ws2p-public
```

##### Configure a WS2P endpoint

For WS2P Public to work you must configure a WS2P endpoint that other duniter nodes will be able to use to reach you. There are three possible cases:

1. You host your node at home and you want to use UPnP (enabled by default) and then you don't have to do anything, duniter will automatically control your box to configure an endpoint.

2. You host your node at home but you don't want to use UPnP (For security reasons for example).

3. You host your node on a dedicated server on a hosting provider,  so you don't have UPnP.

If you are in case 2 or 3, you must configure an access point manually:

```bash
duniter config --ws2p-noupnp --ws2p-port PORT --ws2p-host HOST --ws2p-remote-port REMOTE_PORT --ws2p-remote-host REMOTE_HOST
```

*The "remote" options correspond, for example, to a box that would do a NAT to your machine, or to a nginx/apache that would do a reverse proxy to your Duniter instance.*
If your duniter node is connected to the internet through a box, you will need to configure port forwarding on your box by redirecting the port of your choice to the machine running your duniter node. In addition, in order to keep the local IP of this machine unchanged, you must ask your box to assign a permanent DHCP lease to it.

##### Maximum number of public WS2P connections

To change the maximum number of simultaneous incoming WS2P connections :

```bash
duniter config --ws2p-max-public <count>
```

#### Check your WS2P configuration

```bash
duniter ws2p show-conf
```

#### Define a path for your WS2P endpoint

```bash
duniter config --ws2p-remote-path <path>
```

Use only if you want to place your duniter node behind a reverse proxy.
This option allows you to add a path for your public WS2P access point.
Your WS2P access point will then be: `ws://host:port/path`.

Note that `ws://` will be replaced by `wss://` if you set the remote port to 443.

#### WS2P preferred/privileged nodes

See [WS2P: preferred and privileged nodes](ws2p_preferred_privileged.md)

### What is UPnP

Universal Plug and Play (UPnP) is a protocol that, if enabled on your Internet box, allows the programs you use to configure the network themselves by " controlling " your box.  
UPnP has the advantage of being practical, because it avoids you having to configure the network yourself, but in return you have to trust the programs you use because a malicious program can use UPnP to open your network in an unwanted way.  
If you are not afraid of the command line and you are demanding on the security of your local network, we recommend you to disable UPnP.

If you install duniter on a VPS or a dedicated server you will have to do without UPnP anyway.

### Note on public WS2P (recommended)

Nodes with public WS2P are necessary for the duniter network to work, and the more nodes with public WS2P, the more decentralized the network is.  
This mode is optional if only because technically it is sometimes difficult or even impossible to be accessible from the outside (node behind a 4G router for example).

### Configuring GVA

GVA is still disabled by default, to enable it you have 2 choices:

- Use command `duniter gva configure`, you will be invited to configure GVA interactively.
- Set environment variable `DUNITER_GVA_ENABLED="true"`

It is also possible to manually edit `conf.json` file :

| parameter | type | mandatory | default value |
|:-:|:-:|:-:|:-:|
| enabled | boolean | yes | `true` |
| ip4 | IPv4 | yes | `"0.0.0.0"` |
| ip6 | IPv6 | no | `"::"` |
| port | number | yes | `30901` |
| path | string | yes | `"gva"` |
| remoteHost | string | no | - |
| remotePath | string | no | `"gva"` |
| subscriptionsPath | string | no |  `"gva-sub"` |
| remoteSubscriptionsPath | string | no | `"gva-sub"` |
| remoteTls | boolean | no |  `false` |
| whitelist | IP[] | no |  `["127.0.0.1", "::1"]` |

GVA server listen to `http://<ip4|ip6>:<port>/<remotePath>`

GVA subscriptions websocket server listen to `ws://<ip4|ip6>:<port>/<remoteSubscriptionsPath>`

Each parameter can be redefined by the environment variable of the parameter name in uppercase prefixed by `DUNITER_GVA_`.

For example, the `remotePath` parameter can be redefined by the `DUNITER_GVA_REMOTE_PATH` environment variable.

## Synchronize your node

To join the network of a currency you must synchronize with a node already on this network:

```bash
duniter sync DUNITER_NODE_HOST:DUNITER_NODE_PORT
```

For Ğ1, if you don't know any node you can choose the official node `g1.duniter.org:443`.

## Launch

There are four different commands depending on whether or not you want to demonize your Duniter instance and whether or not you want to use the web-ui:

```bash
duniter start
duniter direct_start
duniter webstart
duniter direct_webstart
```

The `direct_` prefix cancels the demonization, but then you will have to leave your terminal open or use nohup or screen or similar.

In addition, the `direct_start` and `direct_webstart` commands accept the `--keyprompt` option (see the keypair section).

## Tracking logs

```bash
duniter logs
```

## Go further

See the [advanced commands](./advanced-commands.md).
