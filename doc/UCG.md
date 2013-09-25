# uCoin Gossip messages format

## Peering table

uCoin uses P2P networks to manage money data, hence it needs to know which nodes makes the network for a given currency.

For that purpose, uCoin defines a peering table containing, for a given currency and host's PGP key:

* a DNS name
* a network IP (v4, v6 or both)
* a port

This link is made through a document called *peering entry* whose format is:

```plain
Version: VERSION
Currency: CURRENCY_NAME
Fingerprint: A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468
Dns: DNS_NAME
IPv4: IPV4_ADDRESS
IPv6: IPV6_ADDRESS
Port: PORT_NUMBER
```
Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Currency` | contains the name of the currency.
`Fingerprint` | PGP key identifier linked to this address.
`Dns` | the DNS name to access the node.
`IPv4` | the IPv4 address to access the node.
`IPv6` | the IPv6 address to access the node.
`Port` | the port of the address to access the node.
With the signature attached, this document certifies that this fingerprint's key is owned by host at given network address.

The aggregation of all peering entries is called the *peering table*, and allows to authentify addresses of all nodes identified by their PGP key's fingerprint.

## Forward request

In addition to peering table, which only allows to know the address of each peer, *forward request* is a document allowing peers to ask each other to be forwarded of specific transactions when received.

*Forward table* can be seen as an address book, and *forward requests* as rules of sending.

Its format is the following:

```plain
Version: VERSION
Currency: CURRENCY_NAME
From: FORWARDED_TO_FINGERPRINT
To: FORWARDED_BY_FINGERPRINT
Forward: ALL|KEYS
Keys:
395DF8F7C51F007019CB30201C49E884B46B92FA
58E6B3A414A1E090DFC6029ADD0F3555CCBA127F
4DC7C9EC434ED06502767136789763EC11D2C4B7
8EFD86FB78A56A5145ED7739DCB00C78581C5375
95CB0BFD2977C761298D9624E4B4D4C72A39974A
```
Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Currency` | contains the name of the currency.
`From` | PGP key identifier asking for this forwarding request.
`To` | PGP key identifier targeted by this forwarding request.
`Forward` | the forwarding rule, either `ALL` to forward ANY incoming transaction or `KEYS` to forward only transactions whose sender or recipient belongs to values of `Keys`.
`Keys` | if `Forward: KEYS`, tells the keys whose transaction shall be forwarded. Must not be present if `Forward: ALL`.

## Status request

Such a document informs a node on current node's status, either connected, up, or disconnected.

```plain
Version: VERSION
Currency: CURRENCY_NAME
Status: NEW|UP|DOWN
```

## Trust Hash Table

uCoin introduces a new data structure called *Trust Hash Table* (THT).

Such a structure is a simple Hash Table whose entries are OpenPGP key fingerprint, and values are two arrays describing respectively:

* which are the nodes **hosting this key's transactions**
* which are the nodes this key would rather trust *for others' key hosting*

This is a very important feature for two points:

* it makes possible the repartition of the whole transactions database (a random individual's computer can't handle a humanity scale transactions database)
* it aims at preventing double-spending issue

## THT Structure

A THT entry format is the following:

```plain
Version: VERSION
Currency: CURRENCY_NAME
Key: KEY_FINGERPRINT
Hosters:
C139D011FAC7E3AA8E54619F7729F0179526FA54
14808C7325B28B38CBC62CF9CCEE37CD1AA03408
516B9783FCA517EECBD1D064DA2D165310B19759
0499A0A3F2F4DA8697632D5B7AF66EC607B06D99
Trusts:
A5ED399E2E411BF4B09132EFA2CC5E0CA49B835E
25AC706AF69E60A0334B2A072F4B802C3242B159
```
and is followed by signature of `KEY_FINGERPRINT`'s owner.
## THT Signification

### hosters

The `hosters` field is a list of *nodes* a given key declares as the ones that **officialy manages this key's transactions**. That is, which are the nodes by which **every transactions of this key pass** trough.

### trusts

The `trusts` field is a list of *nodes* a given key does trust for receiving transactions. This means, for a given `Recipient`, that he would rather accept transactions from `Sender` if the sender's transactions are managed by one of the trusted nodes of `Recipient`.

> Indeed, if the owner of a key is not an honest man/organization and wants to cheat, he probably will declare a corrupted node *he controls* for his transactions managment. Thus, he would be able to declare wrong transactions and steal people he trades with.

> If the owner of a key declares a node he *trusts* is not subject to corruption as trading node, it will be more difficult for a dishonest man to cheat against him as he does not control the trusted node.

## THT Protections

Of course, a THT entry is a critical data. Thus, **it has to be signed** by the owner of the key. If an entry is not signed by the owner of the key, it should not be considered as trustworthy information.
