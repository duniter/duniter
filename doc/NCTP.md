# NCTP - NodeCoin Transport Protocol

NCTP is a transport protocol which aims at exchanging HDC data over HTTP.

## HTTP API

Data is made accessible through an HTTP API mainly inspired from [OpenUDC_exchange_formats draft](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_exchange_formats.draft.txt), and has been adapted to fit NodeCoin specificities.

    http[s]://Node[:port]/...
    |-- pks/
    |   |-- add
    |   `-- lookup
    `-- hdc/
        |-- amendments/
        |   |-- init
        |   |-- submit
        |   |-- view/
        |   |   `-- [AMENDMENT_ID]/
        |   |       |-- members
        |   |       |-- self
        |   |       `-- voters
        |   `-- vote
        |-- coins/
        |   `-- [PGP_FINGERPRINT]/
        |       |-- list
        |       `-- view/
        |           `-- [COIN_NUMBER]
        |-- community/
        |   |-- declare
        |   `-- join
        `-- transactions/
            |-- process/
            |   |-- issuance
            |   `-- transfert
            `-- view/
                `-- [TRANSACTION_ID]

## Merkle URLs

Merkle URL is a special kind of URL applicable for resources:

* `udc/view/[AMENDMENT_ID]/members`
* `udc/view/[AMENDMENT_ID]/voters`
* `udc/transactions/recipient/[OPENPGP_FINGERPRINT]`
* `udc/transactions/sender/[OPENPGP_FINGERPRINT]`
* `udc/transactions/coin/[COIN_ID]`.

Such kind of URL returns Merkle tree hashes informations. In NodeCoin, Merkle trees are an easy way to detect unsynced data and where the differences come from. For example, `udc/view/[AMENDMENT_ID]/members` is a Merkle tree whose leaves are hashes of members key fingerprint sorted ascending way. Thus, if any new key is added, a branch of the tree will see its hash modified and propagated to the root hash. Change is then easy to detect.

For commodity issues, this URL uses query parameters to retrieve partial data of the tree, as most of the time all the data is not required. NodeCoin Merkle tree has a determined number of parent nodes (given a number of leaves), which allows to ask only for interval of them.

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

With such a tree structure, NodeCoin consider the tree has exactly 6 nodes: `[ROOT,H,E,F,G,E]`. Nodes are just an array, and for a Lambda Server LS1, it is easy to ask for the values of another server LS2 for level 1 (`H` and `E`, the second level): it requires nodes interval `[1;2]`.

Hence it is quite easy for anyone who wants to check if a `Z` member joined the NodeCoin community as it would alter the `E` branch of the tree:

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

For that purpose, Merkle URL defines 4 parameters:


Parameter | Description
--------- | -----------
`level` | indicates the level of hashes to be returned. `level` start from 0 (`ROOT` hash).
`index` | in combination with level, filter hashes to return only the hash of level `level` and position `index` on that level. `index` starts from 0.
`start` | defines the start range (inclusive) of desired hashes. If `level` is used, `start` references to the given level. Otherwise references to the root.
`end` | defines the end range (inclusive) of desired hashes. If `level` is used, `end` references to the given level. Otherwise references to the root.

## Other URLs

### pks/*

This URL is used to manage OpenPGP certificates, making NodeCoin acting **like** an SKS server.

URL | Description
--- | -----------
`add` | allows to POST ASCII-ARMORED OpenPGP certificates.
`lookup` | allows to search for OpenPGP certificates, according to [HKP draft](http://tools.ietf.org/html/draft-shaw-openpgp-hkp-00#page-3).

### hdc/*

This URL pattern manages all the data used by NodeCoin based on the PKS.

In a general way, those URLs return HTTP **200** code on success, HTTP **501** if not implemented and any HTTP error code on error.

#### `amendments/init`
**Goal**

GET the initial keys used to forge the initial amendment.

**Parameters**

*None*.

**Returns**

PGP Public Key Messages.
```js
{
  "keys": [{
    "email":"cem.moreau@gmail.com",
    "comment":"udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;",
    "name":"LoL Cat",
    "fingerprint":"C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    "raw":"-----BEGIN PGP PUBLIC KEY BLOCK ... END PGP PUBLIC KEY BLOCK-----\r\n"
  },{
    // Another key
  },{
    // ...
  }]
}
```
#### `amendments/submit`
**Goal**

POST an amendment in ASCII-Armored format ready for voting.

**Parameters**

Name | Value | Method
---- | ----- | ------
`amendment` | The raw amendment structure. | POST

**Returns**

The posted amendment.
```js
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
  raw: "Version: 1\r\n...+31A6302161AC8F5938969E85399EB3415C237F93\r\n"
}
```

#### `amendments/view/[AMENDMENT_ID]/members`
**Goal**

Merkle URL referencing to the members of the Community.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_ID` | The amendment number. | URL

