# uCoin HTTP API

* [Overview](#overview)
* [Merkle URLs](#merkle-urls)
* [API](#api)
  * [pks/](#pks)
      * [add](#pksadd)
      * [lookup](#pkslookup)
      * [all](#pksall)
  * [ucg/](#ucg)
      * [pubkey](#ucgpubkey)
      * [peering](#ucgpeering)
      * [peering/keys](#ucgpeeringkeys)
      * [peering/peer](#ucgpeeringpeer)
      * [peering/peers (GET)](#ucgpeeringpeers-get)
      * [peering/peers (POST)](#ucgpeeringpeers-post)
      * [peering/peers/upstream](#ucgpeeringpeersupstream)
      * [peering/peers/upstream/[PGP_FINGERPRINT]](#ucgpeeringpeersupstreampgp_fingerprint)
      * [peering/peers/downstream](#ucgpeeringpeersdownstream)
      * [peering/peers/downstream/[PGP_FINGERPRINT]](#ucgpeeringpeersdownstreampgp_fingerprint)
      * [peering/forward](#ucgpeeringforward)
      * [peering/status](#ucgpeeringstatus)
      * [tht (GET)](#ucgtht-get)
      * [tht (POST)](#ucgtht-post)
      * [tht/[PGP_FINGERPRINT]](#ucgthtpgp_fingerprint)
  * [hdc/](#hdc)
      * [amendments/current](#amendmentscurrent)
      * [amendments/current/votes](#amendmentscurrentvotes)
      * [amendments/promoted](#amendmentspromoted)
      * [amendments/promoted/[AMENDMENT_NUMBER]](#amendmentspromotedamendment_number)
      * [amendments/view/[AMENDMENT_ID]/members](#amendmentsviewamendment_idmembers)
      * [amendments/view/[AMENDMENT_ID]/self](#amendmentsviewamendment_idself)
      * [amendments/view/[AMENDMENT_ID]/voters](#amendmentsviewamendment_idvoters)
      * [amendments/view/[AMENDMENT_ID]/signatures](#amendmentsviewamendment_idsignatures)
      * [amendments/votes (GET)](#amendmentsvotes-get)
      * [amendments/votes (POST)](#amendmentsvotes-post)
      * [amendments/votes/[AMENDMENT_ID]](#amendmentsvotesamendment_id)
      * [coins/[PGP_FINGERPRINT]/list](#coinspgp_fingerprintlist)
      * [coins/[PGP_FINGERPRINT]/view/[COIN_NUMBER]](#coinspgp_fingerprintviewcoin_number)
      * [coins/[PGP_FINGERPRINT]/view/[COIN_NUMBER]/history](#coinspgp_fingerprintviewcoin_numberhistory)
      * [transactions/process](#transactionsprocess)
      * [transactions/all](#transactionsall)
      * [transactions/keys](#transactionskeys)
      * [transactions/last](#transactionslast)
      * [transactions/last/[count]](#transactionslastcount)
      * [transactions/sender/[PGP_FINGERPRINT]](#transactionssenderpgp_fingerprint)
      * [transactions/sender/[PGP_FINGERPRINT]/last](#transactionssenderpgp_fingerprintlast)
      * [transactions/sender/[PGP_FINGERPRINT]/last/[count]](#transactionssenderpgp_fingerprintlastcount)
      * [transactions/sender/[PGP_FINGERPRINT]/issuance](#transactionssenderpgp_fingerprintissuance)
      * [transactions/sender/[PGP_FINGERPRINT]/issuance/last](#transactionssenderpgp_fingerprintissuancelast)
      * [transactions/sender/[PGP_FINGERPRINT]/issuance/dividend](#transactionssenderpgp_fingerprintissuancedividend)
      * [transactions/sender/[PGP_FINGERPRINT]/issuance/dividend/[AM_NUMBER]](#transactionssenderpgp_fingerprintissuancedividendam_number)
      * [transactions/sender/[PGP_FINGERPRINT]/issuance/fusion](#transactionssenderpgp_fingerprintissuancefusion)
      * [transactions/sender/[PGP_FINGERPRINT]/issuance/division](#transactionssenderpgp_fingerprintissuancedivision)
      * [transactions/sender/[PGP_FINGERPRINT]/transfer](#transactionssenderpgp_fingerprinttransfer)
      * [transactions/recipient/[PGP_FINGERPRINT]](#transactionsrecipientpgp_fingerprint)
      * [transactions/view/[TRANSACTION_ID]](#transactionsviewtransaction_id)
  * [ucs/](#ucs)
      * [parameters](#parameters)
      * [community/members (POST)](#communitymembers-post)
      * [community/members/[PGP_FINGERPRINT]/membership/current](#communitymemberspgp_fingerprintmembershipcurrent)
      * [community/members/[PGP_FINGERPRINT]/membership/history](#communitymemberspgp_fingerprintmembershiphistory)
      * [community/voters (POST)](#communityvoters-post)
      * [community/voters/[PGP_FINGERPRINT]/voting/current](#communitymemberspgp_fingerprintvotingcurrent)
      * [community/voters/[PGP_FINGERPRINT]/voting/history](#communitymemberspgp_fingerprintvotinghistory)
      * [amendment/[AM_NUMBER]](#amendmentam_number)
      * [amendment/[AM_NUMBER]/members/tree](#amendmentam_numbermemberstree)
      * [amendment/[AM_NUMBER]/members/reason](#amendmentam_numbermembersreason)
      * [amendment/[AM_NUMBER]/voters/tree](#amendmentam_numbervoterstree)
      * [amendment/[AM_NUMBER]/voters/reason](#amendmentam_numbervotersreason)
      * [amendment/[AM_NUMBER]/parameters](#amendmentam_numberparameters)
      * [amendment/[AM_NUMBER]/vote](#amendmentam_numbervote)

## Overview

Data is made accessible through an HTTP API mainly inspired from [OpenUDC_exchange_formats draft](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_exchange_formats.draft.txt), and has been adapted to fit uCoin specificities.

    http[s]://Node[:port]/...
    |-- pks/
    |   |-- add
    |   |-- all
    |   `-- lookup
    |-- ucg/
    |   |-- pubkey
    |   |-- peering
    |   |   |-- keys
    |   |   |-- forward
    |   |   |-- status
    |   |   |-- peer
    |   |   `-- peers/
    |   |       |-- upstream/
    |   |       |   `-- [PGP_FINGERPRINT]
    |   |       `-- downstream/
    |   |           `-- [PGP_FINGERPRINT]
    |   `-- tht/
    |       `-- [PGP_FINGERPRINT]
    |-- hdc/
    |   |-- amendments/
    |   |   |-- current/
    |   |   |   `-- votes
    |   |   |-- promoted
    |   |   |   `-- [AMENDMENT_NUMBER]
    |   |   |-- view/
    |   |   |   `-- [AMENDMENT_ID]/
    |   |   |       |-- members
    |   |   |       |-- self
    |   |   |       `-- voters
    |   |   |       `-- signatures
    |   |   `-- votes/
    |   |   |   `-- [AMENDMENT_ID]/
    |   |   |       `-- signatures
    |   |-- coins/
    |   |   `-- [PGP_FINGERPRINT]/
    |   |       |-- list
    |   |       `-- view/
    |   |           `-- [COIN_NUMBER]/
    |   |               `-- history
    |   `-- transactions/
    |       |-- process
    |       |-- all
    |       |-- keys
    |       |-- last/
    |       |   `-- [count]
    |       |-- sender/
    |       |   `-- [PGP_FINGERPRINT]/
    |       |       |-- last/
    |       |           `-- [count]
    |       |       |-- transfer
    |       |       `-- issuance/
    |       |           |-- last
    |       |           |-- fusion
    |       |           |-- division
    |       |           `-- dividend/
    |       |               `-- [AM_NUMBER]
    |       |-- recipient/
    |       |   `-- [PGP_FINGERPRINT]
    |       `-- view/
    |           `-- [TRANSACTION_ID]
    `-- ucs/
        |-- community/
        |   |-- members/
        |   |   `-- [PGP_FINGERPRINT]/
        |   |       `-- membership/
        |   |           |-- history
        |   |           `-- current
        |   |-- voters/
        |       `-- [PGP_FINGERPRINT]/
        |           `-- voting/
        |               |-- history
        |               `-- current
        `-- amendment/
            `-- [AM_NUMBER]/
                |-- vote
                |-- parameters
                |-- members/
                |   |-- tree
                |   `-- reason
                `-- voters/
                    |-- tree
                    `-- reason

## Merkle URLs

Merkle URL is a special kind of URL applicable for resources:

* `pks/all`
* `ucg/tht (GET)`
* `ucg/peering/peers (GET)`
* `ucg/peering/keys`
* `hdc/amendments/current/votes`
* `hdc/amendments/view/[AMENDMENT_ID]/members`
* `hdc/amendments/view/[AMENDMENT_ID]/voters`
* `hdc/amendments/view/[AMENDMENT_ID]/signatures`
* `hdc/amendments/votes/[AMENDMENT_ID]`
* `hdc/transactions/all`
* `hdc/transactions/keys`
* `hdc/transactions/sender/[PGP_FINGERPRINT]`
* `hdc/transactions/sender/[PGP_FINGERPRINT]/issuance`
* `hdc/transactions/sender/[PGP_FINGERPRINT]/issuance/dividend`
* `hdc/transactions/sender/[PGP_FINGERPRINT]/issuance/dividend/[AM_NUMBER]`
* `hdc/transactions/sender/[PGP_FINGERPRINT]/issuance/fusion`
* `hdc/transactions/sender/[PGP_FINGERPRINT]/transfer`
* `hdc/transactions/recipient/[PGP_FINGERPRINT]`
* `ucs/amendment/[AM_NUMBER]/members/tree`
* `ucs/amendment/[AM_NUMBER]/members/reason`
* `ucs/amendment/[AM_NUMBER]/voters/tree`
* `ucs/amendment/[AM_NUMBER]/voters/reason`

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
`leaves` | Defines wether or not leaves hashes should be returned too. Defaults to `false`.
`leaf` | Hash of a leaf whose content should be returned. Ignore `leaves` parameter.

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


Merkle URL | Leaf | Sort
---------- | ---- | ----
`pks/all` | Fingerprint of the key | By fingerprint string sort, ascending.
`ucg/tht (GET)` | Hash of the THT entry + signature | By hash string sort, ascending.
`ucg/peering/peers (GET)` | Hash of the peering entry + signature | By hash string sort, ascending.
`ucg/peering/keys` | Fingerprint of the key | By hash string sort, ascending.
`hdc/amendments/current/votes` | Hash of the signature | By hash string sort, ascending.
`hdc/amendments/view/[AMENDMENT_ID]/members` | Fingerprint of member's key fingerprint | By fingerprint string sort, ascending.
`hdc/amendments/view/[AMENDMENT_ID]/voters` | Fingerprint of voter's key fingeprint | By fingerprint string sort, ascending.
`hdc/amendments/view/[AMENDMENT_ID]/signatures` | Hash of the signature | By hash string sort, ascending.
`hdc/amendments/votes/[AMENDMENT_ID]` | Hash of the signature | By hash string sort, ascending.
`hdc/transactions/all` | Hash of the transaction + signature | By hash string sort, ascending.
`hdc/transactions/keys` | Fingerprint of the key | By fingerprint string sort, ascending.
`hdc/transactions/sender/[PGP_FINGERPRINT]` | Hash of the transaction + signature | By hash string sort, ascending.
`hdc/transactions/sender/[PGP_FINGERPRINT]/issuance` | Hash of the transaction + signature | By hash string sort, ascending.
`hdc/transactions/sender/[PGP_FINGERPRINT]/issuance/dividend` | Hash of the transaction + signature | By hash string sort, ascending.
`hdc/transactions/sender/[PGP_FINGERPRINT]/issuance/dividend/[AM_NUMBER]` | Hash of the transaction + signature | By hash string sort, ascending.
`hdc/transactions/sender/[PGP_FINGERPRINT]/issuance/fusion` | Hash of the transaction + signature | By hash string sort, ascending.
`hdc/transactions/sender/[PGP_FINGERPRINT]/transfer` | Hash of the transaction + signature | By hash string sort, ascending.
`hdc/transactions/recipient/[PGP_FINGERPRINT]` | Hash of the transaction + signature | By hash string sort, ascending.
`ucs/amendment/[AM_NUMBER]/members/tree` | Fingerprint of the key | By fingerprint string sort, ascending.
`ucs/amendment/[AM_NUMBER]/members/reason` | Fingerprint of the key | By fingerprint string sort, ascending.
`ucs/amendment/[AM_NUMBER]/voters/tree` | Fingerprint of the key | By fingerprint string sort, ascending.
`ucs/amendment/[AM_NUMBER]/voters/reason` | Fingerprint of the key | By fingerprint string sort, ascending.

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
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "key":
  {
    "email":"cem.moreau@gmail.com",
    "comment":"udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;",
    "name":"LoL Cat",
    "fingerprint":"C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    "raw":"-----BEGIN PGP PUBLIC KEY BLOCK----- ... -----END PGP PUBLIC KEY BLOCK-----\r\n"
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

A list of matching PGP keys in json format if `op=index`, a single ASCII-armored key if `op=get`.

```json
{
  "keys": [
    {
      "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
      "key":
      {
        "email":"cem.moreau@gmail.com",
        "comment":"udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;",
        "name":"LoL Cat",
        "fingerprint":"C73882B64B7E72237A2F460CE9CAB76D19A8651E",
        "raw":"-----BEGIN PGP PUBLIC KEY BLOCK----- ... -----END PGP PUBLIC KEY BLOCK-----\r\n"
      }
    },{
      "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
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

### ucg/*

This URL is used for uCoin Gossip protocol (exchanging UCG messages).

#### `ucg/pubkey`
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

#### `ucg/peering`
**Goal**

GET peering informations about a peer.

**Parameters**

*None*.

**Returns**

The peering entry of this node.

This entry contains a sum-up of common Merkle URLs handled by this node, with their respective root value (level `0`).

```json
{
  "currency": "CURRENCY_NAME",
  "key": "SOME_KEY_FINGERPRINT",
  "remote": {
    "host": "name.example.com",
    "ipv4": "11.11.11.11",
    "ipv6": "",
    "port": 8555
  },
  "contract": {
    "currentNumber": 3,
    "hash": "0BC14F62BF2876D11201D8BEBEFEAF9A8968CD15"
  },
  "merkles": {
    "pks/all": {
      "depth": 3,
      "nodesCount": 6,
      "leavesCount": 5,
      "root": "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
    },
    "hdc/amendments/current/votes": {
      "depth": 3,
      "nodesCount": 6,
      "leavesCount": 5,
      "root": "9D5DC18A6CB3FA94B8FC3E07793D391CA1CA5BE5"
    }
  }
}
```

#### `ucg/peering/keys`
**Goal**

Merkle URL referencing PGP keys' fingerprint this node manages, i.e. this node will have transactions history and follow other nodes for this history.

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

Merkle URL leaf: key
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": "2E69197FAB029D8669EF85E82457A1587CA0ED9C"
}
```

#### `ucg/peering/peer`
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
  "dns": "DNS_VALUE",
  "ipv4": "IPV4_ADDRESS",
  "ipv6": "IPV6_ADDRESS",
  "port": "PORT",
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----"
}
```

#### `ucg/peering/peers (GET)`
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
    "dns": "DNS_VALUE",
    "ipv4": "IPV4_ADDRESS",
    "ipv6": "IPV6_ADDRESS",
    "port": "PORT",
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----"
  }
}
```

#### `ucg/peering/peers (POST)`
**Goal**

POST a UCG peering entry document to this node in order to alter UCG peering table.

**Parameters**

Name | Value | Method
---- | ----- | ------
`entry` | UCG peering entry document. | POST
`signature` | Signature of the UCG entry's value. | POST

**Returns**

The posted entry.
```json
{
  "version": "1",
  "currency": "beta_brousouf",
  "fingerprint": "A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468",
  "dns": "DNS_VALUE",
  "ipv4": "IPV4_ADDRESS",
  "ipv6": "IPV6_ADDRESS",
  "port": "PORT",
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----"
}
```

#### `ucg/peering/peers/upstream`
**Goal**

GET a list of peers this node is **listening to** for ANY incoming transaction.

**Parameters**

*None*.

**Returns**

The corresponding peer list.

```json
{
  "peers": [
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8881},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8882},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8883},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8884}
  ]
}
```

#### `ucg/peering/peers/upstream/[PGP_FINGERPRINT]`
**Goal**

GET a list of peers this node is **listening to** for incoming transactions of `PGP_FINGERPRINT`.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP key's fingerprint whose incoming transactions are listened by this node. | URL

**Returns**

The corresponding peer list.

```json
{
  "peers": [
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8881},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8882},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8883},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8884}
  ]
}
```

#### `ucg/peering/peers/downstream`
**Goal**

GET a list of peers this node is **listened by** for ANY incoming transaction.

**Parameters**

*None*.

**Returns**

The corresponding peer list.

```json
{
  "peers": [
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8881},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8882},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8883},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8884}
  ]
}
```

#### `ucg/peering/peers/downstream/[PGP_FINGERPRINT]`
**Goal**

GET a list of peers this node is **listened by** for incoming transactions of `PGP_FINGERPRINT`.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP key's fingerprint whose incoming transactions are listened by other nodes. | URL

**Returns**

The corresponding peer list.

```json
{
  "peers": [
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8881},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8882},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8883},
    {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1", "port": 8884}
  ]
}
```

#### `ucg/peering/forward`
**Goal**

POST a UCG forward document to this node in order to be sent back incoming transactions.

**Parameters**

Name | Value | Method
---- | ----- | ------
`forward` | UCG forward document. | POST
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

#### `ucg/peering/status`
**Goal**

POST a UCG status document to this node in order notify of its status.

**Parameters**

Name | Value | Method
---- | ----- | ------
`status` | UCG status document. | POST
`signature` | Signature of the UCG entry's value. | POST

**Returns**

The posted status.
```json
{
  "version": "1",
  "currency": "beta_brousouf",
  "status": "UP"
}
```

#### `ucg/tht (GET)`
**Goal**

Merkle URL refering to THT entries.

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

Merkle URL leaf: THT entry
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
    "entry": {
      "version": "1",
      "currency": "beta_brousouf",
      "issuer": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
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
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "entry": {
    "version": "1",
    "currency": "beta_brousouf",
    "fingerprint": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
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
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "entry": {
    "version": "1",
    "currency": "beta_brousouf",
    "fingerprint": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
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

### hdc/*

This URL pattern manages all the data used by uCoin based on the PKS.

In a general way, those URLs return HTTP **200** code on success, HTTP **501** if not implemented and any HTTP error code on error.

#### `amendments/current`
**Goal**

Alias of `amendments/promoted`.

#### `amendments/current/votes`
**Goal**

Merkle URL referencing the votes that legitimate the current amendment.

This URL is a shortcut for `hdc/amendments/votes/[CURRENT_AMENDMENT_ID]`.

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

Merkle URL leaf: signature
```json
{
  "hash": "2D41234540938C4263CBC5E7E11564038DED2118",
  "value": {
    "issuer": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----"
  }
}
```

#### `amendments/promoted`
**Goal**

GET the current promoted amendment (amendment which received enough votes to be accepted).

**Parameters**

*None*.

**Returns**

The current amendment.
```json
{
  "version": "1",
  "currency": "beta_brousouf",
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

#### `amendments/promoted/[AMENDMENT_NUMBER]`
**Goal**

GET the current promoted amendment (amendment which received enough votes to be accepted).

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_NUMBER` | The promoted amendment number (integer value) we want to see. | URL

**Returns**

The promoted amendment if it exists (otherwise return HTTP 404).
```json
{
  "version": "1",
  "currency": "beta_brousouf",
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

Merkle URL refering to the members present in the Community for this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_ID` | The amendment id (`AMENDMENT_HASH-AMENDMENT_NUMBER`). | URL

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

Merkle URL leaf: member
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": "2E69197FAB029D8669EF85E82457A1587CA0ED9C"
}
```

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
  "currency": "beta_brousouf",
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

Merkle URL refering to the voters listed in this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AMENDMENT_ID` | The amendment id (`AMENDMENT_HASH-AMENDMENT_NUMBER`). | URL

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

Merkle URL leaf: voter (also a member)
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": "2E69197FAB029D8669EF85E82457A1587CA0ED9C"
}
```

#### `amendments/view/[AMENDMENT_ID]/signatures`
**Goal**

Merkle URL refering to the received signatures for this amendment.

Shortcut for `hdc/amendments/votes/[PREVIOUS_AMENDEMENT_ID]`.

#### `amendments/votes (GET)`
**Goal**

GET an index of votes received by this node.

**Parameters**

*None*.

**Returns**

A list detailing for each amendment number, statistics of votes (grouped by amendment hash).
```json
{
  "amendments": {
    "0": {
      "376C5A6126A4688B18D95043261B2D59867D4047": 3,
      "0035C75B49BD5FBB3D01D63B4C9BF2CC0E20B763": 1
    },
    "1": {
      "0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C": 3
    },
    ...
  }
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
`peer` | **Not mandatory**. A peer's fingerprint where to check and download `amendment`'s signatures Merkle tree | POST

**Returns**

The posted amendment + posted signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "amendment": {
    "version": "1",
    "currency": "beta_brousouf",
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

#### `amendments/votes/[AMENDMENT_ID]`
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
  "depth": 3,
  "nodesCount": 6,
  "leavesCount": 5,
  "root": "114B6E61CB5BB93D862CA3C1DFA8B99E313E66E9"
}
```

Merkle URL leaf: signature
```json
{
  "hash": "2D4224A240938C4263CBC5E7E11564038DED2118",
  "value": {
    "issuer": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----"
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

#### `coins/[PGP_FINGERPRINT]/view/[COIN_NUMBER]`
**Goal**

GET the ownership state of the coin `[COIN_NUMBER]` issued by `[PGP_FINGERPRINT]`.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | Issuer of the coin. | URL
`COIN_NUMBER` | Coin number in the issuer's list of issued coins | URL

**Returns**

Coin ownership state.
```json
{
  "id" : "2E69197FAB029D8669EF85E82457A1587CA0ED9C-0-1-1-A-2",
  "transaction" : "2E69197FAB029D8669EF85E82457A1587CA0ED9C-0",
  "owner" : "2E69197FAB029D8669EF85E82457A1587CA0ED9C"
}
```

#### `coins/[PGP_FINGERPRINT]/view/[COIN_NUMBER]/history`
**Goal**

GET a transaction history of the coin `[COIN_NUMBER]` issued by `[PGP_FINGERPRINT]`.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | Issuer of the coin. | URL
`COIN_NUMBER` | Coin number in the issuer's list of issued coins | URL

**Returns**

Transaction chain.
```json
{
  "transactions": [
    {
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 92,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "type": "TRANSFER",
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

#### `transactions/process`
**Goal**

POST a transaction.

**Parameters**

Name | Value | Method
---- | ----- | ------
`transaction` | The raw transaction. | POST
`signature` | The signature of the `transaction`. | POST

**Returns**

The recorded transaction and its signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "raw": "Version: 1\r\n...\r\n",
  "transaction":
  {
    "version": 1,
    "currency": "beta_brousouf",
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 1,
    "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "type": "ISSUANCE",
    "coins": [
      {
        "id": "31A6302161AC8F5938969E85399EB3415C237F93-1-5-2-A-1",
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

#### `transactions/all`
**Goal**

Merkle URL referencing all the transactions stored by this node.

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

Merkle URL leaf: transaction
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
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



#### `transactions/keys`
**Goal**

Merkle URL referencing PGP keys for which some transactions have been recoreded by this node (sent and received).

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

Merkle URL leaf: PGP key's fingerprint
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": "2E69197FAB029D8669EF85E82457A1587CA0ED9C"
}
```

#### `transactions/last`
**Goal**

Get the last received transaction.

**Parameters**

*None*.

**Returns**

The last transaction received.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "raw": "Version: 1\r\n...\r\n",
  "transaction":
  {
    "version": 1,
    "currency": "beta_brousouf",
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 1,
    "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "type": "ISSUANCE",
    "coins": [
      {
        "id": "31A6302161AC8F5938969E85399EB3415C237F93-1-5-2-A-1",
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

#### `transactions/last/[COUNT]`
**Goal**

Get the last `n` received transactions.

**Parameters**

Name | Value | Method
---- | ----- | ------
`COUNT` | Integer indicating to retrieve the last [COUNT] transactions. | URL

**Returns**

The last [COUNT] transactions received.
```json
{
  "transactions": [
    {
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 92,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "type": "TRANSFER",
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

#### `transactions/sender/[PGP_FINGERPRINT]`
**Goal**

Merkle URL referencing all the transactions sent by this sender and stored by this node (should contain all transactions of the sender).

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions. | URL

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
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
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

#### `transactions/sender/[PGP_FINGERPRINT]/last`
**Goal**

Get the last received transaction of a PGP key.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see last transaction. | URL

**Returns**

The last transaction of given PGP key.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "raw": "Version: 1\r\n...\r\n",
  "transaction":
  {
    "version": 1,
    "currency": "beta_brousouf",
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 1,
    "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "type": "ISSUANCE",
    "coins": [
      {
        "id": "31A6302161AC8F5938969E85399EB3415C237F93-1-5-2-A-1",
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

#### `transactions/sender/[PGP_FINGERPRINT]/last/[COUNT]`
**Goal**

Get the last `n` received transactions of a PGP key.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see last transaction. | URL
`COUNT` | Integer indicating to retrieve the last [COUNT] transactions. | URL

**Returns**

The last [COUNT] transactions of given PGP key.
```json
{
  "transactions": [
    {
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 92,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "type": "TRANSFER",
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

#### `transactions/sender/[PGP_FINGERPRINT]/transfer`
**Goal**

Merkle URL referencing all **transfer** transactions sent by this sender and stored by this node (should contain all **transfer** transactions of the sender).

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions. | URL

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
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
    "transaction":
    {
      "version": 1,
      "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
      "number": 2102,
      "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
      "recipient": "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8",
      "type": "TRANSFER",
      "coins": [
        {
          "id": "10-1-2-F-14",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-14"
        },{
          "id": "10-1-2-A-38",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1218"
        }
      ],
      "comment": "Paying LoLCat's food."
    }
  }
}
```

#### `transactions/sender/[PGP_FINGERPRINT]/issuance`
**Goal**

Merkle URL referencing all **issuance** transactions (forged coins) sent by this sender and stored by this node (should contain all **issuance** transactions of the sender).

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions. | URL

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
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
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
}
```

#### `transactions/sender/[PGP_FINGERPRINT]/issuance/last`
**Goal**

Get the last received *issuance* transaction of a PGP key.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see last issuance transaction. | URL

**Returns**

The last *issuance* transaction of given PGP key.
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
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
}
```

#### `transactions/sender/[PGP_FINGERPRINT]/issuance/dividend`
**Goal**

Merkle URL referencing all **dividend** transactions (issuance of new coins) sent by this sender and stored by this node (should contain all **dividend** transactions of the sender).

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions. | URL

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
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "raw": "Version: 1\r\n...\r\n",
  "transaction":
  {
    "version": 1,
    "currency": "beta_brousouf",
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 1,
    "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "type": "ISSUANCE",
    "coins": [
      {
        "id": "31A6302161AC8F5938969E85399EB3415C237F93-1-5-2-A-1",
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

#### `transactions/sender/[PGP_FINGERPRINT]/issuance/dividend/[AM_NUMBER]`
**Goal**

Merkle URL referencing all **dividend** transactions (issuance of new coins) **for given amendment** sent by this sender and stored by this node (should contain all **dividend** transactions of the sender **for** this amendment).

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions. | URL

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
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "raw": "Version: 1\r\n...\r\n",
  "transaction":
  {
    "version": 1,
    "currency": "beta_brousouf",
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 1,
    "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "type": "ISSUANCE",
    "coins": [
      {
        "id": "31A6302161AC8F5938969E85399EB3415C237F93-1-5-2-A-1",
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

#### `transactions/sender/[PGP_FINGERPRINT]/issuance/fusion`
**Goal**

Merkle URL referencing all **fusion** transactions sent by this sender and stored by this node (should contain all **fusion** transactions of the sender).

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions. | URL

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
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
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

#### `transactions/sender/[PGP_FINGERPRINT]/issuance/division`
**Goal**

Merkle URL referencing all **division** transactions sent by this sender and stored by this node (should contain all **division** transactions of the sender).

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | PGP fingerprint of the key we want to see sent transactions. | URL

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
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
    "transaction":
    {
      "version": 1,
      "sender": "[PGP_FINGERPRINT]",
      "number": 15,
      "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
      "type": "DIVISION",
      "coins": [
        {
          "id": "10-2-1-D-15",
          "transaction_id": ""
        },{
          "id": "11-1-1-D-15",
          "transaction_id": ""
        },{
          "id": "12-1-1-D-15",
          "transaction_id": ""
        },{
          "id": "2-4-1-A-1",
          "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
        }
      ],
      "comment": "Can't give only 10! Division may do it."
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
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
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
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "raw": "Version: 1\r\n...\r\n",
  "transaction":
  {
    "version": 1,
    "currency": "beta_brousouf",
    "sender": "31A6302161AC8F5938969E85399EB3415C237F93",
    "number": 14,
    "previousHash": "BE522363749E62BA1034C7B1358B01C75289DA48",
    "recipient": "31A6302161AC8F5938969E85399EB3415C237F93",
    "type": "FUSION",
    "coins": [
      {
        "id": "31A6302161AC8F5938969E85399EB3415C237F93-10-1-2-F-14",
        "transaction_id": ""
      },{
        "id": "31A6302161AC8F5938969E85399EB3415C237F93-2-4-1-A-1",
        "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
      },{
        "id": "31A6302161AC8F5938969E85399EB3415C237F93-3-6-1-A-1",
        "transaction_id": "31A6302161AC8F5938969E85399EB3415C237F93-1"
      }
    ],
    "comment": "Too much coins ! Making big one."
  }
}
```

### ucs/*

#### `parameters`

**Goal**

GET the synchronization parameters used by this node.

**Parameters**

*None*.

**Returns**

The synchronization parameters.
```json
{
  // To define
}
```

#### `community/members (POST)`

**Goal**

POST a [Membership](https://github.com/c-geek/ucoin/blob/master/doc/UCS.md#membership) document, in order to change membership status of a Public key.

**Parameters**

Name | Value | Method
---- | ----- | ------
`membership` | The raw membership structure. | POST
`signature` | The signature of the `membership` parameter. | POST

**Returns**

The posted membership request + posted signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "membership": {
    "version": "1",
    "currency": "beta_brousouf",
    "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
    "membership": "JOIN",
    "sigDate": 1390739944,
    "raw": "Version: 1\r\n...Membership: JOIN\r\n"
  }
}
```

#### `community/members/[PGP_FINGERPRINT]/membership/current`

**Goal**

GET last received valid [Membership](https://github.com/c-geek/ucoin/blob/master/doc/UCS.md#membership) document.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | Public key's fingerprint to check. | URL

**Returns**

The posted membership request + posted signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "membership": {
    "version": "1",
    "currency": "beta_brousouf",
    "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
    "membership": "JOIN",
    "sigDate": 1390739944,
    "raw": "Version: 1\r\n...Membership: JOIN\r\n"
  }
}
```

#### `community/members/[PGP_FINGERPRINT]/membership/history`

**Goal**

GET an history of all received and stored valid [Membership](https://github.com/c-geek/ucoin/blob/master/doc/UCS.md#membership) documents.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | Public key's fingerprint to check. | URL

**Returns**

A list of posted membership requests + posted signatures.
```json
{
  "memberships": [
    {
      "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
      "membership": {
        "version": "1",
        "currency": "beta_brousouf",
        "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
        "membership": "ACTUALIZE",
        "sigDate": 1414327144,
        "raw": "Version: 1\r\n...Membership: JOIN\r\n"
      }
    },{
      "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
      "membership": {
        "version": "1",
        "currency": "beta_brousouf",
        "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
        "membership": "ACTUALIZE",
        "sigDate": 1403782744,
        "raw": "Version: 1\r\n...Membership: JOIN\r\n"
      }
    },{
      "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
      "membership": {
        "version": "1",
        "currency": "beta_brousouf",
        "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
        "membership": "JOIN",
        "sigDate": 1390739944,
        "raw": "Version: 1\r\n...Membership: JOIN\r\n"
      }
    }
  ]
}
```

#### `community/voters (POST)`

**Goal**

POST a [Voting](https://github.com/c-geek/ucoin/blob/master/doc/UCS.md#voting) document, in order to change voting key of a Community member.

**Parameters**

Name | Value | Method
---- | ----- | ------
`voting` | The raw voting structure. | POST
`signature` | The signature of the `voting` parameter. | POST

**Returns**

The posted voting request + posted signature.
```json
{
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "voting": {
    "version": "1",
    "currency": "beta_brousouf",
    "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
    "votingKey": "8E02FAFC90EDECB451086285DDD99C17AE19CF3F",
    "sigDate": 1390740799,
    "raw": "Version: 1\r\n...VotingKey: 8E02FAFC90EDECB451086285DDD99C17AE19CF3F\r\n"
  }
}
```

#### `community/voters/[PGP_FINGERPRINT]/voting/current`

**Goal**

GET last received valid [Voting](https://github.com/c-geek/ucoin/blob/master/doc/UCS.md#voting) document.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | Public key's fingerprint to check. | URL

**Returns**

```json
{
  "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
  "voting": {
    "version": "1",
    "currency": "beta_brousouf",
    "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
    "votingKey": "FD17FECBAF731658EDEB60CF8700174B1D585861",
    "sigDate": 1393764799,
    "raw": "Version: 1\r\n...VotingKey: FD17FECBAF731658EDEB60CF8700174B1D585861\r\n"
  }
}
```

#### `community/voters/[PGP_FINGERPRINT]/voting/history`

**Goal**

GET an history of all received and stored valid [Voting](https://github.com/c-geek/ucoin/blob/master/doc/UCS.md#voting) documents.

**Parameters**

Name | Value | Method
---- | ----- | ------
`PGP_FINGERPRINT` | Public key's fingerprint to check. | URL

**Returns**

A list of posted voting requests + posted signatures.
```json
{
  "votings": [
    {
      "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
      "voting": {
        "version": "1",
        "currency": "beta_brousouf",
        "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
        "votingKey": "FD17FECBAF731658EDEB60CF8700174B1D585861",
        "sigDate": 1393764799,
        "raw": "Version: 1\r\n...VotingKey: FD17FECBAF731658EDEB60CF8700174B1D585861\r\n"
      }
    },{
      "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
      "voting": {
        "version": "1",
        "currency": "beta_brousouf",
        "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
        "votingKey": "8E02FAFC90EDECB451086285DDD99C17AE19CF3F",
        "sigDate": 1393419199,
        "raw": "Version: 1\r\n...VotingKey: 8E02FAFC90EDECB451086285DDD99C17AE19CF3F\r\n"
      }
    },{
      "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----",
      "voting": {
        "version": "1",
        "currency": "beta_brousouf",
        "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
        "votingKey": "FD17FECBAF731658EDEB60CF8700174B1D585861",
        "sigDate": 1390740799,
        "raw": "Version: 1\r\n...VotingKey: FD17FECBAF731658EDEB60CF8700174B1D585861\r\n"
      }
    }
  ]
}
```

#### `amendment/[AM_NUMBER]`

**Goal**

GET the next amendment *this node* would vote for when time has come.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AM_NUMBER` | The amendment number to be promoted. | URL

**Returns**

Amendment to be voted by this node if voting happened.
```json
{
  "version": "1",
  "currency": "beta_brousouf",
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

#### `amendment/[AM_NUMBER]/members/tree`

**Goal**

Merkle URL refering to the members present in the Community for this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AM_NUMBER` | The amendment number to be promoted. | URL

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

Merkle URL leaf: member
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": "2E69197FAB029D8669EF85E82457A1587CA0ED9C"
}
```

#### `amendment/[AM_NUMBER]/members/reason`


**Goal**

Merkle URL refering to the reasons of members changes to be done for this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AM_NUMBER` | The amendment number to be promoted. | URL

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

Merkle URL key: public key's fingerprint
Merkle URL leaf: specific object giving the reason of the change
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "code": "CODE",
    "document": {
      "version": "1",
      "currency": "beta_brousouf",
      "issuer": "FD17FECBAF731658EDEB60CF8700174B1D585861",
      "membership": "JOIN",
      "sigDate": 1390739944,
      "raw": "Version: 1\r\n...Membership: JOIN\r\n"
    }
  }
}
```

`CODE` is one of the following:

Code | Meaning
---- | -------
`JOINING` | A public key has sent a membership `JOIN` valid request
`LEAVING` | A public key has sent a membership `LEAVE` valid request
`TOO_OLD` | A previously integrated member has not actualized its status early enough

Document is always a Membership document. It is to be interpreted according to given code.

#### `amendment/[AM_NUMBER]/voters/tree`

**Goal**

Merkle URL refering to the members present in the Community for this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AM_NUMBER` | The amendment number to be promoted. | URL

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

Merkle URL leaf: voter
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": "2E69197FAB029D8669EF85E82457A1587CA0ED9C"
}
```

#### `amendment/[AM_NUMBER]/voters/reason`


**Goal**

Merkle URL refering to the reasons of voters changes to be done for this amendment.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AM_NUMBER` | The amendment number to be promoted. | URL

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

Merkle URL key: public key's fingerprint
Merkle URL leaf: specific object giving the reason of the change

```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "code": "CODE",
    "document": // Some JSON value
  }
}
```

Code is one of the following:

Code | Meaning
---- | -------
`VOTING_KEY_CHANGE` | A member has sent a new voting request
`INACTIVE_OR_DISSIDENT` | A voter did not vote previous amendment

Document is present for code `VOTING_KEY_CHANGE`, but is not for `INACTIVE_OR_DISSIDENT`. Document is to be interpreted according to given code.

#### `amendment/[AM_NUMBER]/parameters`

**Goal**

GET the list of parameters to be written in amendment. Parameters are:

* GeneratedOn timestamp
* Universal Dividend
* New coin's minimal power value
* Next amendment required votes count
* Previous amendment's hash

**Parameters**

Name | Value | Method
---- | ----- | ------
`AM_NUMBER` | The amendment number to be promoted. | URL

**Returns**

Parameters object.
```json
{
  "generated": 1388325001502,
  "dividend": 100,
  "coinMinimalPower": 2,
  "nextVotes": 6,
  "previousHash": "0F45DFDA214005250D4D2CBE4C7B91E60227B0E5"
}
```

A parameter may be null or non-present.

#### `amendment/[AM_NUMBER]/vote`


**Goal**

GET the vote of current node for given amendment number (both amendment + signature). Such vote may be used by any node to broadcast the whole network.

**Parameters**

Name | Value | Method
---- | ----- | ------
`AM_NUMBER` | The amendment number to be promoted. | URL

**Returns**

Current node's voting amendment + signature, or HTTP 404 if not available yet.
```json
{
  "hash": "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
  "value": {
    "issuer": "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
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
    },
    "signature": "-----BEGIN PGP SIGNATURE----- ... -----END PGP SIGNATURE-----"
  }
}
```
