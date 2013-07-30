# NCTP - NodeCoin Transport Protocol

NCTP is a transport protocol which aims at exchanging HDC data over HTTP.

## HTTP API

_N.B.:_ *this part is highly sensible to changes, as peering mecanisms are not defined at all. This part is only a first draft not discussed with anyone and only proposed by its author (cgeek) as an initial way to exchange NodeCoin data.*

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

With such a tree structure, NodeCoin considers the tree has exactly 6 nodes: `[ROOT,H,E,F,G,E]`. Nodes are just an array, and for a Lambda Server LS1, it is easy to ask for the values of another server LS2 for level 1 (`H` and `E`, the second level): it requires nodes interval `[1;2]`.

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

URL | Description
--- | -----------
`amendments/init` | is used to GET the initial keys used to forge the initial amendment.
`amendments/submit` | is used to POST an amendment with the required signatures (votes) in ASCII-Armored format.
`amendments/view/[AMENDMENT_ID]/members` | is a Merkle URL referencing to the members of the Community.
`amendments/view/[AMENDMENT_ID]/self` | shows the raw data of the amendment with the given `[AMENDMENT_ID]`.
`amendments/view/[AMENDMENT_ID]/voters` | is a Merkle URL referencing to the voters required to validate the given amendment.
`coins/[PGP_FINGERPRINT]/list` | lists the coins owned by the given `PGP_FINGERPRINT`.
`coins/[PGP_FINGERPRINT]/view/[COIN_NUMBER]` | allows to view money issuance transaction for this coin.
`community/join` | is used to POST an individual request for officially join the community.
`community/declare` | is used to POST a THT entry declaration.
`transactions/process/issuance` | is a URL to POST an issuance transaction.
`transactions/process/transfert` | is a URL to POST a transfert transaction.
`transactions/process/transfert` | is a URL to POST a fusion transaction.
`transactions/view/[TRANSACTION_ID]` | displays detailed informations about a transaction.