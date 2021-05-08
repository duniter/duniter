Title: Configure Duniter server variant with environment variables
Order: 9
Date: 2021-05-07
Slug: configurer
Authors: elois

# Configure Duniter (server variant) with environment variables

This tutorial shows how to configure duniter by setting **environment variables**.
It is also possible to [configure duniter on command line](./configure.md).

## Configuring the cryptographic keypair

All duniter nodes have a cryptographic keypair, which they use to sign the information they transmit over the network. There are two types of duniter nodes:

**1. member nodes:** If the node's keypair corresponds to a member identity, then the node is a "member" node, and
will automatically take part in the calculation of the blocks.

**2. Mirror nodes:** If the node's keypair does not match a member identity, then the node is "mirror" type, it will not be able to write a block, but will still be useful for network resilience and for responding to client requests.

By default this keypair is random, so the duniter node is a mirror node.

To modify the keypair of the node, you must create a keypair in a file and indicate the path to this file with the environment variable `DUNITER_KEYFILE`.

## Configuring the network

### The APIs

  In version `2.0.x` there are two APIs (Application Programming Interface) allowing your node to communicate with other programs.

1. WS2P (WebSocketToPeer): this API is dedicated to inter-node communication, i.e. between your duniter node and other nodes of the same currency. **WS2P is enabled by default** on your duniter node.
2. GVA (Graphql Verification Api): this API is dedicated to the communication with client software (Ğecko, Tikka, ğcli, etc), it can also be used by any external program wishing to request the network (a website that would like to check the presence of a blockchain transaction for example). **GVA is disabled by default** on your duniter node.

### Configuring WS2P Public

This mode is disabled by default, in order for it to work you must configure a WS2P endpoint that other duniter nodes will be able to use to reach you.

First enable the public WS2P mode:

```bash
DUNITER_WS2_PUBLIC="true"
```

#### Configure a WS2P endpoint

For WS2P Public to work you must configure a WS2P endpoint that other duniter nodes will be able to use to reach you.

If you use a reverse proxy, you must define "remote" host and port:

```bash
DUNITER_WS2_REMOTE_HOST="mydomaine.tld"
DUNITER_WS2_REMOTE_PORT="443"
```

You can define a remote path:

```bash
DUNITER_WS2_REMOTE_PATH="/ws2p"
```

If you not use a reverse proxy, you can expose duniter directly

```bash
DUNITER_WS2_HOST="<your public IP>"
DUNITER_WS2_PORT="your opened port"
```

#### WS2P preferred and privileged nodes

See [dedicated page](./ws2p_preferred_privileged.md)

### Configuring GVA

GVA is still disabled by default, to enable it:

```bash
DUNITER_GVA_ENABLED="true"
```

Each parameter value can be defined by the environment variable of the parameter name in uppercase prefixed by `DUNITER_GVA_`.

| parameter | env var name | type | default value |
|:-:|:-:|:-:|:-:|
| enabled | `DUNITER_GVA_ENABLED` | boolean | `false` |
| ip4 | `DUNITER_GVA_IP4` | IPv4 | `0.0.0.0` |
| ip6 | `DUNITER_GVA_IP6` | IPv6 | `::` |
| port | `DUNITER_GVA_PORT` | number | `30901` |
| path | `DUNITER_GVA_PATH` | string | `"gva"` |
| remoteHost | `DUNITER_GVA_REMOTE_HOST` | string | `ip4 [ip6]` |
| remotePort | `DUNITER_GVA_REMOTE_PORT` | string | `port` |
| remotePath | `DUNITER_GVA_REMOTE_PATH` | string | `"gva"` |
| subscriptionsPath | `DUNITER_GVA_SUBSCRIPTIONS_PATH` | string |  `"gva-sub"` |
| remoteSubscriptionsPath | `DUNITER_GVA_REMOTE_SUBSCRIPTIONS_PATH` | string | `"gva-sub"` |
| remoteTls | `DUNITER_GVA_REMOTE_TLS` | boolean |  `false` |
| whitelist | `DUNITER_GVA_WHITELIST` | IP[] |  `["127.0.0.1", "::1"]` |
