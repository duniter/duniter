Title: WS2P: preferred and privileged nodes
Order: 9
Date: 2020-10-04
Slug: ws2p_preferred_privileged
Authors: elois

# WS2P: preferred and privileged nodes

## Preferred nodes

List of preferred public keys, your node will connect in priority to duniter nodes whose public key is in your preferred public key list.

To add a public key to your list of preferred keys:

```bash
duniter config --ws2p-prefered-add <pubkey>
```

To remove a key from your preferred key list :

```bash
duniter config --ws2p-prefered-rm <pubkey>
```

To consult the list of your preferred keys:

```bash
duniter ws2p list-prefered
```

Or use environment variable `DUNITER_WS2P_PREFERED_KEYS`:

```bash
DUNITER_WS2P_PREFERED_KEYS=PUBKEY1,PUBKEY2,PUBKEY3
```

## Privileged nodes

Just as you can set preferred keys for your outgoing WS2P connections, you can set privileged keys for your incoming WS2P connections. That is, if you receive more connection requests than the maximum number you have configured, connections initiated by nodes whose public key is part of your privileged keys will be given priority.

To add a key to your privileged key list :

```bash
duniter config --ws2p-privileged-add <pubkey>
```

To remove a key from your privileged key list:

```bash
duniter config --ws2p-privileged-rm <pubkey>
```

To consult the list of your privileged keys:

```bash
duniter ws2p list-privileged
```

Or use environment variable `DUNITER_WS2P_PRIVILEGED_KEYS`:

```bash
DUNITER_WS2P_PRIVILEGED_KEYS=PUBKEY1,PUBKEY2,PUBKEY3
```
