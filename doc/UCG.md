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

```json
{
  "currency": "CURRENCY_NAME",
  "key": "SOME_KEY_FINGERPRINT",
  "dns": "name.example.com",
  "ipv4": "11.11.11.11",
  "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1",
  "port": 8555
  "peers": [
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8881},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8882},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8883},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8884}
  ]
}
```

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

```json
{
  "KEY_FINGERPRINT": {
    "number", "1",
    "dateTime": "1374852192",
    "hosters": [
      {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8881},
      {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8882},
      {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8883},
      {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8884}
    ],
    "trusts": [
      {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "77.77.77.77", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 7555},
      {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "88.88.88.88", "ipv6": "2A02:E35:2421:4BE0:CDBC:C04E:A7AB:ECF2", "port": 8002},
      {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "99.99.99.99", "ipv6": "3A03:E35:2421:4BE0:CDBC:C04E:A7AB:ECF3", "port": 9005}
    ],
    "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----"
  }
}
```

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
