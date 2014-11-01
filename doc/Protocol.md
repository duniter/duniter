# UCP - uCoin Protocol

> This document is still regularly updated (as of October 2014)

## Contents

* [Contents](#contents)
* [Introduction](#introduction)
* [Conventions](#conventions)
  * [Documents](#documents)
  * [Signatures](#signatures)
* [Formats](#formats)
  * [Public key](#public-key)
  * [Certification](#certification)
  * [Membership](#membership)
  * [Block](#block)
  * [Transaction](#transaction)
  * [Peer](#peer)
  * [Status](#status)
* [Variables](#variables)
  * [Protocol parameters](#protocol-parameters)
  * [Computed variables](#computed-variables)
* [Processing](#processing)
  * [Peer](#peer-1)
  * [Block](#block-1)
  * [Status](#status-1)
  * [Transaction](#transaction-1)
* [Implementations](#implementations)
* [References](#references)

## Vocabulary

Word | Description
---- | -------------
Universal Dividend | Money issuance **directly** and **exclusively** on community members.
Web of Trust | A groupment of individuals linked together trought public keys & certification of identities' mechanism

## Introduction

UCP aims at defining a data format, interpretation of it and processing rules in order to build coherent free currency systems in a P2P environment. UCP is to be understood as an *abstract* protocol since it does not define all of the currency parameters' value but only the rules about them.

This document describes UCP in a bottom-up logic, so you will find first the details of the protocol (data format) to end with general protocol requirements.

## Conventions

### Documents

#### Line endings

Please note **very carefully** that every document's line **ENDS with a newline character**, *Unix-style*, that is to say `<LF>`.

This is a *very important information* as every document is subject to hashes, and Windows-style endings won't produce the expected hashes.

#### Numbering

[Block](#block) numbering starts from `0`. That is, first block is `BLOCK#0`.

#### Dates

For any document using a date field, targeted date is to be understood as **UTC+0** reference.

### Signatures

#### Format

Signatures follow [Ed55219 pattern](http://en.wikipedia.org/wiki/EdDSA), and are written under [Base64](http://en.wikipedia.org/wiki/Base64) encoding.

Here is an of expected signature:

    H41/8OGV2W4CLKbE35kk5t1HJQsb3jEM0/QGLUf80CwJvGZf3HvVCcNtHPUFoUBKEDQO9mPK3KJkqOoxHpqHCw==

#### Line endings

No new line character exists in a signature.

## Formats

This section deals with the various data formats used by UCP.

### Public key

#### Definition

A public key is to be understood as a [Ed55219](http://en.wikipedia.org/wiki/EdDSA) public key.

Its format is a [Base58](http://en.wikipedia.org/wiki/Base58) string such as the following:

    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY

### Certification

#### Definition

A certification is the act of creating a link between a *public key* and *an arbitrary identity*. In UCP, this certification is done through the signature of an identity string by a public key.

####Identity string

UCP does not rely on any particular identity format. Identity simply has to be a string avoiding usage of line endings characters.
    
In this document *identifier*, `UserID`, `USER_ID` and `uid` will be indifferently used to refer to this identity string.

#### Self certification

##### Definition

A self certification is the act, for a given key's owner, to sign an identifier *he considers it reflects his identity*. Doing a self-certification is extacly like saying:

> « This identity refers to me ! »

##### Format

Self-certification is the signature of a special string *containing* the udid2 identifier:

    UID:IDENTIFIER
    
Here, `UID` is just 'UID' string and `IDENTIFIER` has to be replaced by a valid identifier. This string **is what signature is based upon**, without any carriage return.

The whole self-certification is then:

    UID:IDENTIFIER
    META:TS:TIMESTAMP
    SIGNATURE
Where:

* `META` is just 'META' string
* `TS` is just 'TS' string
* `TIMESTAMP` is the timestamp value of the signature date

##### Example

A valid identity:

    UID:lolcat
    
A complete self-certification:

    UID:lolcat
    META:TS:1409990782
    J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
    
#### Certification

##### Definition

The generic word *certification* is to be used for describing *certification from others*, i.e. *non-self certifications*.

##### Format

A certification is only the *signature* over a complete self-certification flavoured with a signature date.

##### Inline format

Certification may exists under *inline format*, which is a more precise format than just the signature, and described under a simple line. Here is general structure:

    PUBKEY_FROM:PUBKEY_TO:TIMESTAMP:SIGNATURE

Where

  * `PUBKEY_FROM` is the certification public key
  * `PUBKEY_TO` is the public key whose identity is being certified
  * `TIMESTAMP` is the certification date
  * `SIGNATURE` is the certification

##### Example

If we have the following complete self-certification:

    UID:lolcat
    META:TS:1409990782
    J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
    
A valid certification could be:

    SoKwoa8PFfCDJWZ6dNCv7XstezHcc2BbKiJgVDXv82R5zYR83nis9dShLgWJ5w48noVUHimdngzYQneNYSMV3rk
    
Over the following data:

    UID:lolcat
    META:TS:1409990782
    J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
    META:TS:1509991044

Note here that a certification *alone* has no meaning: it is only when appended to a flavoured self-certification that this signature (the certification) makes sense.

### Membership

In UCP, a member is represented by a public key he is supposed to be the owner. To be integrated in a community, the newcomer owner of the key *has to express its will* to integrate the Community.

This step is done by issuing a the following document:

```bash
Version: 1
Currency: beta_brousouf
Issuer: HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
Date: TIMESTAMP
Membership: IN
UserID: USER_ID
CertTS: CERTIFICATION_TS
```

followed by a signature of `Issuer`.

#### Fields details

Field | Description
----- | -----------
`Version` | Denotes the current structure version.
`Currency` | Contains the name of the currency.
`Issuer` | The public key of the issuer.
`Date` | Creation date of this message. Timestamp. This date may be different from signature's date.
`Membership` | Membership message. Value is either `IN` or `OUT` to express wether a member wishes to opt-in or opt-out the community.
`UserID` | Identity to use for this public key
`CertTS` | Identity's certification date

#### Validity

A [Membership](#membership) is to be considered valid if:

* `Issuer` matches signature
* `Membership` matches either `IN` or `OUT` value
* `Date` is a valid timestamp
* `Currency` is a valid currency name
* `UserID` if provided is a non-empty string
* `CertTS` if provided is a valid timestamp



### Transaction

#### Definition

Transaction is the support of money: it allows to materialize coins' ownership. It is defined by the following format:

    Version: VERSION
    Currency: CURRENCY_NAME
    Issuers: 
    PUBLIC_KEY
    ...
    Inputs:
    INDEX:SOURCE:NUMBER:FINGERPRINT:AMOUNT
    ...
    Outputs:
    PUBLIC_KEY:AMOUNT
    ...
    SIGNATURES
    ...

Here is a description of each field:

Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Currency` | contains the name of the currency. This is used to identify the target of the transaction, as several moneys may be UCP-based.
`Issuers` | a list of public key, followed by a sequential integer
`Inputs` | a list linking `Issuers` (via INDEX) to coin sources
`Outputs` | a list of public keys and amounts allowed to them

#### Validity

A Transaction structure is considered *valid* if:

* Field `Currency` is not empty.
* Field `Issuers` is a multiline field whose lines are Base58 strings of 44 characters.
* Field `Inputs` is a multiline field whose lines starts with an integer, followed by a colon, a source character (either `T`, `D`), a colon, an integer, a colon, a SHA-1 hash and an integer value
* Field `Outputs` is a multiline field whose lines starts by a Base58 string, followed by a colon and an integer value
* Field `Outputs` is followed by a list of signatures corresponding to the number of issuers

#### Example 1

Key `HsLShA` sending 30 coins to key `BYfWYF` using 1 source transaction (its value is not known but could be 30) written in block #3.

    Version: 1
    Currency: beta_brousouf
    Issuers:
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    Inputs:
    0:T:3:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8:30
    Outputs:
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:25
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:5
    
Signatures (fake here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r

#### Example 2

Key `HsLShA` sending 30 coins to key `BYfWYF` using 2 sources transaction written in blocks #65 and #77 + 1 UD from block #88.

    Version: 1
    Currency: beta_brousouf
    Issuers:
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    Inputs:
    0:T:65:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8:4
    0:T:77:F80993776FB55154A60B3E58910C942A347964AD:15
    0:D:88:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B:11
    Outputs:
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30
    
Signatures (fake here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r

#### Example 3

Key `HsLShA`,  `CYYjHs` and `9WYHTa` sending 235 coins to key `BYfWYF` using 4 sources transaction (written in blocks #4, #78, #66 and #176) + 2 UD from same block #46.

    Version: 1
    Currency: beta_brousouf
    Issuers:
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp
    9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB
    Inputs:
    0:T:4:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8:22
    0:T:78:F80993776FB55154A60B3E58910C942A347964AD:8
    0:D:46:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B:40
    1:T:66:1D02FF8A7AE0037DF33F09C8750C0F733D61B7BD:200
    2:T:176:0651DE13A80EB0515A5D9F29E25D5D777152DE91:5
    2:D:46:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B:40
    Outputs:
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30
    DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx:146
    6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i:49
    
Signatures (fakes here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r
    2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX
    2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk

#### Compact format

A transaction may be described under a more compact format, to be used under [Block](#block) document. General format is:

    TX:VERSION:NB_ISSUERS:NB_INPUTS:NB_OUTPUTS
    PUBLIC_KEY:INDEX
    ...
    INDEX:SOURCE:FINGERPRINT:AMOUNT
    ...
    PUBLIC_KEY:AMOUNT
    ...
    SIGNATURE
    ...

Here is an example compacting above [example 3](#example-3):

    TX:1:3:6:3
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp
    9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB
    0:T:4:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8:22
    0:T:78:F80993776FB55154A60B3E58910C942A347964AD:8
    0:D:46:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B:40
    1:T:66:1D02FF8A7AE0037DF33F09C8750C0F733D61B7BD:120
    2:T:176:0651DE13A80EB0515A5D9F29E25D5D777152DE91:5
    2:D:46:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B:100
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30
    DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx:156
    6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i:49
    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r
    2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX
    2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk

#### Money ownership

Money ownership **IS NOT** limited to members of the Community. Any owner (an individual or an organization) of a public key may own money: it only requires the key to match `Ouputs` of a transaction.

#### Transfering money

Obviously, coins a sender does not own CANNOT be sent by him. That is why a transaction refers to other transactions, to prove that the sender actually owns the coins he wants to send.

### Block

A Block is a document gathering both:

  * [Public key](#publickey) data in order to build a Web Of Trust (WoT) representation
  * [Transaction](#transaction) data to identify money units & ownership

#### Structure

    Version: VERSION
    Type: Block
    Currency: CURRENCY
    Nonce: NONCE
    Number: BLOCK_NUMBER
    Date: GENERATED_ON
    ConfirmedDate: CONFIRMED_DATE
    UniversalDividend: DIVIDEND_AMOUNT
    Fees: FEES_AMOUNT
    Issuer: ISSUER_KEY
    PreviousHash: PREVIOUS_HASH
    PreviousIssuer: PREVIOUS_ISSUER_KEY
    MembersCount: WOT_MEM_COUNT
    Identities:
    PUBLIC_KEY:SIGNATURE:TIMESTAMP:USER_ID
    ...
    Joiners:
    PUBLIC_KEY:SIGNATURE:TIMESTAMP:CERTTS:USER_ID
    ...
    Leavers:
    PUBLIC_KEY:SIGNATURE:TIMESTAMP
    ...
    Excluded:
    PUBLIC_KEY
    ...
    Certifications:
    PUBKEY_FROM:PUBKEY_TO:TIMESTAMP:SIGNATURE
    ...
    Transactions:
    COMPACT_TRANSACTION
    ...
    BOTTOM_SIGNATURE

Field                 | Data                                              | Mandatory?
--------------------- | ------------------------------------------------- | ------------
Version               | The document version                              | Always
Type                  | The document type                                 | Always
Currency              | The currency name                                 | Always
Nonce                 | A arbitrary nonce value                           | Always
Number                | The keyblock number                               | Always
Date                  | Date of generation                                | Always
ConfirmedDate         | Last confirmed date                               | Always
UniversalDividend     | Universal Dividend amount                         | **Optional**
Fees                  | Fees amount from this block's transactions        | Always
Issuer                | This block's issuer's public key                  | Always
PreviousHash          | Previous keyblock fingerprint (SHA-1)             | from Block#1
PreviousIssuer        | Previous keyblock issuer's public key             | from Block#1
MembersCount          | Number of members in the WoT, this block included | Always
Identities            | New identities in the WoT                         | Always
Joiners               | `IN` memberships                                  | Always
Leavers               | `OUT` memberships                                 | Always
Excluded              | Exluded members' public key                       | Always
Transactions          | A liste of compact transactions                   | Always

#### Coherence
To be a valid, a block must match the following rules:

##### Format
* `Version`, `Nonce`, `Number`, `Date`, `ConfirmedDate`, `MembersCount`, `UniversalDividend` and `Fees` are integer values
* `Currency` can be any String of alphanumeric characters, space, `-` or `_`
* `PreviousHash` is an uppercased SHA-1 hash
* `Issuer` and `PreviousIssuer` are [Public keys](#publickey)
* `Identities` is a multiline field composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
  * `SIGNATURE` : a [Signature](#signature)
  * `USER_ID` : an identifier
* `Joiners` and `Leavers` are multiline fields composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
  * `SIGNATURE` : a [Signature](#signature)
  * `TIMESTAMP` : a timestamp value
* `Excluded` is a multiline field composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
* `Certifications` is a multiline field composed for each line of:
  * `PUBKEY_FROM` : a [Public key](#publickey) doing the certification
  * `PUBKEY_TO` : a [Public key](#publickey) being certified
  * `SIGNATURE` : a [Signature](#signature) of the certification
* `Transactions` is a multiline field composed of [compact transactions](#compact-format)

The document must be ended with a `BOTTOM_SIGNATURE` [Signature](#signature) issued by `Issuer` verifying the block's content.

##### Data
* `Version` equals `1`
* `Type` equals `Block`

##### Specific rules
* If `Number` equals `0`, `PreviousHash` and `PreviousIssuer` must not be provided
* If `Number` is over `0`, `PreviousHash` and `PreviousIssuer` must be provided

#### Blockchain
A Blockchain is a chaining of [Blocks](#block). Such a document describes a WoT + Transactions over the time.

Each Block other than the Block#0 must follow these rules:

* Its `Number` field has the same value as preceding block + 1
* Its `Currency` field has exactly the same value as preceding block
* Its `PreviousHash` field match the uppercased SHA-1 fingerprint of the whole previous block
* Its `PreviousIssuer` field has the same value as the previous block's `Issuer`
* Its `MembersCount` field equals to the previous block's `MembersCount` value plus `Joiners` line count, minus `Leavers` and `Excluded` line count.

##### Identities

1. A given public key cannot appear twice under `Identities` field in all the blockchain.
2. For each public key under `Identities` field of a block, the `Joiners` field must see one line with the same public key

##### Joiners

1. A given public key cannot appear twice under `Joiners` field in the same block.
2. For each public key under `Joiners`, a valid identity must exist either in the same block or a previous block.
3. A key appearing in `Joiners`field is to be considered as a **member** from this block until it appears under `Leavers` or `Excluded` fields, included.

##### Leavers

1. A given public key cannot appear twice under `Leavers` field in the same block.
2. Only **members** can have their public key under `Leavers`.

### Peer

UCP uses P2P networks to manage community & money data. Since only members can write to the Blockchain, it is important to have authenticated peers so newly validated blocks can be efficiently sent to them, without any ambiguity.

For that purpose, UCP defines a peering table containing, for a given node public key:

* a currency name
* a list of endpoints to contact the node

This link is made through a document called *Peer* whose format is:
  
    Version: VERSION
    Currency: CURRENCY_NAME
    PublicKey: NODE_PUBLICKEY
    Endpoints:
    END_POINT_1
    END_POINT_2
    END_POINT_3
    [...]

With the signature attached, this document certifies that this public key is owned by this server at given network endpoints.

The aggregation of all *Peer* documents is called the *peering table*, and allows to authentify addresses of all nodes identified by their public key.

#### Fields details

Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Currency` | contains the name of the currency.
`PublicKey` | the node's public key.
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
    PublicKey: HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    Endpoints:
    BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001
    BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002
    OTHER_PROTOCOL 88.77.66.55 9001

### Status

Such a document informs a node on current node's status, either connected, up, or disconnected.

    Version: VERSION
    Currency: CURRENCY_NAME
    Status: NEW|NEW_BACK|UP|UP_BACK|DOWN
    Time: TIMESTAMP
    From: SENDER
    To: RECIPIENT


Field      | Description
-----      | -----------
`Version`  | denotes the current structure version.
`Currency` | contains the name of the currency.
`Status`   | Status type to be sent.
`Time`     | Current node's timestamp
`From`     | Issuer's public key for this message.
`To`       | Recipient's public key for this message.

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
dtDateMin   | Number of seconds that can be added to current date
incDateMin  | Minimum number of confirmations to increment the current date.

### Computed variables

Variable  | Meaning
--------- | ----
members   | Synonym of `members(t = now)`, `wot(t)`, `community(t)`, `keychain(t)` targeting the keys whose last status is `+` in the keychain.

## Processing

### Peer

Peer document is to be considered *neutral*, i.e. it does not have specific rules of interpretation. If a P2P node receives such document, it is free on how to handle it.

### Block
A Block can be accepted only if it respects a set of rules, here divided in 2 parts : *local* and *global*.

#### Local validation

Local validation verifies the coherence of a well-formatted block, withtout any other context than the block itself.

##### Nonce

* `Nonce` value may be any zero or positive integer. This field is a special field allowing for document hash to change for proof-of-work computation.

##### PreviousHash

* `PreviousHash` must be present if `Number` field is over `0` value.
* `PreviousHash` must not be present if `Number` field equals `0` value.

##### PreviousIssuer

* `PreviousIssuer` must be present if `Number` field is over `0` value.
* `PreviousIssuer` must not be present if `Number` field equals `0` value.

##### Signature

* A block must have a valid signature over the block's content, where associated public key is block's `Issuer` field.

##### Dates

* A block must have its `Date` field must be equal either to `ConfirmedDate` or `ConfirmedDate` + `dtDateMin`.

##### Identities

* A block cannot contain identities whose signature does not match identity's content
* A block cannot have two or more identities sharing a same `USER_ID`.
* A block cannot have two or more identities sharing a same `PUBLIC_KEY`.
* Each identity of a block must match a `Joiner` line matching same `PUBLIC_KEY`, `USER_ID` and `CERTTS`.

##### Memberships (Joiners, Leavers)

* A block cannot contain memberships whose signature does not match membership's content, where associated public key is membership's `PUBLIC_KEY` field.

##### Members changes (Joiners, Leavers, Excluded)

* A block cannot contain more than 1 occurrence of a same `PUBLIC_KEY` in `Joiners`, `Leavers` and `Excluded` field as a whole. In other words, a given `PUBLIC_KEY` present in `Joiners` cannot be present in `Joiners` a second time, neither be present one time in `Leavers` or `Excluded`.

##### Certifications

* A block cannot have two identical certifications (same `PUBKEY_FROM` and same `PUBKEY_TO` for the two certifications)
* A block cannot have certifications for public keys present in either `Excluded` or `Leavers` fields.

##### Transactions

* A transaction cannot have 2 identical sources (INDEX + SOURCE + NUMBER + FINGERPRINT)
* A transaction cannot have 2 identical recipients (PUBLIC_KEY)
* A transaction **must** have its output sum equal to its input sum
* A transaction **must** have signatures matching its content for each issuer

###### About signatures

* Signature count must be the same as issuers count
* Signatures are ordered by issuer
* Signature is made over the transaction's content, signatures excepted

#### Global

Global validation verifies the coherence of a locally-validated block, in the context of the whole blockchain, including the block.

##### Definitions

###### Current time

Current time is the one provided by the block being currently used, and provided by `ConfirmedDate` field. For a new block, it is the new block's time provided by `ConfirmedDate`. For a previous block in the blockchain, it is the previous block's time.

###### Certification validity
A certification is to be considered valid if its age in the blockchain (date of the block adding it) is less or equal to `[sigValidity]` compared to another block.

###### Member

A member is a `PUBLIC_KEY` matching a valid `Identity` plus `IN` membership in the blockchain, and satisfying *WoT constraints* for a given block.

###### WoT constraint

WoT constraints is a set of rules toward a `PUBLIC_KEY`'s certifications:

* The minimum number of certifications coming *to* `PUBLIC_KEY` must be `[sigQtyTo]`
* This rule does not apply for block#0

* For each WoT member: it has to exist a path, using certifications, leading to the key `PUBLIC_KEY` with a maximum count of `[stepMax]` steps. Thus, such a path uses maximum `[stepMax]` certifications to link a member to `PUBLIC_KEY`.

##### Number

* A block's `Number` must be exactly equal to previous block + 1.
* If blockchain is empty, `Number` must be `0` .

##### PreviousHash

* A block's `PreviousHash` must be exactly equal to previous block's computed hash (a.k.a Proof-of-Work). Note that this hash **must** start with ` powZeroMin` zeros.

##### PreviousIssuer

* A block's `PreviousIssuer` must be exactly equal to previous block's `Issuer` field.

##### Dates

* A block's `Date` must always be greater or equal to previous block's `ConfirmedDate`
* A block's `ConfirmedDate` must be equal to *last block* `ConfirmedDate` field (in time value), unless it is a confirming block.
* A confirming block (i.e., whose `Date` field is the `incDateMin`<sup>th</sup> consecutive block with same `Date` field) must have its `ConfirmedDate` equal to `Date`.
* Root block's `Date` & `ConfirmedDate` must be equal.

##### Identity

* The blockchain cannot contain two or more identities sharing a same `USER_ID`.
* The blockchain cannot contain two or more identities sharing a same `PUBLIC_KEY`.

##### Joiners

* A given `PUBLIC_KEY` cannot be in `Joiners` if its last occurrence is in `Joiners`.
* `PUBLIC_KEY`, `USER_ID` and `CERTTS` must match for exatly one identity of the blockchain.
* A joining key must be recognized by the WoT (WoT recognition rule).

##### Leavers

* A given `PUBLIC_KEY` cannot be in `Leavers` if its last occurrence is either in `Leavers` or `Excluded`, or has no last occurrence.
* `PUBLIC_KEY`, `USER_ID` and `CERTTS` must match for exatly one identity of the blockchain.

##### Excluded

* A given `PUBLIC_KEY` cannot be in `Excluded` if its last occurrence is either in `Leavers` or `Excluded`, or has no last occurrence.
* Each `PUBLIC_KEY` which was a member before previous block was applied and became non-member after it was applied **must** be present in the `Excluded` field. These keys are to be considered as non-members for this block.

##### Certifications

* A certification's `PUBKEY_FROM` and `PUBKEY_TO` must be members of the WoT (this block excluded).
* A certification's signature must be valid over `PUBKEY_TO`'s self-certification, where signatory is `PUBKEY_FROM`.
* A same certification (same `PUBKEY_FROM` and same `PUBKEY_TO`) cannot be made twice in interval [`lastCertificationBlockTime`, `lastCertificationBlockTime` + `sigDelay`[.

##### MembersCount

`MembersCount` field must match the number of members in the community with this block `Joiners`, `Leavers` and `Excluded` applied.

##### Block fingerprint
To be valid, a block fingerprint (whole document + signature) must start with a specific number of zeros. Rules is the following, and **relative to a each particular member**:

    NB_ZEROS = MAX [ powZeroMin ; lastBlockNbZeros + interBlocksCount - followingBlocksCount ]

Where:

* `[lastBlockNbZeros]` is the number of leading zeros of last written block of the member
* `[interBlocksCount]` is the number of blocks written by *other* members **between** the 2 last blocks of the member (so, those 2 blocks excluded)
* `[followingBlocksCount]` is the number of blocks written by *other* members **since** the last block of the member (so, this block excluded)


* If no block has been written by the member:
  * `[lastBlockNbZeros] = 0`
  * `[followingBlocksCount] = 0`
* If member has written less than 2 blocks:
  * `[interBlocksCount] = 0` 

> Those 2 rules (penality and waited periods) ensures a shared control of the blockchain writing.

##### Universal Dividend

* Root block do not have `UniversalDividend` field.
* Universal Dividend must be present if previous block changed `ConfirmedDate`'s value and that `ConfirmedDate` value is greater or equal to `lastUDTime` + `dt`.
* `lastUDTime` is the `ConfirmedDate` of the last block with `UniversalDividend` in it
* Initial value of `lastUDTime` equals to the root block's `ConfirmedDate`.
* Value of `UniversalDividend` equals to:

```
UD(t+1) = CEIL(MAX(UD(t) ; c * M(t) / N(t+1) ))
```

Where:

* `t` is the number of times `UniversalDividend` field appeared in the blockchain (this block excluded)
* `c` equals to `c` parameter of this protocol
* `UD(t)` equals to `UniversalDividend` of the `t`<sup>th</sup> block with `UniversalDividend`
* `N(t)` equals to `MembersCount` of the `t`<sup>th</sup> block with `UniversalDividend`
* `M(t)` equals to the sum of all `UD(t)*N(t)` of the blockchain
* `UD(0)` equals to `ud0` parameter of this protocol
* `M(0) = 0`
* `N(0) = 0`
* `N(t+1)` equals to this block's `MembersCount` field

##### Transactions

* It cannot exist 2 transactions with an identical source (where `INDEX` is replaced by the correct `PUBLIC_KEY`)
* For `D` sources, public key must be a member of the WoT for the block `#NUMBER`
* For `T` sources, public key must be a recipient of the source transaction

###### Amounts

* For each UD source, the amount must match the exact targeted UD value
* For each Transaction source, the amount must match the exact Output value

### Status
The network needs to be able to discover new peers inside it and eventually know their state to efficiently send data to them. For that purpose [Status](./#status) messages are used to introduce nodes to each other and keep a bilateral state of the connection.

Protocol is the following: for a given node receiving `Receives` message, it should answer `Answers` status type and apply `Impacts` rules.

Receives   | Answers    | Impacts
--------   | -------    | --------
`ASK`      |            | Answer the estimated status of the node toward asking node. Answer can be any status other than `ASK`.
`NEW`      | `NEW_BACK` | Consider the emitter as able to receive data. Send `NEW_BACK` as a response.
`NEW_BACK` |            | Consider the emitter as able to receive data.
`UP`       | `UP_BACK`  | Consider the emitter as able to receive data.
`UP_BACK`  |            | Consider the emitter as able to receive data.
`DOWN`     |            | Consider the emitter as *no more* able to receive data.

#### Events

UCP suggests the above `Receives` events to be sent according to the following rules:

Status     | Event
--------   | --------
`ASK`      | Should be sent regularly to peers not sending `NEW`, `UP` or `DOWN` status by themselves.
`NEW`      | Should be sent on the discovering of new nodes.
`UP`       | Should be sent on startup to nodes which were already sent `NEW`.
`DOWN`     | May be sent on node's shutdown

#### Time offset

As each peer receives Status messages from other peers, it is able to compare `Time` field to local machine time.

### Transactions

#### Local coherence

* A transaction must be signed by all of its `Issuers`
  * Signatures are to be associated to each `Issuers` according to their apparition order
* A transaction must have at least 1 issuer
* A transaction must have at least 1 source
* A transaction must have at least 1 recipient
* A transaction must have at least 1 signature
* A transaction must exactly same number of signatures and issuers
* A transaction's indexes' (`Inputs` field) value must be less or equal to `Issuers` line count
* A transaction must have its issuers appear at least once in `Inputs` field, where an issuer is linked to `INDEX` by its position in `Issuers` field. First issuer is `INDEX = 0`.
* A transaction's `Inputs` amount sum must be equal to `Ouputs` amount sum.
* A transaction cannot have two identical `Inputs`
* A transaction cannot have a same pubkey twice in `Outputs`

## Implementations

### APIs
## Heading ##
UCP does not imposes a particular API to deal with UCP data. Instead, UCP prefers to allow for any API definition using [Peer](#peer) document, and then leting peers deal themselves with the API(s) they prefer.

At this stage, only [uCoin HTTP API](/HTTP_API.md) (named BASIC_MERKLED_API) is known as a valid UCP API.

## References

* [Relative Money Theory](http://fr.wikipedia.org/wiki/Th%C3%A9orie_relative_de_la_monnaie), the theoretical reference behind Universal Dividend
* [OpenUDC](www.openudc.org), the inspiration project of uCoin
* [Bitcoin](https://github.com/bitcoin/bitcoin), the well known crypto-currency system