# uCoin HTTP API

## TODO

* blockchain/block/number

## Contents

* [Contents](#contents)
* [Overview](#overview)
* [Merkle URLs](#merkle-urls)
* [API](#api)
  * [wot/](#wot)
      * [add](#wotadd)
      * [revoke](#wotrevoke)
      * [lookup/[search]](#wotlookupsearch)
      * [certifiers-of/[search]](#wotcertifiers-ofsearch)
      * [certified-by/[search]](#wotcertified-bysearch)
  * [currency/](#currency)
      * [parameters](#currencyparameters)
  * [blockchain/](#blockchain)
      * [parameters](#blockchainparameters)
      * [membership](#blockchainmembership)
      * [memberships/[search]](#blockchainmembershipssearch)
      * [block](#blockchainblock)
      * [block/[number]](#blockchainblocknumber)
      * [current](#blockchaincurrent)
      * [hardship/[PUBKEY]](#blockchainhardshippubkey)
      * [with/](#blockchainwith)
          * [newcomers](#blockchainwithnewcomers)
          * [certs](#blockchainwithcerts)
          * [actives](#blockchainwithactives)
          * [leavers](#blockchainwithleavers)
          * [excluded](#blockchainwithexcluded)
          * [ud](#blockchainwithud)
          * [tx](#blockchainwithtx)
  * [network/](#network)
      * [peering](#networkpeering)
      * [peering/peers (GET)](#networkpeeringpeers-get)
      * [peering/peers (POST)](#networkpeeringpeers-post)
      * [peering/status](#networkpeeringstatus)
  * [tx/](#tx)
      * [process](#txprocess)
      * [sources/[pubkey]](#txsourcespubkey)

## Overview

Data is made accessible through an HTTP API mainly inspired from [OpenUDC_exchange_formats draft](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_exchange_formats.draft.txt), and has been adapted to fit uCoin specificities.

    http[s]://Node[:port]/...
    |-- wot/
    |   |-- certifiers-of/[uid|pubkey]
    |   |-- certified-by/[uid|pubkey]
    |   |-- members
    |   `-- lookup
    |-- blockchain/
    |   |-- parameters
    |   |-- membership
    |   |-- with/
    |       |-- newcomers
    |       |-- certs
    |       |-- joiners
    |       |-- actives
    |       |-- leavers
    |       |-- excluded
    |       |-- ud
    |       `-- tx
    |   |-- hardship
    |   |   `-- [PUBKEY]
    |   |-- block
    |   |   `-- [NUMBER]
    |   `-- current
    |-- network/
    |   `-- peering
    |       |-- status
    |       `-- peers
    `-- tx/
        |-- process
        `-- sources

## Merkle URLs

Merkle URL is a special kind of URL applicable for resources:

* `network/peering/peers (GET)`

Such kind of URL returns Merkle tree hashes informations. In uCoin, Merkle trees are an easy way to detect unsynced data and where the differences come from. For example, `network/peering/peers` is a Merkle tree whose leaves are peers' key fingerprint sorted ascending way. Thus, if any new peer is added, a branch of the tree will see its hash modified and propagated to the root hash. Change is then easy to detect.

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


Merkle URL             | Leaf                      | Sort
---------------------- | --------------------------| -------------
`network/peers (GET)`    | Hash of the peers' pubkey | By hash string sort, ascending.

#### Unicity

It has to be noted that **possible conflict exists** for leaves, as every leaf is hash, but is rather unlikely.

## API

### wot/*

#### `wot/add`


**Goal**

POST [Public key](./Protocol.md#publickey) data.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`pubkey` | The [public key](./Protocol.md#publickey). | POST
`self` | The raw self-certification. | POST
`other` | A list of [inline certifications](./Protocol.md#inlinecertification) separated by new lines. | POST

**Returns**

The available validated data for this public key.
```json
{
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "uids": [
    {
      "uid": "udid2;c;TOCQUEVILLE;FRANCOIS-XAVIER-ROBE;1989-07-14;e+48.84+002.30;0;",
      "meta": {
        "timestamp": 1409990782
      },
      "self": "J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci",
      "others": [
        {
          "pubkey": "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB",
          "meta": {
            "timestamp": 1509991044
          },
          "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
        }
      ]
    }
  ]
}
```

#### `wot/revoke`


**Goal**

Remove an identity from Identity pool.

> N.B.: An identity **written in the blockchain cannot be removed**.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`pubkey` | The [public key](./Protocol.md#publickey). | POST
`revoke` | The raw self-revocation. | POST

**Returns**

True if operation went well. An HTTP error otherwise with body as error message.
```json
{
  "result": true
}
```

#### `wot/lookup/[search]`


**Goal**

GET [Public key](./Protocol.md#publickey) data.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`search` | A string of data to look for (public key, uid). | URL

**Returns**

A list of public key data matching search string (may not return all results, check `partial` flag which is set to `false` if all results are here, ` true` otherwise).
```json
{
  "partial": false,
  "results": [
    {
      "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
      "uids": [
        {
          "uid": "udid2;c;TOCQUEVILLE;FRANCOIS-XAVIER-ROBE;1989-07-14;e+48.84+002.30;0;",
          "meta": {
            "timestamp": 1409990782
          },
          "self": "J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci",
          "others": [
            {
              "pubkey": "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB",
              "meta": {
                "timestamp": 1509991044
              },
              "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
            }
          ]
        }
      ]
    }
  ]
}
```

#### `wot/members`


**Goal**

GET the list of current Web of Trust members.

**Parameters**

*None*.

**Returns**

A list of public key + uid.
```json
{
  "results": [
    { "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY", "uid": "cat" },
    { "pubkey": "9kNEiyseUNoPn3pmNUhWpvCCwPRgavsLu7YFKZuzzd1L", "uid": "tac" },
    { "pubkey": "9HJ9VXa9wc6EKC6NkCi8b5TKWBot68VhYDg7kDk5T8Cz", "uid": "toc" }
  ]
}
```

#### `wot/certifiers-of/[search]`


**Goal**

GET [Certification](./Protocol.md#certification) data over a member.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`search` | Public key or uid of a *member* we want see the certifications. | URL

**Returns**

A list of certifications issued to the member, with `written` data indicating wether the certification is written in the blockchain or not.
```json
{
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "uid": "user identifier",
  "certifications": [
    {
      "pubkey": "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB",
      "uid": "certifier uid",
      "cert_time": {
        "block": 88,
        "medianTime": 1509991044
      },
      "written": true,
      "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
    },
    ...
  ]
}
```

#### `wot/certified-by/[search]`


**Goal**

GET [Certification](./Protocol.md#certification) data over a member.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`search` | Public key or uid of a *member* we want see the certifications. | URL

**Returns**

A list of certifications issued by the *member* to other *members*, with `written` data indicating wether the certification is written in the blockchain or not.
```json
{
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "uid": "user identifier",
  "certifications": [
    {
      "pubkey": "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB",
      "uid": "certifier uid",
      "cert_time": {
        "block": 88,
        "medianTime": 1509991044
      },
      "written": true,
      "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
    },
    ...
  ]
}
```

### currency/*

#### `currency/parameters`

**Goal**

GET the blockchain parameters used by this node.

**Parameters**

*None*.

**Returns**

The synchronization parameters.
```json
{
  currency: "beta_brousouf",
  c: 0.01,
  dt: 302400,
  ud0: 100,
  sigDelay: 5259600,
  sigValidity: 2629800,
  sigQty: 3,
  sigWoT: 5,
  msValidity: 2629800,
  stepMax: 3,
  medianTimeBlocks: 11,
  avgGenTime: 600,
  dtDiffEval: 10,
  blocksRot: 20,
  percentRot: 0.67
}
```

### blockchain/*

#### `blockchain/parameters`

**Goal**

Shortcut to [/currency/parameters](#currency-parameters).

Parameters meaning is described under [Protocol parameters](./Protocol.md#protocol-parameters).

#### `blockchain/membership`


**Goal**

POST a [Membership](./Protocol.md#membership) document.

**Parameters**

Name | Value | Method
---- | ----- | ------
`membership` | The membership document (with signature). | POST

**Returns**

The posted membership request.
```json
{
  "signature": "H41/8OGV2W4CLKbE35kk5t1HJQsb3jEM0/QGLUf80CwJvGZf3HvVCcNtHPUFoUBKEDQO9mPK3KJkqOoxHpqHCw==",
  "membership": {
    "version": "1",
    "currency": "beta_brousouf",
    "issuer": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
    "membership": "IN",
    "sigDate": 1390739944,
    "uid": "superman63"
  }
}
```

#### `blockchain/memberships/[search]`


**Goal**

GET [Membership](./Protocol.md#membership) data written for a member.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`search` | Public key or uid of a *member* we want see the memberships. | URL

**Returns**

A list of memberships issued by the *member* and written in the blockchain.
```json
{
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "uid": "user identifier",
  "sigDate": 1390739944,
  "memberships": [
    {
    "version": "1",
    "currency": "beta_brousouf",
    "membership": "IN",
    "blockNumber": 678,
    "blockHash": "000007936DF3CC32BFCC1023D1258EC9E485D474"
  },
    ...
  ]
}
```

#### `blockchain/block`

**Goal**

POST a new block to add to the blockchain.

**Parameters**

Name               | Value                          | Method
------------------ | ------------------------------ | ------
`block`             | The raw block to be added     | POST
`signature`         | Signature of the raw block    | POST

**Returns**

The promoted block if successfuly added to the blockchain (see [block/[number]](#blockchainblocknumber) return object).

#### `blockchain/block/[NUMBER]`

**Goal**

GET the promoted block whose number `NUMBER`.

**Parameters**

Name               | Value                                                         | Method
------------------ | ------------------------------------------------------------- | ------
`NUMBER`           | The promoted block number (integer value) we want to see.  | URL

**Returns**

The promoted block if it exists (otherwise return HTTP 404).
```json
{
  "version": 1,
  "currency": "beta_brousouf",
  "nonce": 28,
  "number": 1,
  "timestamp": 1408996317,
  "dividend": 254,
  "monetaryMass": 18948,
  "issuer": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "previousHash": "0009A7A62703F976F683BBA500FC0CB832B8220D",
  "previousIssuer": "CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp",
  "membersCount": 4,
  "hash": "0000F40BDC0399F2E84000468628F50A122B5F16",
  "identities": [
    "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX:1409007070:udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;"
  ],
  "joiners": [
"9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk:1505004141"
  ],
  "leavers": [
    "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk:1505004141"
  ],
  "excluded": [
    "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB"
  ],
  "certifications": [
    "CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp:9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:1505900000:2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk"
  ],
  "transactions": [
    {
      "signatures": [
        "H41/8OGV2W4CLKbE35kk5t1HJQsb3jEM0/QGLUf80CwJvGZf3HvVCcNtHPUFoUBKEDQO9mPK3KJkqOoxHpqHCw=="
    ],
      "version": 1,
      "currency": "beta_brousouf",
      "issuers": [
        "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
        "CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp",
        "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB"
      ],
      "inputs": [
        "0:T:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8",
        "0:T:F80993776FB55154A60B3E58910C942A347964AD",
        "0:D:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B",
        "0:F:2B53C3BE2DEA6A74C41DC6A44EEAB8BD4DC47097",
        "1:T:F80993776FB55154A60B3E58910C942A347964AD",
        "2:T:0651DE13A80EB0515A5D9F29E25D5D777152DE91",
        "2:D:20DA3C59D27EABACFFD27626EF74EA56579C58D4"
      ],
      "outputs": [
        "BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30",
        "DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx:156",
        "6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i:49"
      ]
    }
  ],
  "signature": "H41/8OGV2W4CLKbE35kk5t1HJQsb3jEM0/QGLUf80CwJvGZf3HvVCcNtHPUFoUBKEDQO9mPK3KJkqOoxHpqHCw==",
}
```

#### `blockchain/current`

Same as [block/[number]](#blockchainblocknumber), but return last accepted block.

#### `blockchain/hardship/[PUBKEY]`

**Goal**

GET hardship level for given member's fingerprint for writing next block.

**Parameters**

Name              | Value                     | Method
----              | -----                     | ------
`PUBKEY` | Member's PGP fingerprint.   | URL

**Returns**

The hardship value (`level`) + `block` number.
```json
{
  "block": 598,
  "level": 3
}

```

#### `blockchain/with/newcomers`
**Goal**

GET the block numbers containing newcomers (new identities).

**Parameters**

*None*.

**Returns**

Block numbers.
```json
{
  "result": {
    "blocks": [223,813]
  }
}
```

#### `blockchain/with/certs`
**Goal**

GET the block numbers containing certifications.

**Parameters**

*None*.

**Returns**

Block numbers.
```json
{
  "result": {
    "blocks": [223,813]
  }
}
```

#### `blockchain/with/joiners`
**Goal**

GET the block numbers containing joiners (newcomers or people coming back after exclusion).

**Parameters**

*None*.

**Returns**

Block numbers.
```json
{
  "result": {
    "blocks": [223,813]
  }
}
```

#### `blockchain/with/actives`
**Goal**

GET the block numbers containing actives (members updating their membership).

**Parameters**

*None*.

**Returns**

Block numbers.
```json
{
  "result": {
    "blocks": [223,813]
  }
}
```

#### `blockchain/with/leavers`
**Goal**

GET the block numbers containing leavers (members leaving definitely the currency).

**Parameters**

*None*.

**Returns**

Block numbers.
```json
{
  "result": {
    "blocks": [223,813]
  }
}
```

#### `blockchain/with/excluded`
**Goal**

GET the block numbers containing excluded members.

**Parameters**

*None*.

**Returns**

Block numbers.
```json
{
  "result": {
    "blocks": [223,813]
  }
}
```

#### `blockchain/with/ud`
**Goal**

GET the block numbers containing Universal Dividend.

**Parameters**

*None*.

**Returns**

Block numbers.
```json
{
  "result": {
    "blocks": [223,813]
  }
}
```

#### `blockchain/with/tx`
**Goal**

GET the block numbers containing transactions.

**Parameters**

*None*.

**Returns**

Block numbers.
```json
{
  "result": {
    "blocks": [223,813]
  }
}
```

### network/*

This URL is used for uCoin Gossip protocol (exchanging UCG messages).

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
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "endpoints": [
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001",
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002",
    "OTHER_PROTOCOL 88.77.66.55 9001",
  ],
  "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
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
    "fingerprint": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
    "endpoints": [
      "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001",
      "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002",
      "OTHER_PROTOCOL 88.77.66.55 9001",
    ],
    "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
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
  "fingerprint": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "endpoints": [
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001",
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002",
    "OTHER_PROTOCOL 88.77.66.55 9001",
  ],
  "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
}
```

#### `network/peering/status`
**Goal**

POST a Status document to this node in order notify of its status. Eventually, the Status document may be posted with a Peer document that is to be processed just before the Status.

**Parameters**

Name        | Value                                  | Method
----------- | -------------------------------------- | ------
`status`    | Status document.                        | POST
`peer`      | Peer document.                          | POST

**Returns**

The posted status.
```json
{
  "version": "1",
  "currency": "beta_brousouf",
  "status": "UP"
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

**Returns**

The recorded transaction.
```json
{
  "raw": "Version: 1\r\n...\r\n",
  "transaction":
  {
    "signatures": [
      "H41/8OGV2W4CLKbE35kk5t1HJQsb3jEM0/QGLUf80CwJvGZf3HvVCcNtHPUFoUBKEDQO9mPK3KJkqOoxHpqHCw=="
  ],
    "version": 1,
    "currency": "beta_brousouf",
    "issuers": [
      "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
      "CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp",
      "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB"
    ],
    "inputs": [
      "0:T:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8",
      "0:T:F80993776FB55154A60B3E58910C942A347964AD",
      "0:D:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B",
      "0:F:2B53C3BE2DEA6A74C41DC6A44EEAB8BD4DC47097",
      "1:T:F80993776FB55154A60B3E58910C942A347964AD",
      "2:T:0651DE13A80EB0515A5D9F29E25D5D777152DE91",
      "2:D:20DA3C59D27EABACFFD27626EF74EA56579C58D4"
    ],
    "outputs": [
      "BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30",
      "DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx:156",
      "6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i:49"
    ]
  }
}
```


#### `tx/sources/[pubkey]`

**Goal**

GET a list of available sources.

**Parameters**

Name              | Value                       | Method
----              | -----                       | ------
`pubkey`           | Owner of the coins' pubkey. | URL

**Returns**

A list of available sources for the given `pubkey`.
```json
{
  "currency": "beta_brousouf",
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "sources": [
    {
      "type: "D",
      "number": 5,
      "fingerprint": "6C20752F6AD06AEA8D0BB46BB8C4F68641A34C79",
      "amount": 100
    },
    {
      "type: "D",
      "number": 18,
      "fingerprint": "DB7D88E795E42CF8CFBFAAFC77379E97847F9B42",
      "amount": 110
    },
    {
      "type: "T",
      "number": 55,
      "fingerprint": "E614E814179F313B1113475E6319EF4A3D470AD0",
      "amount": 30
    }
  ]
}
```