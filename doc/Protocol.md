# UCP - uCoin Protocol

> This document is to be updated regularly during August 2014

## Contents

* [Contents](#contents)
* [Vocabluary](#vocabulary)
* [Environment](#environment)
* [Conventions](#conventions)
  * [Documents](#documents)
  * [Signatures](#signatures)
* [Formats](#formats)
  * [Public key](#public-key)
  * [Keyblock](#keyblock)
  * [Amendment](#amendment)
  * [Transaction](#transaction)
  * [Peer](#peer)
  * [Status](#status)
  * [Forward](#forward)
  * [Wallet](#wallet)
* [Variables](#variables)
  * [Protocol parameters](#protocol-parameters)
  * [Computed variables](#computed-variables)
* [Processing](#processing)
  * [Neutral documents](#neutral-documents)
  * [Keyblock](#keyblock-1)
  * [Status](#status-1)
  * [Forward](#forward-1)
* [Implementations](#implementations)
  * [Requirements](#requirements)
  * [APIs](#apis)
* [References](#references)

## Vocabulary

Word | Description
---- | -------------
Universal Dividend | Money issuance **directly** and **exclusively** on community members.
Community | A groupment of individuals linked together trought a Monetary Contract.
Monetary Contract | A document gathering the informations defining the community members, voters and monetary mass inside it.

## Environment

> TODO

## Conventions

### Documents

#### Line endings

Please note **very carefully** that every HDC document's line **ENDS with a newline character**, *Windows-style*, that is to say `<CR><LF>`.

This is a *very important information* as every document is subject to hashes, and Unix-style endings won't produce the expected hashes.

#### Numbering

For [Amendments](#amendment) and [Transactions](#transaction), number starts from `0`. That is, first amendments is `AM#0`, and first transaction of a node is `TX#0`.

#### Dates

For any document using a date field, targeted date is to be understood as **UTC+0** reference.

### Signatures

#### Format

A signature format follows [OpenPGP RFC4880's ASCII Armor definition](http://tools.ietf.org/html/rfc4880#section-6.2).

Here is an [example](http://tools.ietf.org/html/rfc4880#section-6.6) of the expected structure:

    -----BEGIN PGP MESSAGE-----
    Version: OpenPrivacy 0.99
    
    yDgBO22WxBHv7O8X7O/jygAEzol56iUKiXmV+XmpCtmpqQUKiQrFqclFqUDBovzS
    vBSFjNSiVHsuAA==
    =njUN
    -----END PGP MESSAGE-----

#### Line endings

Please note **very carefully** that every signature's line **ENDS with a newline character**, *Windows-style*, that is to say `<CR><LF>`.

#### Delimitation

As a consequence, any signature starts with `-----BEGIN PGP MESSAGE-----<CR><LF>` and ends with `-----END PGP MESSAGE-----<CR><LF>`.

## Formats

This section deals with the various data format used by UCP.

### Public key

#### Definition

A public key is to be understood as an OpenPGP public key, also known as OpenPGP certificate.

For more informations on OpenPGP, see [RFC 4880 - OpenPGP Message Format](http://tools.ietf.org/html/rfc4880).

### Representation

#### Fingerprint

UCP considers the 40 alphanumeric SHA1 hash of a key as its identifier, also known as fingerprint of the key. For example, `6413D27D3D9CB2F15DF9D7BBB638A36D40AA4187` is a valid fingerprint for a key.

#### KeyID

The lower 8 bytes of a fingerprint are considered the **KeyID** of a public key. For our previous key `6413D27D3D9CB2F15DF9D7BBB638A36D40AA4187`, this KeyID is `B638A36D40AA4187`.

This ID is obviously weaker than Fingerprint, but is enough for building a Keychain of billions of people.

#### ASCII-armored format

Classically, OpenPGP keys can be represented in ASCII-armored format which allows it to be transfered in a textual way.

An example of such a certificate could be:

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

### Membership

In UCP, a member is represented by a PGP key he is supposed to be the owner. To be integrated in a community, the newcomer owner of the PGP key *has to express its will* to integrate the Community.

This step is done by issuing a the following document:

```bash
Version: 1
Currency: beta_brousouf
Issuer: 405715EC64289D1F43808F57EC51F273CBC0FA17
Date: TIMESTAMP
Membership: IN
UserID: OPENPGP_USER_ID
```

#### Fields details

Field | Description
----- | -----------
`Version` | Denotes the current structure version.
`Currency` | Contains the name of the currency.
`Issuer` | Full PGP key fingerprint issuing this message.
`Date` | Creation date of this message. Timestamp. This date may be different from signature's date.
`Membership` | Membership message. Value is either `IN` or `OUT` to express wether a member wishes to opt-in or opt-out the community.
`UserID` | OpenPGP UserID string present in this document's signing key

#### Validity

A [Membership](#membership) is to be considered valid if:

* `Issuer` matches signature's key ID
* `Membership` matches either `IN` or `OUT` value

### Keyblock
A Keyblock is a document gathering public key informations in order to build a Web Of Trust (WoT) representation.

#### Structure

    Version: VERSION
    Type: KeyBlock
    Currency: CURRENCY
    Nonce: NONCE
    Number: BLOCK_NUMBER
    PreviousHash: PREVIOUS_HASH
    PreviousIssuer: ISSUER_FPR
    MembersCount: WOT_MEM_COUNT
    MembersRoot: WOT_MEM_ROOT
    MembersChanges:
    +MEMBER_IN_KEY_FINGERPRINT
    ...
    -MEMBER_OUT_KEY_FINGERPRINT
    ...
    PublicKeys:
    #PUBLIC_KEY_FINGERPRINT
    [packets]
    ...
    Memberships:
    VERSION:KEY_ID:TYPE:TIMESTAMP
    MembershipsSignatures:
    [signature_packet]
    ...
    BOTTOM_SIGNATURE

Field                 | Data
--------------------- | ------------------------------------------
Version               | The document version
Type                  | The document type
Currency              | The currency name
Nonce                 | A arbitrary nonce value
Number                | The keyblock number
PreviousHash          | Previous keyblock fingerprint
PreviousIssuer        | Previous keyblock issuer's fingerprint
MembersCount          | Number of members in the WoT
MembersChanges        | Public keys' fingerprint: with a `+` for joining or with a `-` for leaving
PublicKeys            | Public keys' packets. Packets are grouped by their target key fingerprint.
Memberships           | Membership entries, under shorthand format
MembershipsSignatures | Signatures attached to `Memberships`.

#### Coherence
To be a valid keyblock document, a keyblock must match the following rules:

##### Format
* `Version`, `Nonce`, `Number`, `MembersCount` are integer values
* `Currency` can be any String of alphanumeric characters, space, `-` or `_`
* `PreviousHash`, `PreviousIssuer`, `MembersRoot` are uppercased SHA-1 hashs
* `MembersChanges` is a multiline field whose lines are either:
  * `+` followed by an SHA-1 hash
  * `-` followed by an SHA-1 hash
* `PublicKeys` is a multiline field whose lines are divided in blocks composed by:
  * A first line with `#PUBLIC_KEY_FINGERPRINT`, where `PUBLIC_KEY_FINGERPRINT` is an SHA-1 hash
  * A bunch of lines under Base64 format, representing OpenPGP public key, user ID and certification packets
* `Memberships` is a multiline field whose lines follow the `VERSION:KEY_ID:TYPE:TIMESTAMP` pattern:
  * `VERSION` is a membership version field
  * `KEY_ID` is a membership signing key ID
  * `TYPE` is either `IN` or `OUT` value
  * `TIMESTAMP` is a timestamp value
* `MembershipsSignatures` is a multiline field composed of Base64 lines

The document must be ended with a `BOTTOM_SIGNATURE`, which is an OpenPGP armored signature.

##### Data
* `Version` equals `1`
* `Type` equals `KeyBlock`
* `MembersChanges` must contain `+KEY` for all memberships of the block with `TYPE = IN`
* `MembersChanges` must contain `-KEY` for all memberships of the block with `TYPE = OUT`
* `MembersChanges` may contain `-KEY` without a corresponding `TYPE = OUT` membership
* `MembersChanges` must *not* contain `+KEY` if the corresponding `TYPE = IN` membership is not present in the block

##### Specific rules
* If `Number` equals `0`, `PreviousHash` and `PreviousIssuer` must not be provided
* If `Number` is over `0`, `PreviousHash` and `PreviousIssuer` must be provided

#### Keychain
A Keychain is a chaining of Keyblock. Such a document describes a WoT over the time.

Each keyblock, other than the keyblock#0 must follow the following rules:

* Its `Number` field has the same value as preceding keyblock + 1
* Its `Currency` field has exactly the same value as preceding keyblock
* Its `PreviousHash` field match the uppercased SHA-1 fingerprint of the whole previous block
* Its `PreviousIssuer` field match the key fingerprint of the previous block's signatory
* Its `MembersCount` field is the sum of all `+` count minus the sum of all `-` count from `MembersChanges` field since keyblock#0, this block included

### Amendment

#### Definition

An amendment is the atomic part **constituting** a Monetary Contract. A Monetary Contract is nothing but a chained list of Amendments. An Amendment is an ASCII document defining:

* A currency name
* A date of generation (timestamp format)
* A list of incoming/outcoming members
* Eventually, a Universal Dividend amount
* Eventually, a reference to its preceding Amendment (every Amendment have a predecessor, excepted first)

Amendments have the following structure:

    Version: VERSION
    Currency: CURRENCY_NAME
    Number: INCREMENT
    GeneratedOn: TIMESTAMP
    UniversalDividend: UNIVERSAL_DIVIDEND
    CoinAlgo: COIN_ALGORITHM
    CoinBase: COIN_BASE_POWER
    CoinList: COIN_LIST
    PreviousHash: PREVIOUS_HASH
    MembersRoot: WOT_MERKLE_ROOT
    MembersCount: WOT_SIZE
    MembersChanges:
    +NEW_INDIVIDUAL_FPR
    -LEAVING_INDIVIDUAL_FPR

All fields are not mandatory for a given amendment. Note that this precise structure is the version 1 amendment structure, and that any other structure may be proposed with a different version number. The only requirement is to have a `Version: VERSION` starting the text structure.

Here is the interpretation of each field:

Field | Description | Required
----- | ----------- | --------
`Version` | denotes the current structure version. | **Required**
`Currency` | contains the name of the currency. This is used to identify the target of the amendment, as several moneys may be HDC-based. | **Required**
`Number` | references the position of the amendment in the amendment chain. Initial amendment has the value `0`. | **Required**
`GeneratedOn` | references the generation date of the amendment. | **Required**
`UniversalDividend` | if provided, is a positive integer. It defines the amount of money each member of the community may create for **THIS** amendment. | *Not Required*
`CoinAlgo` | **is mandatory if `UniversalDividend` is positive**. Gives the algorithm used to fill in `CoinBase` and `CoinList` fields. Allows to deduce coins value too. | *Not Required*
`CoinBase` | **is mandatory if `UniversalDividend` is positive**. Gives the power value of first coin in `CoinList`. | *Not Required*
`CoinList` | **is mandatory if `UniversalDividend` is positive**. List of integers telling how much coins are issued for a given power. First integer gives the number of coins of value 2^`CoinBase`, second gives the number of coins of value 2^(`CoinBase` + 1), and so on. | *Not Required*
`PreviousHash` | **is mandatory if `Number` is positive**. It is a hash of the previous amendment content, and is used for people to identify without ambiguity the previous amendment (`Number` field is not enough for that purpose, `PreviousHash` is an authentication mecanism to do this job). | *Not Required*
`MembersRoot` | is the root hash of a Merkle tree listing the current members of the whole community. It is a checksum mecanism. Note that `MembersChanges` are included in the Merkle. | **Required**
`MembersCount` | is used in combination of `MembersRoot`, it defines how many leaves were used to generate the Merkle tree. | **Required**
`MembersChanges` | contains a list of members joining or leaving the community. A joining member has a line starting with `+` and a leaving one with `-`. | **Required**

And `AMENDMENT_ID` has the following format:

    AMENDMENT_NUMBER-AMENDMENT_HASH

Where `AMENDMENT_NUMBER` is the `Number`, and `AMENDMENT_HASH` is the computed hash of the Amendment #`Number`.

#### Validity

In HDC, an Amendment structure is considered *valid* if:

* Every line ends with a DOS `<CR><LN>` new line character.
* Every required field is present, **with** consideration of fields order.
* Every present field ends with a DOS `<CR><LN>` new line character.
* Fields `Version`, `Number`, `GeneratedOn`, `UniversalDividend` (if present), `MembersCount` are zero or positive integer values.
* Fields `CoinList` is a list of space separated integers.
* Fields `PreviousHash`, `MembersRoot` are upper-cased SHA-1 hashes.
* Fields `MembersChanges` are upper-cased SHA-1 hashes, preceded either by a `+` or `-` character. Furthermore, lists must be string sorted.
* When `Number` field is positive, Amendment has a `PreviousHash` value.

#### Example

    Version: 1
    Currency: beta_brousouf
    Number: 2
    UniversalDividend: 1184
    CoinAlgo: Base2Draft
    CoinBase: 4
    CoinList: 14 6 2 3 1
    PreviousHash: 20947518DD947A25E6EDB16C620909891058C532
    MembersRoot: F5ACFD67FC908D28C0CFDAD886249AC260515C90
    MembersCount: 3
    MembersChanges:
    +2E69197FAB029D8669EF85E82457A1587CA0ED9C
    +33BBFC0C67078D72AF128B5BA296CC530126F372
    +C73882B64B7E72237A2F460CE9CAB76D19A8651E

Issuing a dividend composed of:

* 14 coins of value 2^4
* 6 coins of value 2^5
* 2 coins of value 2^6
* 3 coins of value 2^7
* 1 coin of value 2^8

Here, values can be understood because of `Base2Draft` [algorithm name](./CoinAlgorithms.md), which gives rules on how to interprete coins.

#### Root Amendment

The root Amendment is special in that it has *no previous Amendment* and inventories the root members of the Community.

### Transaction

#### Definition

Transaction is the support of money: it allows to materialize coins' ownership. It is defined by the following format:

    Version: VERSION
    Currency: CURRENCY_NAME
    Sender: SENDER_FINGERPRINT
    Number: INCREMENT
    PreviousHash: PREVIOUS_TRANSACTION_HASH
    Recipient: RECIPIENT_FINGERPRINT
    Coins:
    COIN_ID[:TRANSACTION_ID]
    COIN_ID[:TRANSACTION_ID]
    COIN_ID[:TRANSACTION_ID]
    ...
    Comment:
    [Some multiple line
    comment here...]

Here is a description of each field:

Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Currency` | contains the name of the currency. This is used to identify the target of the transaction, as several moneys may be HDC-based.
`Sender` | the current owner's OpenPGP fingerprint of the coins to be sent.
`Number` | an increment number identifying this transaction among all others sender's transactions.
`PreviousHash` | **is mandatory if `Number` is positive**. It is a hash of the previous transaction (content AND signature), and is used to identify without ambiguity the previous transaction (it is an integrity mecanism).
`Recipient` | the recipient's OpenPGP fingerprint to whom the coins are to be sent.
`Coins` | a list of coins to be transfered, eventually followed by a colon and a transaction ID justifying the ownership. Lines are sorted by `COIN_ID`.
`Comment` | comment for transaction. May be used for any future purpose. Multiline field, ends at the end of the transaction message.

`COIN_ID` has following format:

    FINGERPRINT-AM_NUMBER-COIN_NUMBER

Field      | Description
---------- | -----------
`FINGERPRINT`  | uppercased SHA1 hash of the member for whom this was coin was issued in the Contract
`AM_NUMBER` | integer identifying the amendment justifying this coin's existence
`COIN_NUMBER` | integer identifying the coin into promoted amendment #`AM_NUMBER`

For example, in above amendment, coin `33BBFC0C67078D72AF128B5BA296CC530126F372-0-26` is:
* A coin issued for member `33BBFC0C67078D72AF128B5BA296CC530126F372`
* A coin issued in amendment `#0`
* A coin of value 2^8, as it is the 26th coin in `CoinList`

#### Validity

A Transaction structure is considered *valid* if:

* Field `Currency` is not empty.
* Fields `Sender`, `Recipient` are upper-cased SHA-1 hashes.
* Fields `Version`, `Number` are zero or positive integer values.
* Field `PreviousHash` is an upper-cased SHA-1 hash, if present.
* Field `Coins` have at least one line, with lines sorted and not have twice same `COIN_ID`. Each line may be completed with a colon (':') and a transaction ID.

A transaction ID has following format:

    ISSUER-TRANSACTION_NUMBER

Field      | Description
---------- | -----------
`ISSUER`  | uppercased SHA1 hash of the member for whom this was coin was issued in the Contract
`TRANSACTION_NUMBER` | integer identifying the transaction number of issuer `ISSUER`

#### Example

    Version: 1
    Currency: beta_brousouf
    Sender: 31A6302161AC8F5938969E85399EB3415C237F93
    Number: 1
    PreviousHash: AE5780D605097BA393B4F32DC858C46D4344339D
    Recipient: 31A6302161AC8F5938969E85399EB3415C237F93
    Coins:
    1C5F94BEC2ADBCE799FBD9C61F3245B64118E1FA-54-4:4DEC4AC8D7A6BBE1D65E4CF3BFD99A5E2B7672A6-99
    2035C0C29784D01C74B3F3530F95A381E0E0522E-88-20:20935EFBC0103C121EF5918714AEBAFF780CB3F9-54
    4001FE568F055848DEED454C1E67FD59779D21F5-104-10:32A1C96E3DB2282692C2F27E366248512095BE88-11
    31A6302161AC8F5938969E85399EB3415C237F93-67-1
    Comment:
    Transfering 4 coins.
    * First 3 coins are coins Sender received from other members.
    * Last coin is a coin never transfered by Sender from Universal Dividend of AM#67

#### Money ownership

Money ownership **IS NOT** limited to members of the Community. Any owner (an individual or an organization) of an OpenPGP certificate may own money: it only requires the key's fingerprint to match `Recipient` fingerprint to become an owning key.

#### Transactions chain

Obviously, coins a sender does not own CANNOT be sent by him. That is why a transaction refers to other transactions, to prove that the sender actually owns the coins he wants to send.

### Peer

UCP uses P2P networks to manage communoty & money data, hence it needs to know which nodes make the network for a given currency.

For that purpose, UCP defines a peering table containing, for a given node PGP key:

* a currency name
* a list of endpoints to contact the node

This link is made through a document called *Peer* whose format is:

  Version: VERSION
  Currency: CURRENCY_NAME
  Fingerprint: NODE_FINGERPRINT
  Endpoints:
  END_POINT_1
  END_POINT_2
  END_POINT_3
  [...]

With the signature attached, this document certifies that this fingerprint's key is owned by host at given network endpoints.

The aggregation of all *Peer* documents is called the *peering table*, and allows to authentify addresses of all nodes identified by their PGP key's fingerprint.

#### Fields details

Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Currency` | contains the name of the currency.
`Fingerprint` | PGP key identifier owned by this node.
`Endpoints` | a list of endpoints to interact with the node

`Endpoints` has a particular structure: it is made up of at least one line with each line following format:

  PROTOCOL_NAME[ OPTIONS]
  [...]

For example, the first written uCoin peering protocol is BASIC_MERKLED_API, which defines an HTTP API. An endpoint of such protocol would look like:

  BASIC_MERKLED_API[ DNS][ IPv4][ IPv6] PORT

Where :

Field | Description
----- | -----------
`DNS` | is the dns name to access the node.
`IPv4` | is the IPv4 address to access the node.
`IPv6` | is the IPv6 address to access the node.
`PORT` | is the port of the address to access the node.

#### Example

  Version: 1
  Currency: beta_brousouf
  Fingerprint: A70B8E8E16F91909B6A06DFB7EEF1651D9CCF468
  Endpoints:
  BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001
  BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002
  OTHER_PROTOCOL 88.77.66.55 9001

### Status

Such a document informs a node on current node's status, either connected, up, or disconnected.

  Version: VERSION
  Currency: CURRENCY_NAME
  Status: NEW|NEW_BACK|UP|UP_BACK|DOWN
  From: SENDER_PGP_FINGERPRINT
  To: RECIPIENT_PGP_FINGERPRINT


Field      | Description
-----      | -----------
`Version`  | denotes the current structure version.
`Currency` | contains the name of the currency.
`Status    | Status type to be sent.
`From`     | Issuer's fingerprint of the message.
`To`       | Recipient's fingerprint for this message.

### Forward

In addition to peering table, which only allows to know the address of each peer, *Forward* is a document allowing peers to ask each other to be forwarded of specific transactions when received.

A *Forward table*, the gathering of several *Forward*, can be directly compared to a routing table.

Forward format is the following:

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

Field      | Description
-----      | -----------
`Version`  | denotes the current structure version.
`Currency` | contains the name of the currency.
`From`     | PGP key identifier asking for this forwarding request.
`To`       | PGP key identifier targeted by this forwarding request.
`Forward`  | the forwarding rule, either `ALL` to forward ANY incoming transaction or `KEYS` to forward only transactions whose sender or recipient belongs to values of `Keys`.
`Keys`     | if `Forward: KEYS`, tells the keys whose transaction shall be forwarded. Must not be present if `Forward: ALL`.

### Wallet

UCP also manages, like most of crypto-currency systems, a "wallet" concept. Wallets are described through a *Wallet* message. The aggregation of **all** Wallet messages constitute the *WHT* for *Wallets Hash Table* and containing **all** informations about **any** Wallet in a uCoin network.

> Note: by convention, "Wallet" (uppercased `W`) will refer to uCoin message, and "wallet" (lowercased `W`) refer to the more general wallet concept.

WHT is a simple Hash Table whose entries are OpenPGP key fingerprint, and values are Wallet messages. The goal of WHT is to know, for a given wallet:

* which are the nodes **hosting this wallet's transactions**
* which are the nodes this wallet agrees to trust *for receiving transaction of other wallets*

This is a very important feature for two points:

* it makes possible the distribution of the whole transactions database (a random individual's computer can't handle a humanity scale transactions database)
* it aims at preventing double-spending issue

#### Wallet message Structure

A Wallet format is the following:

  Version: VERSION
  Currency: CURRENCY_NAME
  Key: KEY_FINGERPRINT
  Date: TIMESTAMP
  RequiredTrusts: NUMBER_OF_TRUSTS
  Hosters:
  C139D011FAC7E3AA8E54619F7729F0179526FA54
  14808C7325B28B38CBC62CF9CCEE37CD1AA03408
  516B9783FCA517EECBD1D064DA2D165310B19759
  0499A0A3F2F4DA8697632D5B7AF66EC607B06D99
  Trusts:
  A5ED399E2E411BF4B09132EFA2CC5E0CA49B835E
  25AC706AF69E60A0334B2A072F4B802C3242B159

and is followed by signature of `KEY_FINGERPRINT`'s owner.

#### Wallet's fields signification

##### Date

The `Date` field is to be understood as the date of creation - and thus validity - of this Wallet message. This field may be different from signature's date. The aim is to clearly express the date of validity, instead of relying on the computer datetime.

##### Hosters

The `Hosters` field is a list of *nodes* a given wallet declares as the ones that **officialy manages this wallet's transactions**. That is, which are the nodes by which **every transactions of this wallet pass trough**.

##### Trusts

The `Trusts` field is a list of *nodes* a given wallet does trust for receiving transactions. This means, for a given `Recipient`, that this wallet considers transactions from `Sender` as valid only if the sender's transactions are managed by one of the trusted nodes of `Recipient` (this wallet).

> Indeed, if the owner of a wallet is not an honest man/organization and wants to cheat, he probably will declare a corrupted node *he controls* for his wallet's transactions management. Thus, he would be able to declare wrong transactions and steal people he trades with.

> If the owner of a wallet declares a node he *trusts* is not subject to corruption as trading node, it will be more difficult for a dishonest man to cheat against him as he does not control the trusted node.

##### RequiredTrusts

This field, combined with `Trusts`, gives the threshold a sending wallet needs to reach for a recipient's wallet to consider a transaction as valid.

#### Wallet Protections

Of course, a Wallet is a critical data. Thus, **it has to be signed** by the owner of the wallet. If an entry is not signed by the owner of the wallet, it should not be considered as trustworthy information.


## Variables

### Protocol parameters

Parameter   | Goal
----------- | ----
c           | The %growth of the UD every `[dt]` period
dt          | Time period between two UD
ud0         | UD(0), i.e. initial Universal Dividend
sigDelay    | Time to wait between two certifications of a same UserID by a same key
sigValidity | Maximum age of a valid signature
sigQty      | Minimum quantity of signatures to join/stay in the keychain
stepMax     | Maximum step between the WoT and individual and a newcomer
powZeroMin  | Minimum number of zeros for a Proof-of-Work
powRetro    | Number of days to look back in the keychain for PoW strengh

### Computed variables

Variable  | Meaning
--------- | ----
members   | Synonym of `members(t = now)`, `wot(t)`, `community(t)`, `keychain(t)` targeting the keys whose last status is `+` in the keychain.

## Processing

### Neutral documents

> TODO

### Keyblock
A Keyblock can be accepted only if it respects the following rules.

#### Newcomers

`MembersChanges` field may contain `+KEY` only if:

* The targeted public key is either present in the keychain or the current keyblock
* The targeted public key matches [signatures requirements](#signature-requirements) with the current keyblock
* The targeted public key has a [valid membership](#valid-membership) in the current keyblock

#### Leavers
* `MembersChanges` field may contain `-KEY` if it receives a [valid leaving membership](#valid-membership)
* `MembersChanges` field may contain `-KEY` without corresponding membership **only if** the `KEY` no more matches [signatures requirements](#signature-requirements).
* `MembersChanges` field **must** contain `-KEY` without corresponding membership if a `KEY` no more matches [signatures requirements](#signature-requirements).

#### Public key add

* A new public key can be added to a keyblock only for [newcomers](#newcomers)
* A public key must contain a UserID packet with the exact same UserID as in the [membership](#valid-membership)
* A public key with the same [KeyID](#keyid) as an existing member or a newcomer cannot be added to the keychain

#### Certifications

##### Self-certification
* Only *one* self-certification of a UserID can be added in the whole keychain.
* A public key must have a self-certification of its UserID

##### Tiers-certifications
* Only members' certifications can be added in a keyblock
* A same certification (same UserID by a given key) cannot happen twice in a `[sigDelay]` duration interval

#### Valid membership
A membership is to be considered valid if matching the following rules:

* The membership must be [well formated](#membership)
* The membership `UserId` field matches [udid2 format](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_Authentication_Mechanisms.draft.txt#L164)
* A joining membership cannot follow a `+KEY` in keychain changes for this key
* A leaving membership can only follow a `+KEY` in keychain changes for this key

#### Certification validity
A signature (certification)  is considered valid if its age is less or equal to `[sigValidity]` months.

#### Certification requirements
A public key can join/stay in the community only if its [certifications](#certifications) matches the following rules:

* The number of valid certifications must be at least `[sigQty]`
* The maximum step between the key and the whole WoT (each member) must be `[stepMax]`

#### Block fingerprint
To be valid, a block fingerprint (whole document + signature) must start with a specific number of zeros. Rules are the following:

* A PoW fingerprint must start with at least `[powZeroMin]` zeros
* A zero must be added at the beginning for each keyblock emitted by the key during the last `[powRetro]` days

> Those 2 rules, and notably the second, ensures a specific member won't keep the control too long

### Status

> TODO

### Forward

> TODO

## Implementations

> TODO

### Requirements

> TODO

### APIs

> TODO

## References

> TODO
