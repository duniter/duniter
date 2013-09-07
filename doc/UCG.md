# uCoin Gossip messages format

## Peers table

uCoin uses P2P networks to manage the money data, hence it needs to know which nodes makes the network for a given currency.

For that purpose, uCoin defines a peering table containing, for a given currency and host:

* its DNS name
* its network IP (v4, v6 or both)
* a currency
* a port for this currency
* its PGP public key
* a list of known awake nodes

Here is an example describing its structure:

    Version: VERSION
    Currency: CURRENCY_NAME
    Dns: DNS_NAME
    IPv4: IPV4_ADDRESS
    IPv6: IPV6_ADDRESS
    Port: PORT_NUMBER
    Peers:
    SOME_KEY_FINGERPRINT,name.example1.com,11.11.11.11,1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1,8881
    SOME_KEY_FINGERPRINT,name.example2.com,11.11.11.11,1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1,8882
    SOME_KEY_FINGERPRINT,name.example3.com,11.11.11.11,1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1,8883
    SOME_KEY_FINGERPRINT,name.example4.com,11.11.11.11,1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1,8884

## Peering request

Such a document tells a node to forward transactions to another node for given keys.

    Version: VERSION
    Currency: CURRENCY_NAME
    Dns: DNS_NAME
    IPv4: IPV4_ADDRESS
    IPv6: IPV6_ADDRESS
    Port: PORT_NUMBER
    Forward: ALL|KEYS
    Keys:
    395DF8F7C51F007019CB30201C49E884B46B92FA
    58E6B3A414A1E090DFC6029ADD0F3555CCBA127F
    4DC7C9EC434ED06502767136789763EC11D2C4B7
    8EFD86FB78A56A5145ED7739DCB00C78581C5375
    95CB0BFD2977C761298D9624E4B4D4C72A39974A


Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Currency` | contains the name of the currency. This is used to identify the target of the transaction, as several moneys may be HDC-based.
`Dns` | the DNS name to access the node.
`IPv4` | the IPv4 address to access the node.
`IPv6` | the IPv6 address to access the node.
`Port` | the port of the address to access the node.
`Forward` | the forwarding rule, either `ALL` to forward ANY incoming transaction or `KEYS` to forward only transactions whose sender or recipient belongs to values of `Keys`.
`Keys` | if `Forward: KEYS`, tells the keys whose transaction shall be forwarded.

## Status request

Such a document informs a node on current node's status, either connected, up, or disconnected.

    Version: VERSION
    Currency: CURRENCY_NAME
    Status: CONNECTED|UP|DISCONNECTED

## Trust Hash Table

uCoin introduces a new data structure called *Trust Hash Table* (THT).

Such a structure is a simple Hash Table whose entries are OpenPGP key fingerprint, and values are two ojects describing respectively:

* which are the keys/servers **hosting this key's transactions**
* which are the keys/servers this key would rather trust *for others' key hosting*

This is a very important feature for two points:

* it makes possible the repartition of the whole transactions database (a random individual's computer can't handle a humanity scale transactions database)
* it aims at preventing double-spending issue

## THT Structure

In JSON format, a THT entry would look like:

    Version: VERSION
    Currency: CURRENCY_NAME
    Key: KEY_FINGERPRINT
    DateTime: TIMESTAMP_OF_DECLARATION_DATE
    Hosters:
    SOME_KEY_FINGERPRINT,name.example1.com,11.11.11.11,1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1,8881
    SOME_KEY_FINGERPRINT,name.example2.com,11.11.11.11,1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1,8882
    SOME_KEY_FINGERPRINT,name.example3.com,11.11.11.11,1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1,8883
    SOME_KEY_FINGERPRINT,name.example4.com,11.11.11.11,1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1,8884
    Trusts:
    SOME_KEY_FINGERPRINT,name.example4.com,77.77.77.77,1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1,7555
    SOME_KEY_FINGERPRINT,name.example4.com,88.88.88.88,2A02:E35:2421:4BE0:CDBC:C04E:A7AB:ECF2,8002
    SOME_KEY_FINGERPRINT,name.example4.com,99.99.99.99,3A02:E35:2421:4BE0:CDBC:C04E:A7AB:ECF3,9005

Of course this example has bad values, but it shows the global structure.

## THT Signification

### hosters

The `hosters` field is a list of *nodes* a given key declares as the ones that **officialy manages this key's transactions**. That is, which are the nodes by which **every transactions of this key pass** trough.

### trusts

The `trusts` field is a list of *nodes* a given key does trust for receiving transactions. This means, for a given `Recipient`, that he would rather accept transactions from `Sender` if the sender's transactions are managed by one of the trusted nodes of `Recipient`.

> Indeed, if the owner of a key is not an honest man/organization and wants to cheat, he probably will declare a corrupted node *he controls* for his transactions managment. Thus, he would be able to declare wrong transactions and steal people he trades with.

> If the owner of a key declares a node he *trusts* is not subject to corruption as trading node, it will be more difficult for a dishonest man to cheat against him as he does not control the trusted node.

## THT Protections

Of course, a THT entry is a critical data. Thus, **it has to be signed** by the owner of the key. If an entry is not signed by the owner of the key, it should not be considered as trustworthy information.
