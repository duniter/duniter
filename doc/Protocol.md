# UCP - uCoin Protocol

> This document is still regularly updated (as of September 2014)

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
Community | A groupment of individuals linked together trought a Monetary Contract.
Monetary Contract | A document gathering the informations defining the community members, voters and monetary mass inside it.

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

UCP relies on [udid2](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_Authentication_Mechanisms.draft.txt#L164) identity string, which looks like this:

    udid2;c;TOCQUEVILLE;FRANCOIS-XAVIER-ROBE;1989-07-14;e+48.84+002.30;0;
    
In this document *identifier* will be the word refering to this identity string.

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

    UID:udid2;c;TOCQUEVILLE;FRANCOIS-XAVIER-ROBE;1989-07-14;e+48.84+002.30;0;
    
A complete self-certification:

    UID:udid2;c;TOCQUEVILLE;FRANCOIS-XAVIER-ROBE;1989-07-14;e+48.84+002.30;0;
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

    UID:udid2;c;TOCQUEVILLE;FRANCOIS-XAVIER-ROBE;1989-07-14;e+48.84+002.30;0;
    META:TS:1409990782
    J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
    
A valid certification could be:

    SoKwoa8PFfCDJWZ6dNCv7XstezHcc2BbKiJgVDXv82R5zYR83nis9dShLgWJ5w48noVUHimdngzYQneNYSMV3rk
    
Over the following data:

    UID:udid2;c;TOCQUEVILLE;FRANCOIS-XAVIER-ROBE;1989-07-14;e+48.84+002.30;0;
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

#### Validity

A [Membership](#membership) is to be considered valid if:

* `Issuer` matches signature
* `Membership` matches either `IN` or `OUT` value
* `Date` is a valid timestamp
* `Currency` is a valid currency name
* `Version` equals `1`



### Transaction

#### Definition

Transaction is the support of money: it allows to materialize coins' ownership. It is defined by the following format:

    Version: VERSION
    Currency: CURRENCY_NAME
    Issuers:
    PUBLIC_KEY:INDEX
    ...
    Inputs:
    INDEX:SOURCE:FINGERPRINT
    ...
    Outputs:
    PUBLIC_KEY:AMOUNT
    ...

Here is a description of each field:

Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Currency` | contains the name of the currency. This is used to identify the target of the transaction, as several moneys may be UCP-based.
`Issuers` | a list of public key, followed by a sequential integer
`Inputs` | a list linking `Issuers` (via INDEX) to coin sources
`Outpus` | a list of public keys and amounts allowed to them

#### Validity

A Transaction structure is considered *valid* if:

* Field `Currency` is not empty.
* Field `Issuers` is a multiline field whose lines are Base58 strings of 44 characters.
* Field `Inputs` is a multiline field whose lines starts with an integer, followed by a colon, a source character (either `T`, `D`, `F`), a colon and a SHA-1 hash
* Field `Outputs` is a multiline field whose lines starts by a Base58 string, followed by a colon and an integer value
* Signatures of `Issuers` are provided and **ALL** verify this structure

#### Example 1

Key `HsLShA` sending 30 coins to key `BYfWYF` using 1 source transaction (its value is not known but could be 30).

    Version: 1
    Currency: beta_brousouf
    Issuers:
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    Inputs:
    0:T:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8
    Outputs:
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30
    
Signatures (fake here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r

#### Example 2

Key `HsLShA` sending 30 coins to key `BYfWYF` using 2 sources transaction + 1 UD + 1 fee (their respective value are not known but the supposed sum could be 30).

    Version: 1
    Currency: beta_brousouf
    Issuers:
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    Inputs:
    0:T:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8
    0:T:F80993776FB55154A60B3E58910C942A347964AD
    0:D:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B
    0:F:2B53C3BE2DEA6A74C41DC6A44EEAB8BD4DC47097
    Outputs:
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30
    
Signatures (fake here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r

#### Example 3

Key `HsLShA`,  `CYYjHs` and `9WYHTa` sending 235 coins to key `BYfWYF` using 4 sources transaction + 2 UD + 1 fee (their respective value are not known but the supposed sum could be 220 for example, so this transaction also carries a fee).

    Version: 1
    Currency: beta_brousouf
    Issuers:
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp
    9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB
    Inputs:
    0:T:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8
    0:T:F80993776FB55154A60B3E58910C942A347964AD
    0:D:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B
    0:F:2B53C3BE2DEA6A74C41DC6A44EEAB8BD4DC47097
    1:T:F80993776FB55154A60B3E58910C942A347964AD
    2:T:0651DE13A80EB0515A5D9F29E25D5D777152DE91
    2:D:20DA3C59D27EABACFFD27626EF74EA56579C58D4
    Outputs:
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30
    DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx:156
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
    INDEX:SOURCE:FINGERPRINT
    ...
    PUBLIC_KEY:AMOUNT
    ...
    SIGNATURE
    ...

Here is an example compacting above [example 3](#example-3):

    TX:1:3:7:3
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp
    9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB
    0:T:D717FEC1993554F8EAE4CEA88DE5FBB6887CFAE8
    0:T:F80993776FB55154A60B3E58910C942A347964AD
    0:D:F4A47E39BC2A20EE69DCD5CAB0A9EB3C92FD8F7B
    0:F:2B53C3BE2DEA6A74C41DC6A44EEAB8BD4DC47097
    1:T:F80993776FB55154A60B3E58910C942A347964AD
    2:T:0651DE13A80EB0515A5D9F29E25D5D777152DE91
    2:D:20DA3C59D27EABACFFD27626EF74EA56579C58D4
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30
    DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx:156
    6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i:4942yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r
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
    Timestamp: GENERATED_ON
    UniversalDividend: DIVIDEND_AMOUNT
    Fees: FEES_AMOUNT
    Issuer: ISSUER_KEY
    PreviousHash: PREVIOUS_HASH
    PreviousIssuer: PREVIOUS_ISSUER_KEY
    MembersCount: WOT_MEM_COUNT
    Identities:
    PUBLIC_KEY:SIGNATURE:TIMESTAMP:UDID2
    ...
    Joiners:
    PUBLIC_KEY:SIGNATURE:TIMESTAMP
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
--------------------- | ------------------------------------------------- | 
Version               | The document version                              | Always
Type                  | The document type                                 | Always
Currency              | The currency name                                 | Always
Nonce                 | A arbitrary nonce value                           | Always
Number                | The keyblock number                               | Always
Timestamp             | Timestamp of generation                           | Always
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
* `Version`, `Nonce`, `Number`, `MembersCount`, `UniversalDividend` and `Fees` are integer values
* `Currency` can be any String of alphanumeric characters, space, `-` or `_`
* `PreviousHash` is an uppercased SHA-1 hash
* `Issuer` and `PreviousIssuer` are [Public keys](#publickey)
* `Identities` is a multiline field composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
  * `SIGNATURE` : a [Signature](#signature)
  * `UDID2` : an [udid2](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_Authentication_Mechanisms.draft.txt#L164) string
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
powPeriod   | Number of written blocks to wait to lower the PoW difficulty by 1. Value is either a `[1;+infinity[` integer or a `]0;1[` decimal value.

### Computed variables

Variable  | Meaning
--------- | ----
members   | Synonym of `members(t = now)`, `wot(t)`, `community(t)`, `keychain(t)` targeting the keys whose last status is `+` in the keychain.

## Processing

### Peer

Peer document is to be considered *neutral*, i.e. it does not have specific rules of interpretation. If a P2P node receives such document, it is free on how to handle it.

### Block
A Block can be accepted only if it respects the following rules.

#### Certifications

* Only members' certifications can be added in a block
* A same certification (same key being signed by another key twice or more) cannot happen twice in a `[sigDelay]` duration interval

#### Valid membership
A membership is to be considered valid if it matches the following rules:

* The membership must be [well formated](#membership)
* The membership must be signed by its issuer
* First membership MUST contain a `UserID` field with an UDID2 in it
* First membership MUST be `IN` type
* First membership `UserID` MUST be the same as the one in `Identities` for `Issuer`
* Following memberships of a given key MUST NOT have an `UserID` field.

#### Certification validity
A signature (certification)  is considered valid if its age is less or equal to `[sigValidity]` months.

#### Certification requirements
A public key can join/stay in the community only if its [certifications](#certifications) match the following rules:

* The number of valid certifications must be at least `[sigQty]`
* The maximum step between the key and the whole WoT (each member) must be `[stepMax]`

#### Members

`MembersCount` field must match the number of members in the community with this block applied

#### Block fingerprint
To be valid, a block fingerprint (whole document + signature) must start with a specific number of zeros. Rules is the following, and **relative to a each particular member**:

    NB_ZEROS = MAX [ powZeroMin ; powZeroMin + lastBlockPenality - FLOOR(nbWaitedPeriods) ]

Where:

* `[lastBlockPenality]` is the number of leading zeros of last written block of the member, minus `[powZeroMin]`. If no block has been written by the member, `[lastBlockPenality] = 0`.
* `[nbWaitedPeriods]` is the number of blocks written by any member since last written block of the member, divided by `[powPeriodComputed]`.
    * Note: number of validated blocks is `current` and  `newblock` **excluded**
    * `[powPeriodComputed] = [powPeriod]` if `[powPeriod]`'s value is between `[1;+inf[`
    * `[powPeriodComputed] = FLOOR([powPeriod] * N)` if `[powPeriod]`'s value is between `]0;1[`
    * `N` if the number of members *before* new block, so that `[powPeriodComputed]` can be computed *for new block*
    * If `[powPeriodComputed]` equals `0`, then `[nbWaitedPeriods]` directly equals `1`.

> Those 2 rules (penality and waited periods) ensures a shared control of the keychain writing.

#### Block timestamp
A node SHOULD NOT accept a new block if `Timestamp` field does not match the `network-adjusted-time`, more or less a `30 seconds` interval.

`network-adjusted-time` is defined as the median of all connected member peers' time, including self-peer. If the median timestamp is a real, it is rounded to integer.

#### Transactions

A transaction is to be considered valid according to the following rules.

##### Inputs

As a general rule, any input from a transaction *MUST drain all the money from its source*. Sources are:

* Universal Dividend (1 per member & per block)
* Fees (1 per block)
* Transactions' outputs (1 per output)

This involves 3 consequences: a transaction input refering to:

* Universal Dividend must have the exact same amount as the refered block's `UniversalDividend` field.
* transaction fees must have the exact same amount as the refered block's `Fees` field.
* transaction output must have the exact same amount as the refered transaction output value.

##### Sources limits

Each money source can be pointed only once by a transaction.

##### Sources owner

For each source, an owner is *ALWAYS* defined. Only the owner may refer to it as an input for a transaction. Source owner is defined as the following:

* For each transaction output, the *owner* is defined as the output *public key*.
* For each Block's fees, the *owner* is defined as the `Issuer` of the block
* For each Block's dividend, `N` *owners* are defined as the members of WoT for this block

##### Members for a block

For a given block, members are defined as the *public keys* for which last occurrence in previous or current block is in `Joiners`.

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

## Implementations

### APIs

UCP does not imposes a particular API to deal with UCP data. Instead, UCP prefers to allow for any API definition using [Peer](#peer) document, and then leting peers deal themselves with the API(s) they prefer.

At this stage, only [uCoin HTTP API](/HTTP_API.md) (named BASIC_MERKLED_API) is known as a valid UCP API.

## References

* [Relative Money Theory](http://fr.wikipedia.org/wiki/Th%C3%A9orie_relative_de_la_monnaie), the theoretical reference behind Universal Dividend
* [OpenUDC](www.openudc.org), the inspiration project of uCoin
* [Bitcoin](https://github.com/bitcoin/bitcoin), the well known crypto-currency system