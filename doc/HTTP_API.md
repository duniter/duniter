# uCoin HTTP API

## Contents

* [Contents](#contents)
* [Overview](#overview)
* [Merkle URLs](#merkle-urls)
* [API](#api)
  * [pks/](#pks)
      * [add](#pksadd)
      * [lookup](#pkslookup)
      * [all](#pksall)
  * [keychain/](#keychain)
      * [membership](#keychainmembership)
      * [keyblock](#keychainkeyblock)
      * [current](#keychaincurrent)
  * [network/](#network)
      * [pubkey](#networkpubkey)
      * [peering](#networkpeering)
      * [peering/peers (GET)](#networkpeeringpeers-get)
      * [peering/peers (POST)](#networkpeeringpeers-post)
      * [peering/peers/upstream](#networkpeeringpeersupstream)
      * [peering/peers/upstream/[PGP_FINGERPRINT]](#networkpeeringpeersupstreampgp_fingerprint)
      * [peering/peers/downstream](#networkpeeringpeersdownstream)
      * [peering/peers/downstream/[PGP_FINGERPRINT]](#networkpeeringpeersdownstreampgp_fingerprint)
      * [peering/forward](#networkpeeringforward)
      * [peering/status](#networkpeeringstatus)
      * [wallet (GET)](#networkwallet-get)
      * [wallet (POST)](#networkwallet-post)
      * [wallet/[PGP_FINGERPRINT]](#networkwalletpgp_fingerprint)
  * [contract/](#contract)
      * [parameters](#parameters)
      * [am/[AMENDMENT_NUMBER]](#amamendment_number)
  * [tx/](#tx)
      * [process](#process)
      * [last/[count]](#lastcount)
      * [sender/[PGP_FINGERPRINT]](#senderpgp_fingerprint)
      * [sender/[PGP_FINGERPRINT]/view/[TX_NUMBER]](#senderpgp_fingerprintviewtx_number)
      * [sender/[PGP_FINGERPRINT]/last/[count]/[from]](#senderpgp_fingerprintlastcountfrom)
      * [recipient/[PGP_FINGERPRINT]](#recipientpgp_fingerprint)
      * [refering/[PGP_FINGERPRINT]/[TX_NUMBER]](#referingpgp_fingerprinttx_number)
      * [coins/list/[PGP_FINGERPRINT]](#coinslistpgp_fingerprint)
      * [coins/view/[COIN_ID]/owner](#coinsviewcoin_idowner)
      * [coins/view/[COIN_ID]/history](#coinsviewcoin_idhistory)

## Overview

Data is made accessible through an HTTP API mainly inspired from [OpenUDC_exchange_formats draft](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_exchange_formats.draft.txt), and has been adapted to fit uCoin specificities.

    http[s]://Node[:port]/...
    |-- pks/
    |   |-- add
    |   |-- all
    |   `-- lookup
    |-- keychain/
    |   |-- membership
    |   |-- keyblock
    |   `-- current
    |-- network/
    |   |-- pubkey
    |   |-- peering
    |   |   |-- forward
    |   |   |-- status
    |   |   `-- peers/
    |   |       |-- upstream/
    |   |       |   `-- [PGP_FINGERPRINT]
    |   |       `-- downstream/
    |   |           `-- [PGP_FINGERPRINT]
    |   `-- wallet/
    |       `-- [PGP_FINGERPRINT]
    |-- contract/
    |   |-- parameters
    |   `-- amendments/
    |       `-- am/
    |           `-- [AMENDMENT_NUMBER]
    `-- tx/
        |-- process
        |-- last/
        |   `-- [count]
        |-- sender/
        |   `-- [PGP_FINGERPRINT]/
        |       |-- view/
        |       |   `-- [TX_NUMBER]
        |       `-- last/
        |           `-- [count]/
        |               `-- [from]
        |-- recipient/
        |   `-- [PGP_FINGERPRINT]
        |-- refering/    
        |   `-- [PGP_FINGERPRINT]/
        |       `-- [TX_NUMBER]
        `-- coins/
            |-- list/
            |   `-- [PGP_FINGERPRINT]
            `-- view/
                `-- [COIN_ID]/
                    |-- history
                    `-- owner

## Merkle URLs

Merkle URL is a special kind of URL applicable for resources:

* `pks/all`
* `network/peering/peers (GET)`
* `network/wallet (GET)`
* `hdc/transactions/sender/[PGP_FINGERPRINT]`
* `hdc/transactions/recipient/[PGP_FINGERPRINT]`

Such kind of URL returns Merkle tree hashes informations. In uCoin, Merkle trees are an easy way to detect unsynced data and where the differences come from. For example, `network/peers` is a Merkle tree whose leaves are peers' key fingerprint sorted ascending way. Thus, if any new peer is added, a branch of the tree will see its hash modified and propagated to the root hash. Change is then easy to detect.

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
`leaves`  | Defines wether or not leaves hashes should be returned too. Defaults to `false`.
`leaf`    | Hash of a leaf whose content should be returned. Ignore `leaves` parameter.

**Returns**

Merkle URL result with `leaves=false`.
```json
{
  "depth": 3,
  "nodesCount": 6,
  "leavesCount": 5,
  "root": "6513D6A1582DAE614D8A3B364BF3C64C513D236B"
}
```

Merkle URL result with `leaves=true`.
```json
{
  "depth": 3,
  "nodesCount": 6,
  "leavesCount": 5,
  "root": "6513D6A1582DAE614D8A3B364BF3C64C513D236B",
  "leaves": [
    "32096C2E0EFF33D844EE6D675407ACE18289357D",
    "50C9E8D5FC98727B4BBC93CF5D64A68DB647F04F",
    "6DCD4CE23D88E2EE9568BA546C007C63D9131C1B",
    "AE4F281DF5A5D0FF3CAD6371F76D5C29B6D953EC",
    "E0184ADEDF913B076626646D3F52C3B49C39AD6D"
  ]
}
```

Merkle URL result with `leaf=AE4F281DF5A5D0FF3CAD6371F76D5C29B6D953EC`.
```json
{
  "depth": 3,
  "nodesCount": 6,
  "leavesCount": 5,
  "root": "6513D6A1582DAE614D8A3B364BF3C64C513D236B",
  "leaf": {
    "hash": "AE4F281DF5A5D0FF3CAD6371F76D5C29B6D953EC",
    "value": // JSON value (object, string, int, ...)
  }
}
```

### uCoin Merkle trees leaves

Each tree manages different data, and has a different goal. Hence, each tree has its own rules on how are generated and sorted tree leaves.
Here is a summup of such rules:


Merkle URL                                                                | Leaf                                    | Sort
------------------------------------------------------------------------- | ----------------------------------------| ---------------------------------------
`pks/all`                                                                 | Fingerprint of the key                  | By fingerprint string sort, ascending.
`network/peers (GET)`                                                     | Fingerprint of the peer                 | By fingerprint string sort, ascending.
`network/wallet (GET)`                                                    | Fingerprint of the wallet               | By fingerprint string sort, ascending.
`hdc/transactions/sender/[PGP_FINGERPRINT]`                               | Hash of (transaction + signature)       | By hash string sort, ascending.
`hdc/transactions/recipient/[PGP_FINGERPRINT]`                            | Hash of (transaction + signature)       | By hash string sort, ascending.

#### Unicity

It has to be noted that the first four Merkle URLs, there is **no possible conflict** for leaves, as every leaf is represents a OpenPGP key whose fingerprint is unique according to [uCoin protocol](./Protocol.md). Indeed: *nodes are responsible for the concrete key stored under a fingerprint*.

However for the 2 last URLs, conflicts are possible even if largely improbable. Such conflicts would not be a huge problem however: it would lead to hide one of the conflicted transactions, but those 2 URLs are not here for exhaustive inventory of transactions, only for quick synchronization checking. So the goal is still reached.

## API

### pks/*

This URL is used to manage OpenPGP certificates, making uCoin acting **like** an SKS server.

#### `pks/add`
**Goal**

POST ASCII-armored OpenPGP certificates.

**Parameters**

Name      | Value                                     | Method
--------- | ----------------------------------------- | ------
`keytext` | The raw certificate, ASCII-armored.       | POST

**Returns**

The sent PGP Public Key and signature.
```json
{
  "email":"cem.moreau@gmail.com",
  "comment":"udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;",
  "name":"LoL Cat",
  "fingerprint":"C73882B64B7E72237A2F460CE9CAB76D19A8651E",
  "raw":"-----BEGIN PGP PUBLIC KEY BLOCK----- ... -----END PGP PUBLIC KEY BLOCK-----\r\n"
}
```

#### `pks/lookup`
**Goal**

Allows to search for OpenPGP certificates, according to [HKP draft](http://tools.ietf.org/html/draft-shaw-openpgp-hkp-00#page-3).

**Parameters**

Name     | Value                                                                                                         | Method
-------- | ------------------------------------------------------------------------------------------------------------- | ------
`search` | A value for searching in PGP certificates database. May start with '0x' for direct search on PGP fingerprint. | GET
`op`     | Operation: may be either 'index' or 'get'.                                                                    | GET

**Returns**

A list of matching PGP keys in json format if `op=index`, a single ASCII-armored key if `op=get`.

```json
{
  "keys": [
    {
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "key":
      {
        "email":"cem.moreau@gmail.com",
        "comment":"udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;",
        "name":"LoL Cat",
        "fingerprint":"C73882B64B7E72237A2F460CE9CAB76D19A8651E",
        "raw":"-----BEGIN PGP PUBLIC KEY BLOCK----- ... -----END PGP PUBLIC KEY BLOCK-----\r\n"
      }
    },{
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "key":
      {
        "email":"cem.moreau@gmail.com",
        "comment":"udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;",
        "name":"LoL Cat",
        "fingerprint":"C73882B64B7E72237A2F460CE9CAB76D19A8651E",
        "raw":"-----BEGIN PGP PUBLIC KEY BLOCK----- ... -----END PGP PUBLIC KEY BLOCK-----\r\n"
      }
    }
  ]
```

#### `pks/all`
**Goal**

Merkle URL refering all the received public keys.

**Parameters**

*None*.

**Returns**

Merkle URL result.
```json
{
  "depth": 3,
  "nodesCount": 6,
  "leavesCount": 5,
  "root": "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
}
```

Merkle URL leaf: public key
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "fingerprint": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    "pubkey": "-----BEGIN PGP PUBLIC KEY BLOCK----- ... -----END PGP PUBLIC KEY BLOCK-----\r\n"
  }
}
```

### keychain/*

#### `keychain/membership`

> TODO

#### `keychain/keyblock`

> TODO

#### `keychain/current`

> TODO

### network/*

This URL is used for uCoin Gossip protocol (exchanging UCG messages).

#### `network/pubkey`
**Goal**

GET the public key of the peer.

**Parameters**

*None*.

**Returns**

The public key in ASCII-armored format.
```
-----BEGIN PGP PUBLIC KEY BLOCK-----
Version: GnuPG v1.4.12 (GNU/Linux)

mQENBFHHC/EBCADWTLSN7EGP+n30snndS3ZNcB02foL+0opcS6LK2coPDJLg2noo
keJRHZxF3THmZQrKwZOjiuDBinOc5DWlzIS/gD/RaXwntgPFlGKBlBU+g255fr28
ziSb5Y1lW4N//nUFdPZzoMmPgRj0b17T0UPCoMR8ZZ/Smk5LINbQwt+A+LEoxEdE
Vcq+Tyc0OlEabqO6RFqiKDRiPhGPiCwVQA3yPjb6iCp5gTchObCxCnDbxA0Mfj9F
mHrGbepNHGXxStO4xT0woCb7y02S1E8K08kOc5Bq9e1Yj5I/mdaw4Hn/Wp28lZl1
mnO1u1z9ZU/rcglhEyaEOTwasheb44QcdGSfABEBAAG0TUxvTCBDYXQgKHVkaWQy
O2M7Q0FUO0xPTDsyMDAwLTA0LTE5O2UrNDMuNzAtMDc5LjQyOzA7KSA8Y2VtLm1v
cmVhdUBnbWFpbC5jb20+iQE9BBMBCAAnBQJRxwvxAhsDBQkLR5jvBQsJCAcDBRUK
CQgLBRYCAwEAAh4BAheAAAoJEOnKt20ZqGUeZYcH/0ItH4b/O0y7V1Jzc1DZAdn4
iDiI7/SF3fN4f6cJCu/SOVb+ERFIb6JK+HNHdVAcMHKaPW625R0FahHUkcXWkkGm
Q6+sLIsVZwVN1oeZtlD12cq9A4UJyfJUXkinMKkI8xpdV8J7s5wFRavOS/qaF5be
ah0Z+IGwQK0nuXxWpT6UZWbpUfXPQB2Mz2/rpjSWKwO3X4FwwOfDiuZExyH2JPDY
shdPcj/x+gnzYW9XfWCJw3rOK42vtM+aLtUpJO0Jh6X/sj/iqyS4rPB4DVCmEgSX
Px1P+kqnsz3aNTOIujXS8Faz+TC+eNhn+z3SoTl5gBlNNM171fWFr0BR3nIfIu65
AQ0EUccL8QEIAPAQaxK6s4DjDHiOwrMotvb479QD5PsHU6S0VG0+naoPlNJb2d5w
YhnFAn4aYLiXx4IIl38rHnV+yWATOUe2rdCe4enTXkxyWJVaxIcNJLFpUjHYGbrC
nNwiXpuQfSDuRN/wcVNSBKXhWNUPY9IsbgERWhS5YTFnuQcBjMqDwF6JImQ8O4nZ
wno811nqK1XaMuLVvXZAsO1Vi1k3NArM5+jdlq9e3BA0NcHJmGEcQdTw0Tk5Oq6r
mE8ux7pS0bn6OUkkseR5DyRlFtzqi4wp30GeggeFExx7ZCVuctpJX9ZoC3cJoZT0
s3LuUtV0EW50yCtP+3Vpkek2WtjfVbM6kDkAEQEAAYkBJQQYAQgADwUCUccL8QIb
DAUJC0eY7wAKCRDpyrdtGahlHg7+B/95xEoSrFQ7/mc7g6sbisvx3s547gUXXYSu
FHS03IMDWJrfGKqXtBf9ETBx4OLeBXY7z1lL4WCN6/xtrL+mSQ9dbDqdXv/1EhkS
v0s+IvJ34KYGAkFXSCoTE7rnkPwQjoMYVSFkf5e8g9adyKvndq/QSPNuv+FPL6sH
m1N9nmus5Ebr0zTVDmmfoqzokuDfHm5h6YrkFscMGjrCKWuXSiTaGj9Hm3MqeZ3T
Kva5isa/h0h7Ai3wJ5XJpMrFNN6BU/wIt7fM2hsNAOwaG+WUfgjYEkOua8gPPtpL
ZJJPb/89yrs9F7JkLi/oiAl5VpItm+hlFpLe1TE7oa6k53eZ2a+V
=rOj9
-----END PGP PUBLIC KEY BLOCK-----
```

#### `network/peering`
**Goal**

GET the peering informations of this node.

**Parameters**

*None*.

**Returns**

Peering entry of the node.
```json
{
  "version": "1",
  "currency": "beta_brousouf",
  "fingerprint": "A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468",
  "endpoints": [
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001",
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002",
    "OTHER_PROTOCOL 88.77.66.55 9001",
  ],
  "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n"
}
```

#### `network/peering/peers (GET)`
**Goal**

Merkle URL refering to peering entries of every node inside the currency network.

**Parameters**

*None*.

**Returns**

Merkle URL result.
```json
{
  "depth": 3,
  "nodesCount": 6,
  "leavesCount": 5,
  "root": "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
}
```

Merkle URL leaf: peering entry
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "version": "1",
    "currency": "beta_brousouf",
    "fingerprint": "A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468",
    "endpoints": [
      "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001",
      "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002",
      "OTHER_PROTOCOL 88.77.66.55 9001"
    ],
    "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n"
  }
}
```

#### `network/peering/peers (POST)`
**Goal**

POST a UCG peering entry document to this node in order to alter UCG peering table.

**Parameters**

Name        | Value                               | Method
----------- | ----------------------------------- | ------
`entry`     | UCG peering entry document.         | POST
`signature` | Signature of the UCG entry's value. | POST

**Returns**

The posted entry.
```json
{
  "version": "1",
  "currency": "beta_brousouf",
  "fingerprint": "A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468",
  "endpoints": [
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001",
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002",
    "OTHER_PROTOCOL 88.77.66.55 9001"
  ],
  "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n"
}
```

#### `network/peering/peers/upstream`
**Goal**

GET a list of peers this node is **listening to** for ANY incoming transaction.

**Parameters**

*None*.

**Returns**

The corresponding peer list's fingerprints.

```json
{
  "peers": [
    "A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468",
    "B356F8A6AD4A0431AF047AA204511A9F8A51ED37"
  ]
}
```

#### `network/peering/peers/upstream/[PGP_FINGERPRINT]`
**Goal**

GET a list of peers this node is **listening to** for incoming transactions of `PGP_FINGERPRINT`.

**Parameters**

Name              | Value                                                                        | Method
----------------- | ---------------------------------------------------------------------------- | ------
`PGP_FINGERPRINT` | PGP key's fingerprint whose incoming transactions are listened by this node. | URL

**Returns**

The corresponding peer list.

```json
{
  "peers": [
    "A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468",
    "B356F8A6AD4A0431AF047AA204511A9F8A51ED37"
  ]
}
```

#### `network/peering/peers/downstream`
**Goal**

GET a list of peers this node is **listened by** for ANY incoming transaction.

**Parameters**

*None*.

**Returns**

The corresponding peer list.

```json
{
  "peers": [
    "A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468",
    "B356F8A6AD4A0431AF047AA204511A9F8A51ED37"
  ]
}
```

#### `network/peering/peers/downstream/[PGP_FINGERPRINT]`
**Goal**

GET a list of peers this node is **listened by** for incoming transactions of `PGP_FINGERPRINT`.

**Parameters**

Name              | Value                                                                          | Method
----------------- | ------------------------------------------------------------------------------ | ------
`PGP_FINGERPRINT` | PGP key's fingerprint whose incoming transactions are listened by other nodes. | URL

**Returns**

The corresponding peer list.

```json
{
  "peers": [
    "A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468",
    "B356F8A6AD4A0431AF047AA204511A9F8A51ED37"
  ]
}
```

#### `network/peering/forward`
**Goal**

POST a UCG forward document to this node in order to be sent back incoming transactions.

**Parameters**

Name        | Value                                  | Method
----------- | -------------------------------------- | ------
`forward`   | UCG forward document.                  | POST
`signature` | Signature of the UCG forward document. | POST

**Returns**

The posted forward.
```json
{
  "version": "1",
  "currency": "beta_brousouf",
  "from": "A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468",
  "to": "CC5AE6DA4307AD2339FB52013119E9704EDE0802",
  "forward": "KEYS",
  "keys": [
    "395DF8F7C51F007019CB30201C49E884B46B92FA",
    "58E6B3A414A1E090DFC6029ADD0F3555CCBA127F",
    "4DC7C9EC434ED06502767136789763EC11D2C4B7",
    "8EFD86FB78A56A5145ED7739DCB00C78581C5375",
    "95CB0BFD2977C761298D9624E4B4D4C72A39974A"
  ]
}
```

#### `network/peering/status`
**Goal**

POST a UCG status document to this node in order notify of its status.

**Parameters**

Name        | Value                                  | Method
----------- | -------------------------------------- | ------
`status`    | UCG status document.                   | POST
`signature` | Signature of the UCG entry's value.    | POST

**Returns**

The posted status.
```json
{
  "version": "1",
  "currency": "beta_brousouf",
  "status": "UP"
}
```

#### `network/wallet (GET)`
**Goal**

Merkle URL refering to WHT (Wallets Hash Table).

**Parameters**

*None*.

**Returns**

Merkle URL result.
```json
{
  "depth": 3,
  "nodesCount": 6,
  "leavesCount": 5,
  "root": "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
}
```

Merkle URL leaf: Wallet
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
    "entry": {
      "version": "1",
      "currency": "beta_brousouf",
      "issuer": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "requiredTrusts": 3,
      "hosters": [
        "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
        "D049002A6724D35F867F64CC087BA351C0AEB6DF"
      ],
      "trusts": [
        "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
        "D049002A6724D35F867F64CC087BA351C0AEB6DF"
      ]
    }
  }
}
```

#### `network/wallet (POST)`
**Goal**

POST a Wallet.

**Parameters**

Name        | Value                                  | Method
----------- | -------------------------------------- | ------
`entry`     | Entry data.                            | POST
`signature` | Signature of the Wallet value.         | POST

**Returns**

The posted Wallet.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
  "entry": {
    "version": "1",
    "currency": "beta_brousouf",
    "fingerprint": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    "requiredTrusts": 3,
    "hosters": [
      "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "D049002A6724D35F867F64CC087BA351C0AEB6DF"
    ],
    "trusts": [
      "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "D049002A6724D35F867F64CC087BA351C0AEB6DF"
    ]
  }
}
```

#### `network/wallet/[PGP_FINGERPRINT]`
**Goal**

GET a unique Wallet.

**Parameters**

Name              | Value                                           | Method
----------------- | ----------------------------------------------- | ------
`PGP_FINGERPRINT` | The key fingerprint we want Trust informations. | URL

**Returns**

The requested Wallet.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
  "entry": {
    "version": "1",
    "currency": "beta_brousouf",
    "fingerprint": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    "requiredTrusts": 3,
    "hosters": [
      "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "D049002A6724D35F867F64CC087BA351C0AEB6DF"
    ],
    "trusts": [
      "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
      "D049002A6724D35F867F64CC087BA351C0AEB6DF"
    ]
  }
}
```

### contract/*

This URL pattern manages all the data used by uCoin based on the PKS.

In a general way, those URLs return HTTP **200** code on success, HTTP **501** if not implemented and any HTTP error code on error.

#### `parameters`

> TODO: rewrite this method

**Goal**

GET the synchronization parameters used by this node.

**Parameters**

*None*.

**Returns**

The synchronization parameters.
```json
{
    "AMStart": 1388530800,
    "AMFrequency": 86400,
    "UDFrequency": 2629800,
    "UD0": 100,
    "UDPercent": 0.007376575,
    "CoinAlgo": "Base2Draft",
    "Consensus": 0.6666666666666666
}
```

Below are parameters meaning:

Parameter         | Meaning
----------------- | ------------
AMStart           | Root amendment starting timestamp (in seconds)
AMFrequency       | Amendment frequency (in seconds)
UDFrequency       | Universal Dividend frequency (in seconds)
UD0               | Universal Dividend initial value
UDPercent         | Universal Dividend % of monetary mass growth
CoinAlgo          | Algorithm used for generating coins (this also gives interpretation of coins' value in each amendment)
Consensus         | Percent of voters required to valid an Amendment

#### `am/[AMENDMENT_NUMBER]`
**Goal**

GET the promoted amendment with number `AMENDMENT_NUMBER`.

**Parameters**

Name               | Value                                                         | Method
------------------ | ------------------------------------------------------------- | ------
`AMENDMENT_NUMBER` | The promoted amendment number (integer value) we want to see. | URL

**Returns**

The promoted amendment if it exists (otherwise return HTTP 404).
```json
{
  "version": "1",
  "currency": "beta_brousouf",
  "number": "2",
  "generated": 1400588975,
  "previousHash": "0F45DFDA214005250D4D2CBE4C7B91E60227B0E5",
  "dividend": "100",
  "membersRoot": "F92B6F81C85200250EE51783F5F9F6ACA57A9AFF",
  "membersCount": "4",
  "membersChanges": [
    "+31A6302161AC8F5938969E85399EB3415C237F93"
  ],
  "raw": "Version: 1\r\n...+31A6302161AC8F5938969E85399EB3415C237F93\r\n"
}
```

### tx/*

#### `tx/process`
**Goal**

POST a transaction.

**Parameters**

Name              | Value                                                         | Method
----------------- | ------------------------------------------------------------- | ------
`transaction`     | The raw transaction.                                          | POST
`signature`       | The signature of the `transaction`.                           | POST

**Returns**

The recorded transaction and its signature.
```json
{
  "raw": "Version: 1\r\n...\r\n",
  "transaction":
  {
    "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
    "version": 1,
    "currency": "beta_brousouf",
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 1,
    "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
    "recipient": "A9571447F4B6B477F1037D85C6211FB059C561C7",
    "amounts": [
      "9EE7ABA9EE7A15F57319B6BFC21FA08E821ABEAA-0:100",
      "D02B0466F3F9B7B0C9C8E926700379AEF0DD1E5B-1:110",
    ],
    "comment": "Buying something"
  }
}
```

#### `tx/last/[COUNT]`
**Goal**

Get the last `n` received transactions.

**Parameters**

Name              | Value                                                                        | Method
----------------- | ---------------------------------------------------------------------------- | ------
`COUNT`           | Integer indicating to retrieve the last [COUNT] transactions. Defaults to 1. | URL

**Returns**

The last [COUNT] transactions received.
```json
{
  "transactions": [
    {
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 92,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "amounts": [
        "70C881D4A26984DDCE795F6F71817C9CF4480E79-92:66",
        "503A586FE6F7819A18A38426A7C2C1D0880F99CB-122:988",
      ],
      "comment": "Paying LoLCat's food."
    },{
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "version": 1,
      "currency": "beta_brousouf",
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 91,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "A9571447F4B6B477F1037D85C6211FB059C561C7",
      "amounts": [
        "9EE7ABA9EE7A15F57319B6BFC21FA08E821ABEAA-0:100",
        "D02B0466F3F9B7B0C9C8E926700379AEF0DD1E5B-1:110",
      ],
      "comment": "Buying something"
    }
  ]
}
```

#### `tx/sender/[PGP_FINGERPRINT]`
**Goal**

Merkle URL referencing all the transactions sent by this sender and stored by this node (should contain all transactions of the sender).

**Parameters**

Name              | Value                                                         | Method
----------------- | ------------------------------------------------------------- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions.  | URL

**Returns**

Merkle URL result.
```json
{
  "depth": 3,
  "nodesCount": 6,
  "leavesCount": 5,
  "root": "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
}
```

Merkle URL leaf: transaction
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "transaction":
    {
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "version": 1,
      "sender": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
      "number": 14,
      "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
      "coins": [
        "2E69197FAB029D8669EF85E82457A1587CA0ED9C-10-1",
        "2E69197FAB029D8669EF85E82457A1587CA0ED9C-2-4:31A6302161AC8F5938969E85399EB3415C237F93-1",
        "2E69197FAB029D8669EF85E82457A1587CA0ED9C-3-6:31A6302161AC8F5938969E85399EB3415C237F93-1",
      ],
      "comment": "Giving back some coins"
    }
  }
}
```

#### `tx/sender/[PGP_FINGERPRINT]/view/[TX_NUMBER]`
**Goal**

GET the transaction of given `TRANSACTION_ID`.

**Parameters**

Name              | Value                                                                                                                | Method
----------------- | -------------------------------------------------------------------------------------------------------------------- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see transaction.                                                               | URL
`TX_NUMBER`       | The transaction [unique identifier](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#transaction) number part. | URL

**Returns**

The transaction and its signature.
```json
{
  "raw": "Version: 1\r\n...\r\n",
  "transaction":
  {
    "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
    "version": 1,
    "sender": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
    "number": 14,
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "coins": [
      "2E69197FAB029D8669EF85E82457A1587CA0ED9C-10-1",
      "2E69197FAB029D8669EF85E82457A1587CA0ED9C-2-4:31A6302161AC8F5938969E85399EB3415C237F93-1",
      "2E69197FAB029D8669EF85E82457A1587CA0ED9C-3-6:31A6302161AC8F5938969E85399EB3415C237F93-1",
    ],
    "comment": "Giving back some coins"
  }
}
```

#### `tx/sender/[PGP_FINGERPRINT]/last/[COUNT]/[FROM]`
**Goal**

Get the last `n` received transactions of a PGP key.

**Parameters**

Name              | Value                                                                                      | Method
----------------- | ------------------------------------------------------------------------------------------ | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see last transaction.                                | URL
`COUNT`           | Integer indicating to retrieve the last [COUNT] transactions. Defaults to 1.               | URL
`FROM`            | Integer indicating to retrieve [COUNT] transactions starting from [FROM] number. Optional. | URL

**Returns**

The last [COUNT] transactions of given PGP key.
```json
{
  "transactions": [
    {
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 92,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "amounts": [
        "70C881D4A26984DDCE795F6F71817C9CF4480E79-92:66",
        "503A586FE6F7819A18A38426A7C2C1D0880F99CB-122:988",
      ],
      "comment": "Paying LoLCat's food."
    },{
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "version": 1,
      "currency": "beta_brousouf",
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 91,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "A9571447F4B6B477F1037D85C6211FB059C561C7",
      "amounts": [
        "9EE7ABA9EE7A15F57319B6BFC21FA08E821ABEAA-0:100",
        "D02B0466F3F9B7B0C9C8E926700379AEF0DD1E5B-1:110",
      ],
      "comment": "Buying something"
    }
  ]
}
```

#### `tx/recipient/[PGP_FINGERPRINT]`
**Goal**

Merkle URL referencing all the transactions received for this recipient stored by this node.

**Parameters**

Name              | Value                                                            | Method
----------------- | ---------------------------------------------------------------- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see received transactions. | URL

**Returns**

Merkle URL result.
```json
{
  "depth": 3,
  "nodesCount": 6,
  "leavesCount": 5,
  "root": "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
}
```

Merkle URL leaf: transaction
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "transaction":
    {
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 92,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "amounts": [
        "70C881D4A26984DDCE795F6F71817C9CF4480E79-92:66",
        "503A586FE6F7819A18A38426A7C2C1D0880F99CB-122:988",
      ],
      "comment": "Paying LoLCat's food."
    }
  }
}
```

#### `tx/refering/[PGP_FINGERPRINT]/[TX_NUMBER]`
**Goal**

GET all the transactions refering to source transaction #`[TX_NUMBER]` issued by `[PGP_FINGERPRINT]`.

**Parameters**

Name              | Value                                                         | Method
----------------- | ------------------------------------------------------------- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions.  | URL
`TX_NUMBER`       | Transaction number of given PGP key                           | URL

**Returns**

A list of transactions pointing to this source transaction.
```json
{
  "transactions": [
    {
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 92,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "amounts": [
        "70C881D4A26984DDCE795F6F71817C9CF4480E79-92:66",
        "503A586FE6F7819A18A38426A7C2C1D0880F99CB-122:988",
      ],
      "comment": "Paying LoLCat's food."
    },{
      "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
      "version": 1,
      "currency": "beta_brousouf",
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 91,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "A9571447F4B6B477F1037D85C6211FB059C561C7",
      "amounts": [
        "9EE7ABA9EE7A15F57319B6BFC21FA08E821ABEAA-0:100",
        "D02B0466F3F9B7B0C9C8E926700379AEF0DD1E5B-1:110",
      ],
      "comment": "Buying something"
    }
  ]
}
```

#### `coins/list/[PGP_FINGERPRINT]`
**Goal**

GET all the coins owned by `[PGP_FINGERPRINT]`.

**Parameters**

Name              | Value                                                         | Method
----------------- | ------------------------------------------------------------- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent owned coins.   | URL

**Returns**

A list of coins owned by this key.
```json
{
  "coins": [
    "31A6302161AC8F5938969E85399EB3415C237F93-0-1",
    "31A6302161AC8F5938969E85399EB3415C237F93-0-2",
    "31A6302161AC8F5938969E85399EB3415C237F93-0-3",
    "31A6302161AC8F5938969E85399EB3415C237F93-0-4",
    "D02B0466F3F9B7B0C9C8E926700379AEF0DD1E5B-0-1",
    "D02B0466F3F9B7B0C9C8E926700379AEF0DD1E5B-0-2",
    "D02B0466F3F9B7B0C9C8E926700379AEF0DD1E5B-0-3",
    "D02B0466F3F9B7B0C9C8E926700379AEF0DD1E5B-0-4",
    "D02B0466F3F9B7B0C9C8E926700379AEF0DD1E5B-0-5"
    ...
  ]
}
```

#### `coins/view/[COIN_ID]/owner`
**Goal**

GET a coin owner + justifying transaction if it exists.

**Parameters**

Name              | Value                                                         | Method
----------------- | ------------------------------------------------------------- | ------
`COIN_ID`         | ID of the coin to be checked.                                 | URL

**Returns**

A coin's ownership.
```json
{
  "coinid": "70C881D4A26984DDCE795F6F71817C9CF4480E79-92-66",
  "owner": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
  "transaction": {
    "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
    "version": 1,
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 92,
    "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
    "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
    "amounts": [
      "31A6302161AC8F5938969E85399EB3415C237F93-92-25",
      "31A6302161AC8F5938969E85399EB3415C237F93-122-1",
    ],
    "comment": "Paying LoLCat's food."
  }
}
```

#### `coins/view/[COIN_ID]/history`
**Goal**

GET a coin owner + justifying transaction for each state a coin has gone trough.

**Parameters**

Name              | Value                                                         | Method
----------------- | ------------------------------------------------------------- | ------
`COIN_ID`         | ID of the coin to be checked.                                 | URL

**Returns**

A coin's list of ownerships in time.
```json
{
  "history": [{
      "coinid": "70C881D4A26984DDCE795F6F71817C9CF4480E79-92-66",
      "owner": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "transaction": {
        "signature": "-----BEGIN PGP SIGNATURE-----\r\n ... -----END PGP SIGNATURE-----\r\n",
        "version": 1,
        "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
        "number": 92,
        "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
        "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
        "amounts": [
          "31A6302161AC8F5938969E85399EB3415C237F93-92-25",
          "31A6302161AC8F5938969E85399EB3415C237F93-122-1",
        ],
        "comment": "Paying LoLCat's food."
      }
    },{
    ...
    }
  ]
}
```