**Returns**

Merkle URL result.
```js
{
  "level": "1",
  "nodes": [
    "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
    "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
  ]
}
```

#### `amendments/view/[AMENDMENT_ID]/self`
**Goal**

Shows the raw data of the amendment `[AMENDMENT_ID]`.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_ID` | The amendment number. | URL

**Returns**

The requested amendment.
```js
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
  raw: "Version: 1\r\n...+31A6302161AC8F5938969E85399EB3415C237F93\r\n"
}
```

#### `amendments/view/[AMENDMENT_ID]/voters`
**Goal**

Merkle URL referencing to the voters of the Community.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_ID` | The amendment number. | URL

**Returns**

Merkle URL result.
```js
{
  "level": "0",
  "nodes": [
    "585DD1B0A3A55D9A36DE747EC37524D318E2EBEE",
    "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F"
  ]
}
```

#### `amendments/vote`
**Goal**

POST an amendment signed by a Community member, considering it as a vote for this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`amendment` | The raw amendment structure. | POST
`signature` | The signature of the `amendment`. | POST

**Returns**

The posted amendment + posted signature.
```js
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
    raw: "Version: 1\r\n...+31A6302161AC8F5938969E85399EB3415C237F93\r\n"
  }
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
```js
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
`COIN_ID` | Coin [unique identifier](https://github.com/c-geek/nodecoind/blob/master/doc/HDC.md#coins-format). | URL

**Returns**

Transaction chain.
```js
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
      ]
    },{
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 14,
      "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
      "type": "FUSION",
      "coins": [
        {
          "id": "2-4-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        },{
          "id": "3-6-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        }
      ]
    }
  ]
}
```

#### `community/join`
**Goal**

POST an individual's PGP certificate with a signature of it to officialize his will join the community.

**Parameters**

Name | Value | Method
---- | ----- | ------
`certificate` | The raw individual's certificate. | POST
`signature` | The signature of the `certificate`. | POST

**Returns**

The posted certificate + posted signature.
```js
{
  "signature": "-----BEGIN PGP SIGNATURE ... END PGP SIGNATURE-----",
  "certificate": {
    "email":"cem.moreau@gmail.com",
    "comment":"udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;",
    "name":"LoL Cat",
    "fingerprint":"C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    "raw":"-----BEGIN PGP PUBLIC KEY BLOCK ... END PGP PUBLIC KEY BLOCK-----\r\n"
  }
}
```

#### `community/declare`
**Goal**

POST a THT entry declaration.

**Parameters**

Name | Value | Method
---- | ----- | ------
`certificate` | The raw individual's certificate. | POST
`signature` | The signature of the `certificate`. | POST

**Returns**

The new THT entry.
```js
{
  "number", "1",
  "dateTime": "1374852192",
  "managedBy": [
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1"},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "22.22.22.22", "ipv6": "2A02:E35:2421:4BE0:CDBC:C04E:A7AB:ECF2"},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "33.33.33.33", "ipv6": "3A03:E35:2421:4BE0:CDBC:C04E:A7AB:ECF3"},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "44.44.44.44", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1"}
  ],
  "trusts": [
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "77.77.77.77", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1"},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "88.88.88.88", "ipv6": "2A02:E35:2421:4BE0:CDBC:C04E:A7AB:ECF2"},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "99.99.99.99", "ipv6": "3A03:E35:2421:4BE0:CDBC:C04E:A7AB:ECF3"}
  ]
}
```

#### transactions/*

URL | Description | Result
--- | ----------- | ------
`process/issuance` | is a URL to POST an issuance transaction. | The issuance transaction.
`process/transfert` | is a URL to POST a transfert transaction. | The transfert transaction.
`process/transfert` | is a URL to POST a fusion transaction. | The fusion transaction.
`view/[TRANSACTION_ID]` | displays detailed informations about a transaction. | The asked transaction.