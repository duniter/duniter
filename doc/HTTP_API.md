# Duniter HTTP API

## Contents

* [Contents](#contents)
* [Overview](#overview)
* [Merkle URLs](#merkle-urls)
* [API](#api)
  * [node/](#node)
      * [summary](#nodesummary)
      * [sandboxes](#nodesandboxes)
  * [wot/](#wot)
      * [add](#wotadd)
      * [certify](#wotcertify)
      * [revoke](#wotrevoke)
      * [lookup/[search]](#wotlookupsearch)
      * [requirements/[PUBKEY]](#wotrequirementspubkey)
      * [certifiers-of/[search]](#wotcertifiers-ofsearch)
      * [certified-by/[search]](#wotcertified-bysearch)
  * [blockchain/](#blockchain)
      * [parameters](#blockchainparameters)
      * [membership](#blockchainmembership)
      * [memberships/[search]](#blockchainmembershipssearch)
      * [block](#blockchainblock)
      * [block/[number]](#blockchainblocknumber)
      * [blocks/[count]/[from]](#blockchainblockscountfrom)
      * [current](#blockchaincurrent)
      * [hardship/[PUBKEY]](#blockchainhardshippubkey)
      * [difficulties](#blockchaindifficulties)
      * [with/](#blockchainwith)
          * [newcomers](#blockchainwithnewcomers)
          * [certs](#blockchainwithcerts)
          * [actives](#blockchainwithactives)
          * [leavers](#blockchainwithleavers)
          * [excluded](#blockchainwithexcluded)
          * [ud](#blockchainwithud)
          * [tx](#blockchainwithtx)
      * [branches](#blockchainbranches)
  * [network/](#network)
      * [peers](#networkpeers)
      * [peering](#networkpeering)
      * [peering/peers (GET)](#networkpeeringpeers-get)
      * [peering/peers (POST)](#networkpeeringpeers-post)
  * [tx/](#tx)
      * [process](#txprocess)
      * [sources/[pubkey]](#txsourcespubkey)
      * [history/[pubkey]](#txhistorypubkey)
      * [history/[pubkey]/pending](#txhistorypubkeypending)
      * [history/[pubkey]/blocks/[from]/[to]](#txhistorypubkeyblocksfromto)
      * [history/[pubkey]/times/[from]/[to]](#txhistorypubkeytimesfromto)
  * [ud/](#ud)
      * [history/[pubkey]](#udhistorypubkey)
  * [ws/](#ws)
      * [block](#wsblock)
      * [peer](#wspeer)

## Overview

Data is made accessible through an HTTP API mainly inspired from [OpenUDC_exchange_formats draft](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_exchange_formats.draft.txt), and has been adapted to fit Duniter specificities.

    http[s]://Node[:port]/...
    |-- node/
    |   |-- summary
    |   |-- sandboxes
    |-- wot/
    |   |-- add
    |   |-- certify
    |   |-- revoke
    |   |-- requirements/[pubkey]
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
    |   |-- difficulties
    |   `-- current
    |-- network/
    |   |-- peers
    |   `-- peering
    |       `-- peers
    |-- tx/
    |   |-- process
    |   |-- sources
    |   `-- history
    |-- ud/
    |   `-- history
    `-- ws/
        |-- block
        `-- peer

## Merkle URLs

Merkle URL is a special kind of URL applicable for resources:

* `network/peering/peers (GET)`

Such kind of URL returns Merkle tree hashes informations. In Duniter, Merkle trees are an easy way to detect unsynced data and where the differences come from. For example, `network/peering/peers` is a Merkle tree whose leaves are peers' key fingerprint sorted ascending way. Thus, if any new peer is added, a branch of the tree will see its hash modified and propagated to the root hash. Change is then easy to detect.

For commodity issues, this URL uses query parameters to retrieve partial data of the tree, as most of the time all the data is not required. Duniter Merkle tree has a determined number of parent nodes (given a number of leaves), which allows to ask only for interval of them.

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

With such a tree structure, Duniter consider the tree has exactly 6 nodes: `[ROOT,H,E,F,G,E]`. Nodes are just an array, and for a Lambda Server LS1, it is easy to ask for the values of another server LS2 for level 1 (`H` and `E`, the second level): it requires nodes interval `[1;2]`.

Hence it is quite easy for anyone who wants to check if a `Z` member joined the Duniter community as it would alter the `E` branch of the tree:

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

### Duniter Merkle trees leaves

Each tree manages different data, and has a different goal. Hence, each tree has its own rules on how are generated and sorted tree leaves.
Here is a summup of such rules:


Merkle URL             | Leaf                      | Sort
---------------------- | --------------------------| -------------
`network/peers (GET)`    | Hash of the peers' pubkey | By hash string sort, ascending.

#### Unicity

It has to be noted that **possible conflict exists** for leaves, as every leaf is hash, but is rather unlikely.

## API

### node/*

#### `node/summary`
**Goal**

GET technical informations about this peer.

**Parameters**

*None*.

**Returns**

Technical informations about the node.
```json
{
  "duniter": {
    "software": "duniter",
    "version": "0.10.3",
    "forkWindowSize": 10
  }
}
```

#### `node/sandboxes`
**Goal**

GET filling and capacity of indentities, membership and transactions sandboxes of the requested peer.

**Parameters**

*None*.

**Returns**

Technical informations about identities, membership and transactions sandboxes.
```json
{
  "identities": {
    "size": 5000,
    "free": 4626
  },
  "memberships": {
    "size": 5000,
    "free": 4750
  },
  "transactions": {
    "size": 200,
    "free": 190
  }
}
```

### wot/*

#### `wot/add`


**Goal**

POST [Identity](./Protocol.md#identity) data.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`identity` | The raw identity. | POST

**Returns**

The available validated data for this public key.
```json
{
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "uids": [
    {
      "uid": "udid2;c;TOCQUEVILLE;FRANCOIS-XAVIER-ROBE;1989-07-14;e+48.84+002.30;0;",
      "meta": {
        "timestamp": "44-76522E321B3380B058DB6D9E66121705EEA63610869A7C5B3E701CF6AF2D55A8"
      },
      "self": "J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci",
      "others": [
        {
          "pubkey": "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB",
          "meta": {
            "timestamp": "22-2E910FCCCEE008C4B978040CA68211C2395C84C3E6BFB432A267384ED8CD22E5"
          },
          "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
        }
      ]
    }
  ]
}
```

#### `wot/certify`


**Goal**

POST [Certification](./Protocol.md#certification) data.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`cert` | The raw certification. | POST

**Returns**

The available validated data for this public key.
```json
{
  "issuer": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "timestamp": "44-76522E321B3380B058DB6D9E66121705EEA63610869A7C5B3E701CF6AF2D55A8",
  "sig": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r",
  "target": {
    "issuer": "CqwuWfMsPqtUkWdUK6FxV6hPWeHaUfEcz7dFZZJA49BS",
    "uid": "johnsnow",
    "timestamp": "44-76522E321B3380B058DB6D9E66121705EEA63610869A7C5B3E701CF6AF2D55A8",
    "sig": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r",
  }
}
```

#### `wot/revoke`


**Goal**

Remove an identity from Identity pool.

> N.B.: An identity **written in the blockchain cannot be removed**.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`revocation` | The raw revocation. | POST

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
            "timestamp": "56-97A56CCE04A1B7A03264ADE09545B262CBE65E62DDA481B7D7C89EB4669F5435"
          },
          "self": "J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci",
          "revocation_sig": "CTmlh3tO4B8f8IbL8iDy5ZEr3jZDcxkPmDmRPQY74C39MRLXi0CKUP+oFzTZPYmyUC7fZrUXrb3LwRKWw1jEBQ==",
          "revoked": false,
          "others": [
            {
              "pubkey": "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB",
              "meta": {
                "timestamp": "32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD"
              },
              "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
            }
          ]
        }
      ],
      "signed": [
        {
          "uid": "snow",
          "pubkey": "2P7y2UDiCcvsgSSt8sgHF3BPKS4m9waqKw4yXHCuP6CN",
          "meta": {
            "timestamp": "33-AB30D958EE5CB75186972286ED3F4686B8A1C2CD"
          },
          "revocation_sig": "CK6UDDJM3d0weE1RVtzFJnw/+J507lPAtspleHc59T4+N1tzQj1RRGWrzPiTknCjnCO6SxBSJX0B+MIUWrpNAw==",
          "revoked": false,
          "signature": "Xbr7qhyGNCmLoVuuKnKIbrdmtCvb9VBIEY19izUNwA5nufsjNm8iEsBTwKWOo0lq5O1+AAPMnht8cm2JjMq8AQ=="
        },
        {
          "uid": "snow",
          "pubkey": "2P7y2UDiCcvsgSSt8sgHF3BPKS4m9waqKw4yXHCuP6CN",
          "meta": {
            "timestamp": "978-B38F54242807DFA1A12F17E012D355D8DB92CA6E947FC5D147F131B30C639163"
          },
          "revocation_sig": "a7SFapoVaXq27NU+wZj4afmxp0SbwLGqLJih8pfX6TRKPvNp/V93fbKixbqg10cwa1CadNenztxq3ZgOivqADw==",
          "revoked": false,
          "signature": "HU9VPwC4EqPJwATPuyUJM7HLjfig5Ke1CKonL9Q78n5/uNSL2hkgE9Pxsor8CCJfkwCxh66NjGyqnGYqZnQMAg=="
        },
        {
          "uid": "snow",
          "pubkey": "7xapQvvxQ6367bs8DsskEf3nvQAgJv97Yu11aPbkCLQj",
          "meta": {
            "timestamp": "76-0DC977717C49E69A78A67C6A1526EC17ED380BC68F0C38D290A954471A1349B7"
          },
          "revocation_sig": "h8D/dx/z5K2dx06ktp7fnmLRdxkdV5wRkJgnmEvKy2k55mM2RyREpHfD7t/1CC5Ew+UD0V9N27PfaoLxZc1KCQ==",
          "revoked": true,
          "signature": "6S3x3NwiHB2QqYEY79x4wCUYHcDctbazfxIyxejs38V1uRAl4DuC8R3HJUfD6wMSiWKPqbO+td+8ZMuIn0L8AA=="
        },
        {
          "uid": "cat",
          "pubkey": "CK2hBp25sYQhdBf9oFMGHyokkmYFfzSCmwio27jYWAN7",
          "meta": {
            "timestamp": "63-999677597FC04E6148860AE888A2E1942DF0E1E732C31500BA8EFF07F06FEC0C"
          },
          "revocation_sig": "bJyoM2Tz4hltVXkLvYHOOmLP4qqh2fx7aMLkS5q0cMoEg5AFER3iETj13uoFyhz8yiAKESyAZSDjjQwp8A1QDw==",
          "revoked": false,
          "signature": "AhgblSOdxUkLwpUN9Ec46St3JGaw2jPyDn/mLcR4j3EjKxUOwHBYqqkxcQdRz/6K4Qo/xMa941MgUp6NjNbKBA=="
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

#### `wot/requirements/[pubkey]`


**Goal**

GET requirements to be filled by pubkey to become a member.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`pbkey` | Public key to check. | URL

**Returns**

A list of identities matching this pubkey and the requirements of each identities to become a member.

> If the pubkey is matching a member, only one identity may be displayed: the one which is a member.

```json
{
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "identities": [{
      "uid": "tobi",
      "meta": {
        "timestamp": "12-20504546F37853625C1E695B757D93CFCC6E494069D53F73748E428947933E45"
      },
      "outdistanced": true,
      "certifications": 2,
      "membershipMissing": true
    }
    ...
  ]
}
```

#### `wot/certifiers-of/[search]`


**Goal**

GET [Certification](./Protocol.md#certification) data over a member.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`search` | Public key or uid of a *member* (or someone who *was a member*) we want see the certifications. | URL

**Returns**

A list of certifications issued to the member by other members (or who used to be members), with `written` data indicating wether the certification is written in the blockchain or not.

Each certification also has:

* a `isMember` field to indicate wether the issuer of the certification is still a member or not.
* a `written` field to indicate the block where the certification was written (or null if not written yet).

```json
{
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "uid": "user identifier",
  "isMember": true,
  sigDate: 1421787461,
  "certifications": [
    {
      "pubkey": "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB",
      "uid": "certifier uid",
      "cert_time": {
        "block": 88,
        "medianTime": 1509991044
      },
      sigDate: 1421787461,
      "written": {
        "number": 872768,
        "hash": "D30978C9D6C5A348A8188603F039423D90E50DC5"
      },
      "isMember": true,
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
`search` | Public key or uid of a *member* (or someone who *was a member*) we want see the certifications. | URL

**Returns**

A list of certifications issued by the member to other members (or who used to be members), with `written` data indicating wether the certification is written in the blockchain or not.

Each certification also has:

* a `isMember` field to indicate wether the issuer of the certification is still a member or not.
* a `written` field to indicate the block where the certification was written (or null if not written yet).
```json
{
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "uid": "user identifier",
  "isMember": true,
  sigDate: 1421787461,
  "certifications": [
    {
      "pubkey": "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB",
      "uid": "certifier uid",
      "cert_time": {
        "block": 88,
        "medianTime": 1509991044
      },
      sigDate: 1421787461,
      "written": {
        "number": 872768,
        "hash": "D30978C9D6C5A348A8188603F039423D90E50DC5"
      },
      "isMember": true,
      "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
    },
    ...
  ]
}
```

#### `wot/identity-of/[search]`


**Goal**

GET identity data written for a member.

**Parameters**

Name  | Value | Method
----  | ----- | ------
`search` | Public key or uid of a *member* we want see the attached identity. | URL

**Returns**

Identity data written in the blockchain.
```json
{
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "uid": "user identifier",
  "sigDate": "21-EB18A8D89256EA80195990C91AD399B798F92EE8187F775DF7F4823C46E61F00"
}
```


### blockchain/*

#### `blockchain/parameters`

**Goal**

GET the blockchain parameters used by this node.

**Parameters**

*None*.

**Returns**

The synchronization parameters.
```json
{
  currency: "beta_brouzouf",
  c: 0.01,
  dt: 302400,
  ud0: 100,
  sigPeriod: 7200,
  sigStock: 45,
  sigWindow: 604800,
  sigValidity: 2629800,
  sigQty: 3,
  idtyWindow: 604800,
  msWindow: 604800,
  xpercent: 5,
  msValidity: 2629800,
  stepMax: 3,
  medianTimeBlocks: 11,
  avgGenTime: 600,
  dtDiffEval: 10,
  percentRot: 0.67
}
```

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
    "version": "2",
    "currency": "beta_brouzouf",
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
	  "version": "2",
	  "currency": "beta_brouzouf",
	  "membership": "IN",
	  "blockNumber": 678,
	  "blockHash": "000007936DF3CC32BFCC1023D1258EC9E485D474",
	  "written_number": null
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

The promoted block if successfully added to the blockchain (see [block/[number]](#blockchainblocknumber) return object).

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
  "version": 2,
  "currency": "beta_brouzouf",
  "nonce": 28,
  "inner_hash": "FD09B0F7CEC5A575CA6E528DC4C854B612AE77B7283F48E0D28677F5C9C9D0DD",
  "number": 1,
  "time": 1408996317,
  "medianTime": 1408992543,
  "dividend": 254,
  "monetaryMass": 18948,
  "issuer": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "previousHash": "0009A7A62703F976F683BBA500FC0CB832B8220D",
  "previousIssuer": "CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp",
  "membersCount": 4,
  "hash": "0000F40BDC0399F2E84000468628F50A122B5F16",
  "identities": [
    "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:crowlin"
  ],
  "joiners": [
    "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:crowlin"
  ],
  "leavers": [
    "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:crowlin"
  ],
  "revoked": [
    "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX"
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
        "2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX",
        "2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk"
      ],
        "version": 2,
        "currency": "beta_brouzouf",
        "issuers": [
          "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
          "CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp",
          "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB"
        ],
        "inputs": [
          "T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:0",
          "T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:0",
          "D:4745EEBA84D4E3C2BDAE4768D4E0F5A671531EE1B0B9F5206744B4551C664FDF:243",
          "T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:1",
          "T:67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B:0",
          "D:521A760049DF4FAA602FEF86B7A8E306654502FA3A345F6169B8468B81E71AD3:187"
       ],
       "unlocks": [
          "0:SIG(0)",
          "1:SIG(2)",
          "2:SIG(1)",
          "3:SIG(1)",
          "4:SIG(0)",
          "5:SIG(0)"
       ],
      "outputs": [
        "30:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)",
        "156:SIG(DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx)",
        "49:SIG(6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i)"
      ]
    }
  ],
  "signature": "H41/8OGV2W4CLKbE35kk5t1HJQsb3jEM0/QGLUf80CwJvGZf3HvVCcNtHPUFoUBKEDQO9mPK3KJkqOoxHpqHCw==",
}
```

#### `blockchain/blocks/[COUNT]/[FROM]`

**Goal**

GET the `[COUNT]` promoted blocks from `[FROM]` number, inclusive.

**Parameters**

Name               | Value                                                         | Method
------------------ | ------------------------------------------------------------- | ------
`COUNT`           | The number of blocks we want to see.  | URL
`FROM`           | The starting block.  | URL

**Returns**

The promoted blocks if it exists block `[FROM]` (otherwise return HTTP 404). Result is an array whose values are the same structure as [/blockchain/block/[number]](#blockchainblocknumber).
```json
{
  "blocks": [
    { number: 2, ... },
    { number: 3, ... }
  ]
}
```

#### `blockchain/current`

Same as [block/[number]](#blockchainblocknumber), but return last accepted block.

#### `blockchain/hardship/[PUBKEY]`

**Goal**

GET hardship level for given member's pubkey for writing next block.

**Parameters**

Name              | Value                     | Method
----              | -----                     | ------
`PUBKEY` | Member's pubkey.   | URL

**Returns**

The hardship value (`level`) + `block` number.
```json
{
  "block": 598,
  "level": 3
}

```

#### `blockchain/difficulties`

**Goal**

GET hardship level for all member's uid for writing next block.

**Parameters**

None.

**Returns**

The respective difficulty of each member in the last `IssuersFrame` blocks for current block.
```json
{
  "block": 598,
  "levels": [{
    "uid": "jack",
    "level": 8
  },{
    "uid": "cat",
    "level": 4
  }]
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

#### `blockchain/with/revoked`
**Goal**

GET the block numbers containing revoked members.

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

#### `blockchain/branches`

**Goal**

GET current branches of the node.

**Parameters**

*None*.

**Returns**

Top block of each branch, i.e. the last received block of each branch. An array of 4 blocks would mean the node has 4 branches,
3 would mean 3 branches, and so on.

```json
{
  "blocks": [
    { number: 2, ... },
    { number: 3, ... }
  ]
}
```

### network/*

This URL is used for Duniter Gossip protocol (exchanging UCG messages).

#### `network/peers`
**Goal**

GET the exhaustive list of peers known by the node.

**Parameters**

*None*.

**Returns**

List of peering entries.
```json
{
  "peers": [
    {
      "version": "2",
      "currency": "meta_brouzouf",
      "status": "UP",
      "first_down": null,
      "last_try": null,
      "pubkey": "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk",
      "block": "45180-00000E577DD4B308B98D0ED3E43926CE4D22E9A8",
      "signature": "GKTrlUc4um9lQuj9UI8fyA/n/JKieYqBYcl9keIWfAVOnvHamLHaqGzijsdX1kNt64cadcle/zkd7xOgMTdQAQ==",
      "endpoints": [
        "BASIC_MERKLED_API metab.ucoin.io 88.174.120.187 9201"
      ]
    },
    {
      "version": "2",
      "currency": "meta_brouzouf",
      "status": "UP",
      "first_down": null,
      "last_try": null,
      "pubkey": "2aeLmae5d466y8D42wLK5MknwUBCR6MWWeixRzdTQ4Hu",
      "block": "45182-0000064EEF412C1CDD1B370CC45A3BC3B9743464",
      "signature": "kbdTay1OirDqG/E3jyCaDlL7HVVHb9/BXvNHAg+xO9sSA+NgmBo/4mEqL9b7hH0UnbXHss6TfuvxAHZLmBqsCw==",
      "endpoints": [
        "BASIC_MERKLED_API twiced.fr 88.174.120.187 9223"
      ]
    },
    ...
  ]
}
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
  "version": "2",
  "currency": "beta_brouzouf",
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
    "version": "2",
    "currency": "beta_brouzouf",
    "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
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

POST a peering entry document.

**Parameters**

Name        | Value                               | Method
----------- | ----------------------------------- | ------
`peer`      | The peering entry document.         | POST

**Returns**

The posted entry.
```json
{
  "version": "2",
  "currency": "beta_brouzouf",
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "endpoints": [
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001",
    "BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002",
    "OTHER_PROTOCOL 88.77.66.55 9001",
  ],
  "signature": "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r"
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
  "raw": "Version: 2\r\n...\r\n",
  "transaction":
  {
      "signatures": [
        "H41/8OGV2W4CLKbE35kk5t1HJQsb3jEM0/QGLUf80CwJvGZf3HvVCcNtHPUFoUBKEDQO9mPK3KJkqOoxHpqHCw=="
        "2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX",
        "2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk"
      ],
        "version": 2,
        "currency": "beta_brouzouf",
        "issuers": [
          "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
          "CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp",
          "9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB"
        ],
        "inputs": [
          "T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:0",
          "T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:0",
          "D:4745EEBA84D4E3C2BDAE4768D4E0F5A671531EE1B0B9F5206744B4551C664FDF:243",
          "T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:1",
          "T:67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B:0",
          "D:521A760049DF4FAA602FEF86B7A8E306654502FA3A345F6169B8468B81E71AD3:187"
       ],
       "unlocks": [
          "0:SIG(0)",
          "1:SIG(2)",
          "2:SIG(1)",
          "3:SIG(1)",
          "4:SIG(0)",
          "5:SIG(0)"
       ],
      "outputs": [
        "30:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)",
        "156:SIG(DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx)",
        "49:SIG(6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i)"
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
  "currency": "beta_brouzouf",
  "pubkey": "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY",
  "sources": [
    {
      "type: "D",
      "noffset": 5,
      "identifier": "6C20752F6AD06AEA8D0BB46BB8C4F68641A34C79",
      "amount": 100
    },
    {
      "type: "D",
      "noffset": 18,
      "identifier": "DB7D88E795E42CF8CFBFAAFC77379E97847F9B42",
      "amount": 110
    },
    {
      "type: "T",
      "noffset": 55,
      "identifier": "E614E814179F313B1113475E6319EF4A3D470AD0",
      "amount": 30
    }
  ]
}
```


#### `tx/history/[pubkey]`

**Goal**

Get the wallet transaction history

**parameters**

Name              | Value							| Method
----              | -----							| ------
`pubkey`          | Wallet public key.				| URL

**Returns**

The full transaction history for the given `pubkey`
```json
{
  "currency": "meta_brouzouf",
  "pubkey": "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk",
  "history": {
    "sent": [
      {
        "version": 2,
        "received": null,
        "issuers": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk"
        ],
        "inputs": [
          "D:000A8362AE0C1B8045569CE07735DE4C18E81586:125"
        ],
        "outputs": [
          "5:SIG(8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU)",
          "95:SIG(HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk)"
        ],
        "comment": "Essai",
        "signatures": [
          "8zzWSU+GNSNURnH1NKPT/TBoxngEc/0wcpPSbs7FqknGxud+94knvT+dpe99k6NwyB5RXvOVnKAr4p9/KEluCw=="
        ],
        "hash": "FC7BAC2D94AC9C16AFC5C0150C2C9E7FBB2E2A09",
        "block_number": 173,
        "time": 1421932545
      }
    ],
    "received": [
      {
        "version": 2,
        "received": null,
        "issuers": [
          "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU"
        ],
        "inputs": [
          "D:000A8362AE0C1B8045569CE07735DE4C18E81586:125"
        ],
        "outputs": [
          "7:SIG(HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk)",
          "93:SIG(8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU)"
        ],
        "comment": "",
        "signatures": [
          "1Mn8q3K7N+R4GZEpAUm+XSyty1Uu+BuOy5t7BIRqgZcKqiaxfhAUfDBOcuk2i4TJy1oA5Rntby8hDN+cUCpvDg=="
        ],
        "hash": "5FB3CB80A982E2BDFBB3EA94673A74763F58CB2A",
        "block_number": 207,
        "time": 1421955525
      },
      {
        "version": 2,
        "received": null,
        "issuers": [
          "J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3"
        ],
        "inputs": [
          "T:6A50FF82410387B239489CE38B34E0FDDE1697FE:0"
        ],
        "outputs": [
          "42:SIG(HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk)",
          "9958:SIG(J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3)"
        ],
        "comment": "",
        "signatures": [
          "XhBcCPizPiWdKeXWg1DX/FTQst6DppEjsYEtoAZNA0P11reXtgc9IduiIxNWzNjt/KvTw8APkSI8/Uf31QQVDA=="
        ],
        "hash": "ADE7D1C4002D6BC10013C34CE22733A55173BAD4",
        "block_number": 15778,
        "time": 1432314584
      }
    ],
    "sending": [
	  {
        "version": 2,
        "received": 1459691641,
        "issuers": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk"
        ],
        "inputs": [
          "0:D:8196:000022AD426FE727C707D847EC2168A64C577706:5872"
        ],
        "outputs": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:5871"
          "2sq8bBDQGK74f1eD3mAPQVgHCmFdijZr9nbv16FwbokX:1",
        ],
        "comment": "some comment",
        "signatures": [
          "kLOAAy7/UldQk7zz4I7Jhv9ICuGYRx7upl8wH8RYL43MMF6+7MbPh3QRN1qNFGpAfa3XMWIQmbUWtjZKP6OfDA=="
        ],
        "hash": "BA41013F2CD38EDFFA9D38A275F8532DD906A2DE"
      }
    ],
    "receiving": [
	 {
        "version": 2,
        "received": 1459691641,
        "issuers": [
          "2sq8bBDQGK74f1eD3mAPQVgHCmFdijZr9nbv16FwbokX"
        ],
        "inputs": [
          "0:D:8196:000022AD426FE727C707D847EC2168A64C577706:4334"
        ],
        "outputs": [
          "2sq8bBDQGK74f1eD3mAPQVgHCmFdijZr9nbv16FwbokX:1",
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:4333"
        ],
        "comment": "some comment",
        "signatures": [
          "DRiZinUEKrrLiJNogtydzwEbmETrvWiLNYXCiJsRekxTLyU5g4LjnwiLp/XlvmIekjJK5n/gullLWrHUBvFSAw==
        ],
        "hash": "A0A511131CD0E837204A9441B3354918AC4CE671"
      }
	]
  }
}
```

#### `tx/history/[pubkey]pending`

**Goal**

Get the wallet transaction pending history

**parameters**

Name              | Value							| Method
----              | -----							| ------
`pubkey`          | Wallet public key.				| URL

**Returns**

The pending transaction history for the given `pubkey`
```json
{
  "currency": "g1",
  "pubkey": "8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD",
  "history": {
    "sending": [
      {
        "version": 10,
        "locktime": 0,
        "blockstamp": "126087-000005A3F03F05E57D538265068948AFAC839B149FF6ABE1CFE62F3568EC2453",
        "blockstampTime": 1528309130,
        "issuers": [
          "8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD"
        ],
        "inputs": [
          "1002:0:D:8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD:124577",
          "1002:0:D:8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD:124863",
          "1002:0:D:8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD:125149"
        ],
        "outputs": [
          "3000:0:SIG(DfAT7wGnRG4c3vnCDSfF5CW8HkwLRL6bMb1ykQPiAgCX)",
          "6:0:SIG(8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD)"
        ],
        "unlocks": [
          "0:SIG(0)",
          "1:SIG(0)",
          "2:SIG(0)"
        ],
        "signatures": [
          "ySMUI6qn1S2vCdXiLdDBKF8XgvzrCvgOUeMkrdDdkU2v2S0c0RhZrOrMxxq8iymx6i7k5EmA+6BRBIOPMa7mCg=="
        ],
        "comment": "merci pour les moufles et a mardi pour l apero monnaie libre",
        "hash": "C7138CEFB2BF6C92C92EA809AF8C90DEC79B5E6F6C0A0E34434260EF706A1BF2",
        "time": null,
        "block_number": null,
        "received": 1528311498
      }
    ],
    "received": [],
    "receiving": [],
    "sent": [],
    "pending": [
      {
        "version": 10,
        "locktime": 0,
        "blockstamp": "126087-000005A3F03F05E57D538265068948AFAC839B149FF6ABE1CFE62F3568EC2453",
        "blockstampTime": 1528309130,
        "issuers": [
          "8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD"
        ],
        "inputs": [
          "1002:0:D:8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD:124577",
          "1002:0:D:8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD:124863",
          "1002:0:D:8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD:125149"
        ],
        "outputs": [
          "3000:0:SIG(DfAT7wGnRG4c3vnCDSfF5CW8HkwLRL6bMb1ykQPiAgCX)",
          "6:0:SIG(8MPJrxpkd8E5VeKTMrgD7ZjL8SYRPrC6hi2KeP4QFbaD)"
        ],
        "unlocks": [
          "0:SIG(0)",
          "1:SIG(0)",
          "2:SIG(0)"
        ],
        "signatures": [
          "ySMUI6qn1S2vCdXiLdDBKF8XgvzrCvgOUeMkrdDdkU2v2S0c0RhZrOrMxxq8iymx6i7k5EmA+6BRBIOPMa7mCg=="
        ],
        "comment": "merci pour les moufles et a mardi pour l apero monnaie libre",
        "hash": "C7138CEFB2BF6C92C92EA809AF8C90DEC79B5E6F6C0A0E34434260EF706A1BF2",
        "time": null,
        "block_number": null,
        "received": 1528311498
      }
    ]
  }
}⏎
```

#### `tx/history/[PUBKEY]/blocks/[from]/[to]`

**Goal**

Get the wallet transaction history

**parameters**

Name				| Value							| Method
----				| -----							| ------
`pubkey`			| Wallet public key.			| URL
`from`				| The starting block.			| URL
`to`				| the ending block.				| URL

**Returns**

The transaction history for the given `pubkey` and between the given `from` and `to` blocks. 
```json
{
  "currency": "meta_brouzouf",
  "pubkey": "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk",
  "history": {
    "sent": [
      {
        "version": 2,
        "issuers": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk"
        ],
        "inputs": [
          "0:D:125:000A8362AE0C1B8045569CE07735DE4C18E81586:100"
        ],
        "outputs": [
          "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:5",
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:95"
        ],
        "comment": "Essai",
        "signatures": [
          "8zzWSU+GNSNURnH1NKPT/TBoxngEc/0wcpPSbs7FqknGxud+94knvT+dpe99k6NwyB5RXvOVnKAr4p9/KEluCw=="
        ],
        "hash": "FC7BAC2D94AC9C16AFC5C0150C2C9E7FBB2E2A09",
        "block_number": 173,
        "time": 1421932545
      }
    ],
    "received": [
      {
        "version": 2,
        "issuers": [
          "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU"
        ],
        "inputs": [
          "0:D:125:000A8362AE0C1B8045569CE07735DE4C18E81586:100"
        ],
        "outputs": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:7",
          "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:93"
        ],
        "comment": "",
        "signatures": [
          "1Mn8q3K7N+R4GZEpAUm+XSyty1Uu+BuOy5t7BIRqgZcKqiaxfhAUfDBOcuk2i4TJy1oA5Rntby8hDN+cUCpvDg=="
        ],
        "hash": "5FB3CB80A982E2BDFBB3EA94673A74763F58CB2A",
        "block_number": 207,
        "time": 1421955525
      },
      {
        "version": 2,
        "issuers": [
          "J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3"
        ],
        "inputs": [
          "0:T:15128:6A50FF82410387B239489CE38B34E0FDDE1697FE:10000"
        ],
        "outputs": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:42",
          "J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:9958"
        ],
        "comment": "",
        "signatures": [
          "XhBcCPizPiWdKeXWg1DX/FTQst6DppEjsYEtoAZNA0P11reXtgc9IduiIxNWzNjt/KvTw8APkSI8/Uf31QQVDA=="
        ],
        "hash": "ADE7D1C4002D6BC10013C34CE22733A55173BAD4",
        "block_number": 15778,
        "time": 1432314584
      }
    ],
    "sending": [
	  {
        "version": 2,
        "issuers": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk"
        ],
        "inputs": [
          "0:D:8196:000022AD426FE727C707D847EC2168A64C577706:5872"
        ],
        "outputs": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:5871"
          "2sq8bBDQGK74f1eD3mAPQVgHCmFdijZr9nbv16FwbokX:1",
        ],
        "comment": "some comment",
        "signatures": [
          "kLOAAy7/UldQk7zz4I7Jhv9ICuGYRx7upl8wH8RYL43MMF6+7MbPh3QRN1qNFGpAfa3XMWIQmbUWtjZKP6OfDA=="
        ],
        "hash": "BA41013F2CD38EDFFA9D38A275F8532DD906A2DE"
      }
    ],
    "receiving": [
	 {
        "version": 2,
        "issuers": [
          "2sq8bBDQGK74f1eD3mAPQVgHCmFdijZr9nbv16FwbokX"
        ],
        "inputs": [
          "0:D:8196:000022AD426FE727C707D847EC2168A64C577706:4334"
        ],
        "outputs": [
          "2sq8bBDQGK74f1eD3mAPQVgHCmFdijZr9nbv16FwbokX:1",
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:4333"
        ],
        "comment": "some comment",
        "signatures": [
          "DRiZinUEKrrLiJNogtydzwEbmETrvWiLNYXCiJsRekxTLyU5g4LjnwiLp/XlvmIekjJK5n/gullLWrHUBvFSAw==
        ],
        "hash": "A0A511131CD0E837204A9441B3354918AC4CE671"
      }
	]
  }
}
```

#### `tx/history/[pubkey]/times/[from]/[to]`

**Goal**

Get the wallet transaction history

**parameters**

Name              | Value							| Method
----              | -----							| ------
`pubkey`          | Wallet public key.				| URL
`from` | The starting timestamp limit. (optionnal) | URL
`to`        | The ending timestamp. (optionnal)	| URL

**Returns**

The transaction history for the given `pubkey` and between the given `from` and `to` dates. 
```json
{
  "currency": "meta_brouzouf",
  "pubkey": "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk",
  "history": {
    "sent": [
      {
        "version": 2,
        "issuers": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk"
        ],
        "inputs": [
          "0:D:125:000A8362AE0C1B8045569CE07735DE4C18E81586:100"
        ],
        "outputs": [
          "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:5",
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:95"
        ],
        "comment": "Essai",
        "signatures": [
          "8zzWSU+GNSNURnH1NKPT/TBoxngEc/0wcpPSbs7FqknGxud+94knvT+dpe99k6NwyB5RXvOVnKAr4p9/KEluCw=="
        ],
        "hash": "FC7BAC2D94AC9C16AFC5C0150C2C9E7FBB2E2A09",
        "block_number": 173,
        "time": 1421932545
      }
    ],
    "received": [
      {
        "version": 2,
        "issuers": [
          "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU"
        ],
        "inputs": [
          "0:D:125:000A8362AE0C1B8045569CE07735DE4C18E81586:100"
        ],
        "outputs": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:7",
          "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:93"
        ],
        "comment": "",
        "signatures": [
          "1Mn8q3K7N+R4GZEpAUm+XSyty1Uu+BuOy5t7BIRqgZcKqiaxfhAUfDBOcuk2i4TJy1oA5Rntby8hDN+cUCpvDg=="
        ],
        "hash": "5FB3CB80A982E2BDFBB3EA94673A74763F58CB2A",
        "block_number": 207,
        "time": 1421955525
      },
      {
        "version": 2,
        "issuers": [
          "J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3"
        ],
        "inputs": [
          "0:T:15128:6A50FF82410387B239489CE38B34E0FDDE1697FE:10000"
        ],
        "outputs": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:42",
          "J78bPUvLjxmjaEkdjxWLeENQtcfXm7iobqB49uT1Bgp3:9958"
        ],
        "comment": "",
        "signatures": [
          "XhBcCPizPiWdKeXWg1DX/FTQst6DppEjsYEtoAZNA0P11reXtgc9IduiIxNWzNjt/KvTw8APkSI8/Uf31QQVDA=="
        ],
        "hash": "ADE7D1C4002D6BC10013C34CE22733A55173BAD4",
        "block_number": 15778,
        "time": 1432314584
      }
    ],
    "sending": [
	  {
        "version": 2,
        "issuers": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk"
        ],
        "inputs": [
          "0:D:8196:000022AD426FE727C707D847EC2168A64C577706:5872"
        ],
        "outputs": [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:5871"
          "2sq8bBDQGK74f1eD3mAPQVgHCmFdijZr9nbv16FwbokX:1",
        ],
        "comment": "some comment",
        "signatures": [
          "kLOAAy7/UldQk7zz4I7Jhv9ICuGYRx7upl8wH8RYL43MMF6+7MbPh3QRN1qNFGpAfa3XMWIQmbUWtjZKP6OfDA=="
        ],
        "hash": "BA41013F2CD38EDFFA9D38A275F8532DD906A2DE"
      }
    ],
    "receiving": [
	 {
        "version": 2,
        "issuers": [
          "2sq8bBDQGK74f1eD3mAPQVgHCmFdijZr9nbv16FwbokX"
        ],
        "inputs": [
          "0:D:8196:000022AD426FE727C707D847EC2168A64C577706:4334"
        ],
        "outputs": [
          "2sq8bBDQGK74f1eD3mAPQVgHCmFdijZr9nbv16FwbokX:1",
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:4333"
        ],
        "comment": "some comment",
        "signatures": [
          "DRiZinUEKrrLiJNogtydzwEbmETrvWiLNYXCiJsRekxTLyU5g4LjnwiLp/XlvmIekjJK5n/gullLWrHUBvFSAw==
        ],
        "hash": "A0A511131CD0E837204A9441B3354918AC4CE671"
      }
	]
  }
}
```
### ud/*

#### `ud/history/[pubkey]`

**Goal**

Get the wallet universal dividend history

**parameters**

Name              | Value							| Method
----              | -----							| ------
`pubkey`          | Wallet public key.				| URL

**Returns**

The universal dividend history for the given `pubkey`. 
```json
{
  "currency": "meta_brouzouf",
  "pubkey": "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk",
  "history": {
    "history": [
      {
        "block_number": 125,
        "consumed": true,
        "time": 1421927007,
        "amount": 100
      },
      {
        "block_number": 410,
        "consumed": false,
        "time": 1422012828,
        "amount": 100
      },
      {
        "block_number": 585,
        "consumed": true,
        "time": 1422098800,
        "amount": 100
      }
    ]
  }
}
```


### ws/*

#### `ws/block`

**Goal**

A websocket entry point for receiving blocks.

**Parameters**

*None*.

**Returns**

Websocket connection.

#### `ws/peer`

**Goal**

A websocket entry point for receiving peers.

**Parameters**

*None*.

**Returns**

Websocket connection.
