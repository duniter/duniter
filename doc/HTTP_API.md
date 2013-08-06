# uCoin HTTP API

* [Overview](#overview)
* [Merkle URLs](#merkle-urls)
* [API](#api)
  * [pks/](#pks)
      * [add](#pksadd)
      * [lookup](#pkslookup)
  * [ucg/](#ucg)
      * [peering](#ucgpeering)
      * [tht (GET)](#ucgtht-get)
      * [tht (POST)](#ucgtht-post)
      * [tht/[PGP_FINGERPRINT]](#ucgthtpgp_fingerprint)
  * [hdc/](#hdc)
      * [amendments/current](#amendmentscurrent)
      * [amendments/view/[AMENDMENT_ID]/members](#amendmentsviewamendment_idmembers)
      * [amendments/view/[AMENDMENT_ID]/self](#amendmentsviewamendment_idself)
      * [amendments/view/[AMENDMENT_ID]/voters](#amendmentsviewamendment_idvoters)
      * [amendments/votes (GET)](#amendmentsvotes-get)
      * [amendments/votes (POST)](#amendmentsvotes-post)
      * [amendments/votes/[AMENDMENT_ID]/signatures](#amendmentsvotesamendment_idsignatures)
      * [coins/[PGP_FINGERPRINT]/list](#coinspgp_fingerprintlist)
      * [coins/[PGP_FINGERPRINT]/view/[COIN_ID]](#coinspgp_fingerprintviewcoin_id)
      * [community/join](#communityjoin)
      * [community/members](#communitymembers)
      * [community/votes](#communityvotes)
      * [transactions/process/issuance](#transactionsprocessissuance)
      * [transactions/process/transfert](#transactionsprocesstransfert)
      * [transactions/process/fusion](#transactionsprocessfusion)
      * [transactions/all](#transactionsall)
      * [transactions/sender/[PGP_FINGERPRINT]](#transactionssenderpgp_fingerprint)
      * [transactions/recipient/[PGP_FINGERPRINT]](#transactionsrecipientpgp_fingerprint)
      * [transactions/view/[TRANSACTION_ID]](#transactionsviewtransaction_id)

## Overview

Data is made accessible through an HTTP API mainly inspired from [OpenUDC_exchange_formats draft](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_exchange_formats.draft.txt), and has been adapted to fit uCoin specificities.

    http[s]://Node[:port]/...
    |-- pks/
    |   |-- add
    |   `-- lookup
    |-- ucg/
    |   |-- peering
    |   `-- tht/
    |       `-- [PGP_FINGERPRINT]
    `-- hdc/
        |-- amendments/
        |   |-- current
        |   |-- view/
        |   |   `-- [AMENDMENT_ID]/
        |   |       |-- members
        |   |       |-- self
        |   |       `-- voters
        |   `-- votes/
        |   |   `-- [AMENDMENT_ID]/
        |   |       `-- signatures
        |-- coins/
        |   `-- [PGP_FINGERPRINT]/
        |       |-- list
        |       `-- view/
        |           `-- [COIN_NUMBER]
        |-- community/
        |   |-- join
        |   |-- members
        |   `-- votes
        `-- transactions/
            |-- process/
            |   |-- issuance
            |   `-- transfert
            |-- all
            |-- sender/
            |   `-- [PGP_FINGERPRINT]
            |-- recipient/
            |   `-- [PGP_FINGERPRINT]
            `-- view/
                `-- [TRANSACTION_ID]

## Merkle URLs

Merkle URL is a special kind of URL applicable for resources:

* `hdc/amendments/view/[AMENDMENT_ID]/members`
* `hdc/amendments/view/[AMENDMENT_ID]/voters`
* `hdc/amendments/votes/[AMENDMENT_ID]/signatures`
* `hdc/community/members`
* `hdc/community/votes`
* `hdc/transactions/all`
* `hdc/transactions/sender/[PGP_FINGERPRINT]`
* `hdc/transactions/recipient/[PGP_FINGERPRINT]`

Such kind of URL returns Merkle tree hashes informations. In uCoin, Merkle trees are an easy way to detect unsynced data and where the differences come from. For example, `hdc/amendments/view/[AMENDMENT_ID]/members` is a Merkle tree whose leaves are hashes of members key fingerprint sorted ascending way. Thus, if any new key is added, a branch of the tree will see its hash modified and propagated to the root hash. Change is then easy to detect.

For commodity issues, this URL uses query parameters to retrieve partial data of the tree, as most of the time all the data is not required. uCoin Merkle tree has a determined number of parent nodes (given a number of leaves), which allows to ask only for interval of them.

Here is an example of members Merkle tree with 5 members (taken from [Tree Hash EXchange format (THEX)](http://web.archive.org/web/20080316033726/http://www.open-content.net/specs/draft-jchapweske-thex-02.html)):

                       ROOT=H(H+E)
                        /        \
                       /          \
                 H=H(F+G)          E
                /       \           \
               /         \           \
        F=H(A+B)         G=H(C+D)     E
        /     \           /     \      \
       /       \         /       \      \
      A         B       C         D      E


    Note: H() is some hash function

Where A,B,C,D,E are already hashed data.

With such a tree structure, uCoin consider the tree has exactly 6 nodes: `[ROOT,H,E,F,G,E]`. Nodes are just an array, and for a Lambda Server LS1, it is easy to ask for the values of another server LS2 for level 1 (`H` and `E`, the second level): it requires nodes interval `[1;2]`.

Hence it is quite easy for anyone who wants to check if a `Z` member joined the uCoin community as it would alter the `E` branch of the tree:

                        ROOT'=H(H+E')
                        /            \
                       /              \
                 H=H(F+G)              E'
                /       \               \
               /         \               \
        F=H(A+B)          G=H(C+D)       E'=H(E+Z)
        /     \           /     \         /     \
       /       \         /       \       /       \
      A         B       C         D     E         Z

`ROOT` changed to `ROOT'`, `E` to `E'`, but `H` did not. The whole `E'` branch should be updated with the proper new data.

For that purpose, Merkle URL defines different parameters and results:

**Parameters**

Parameter | Description
--------- | -----------
`level` | Integer value that indicates the level of hashes to be returned. `level` start from `0` (`ROOT` hash). Defaults to `0`.
`start` | Integer value that defines the start range (inclusive) of desired hashes for a given level.
`end` | Integer value which  that defines the end range (inclusive) of desired hashes for a given level.
`extract` | Boolean value that asks for result to inspect leaves and return both **hash** *and* **original content** values. Ignore `level` parameter.

**Returns**

Merkle URL result with `extract=false`.
```json
{
  "merkle": {
    "depth": 3,
    "nodesCount": 6,
    "levelsCount": 4,
    "levels": [
    {
      "level": 0,
      "nodes": [
        "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
      ]
    },{
      "level": 1,
      "nodes": [
        "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
        "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
      ]
    },{
      // Other levels...
    }]
  }
}
```

Merkle URL result with `extract=true`.
```json
{
  "merkle": {
    "depth": 3,
    "nodesCount": 6,
    "levelsCount": 4,
    "leaves": [
    {
      "index": 1,
      "hash": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "value": // JSON value (object, string, int, ...)
    },
    {
      "index": 2,
      "hash": "E9D71F5EE7C92D6DC9E92FFDAD17B8BD49418F98",
      "value": // JSON value (object, string, int, ...)
    },{
      // Other leaf...
    }]
  }
}
```

## API

### pks/*

This URL is used to manage OpenPGP certificates, making uCoin acting **like** an SKS server.

#### `pks/add`
**Goal**

POST ASCII-armored OpenPGP certificates.

**Parameters**

Name | Value | Method
---- | ----- | ------
`keytext` | The raw certificate, ASCII-armored. | POST
`keysign` | The raw signature of the `keytext` value. | POST

**Returns**

The sent PGP Public Key and signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
  "key":
  {
    "email":"cem.moreau@gmail.com",
    "comment":"udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;",
    "name":"LoL Cat",
    "fingerprint":"C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    "raw":"-----BEGIN PGP PUBLIC KEY BLOCK ... END PGP PUBLIC KEY BLOCK-----\r\n"
  }
}
```

#### `pks/lookup`
**Goal**

Allows to search for OpenPGP certificates, according to [HKP draft](http://tools.ietf.org/html/draft-shaw-openpgp-hkp-00#page-3).

**Parameters**

Name | Value | Method
---- | ----- | ------
`search` | A value for searching in PGP certificates database. May start with '0x' for direct search on PGP fingerprint. | GET
`op` | Operation: may be either 'index' or 'get'. | GET

**Returns**

Result differs according to parameters and is HKP-compliant.

### ucg/*

This URL is used for uCoin Gossip protocol (exchanging UCG messages).

#### `ucg/peering`
**Goal**

GET peering informations about a peer.

**Parameters**

*None*.

**Returns**

The peering entry of this node.
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

#### `ucg/tht (GET)`
**Goal**

GET the whole THT entries.

**Parameters**

*None*.

**Returns**

The whole THT entries (may be big).
```json
{
  "entries": [
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
    },{
      "OTHER_KEY_FINGERPRINT": {
        "number", "6",
        "dateTime": "1304888015",
        "hosters": [
          {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8881},
          {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8882},
        ],
        "trusts": [
          {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "77.77.77.77", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 7555},
          {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "99.99.99.99", "ipv6": "3A03:E35:2421:4BE0:CDBC:C04E:A7AB:ECF3", "port": 9005}
        ],
        "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----"
      }
    }
  ]
}
```

#### `ucg/tht (POST)`
**Goal**

POST a THT entry.

**Parameters**

Name | Value | Method
---- | ----- | ------
`entry` | Entry data. | POST
`signature` | Signature of the THT entry value. | POST

**Returns**

The posted THT entry.
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

#### `ucg/tht/[PGP_FINGERPRINT]`
**Goal**

GET a unique THT entry.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | The key fingerprint we want Trust informations. | URL

**Returns**

The requested THT entry.
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

### hdc/*

This URL pattern manages all the data used by uCoin based on the PKS.

In a general way, those URLs return HTTP **200** code on success, HTTP **501** if not implemented and any HTTP error code on error.

#### `amendments/current`
**Goal**

GET the current promoted amendment (amendment which received enough votes to be accepted).

**Parameters**

*None*.

**Returns**

The current amendment.
```json
{
  "version": "1",
  "currency": "beta_brousoufs",
  "number": "2",
  "previousHash": "0F45DFDA214005250D4D2CBE4C7B91E60227B0E5",
  "dividend": "100",
  "coinMinimalPower": "0",
  "votersRoot": "DC7A9229DFDABFB9769789B7BFAE08048BCB856F",
  "votersCount": "2",
  "votersChanges": [
    "-C73882B64B7E72237A2F460CE9CAB76D19A8651E"
  ],
  "membersRoot": "F92B6F81C85200250EE51783F5F9F6ACA57A9AFF",
  "membersCount": "4",
  "membersChanges": [
    "+31A6302161AC8F5938969E85399EB3415C237F93"
  ],
  "raw": "Version: 1\r\n...+31A6302161AC8F5938969E85399EB3415C237F93\r\n"
}
```

#### `amendments/view/[AMENDMENT_ID]/members`
**Goal**

Merkle URL refering to the membership requests for every member of the Community for this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_ID` | The amendment id (`AMENDMENT_HASH-AMENDMENT_NUMBER`). | URL

**Returns**

Merkle URL result.
```json
{
  "merkle": {
    "depth": 3,
    "nodesCount": 6,
    "levelsCount": 4,
    "levels": [
    {
      "level": 0,
      "nodes": [
        "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
      ]
    },{
      "level": 1,
      "nodes": [
        "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
        "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
      ]
    }]
  }
}
```

Merkle URL leaf: membership request
```json
{
  "index": 1,,
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
    "request": {
      "version": 1,
      "currency": "beta_brousoufs",
      "status": "JOIN",
      "basis": 0
    }
  }
}
``
`
#### `amendments/view/[AMENDMENT_ID]/self`
**Goal**

Shows the raw data of the amendment `[AMENDMENT_ID]`.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_ID` | The amendment id (`AMENDMENT_HASH-AMENDMENT_NUMBER`). | URL

**Returns**

The requested amendment.
```json
{
  "version": "1",
  "currency": "beta_brousoufs",
  "number": "2",
  "previousHash": "0F45DFDA214005250D4D2CBE4C7B91E60227B0E5",
  "dividend": "100",
  "coinMinimalPower": "0",
  "votersRoot": "DC7A9229DFDABFB9769789B7BFAE08048BCB856F",
  "votersCount": "2",
  "votersChanges": [
    "-C73882B64B7E72237A2F460CE9CAB76D19A8651E"
  ],
  "membersRoot": "F92B6F81C85200250EE51783F5F9F6ACA57A9AFF",
  "membersCount": "4",
  "membersChanges": [
    "+31A6302161AC8F5938969E85399EB3415C237F93"
  ],
  "raw": "Version: 1\r\n...+31A6302161AC8F5938969E85399EB3415C237F93\r\n"
}
```

#### `amendments/view/[AMENDMENT_ID]/voters`
**Goal**

Merkle URL refering to the voters of the Community for this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_ID` | The amendment id (`AMENDMENT_HASH-AMENDMENT_NUMBER`). | URL

**Returns**

Merkle URL result.
```json
{
  "level": "0",
  "nodes": [
    "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
    "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
  ]
}
```

Merkle URL leaf: vote
```json
{
  "index": 1,,
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----"
}
```

#### `amendments/votes (GET)`
**Goal**

GET an index of votes received by this node.

**Parameters**

*None*.

**Returns**

A list detailing for each amendment number, statistics of votes (grouped by amendment hash).
```json
{
  "amendments": [
    {
      "number": 2,
      "hashes": [
        {
          "hash": "AMENDMENT_HASH",
          "votesCount": 14
        }
      ]
    },
    {
      "number": 3,
      "hashes": [
        {
          "hash": "AMENDMENT_HASH",
          "votesCount": 7
        }
      ]
    },{
      // Other stats...
    }
  ]
}
```

#### `amendments/votes (POST)`
**Goal**

POST an amendment signed by a Community member, considering it as a vote for this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`amendment` | The raw amendment structure. | POST
`signature` | The signature of the `amendment`. | POST

**Returns**

The posted amendment + posted signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
  "amendment": {
    "version": "1",
    "currency": "beta_brousoufs",
    "number": "2",
    "previousHash": "0F45DFDA214005250D4D2CBE4C7B91E60227B0E5",
    "dividend": "100",
    "coinMinimalPower": "0",
    "votersRoot": "DC7A9229DFDABFB9769789B7BFAE08048BCB856F",
    "votersCount": "2",
    "votersChanges": [
      "-C73882B64B7E72237A2F460CE9CAB76D19A8651E"
    ],
    "membersRoot": "F92B6F81C85200250EE51783F5F9F6ACA57A9AFF",
    "membersCount": "4",
    "membersChanges": [
      "+31A6302161AC8F5938969E85399EB3415C237F93"
    ],
    "raw": "Version: 1\r\n...+31A6302161AC8F5938969E85399EB3415C237F93\r\n"
  }
}
```

#### `amendments/votes/[AMENDMENT_ID]/signatures`
**Goal**

Merkle URL referencing to the votes for a given amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_ID` | The amendment id (`AMENDMENT_HASH-AMENDMENT_NUMBER`). | URL

**Returns**

Merkle URL result.
```json
{
  "level": "0",
  "nodes": [
    "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
    "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
  ]
}
```

Merkle URL leaf: signature
```json
{
  "index": 1,,
  "hash": "2D4224A240938C4263CBC5E7E11564038DED2118",
  "value": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----"
}
```

#### `coins/[PGP_FINGERPRINT]/list`
**Goal**

GET a list of coins owned by the given `[PGP_FINGERPRINT]`.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | Owner of the coins. | URL

**Returns**

Coins list with their owner.
```json
{
  "owner": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
  "coins": [{
      "issuer": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "ids": ["1-5-2-A-1", "2-4-1-A-1"]
    },{
      "issuer": "31A6302161AC8F5938969E85399EB3415C237F93",
      "ids": ["10-1-2-F-14"]
    }
  ]
}
```

#### `coins/[PGP_FINGERPRINT]/view/[COIN_ID]`
**Goal**

GET a transaction chain justifying that coin `[COIN_ID]` is owned by the given `[PGP_FINGERPRINT]`.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | Owner of the coins. | URL
`COIN_ID` | Coin [unique identifier](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#coins-format). | URL

**Returns**

Transaction chain.
```json
{
  "transactions": [
    {
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 92,
      "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "type": "TRANSFERT",
      "coins": [
        {
          "id": "10-1-2-F-14",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-14"
        },{
          // Other coin
        },{
          // ...
        }
      ],
      "comment": "Paying LoLCat's food."
    },{
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 14,
      "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
      "type": "FUSION",
      "coins": [
        {
          "id": "10-1-2-F-14",
          "transaction_id": ""
        },{
          "id": "2-4-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        },{
          "id": "3-6-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        }
      ],
      "comment": "Too much coins ! Making big one."
    }
  ]
}
```

#### `community/join`
**Goal**

POST an individual's membership request with a signature of it to register/actualize his status inside the Community.

**Parameters**

Name | Value | Method
---- | ----- | ------
`request` | The raw individual's membership request. | POST
`signature` | The signature of the `certificate`. | POST

**Returns**

The posted membership request + posted signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
  "request": {
    "version": 1,
    "currency": "beta_brousoufs",
    "status": "JOIN",
    "basis": 0
  }
}
```

#### `community/members`
**Goal**

Merkle URL referencing membership requests of individual's registering/actualizing for the next amendment.

**Parameters**

*None*.

**Returns**

Merkle URL result.
```json
{
  "merkle": {
    "depth": 3,
    "nodesCount": 6,
    "levelsCount": 4,
    "levels": [
    {
      "level": 0,
      "nodes": [
        "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
      ]
    },{
      "level": 1,
      "nodes": [
        "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
        "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
      ]
    }]
  }
}
```

Merkle URL leaf: membership request
```json
{
  "index": 1,,
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
    "request": {
      "version": 1,
      "currency": "beta_brousoufs",
      "status": "JOIN",
      "basis": 0
    }
  }
}
```

#### `community/votes`
**Goal**

Merkle URL referencing the votes that legitimate the current amendment.

**Parameters**

*None*.

**Returns**

Merkle URL result.
```json
{
  "merkle": {
    "depth": 3,
    "nodesCount": 6,
    "levelsCount": 4,
    "levels": [
    {
      "level": 0,
      "nodes": [
        "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
      ]
    },{
      "level": 1,
      "nodes": [
        "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
        "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
      ]
    }]
  }
}
```

Merkle URL leaf: signature
```json
{
  "index": 1,
  "hash": "2D41234540938C4263CBC5E7E11564038DED2118",
  "value": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----"
}
```

#### `transactions/process/issuance`
**Goal**

POST an issuance transaction.

**Parameters**

Name | Value | Method
---- | ----- | ------
`transaction` | The raw transaction. | POST
`signature` | The signature of the `transaction`. | POST

**Returns**

The issuance transaction and its signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
  "transaction":
  {
    "version": 1,
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 1,
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "type": "ISSUANCE",
    "coins": [
      {
        "id": "1-5-2-A-1",
        "transaction_id": ""
      },{
        // Other coin
      },{
        // ...
      }
    ],
    "comment": "Universal Dividend"
  }
}
```

#### `transactions/process/transfert`
**Goal**

POST a transfert transaction.

**Parameters**

Name | Value | Method
---- | ----- | ------
`transaction` | The raw transaction. | POST
`signature` | The signature of the `transaction`. | POST

**Returns**

The transfert transaction and its signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
  "transaction":
  {
    "version": 1,
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 92,
    "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
    "type": "TRANSFERT",
    "coins": [
      {
        "id": "10-1-2-F-14",
        "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-14"
      },{
        // Other coin
      },{
        // ...
      }
    ],
    "comment": "Paying LoLCat's food."
  }
}
```

#### `transactions/process/fusion`
**Goal**

POST a fusion transaction.

**Parameters**

Name | Value | Method
---- | ----- | ------
`transaction` | The raw transaction. | POST
`signature` | The signature of the `transaction`. | POST

**Returns**

The fusion transaction and its signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
  "transaction":
  {
    "version": 1,
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 14,
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "type": "FUSION",
    "coins": [
      {
        "id": "10-1-2-F-14",
        "transaction_id": ""
      },{
        "id": "2-4-1-A-1",
        "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
      },{
        "id": "3-6-1-A-1",
        "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
      }
    ],
    "comment": "Too much coins ! Making big one."
  }
}
```

#### `transactions/all`
**Goal**

Merkle URL referencing all the transactions stored by this node.

**Parameters**

*None*.

**Returns**

Merkle URL result.
```json
{
  "merkle": {
    "depth": 3,
    "nodesCount": 6,
    "levelsCount": 4,
    "levels": [
    {
      "level": 0,
      "nodes": [
        "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
      ]
    },{
      "level": 1,
      "nodes": [
        "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
        "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
      ]
    }]
  }
}
```

Merkle URL leaf: transaction
```json
{
  "index": 1,
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
    "transaction":
    {
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 14,
      "recipient": "[PGP_FINGERPRINT]",
      "type": "FUSION",
      "coins": [
        {
          "id": "10-1-2-F-14",
          "transaction_id": ""
        },{
          "id": "2-4-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        },{
          "id": "3-6-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        }
      ],
      "comment": "Too much coins ! Making big one."
    }
  }
}
```

#### `transactions/sender/[PGP_FINGERPRINT]`
**Goal**

Merkle URL referencing all the transactions sent by this sender stored by this node.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions. | URL

**Returns**

Merkle URL result.
```json
{
  "merkle": {
    "depth": 3,
    "nodesCount": 6,
    "levelsCount": 4,
    "levels": [
    {
      "level": 0,
      "nodes": [
        "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
      ]
    },{
      "level": 1,
      "nodes": [
        "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
        "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
      ]
    }]
  }
}
```

Merkle URL leaf: transaction
```json
{
  "index": 1,
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
    "transaction":
    {
      "version": 1,
      "sender": "[PGP_FINGERPRINT]",
      "number": 14,
      "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
      "type": "FUSION",
      "coins": [
        {
          "id": "10-1-2-F-14",
          "transaction_id": ""
        },{
          "id": "2-4-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        },{
          "id": "3-6-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        }
      ],
      "comment": "Too much coins ! Making big one."
    }
  }
}
```

#### `transactions/recipient/[PGP_FINGERPRINT]`
**Goal**

Merkle URL referencing all the transactions received for this recipient stored by this node.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see received transactions. | URL

**Returns**

Merkle URL result.
```json
{
  "merkle": {
    "depth": 3,
    "nodesCount": 6,
    "levelsCount": 4,
    "levels": [
    {
      "level": 0,
      "nodes": [
        "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
      ]
    },{
      "level": 1,
      "nodes": [
        "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
        "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
      ]
    }]
  }
}
```

Merkle URL leaf: transaction
```json
{
  "index": 1,
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
    "transaction":
    {
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 14,
      "recipient": "[PGP_FINGERPRINT]",
      "type": "FUSION",
      "coins": [
        {
          "id": "10-1-2-F-14",
          "transaction_id": ""
        },{
          "id": "2-4-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        },{
          "id": "3-6-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        }
      ],
      "comment": "Too much coins ! Making big one."
    }
  }
}
```

#### `transactions/view/[TRANSACTION_ID]`
**Goal**

GET the transaction of given `TRANSACTION_ID`.

**Parameters**

Name | Value | Method
---- | ----- | ------
`TRANSACTION_ID` | The transaction [unique identifier](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#transaction). | URL

**Returns**

The transaction and its signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
  "transaction":
  {
    "version": 1,
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 14,
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "type": "FUSION",
    "coins": [
      {
        "id": "10-1-2-F-14",
        "transaction_id": ""
      },{
        "id": "2-4-1-A-1",
        "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
      },{
        "id": "3-6-1-A-1",
        "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
      }
    ],
    "comment": "Too much coins ! Making big one."
  }
}
```
