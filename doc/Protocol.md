# UCP - uCoin Protocol

> This document is still regularly updated (as of December 2014)

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
* [Variables](#variables)
  * [Protocol parameters](#protocol-parameters)
  * [Computed variables](#computed-variables)
* [Processing](#processing)
  * [Block](#block-1)
  * [Peer](#peer-1)
  * [Transaction](#transaction-1)
* [Implementations](#implementations)
* [References](#references)

## Vocabulary

Word                  | Description
--------------------- | -------------
UCP                   | Acronym for *UCoin Protocol*. A set of rules to create uCoin based currencies.
Signature             | The cryptographical act of certifying a document using a private key.
WoT                   | Acronym for *Web of Trust*. A groupment of individuals recognizing each other's identity through public keys and certification mechanisms
UD                    | Acronym for *Universal Dividend*. Means money issuance **directly** and **exclusively** by and to WoT members
realtime              | The time of real life (the habitual time).
blocktime             | The realtime recorded by a block.

## Introduction

UCP aims at defining a data format, interpretation of it and processing rules in order to build coherent free currency systems in a P2P environment. UCP is to be understood as an *abstract* protocol since it defines currency parameters and rules about them, but not their value which is implementation specific.

This document describes UCP in a bottom-up logic, so you will find first the details of the protocol (data format) to end with general protocol requirements.

## Conventions

### Documents

#### Line endings

Please note **very carefully** that every document's line **ENDS with a newline character**, *Unix-style*, that is to say `<LF>`.

This is a *very important information* as every document is subject to hashes, and Windows-style endings won't produce the expected hashes.

#### Numbering

[Block](#block) numbering starts from `0`. That is, first block is `BLOCK#0`.

#### Block identifiers

It exists 2 kinds of [Block](#block) identifiers:

##### `BLOCK_ID`

It is the number of the block. Its format is `INTEGER`, so it is a positive or zero integer.

##### `BLOCK_UID`
It is the concatenation of the `BLOCK_ID` of a block and hash. Its format is `BLOCK_ID-HASH`.

##### Examples

The block ID of the root block is `0`. Its UID *might be* `0-883228A23F8A75B342E912DF439738450AE94F5D`.
The block ID of the block#433 is `433`. Its UID *might be* `433-FB11681FC1B3E36C9B7A74F4DDE2D07EC2637957`.

> Note that it is said "might be" because the hash is not known by advance.

#### Currency name

A valid currency name is composed of alphanumeric characters, space, `-` or `_`.

#### Dates

For any document using a date field, targeted date is to be understood as **UTC+0** reference.

### Signatures

#### Format

Signatures follow [Ed55219 pattern](http://en.wikipedia.org/wiki/EdDSA), and are written under [Base64](http://en.wikipedia.org/wiki/Base64) encoding.

Here is an example of expected signature:

    H41/8OGV2W4CLKbE35kk5t1HJQsb3jEM0/QGLUf80CwJvGZf3HvVCcNtHPUFoUBKEDQO9mPK3KJkqOoxHpqHCw==

#### Line endings

No new line character exists in a signature. However, a signature may be followed by a new line character, hence denoting the end of the signature.

## Formats

This section deals with the various data formats used by UCP.

### Public key

#### Definition

A public key is to be understood as an [Ed55219](http://en.wikipedia.org/wiki/EdDSA) public key.

Its format is a [Base58](http://en.wikipedia.org/wiki/Base58) string of 43 or 44 characters, such as the following:

    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY

A public key is alway paired with a private key, which UCP will never deal with. UCP only deals with public keys and signatures.

### Certification

#### Definition

A certification is the generic act of creating a link between a *public key* and *an arbitrary identity*. In UCP, this certification is done through the signature of an identity string by a public key.

####Identity string

UCP does not rely on any particular identity format, which remains implementation free. Identity simply has to be a string avoiding usage of line endings characters.
    
In this document *identifier*, `UserID`, `USER_ID` and `uid` will be indifferently used to refer to this identity string.

#### Self certification

##### Definition

A self certification is the act, for a given public key's owner, to sign an identifier *he considers it reflects his identity*. Doing a self-certification is extacly like saying:

> « This identity refers to me ! »

##### Format

Self-certification is the signature of a special string *containing* the identifier:

    UID:IDENTIFIER
    META:TS:BLOCK_UID
    
Here, `UID` is just 'UID' string and `IDENTIFIER` has to be replaced by a valid identifier. Also, `META` and `TS` are simple strings. This whole string **is what signature is based upon**, without any carriage return.

The whole self-certification is then:

    UID:IDENTIFIER
    META:TS:BLOCK_UID
    SIGNATURE

Where:

* `META` is just 'META' string
* `TS` is just 'TS' string
* `BLOCK_UID` refers to a [block unique ID], and represents a time reference.
* `SIGNATURE` is a signature

So a self-certification is the act of saying:

> « I attest, today, that this identity refers to me. »

##### Example

A valid identity:

    UID:lolcat
    
A complete self-certification:

    UID:lolcat
    META:TS:32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
    J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci

#### Self-revocation

##### Definition

A self revocation is the act, for a given public key's owner, to revoke an identity he created for representing himself. Doing a self-revocation is extacly like saying:

> « Sorry, I made a mistake about this identity. Do not consider it. »

##### Use case

This document is not to be written in the blockchain. Its goal is only to inform that a created identity was made by mistake, or contained a mistake, and should not be considered.

For example, this document could be sent to a node to remove an identity we submitted by mistake.

##### Format

A self-revocation is just *a signature* over a complete self-certification flavoured with metadata telling this identity is to be revoked:

    UID:IDENTIFIER
    META:TS:BLOCK_UID
    SIGNATURE
    META:REVOKE
    CERTIFIER_SIGNATURE

Where:

* `CERTIFIER_SIGNATURE` is the signature of the *certifier*.

##### Example

If we have the following complete self-certification:

    UID:lolcat
    META:TS:32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
    J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
    
A valid self-revocation could be:

    SoKwoa8PFfCDJWZ6dNCv7XstezHcc2BbKiJgVDXv82R5zYR83nis9dShLgWJ5w48noVUHimdngzYQneNYSMV3rk
    
Over the following data:

    UID:lolcat
    META:TS:32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
    J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
    META:REVOKE
    
#### Certification

##### Definition

The generic word *certification*, in UCP, is to be used for describing *certification from others*, i.e. *non-self certifications*.

##### Format

A certification is just *a signature* over a complete self-certification flavoured with a signature date:

    UID:IDENTIFIER
    META:TS:BLOCK_UID
    SIGNATURE
    META:TS:BLOCK_UID
    CERTIFIER_SIGNATURE

Where:

* `BLOCK_UID` refers to a block unique ID.
* `CERTIFIER_SIGNATURE` is the signature of the *certifier*.

##### Inline format

Certification may exists under *inline format* which describes the certification under a simple line. Here is general structure:

    PUBKEY_FROM:PUBKEY_TO:BLOCK_ID:SIGNATURE

Where:

  * `PUBKEY_FROM` is the certification public key
  * `PUBKEY_TO` is the public key whose identity is being certified
  * `BLOCK_ID` is the certification time reference
  * `SIGNATURE` is the certification signature

> Note: BLOCK_HASH is not required in the inline format, since this format aims at being used in the context of a blockchain, where hash can be deduced.

##### Example

If we have the following complete self-certification:

    UID:lolcat
    META:TS:32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
    J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
    
A valid certification could be:

    SoKwoa8PFfCDJWZ6dNCv7XstezHcc2BbKiJgVDXv82R5zYR83nis9dShLgWJ5w48noVUHimdngzYQneNYSMV3rk
    
Over the following data:

    UID:lolcat
    META:TS:32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
    J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
    META:TS:84-2E76A3677D24C4A7225059A4A51364A11A6E47F7

Note here that a certification *alone* has no meaning: it is only when appended to a flavoured self-certification that this signature (the certification) makes sense.

### Membership

In UCP, a member is represented by a public key he is supposed to be the owner. To be integrated in a WoT, the newcomer owner of the key *has to express its will* to integrate the WoT.

This step is done by issuing a the following document:

```bash
Version: VERSION
Type: Membership
Currency: CURRENCY_NAME
Issuer: ISSUER
Block: BLOCK_UID
Membership: MEMBERSHIP_TYPE
UserID: USER_ID
CertTS: BLOCK_UID
```

followed by a signature of `Issuer`.

#### Fields details

Field | Description
----- | -----------
`Version` | Denotes the current structure version.
`Type` | Type of the document.
`Currency` | Contains the name of the currency.
`Issuer` | The public key of the issuer.
`Block` | Block number and hash. Value is used to target a blockchain and precise time reference for membership's time validity.
`Membership` | Membership message. Value is either `IN` or `OUT` to express wether a member wishes to opt-in or opt-out the community.
`UserID` | Identity to use for this public key
`CertTS` | Identity's block UID

#### Validity

A [Membership](#membership) is to be considered having valid format if:

* `Version` equals `1`
* `Type` equals `Membership` value.
* `Currency` is a valid currency name
* `Issuer` is a public key
* `Membership` matches either `IN` or `OUT` value
* `Block` starts with an integer value, followed by a dash and an uppercased SHA1 string
* `UserID` is a non-empty string
* `CertTS` is a valid block UID

### Transaction

#### Definition

Transaction is the support of money: it allows to materialize coins' ownership.

#### Money ownership

Money ownership **IS NOT** limited to members of the Community. Any owner (an individual or an organization) of a public key may own money: it only requires the key to match `Ouputs` of a transaction.

#### Transfering money

Obviously, coins a sender does not own CANNOT be sent by him. That is why a transaction refers to other transactions, to prove that the sender actually owns the coins he wants to send.

#### Format

A transaction is defined by the following format:

    Version: VERSION
    Type: Transaction
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
    Comment: COMMENT
    SIGNATURES
    ...

Here is a description of each field:

Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Type` | Type of the document.
`Currency` | contains the name of the currency. This is used to identify the target of the transaction, as several moneys may be UCP-based.
`Issuers` | a list of public key, followed by a sequential integer
`Inputs` | a list linking `Issuers` (via INDEX) to coin sources
`Outputs` | a list of public keys and amounts allowed to them
`Comment` | a comment to write on the transaction

#### Validity

A Transaction structure is considered *valid* if:

* Field `Version` equals `1`.
* Field `Type` equals `Transaction`.
* Field `Currency` is not empty.
* Field `Issuers` is a multiline field whose lines are public keys.
* Field `Inputs` is a multiline field whose lines starts with an integer, followed by a colon, a source character (either `T`, `D`), a colon, an integer, a colon, a SHA-1 hash and an integer value
* Field `Outputs` is a multiline field whose lines starts by a Base58 string, followed by a colon and an integer value
* Field `Comment` is a string of maximum 255 characters, exclusively composed of alphanumeric characters, space, `-`, `_`, `:`, `/`, `;`, `*`, `[`, `]`, `(`, `)`, `?`, `!`, `^`, `+`, `=`, `@`, `&`, `~`, `#`, `{`, `}`, `|`, `\`, `<`, `>`, `%`, `.`. Must be present even if empty.

#### Example 1

Key `HsLShA` sending 30 coins to key `BYfWYF` using 1 source transaction (its value is not known but could be 30) written in block #3.

    Version: 1
    Type: Transaction
    Currency: beta_brousouf
    Issuers:
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    Inputs:
    0:T:3:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:30
    Outputs:
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:25
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:5
    Comment: First transaction
    
Signatures (fake here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r

#### Example 2

Key `HsLShA` sending 30 coins to key `BYfWYF` using 2 sources transaction written in blocks #65 and #77 + 1 UD from block #88.

    Version: 1
    Type: Transaction
    Currency: beta_brousouf
    Issuers:
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    Inputs:
    0:T:65:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:4
    0:T:77:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:15
    0:D:88:4745EEBA84D4E3C2BDAE4768D4E0F5A671531EE1B0B9F5206744B4551C664FDF:11
    Outputs:
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30
    Comment: 
    
Signatures (fake here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r

#### Example 3

Key `HsLShA`,  `CYYjHs` and `9WYHTa` sending 235 coins to key `BYfWYF` using 4 sources transaction (written in blocks #4, #78, #66 and #176) + 2 UD from same block #46.

    Version: 1
    Type: Transaction
    Currency: beta_brousouf
    Issuers:
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp
    9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB
    Inputs:
    0:T:4:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:22
    0:T:78:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:8
    0:D:46:4745EEBA84D4E3C2BDAE4768D4E0F5A671531EE1B0B9F5206744B4551C664FDF:40
    1:T:66:A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956:200
    2:T:176:67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B:5
    2:D:46:4745EEBA84D4E3C2BDAE4768D4E0F5A671531EE1B0B9F5206744B4551C664FDF:40
    Outputs:
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:120
    DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx:146
    6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i:49
    Comment: -----@@@----- (why not this comment?)
    
Signatures (fakes here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r
    2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX
    2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk

#### Compact format

A transaction may be described under a more compact format, to be used under [Block](#block) document. General format is:

    TX:VERSION:NB_ISSUERS:NB_INPUTS:NB_OUTPUTS:HAS_COMMENT
    PUBLIC_KEY
    ...
    INDEX:SOURCE:NUMBER:FINGERPRINT:AMOUNT
    ...
    PUBLIC_KEY:AMOUNT
    ...
    COMMENT
    SIGNATURE
    ...

Here is an example compacting above [example 2](#example-2):

    TX:1:1:3:1:0
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    0:T:65:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:4
    0:T:77:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:15
    0:D:88:4745EEBA84D4E3C2BDAE4768D4E0F5A671531EE1B0B9F5206744B4551C664FDF:11
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:30
    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r

Here is an example compacting above [example 3](#example-3):

    TX:1:3:6:3:1
    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp
    9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB
    0:T:4:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:22
    0:T:78:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:8
    0:D:46:4745EEBA84D4E3C2BDAE4768D4E0F5A671531EE1B0B9F5206744B4551C664FDF:40
    1:T:66:A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956:200
    2:T:176:67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B:5
    2:D:46:4745EEBA84D4E3C2BDAE4768D4E0F5A671531EE1B0B9F5206744B4551C664FDF:40
    BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g:120
    DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx:146
    6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i:49
    -----@@@----- (why not this comment?)
    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r
    2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX
    2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk

### Block

A Block is a document gathering both:

  * [Public key](#publickey) data in order to build a Web Of Trust (WoT) representation
  * [Transaction](#transaction) data to identify money units & ownership

but also other informations like:

* time reference (calendar time)
* UD value for money issuance

#### Structure

    Version: VERSION
    Type: Block
    Currency: CURRENCY
    Nonce: NONCE
    Number: BLOCK_ID
    PoWMin: NUMBER_OF_ZEROS
    Time: GENERATED_ON
    MedianTime: MEDIAN_DATE
    UniversalDividend: DIVIDEND_AMOUNT
    Issuer: ISSUER_KEY
    PreviousHash: PREVIOUS_HASH
    PreviousIssuer: PREVIOUS_ISSUER_KEY
    Parameters: PARAMETERS
    MembersCount: WOT_MEM_COUNT
    Identities:
    PUBLIC_KEY:SIGNATURE:I_BLOCK_UID:USER_ID
    ...
    Joiners:
    PUBLIC_KEY:SIGNATURE:NUMBER:HASH:I_BLOCK_UID:USER_ID
    ...
    Actives:
    PUBLIC_KEY:SIGNATURE:NUMBER:HASH:I_BLOCK_UID:USER_ID
    ...
    Leavers:
    PUBLIC_KEY:SIGNATURE:NUMBER:HASH:I_BLOCK_UID:USER_ID
    ...
    Excluded:
    PUBLIC_KEY
    ...
    Certifications:
    PUBKEY_FROM:PUBKEY_TO:BLOCK_ID:SIGNATURE
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
Nonce                 | An arbitrary nonce value                          | Always
Number                | The block number                                  | Always
PoWMin                | The current minimum PoW difficulty                | Always
Time                  | Time of generation                                | Always
MedianTime            | Median date                                       | Always
UniversalDividend     | Universal Dividend amount                         | **Optional**
Issuer                | This block's issuer's public key                  | Always
PreviousHash          | Previous block fingerprint (SHA-1)                | from Block#1
PreviousIssuer        | Previous block issuer's public key                | from Block#1
Parameters            | Currency parameters.                              | **Block#0 only**
MembersCount          | Number of members in the WoT, this block included | Always
Identities            | New identities in the WoT                         | Always
Joiners               | `IN` memberships                                  | Always
Actives               | `IN` memberships                                  | Always
Leavers               | `OUT` memberships                                 | Always
Excluded              | Exluded members' public key                       | Always
Transactions          | A liste of compact transactions                   | Always

#### Coherence
To be a valid, a block must match the following rules:

##### Format
* `Version`, `Nonce`, `Number`, `PoWMin`, `Time`, `MedianTime`, `MembersCount` and `UniversalDividend` are integer values
* `Currency` is a valid currency name
* `PreviousHash` is an uppercased SHA-1 hash
* `Issuer` and `PreviousIssuer` are [Public keys](#publickey)
* `Identities` is a multiline field composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
  * `SIGNATURE` : a [Signature](#signature)
  * `BLOCK_UID` : a block UID
  * `USER_ID` : an identifier
* `Joiners`, `Actives` and `Leavers` are multiline fields composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
  * `SIGNATURE` : a [Signature](#signature)
  * `NUMBER` : an integer
  * `HASH` : an uppercased SHA1 string
  * `I_BLOCK_UID` : a block UID
  * `USER_ID` : an identifier
* `Excluded` is a multiline field composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
* `Certifications` is a multiline field composed for each line of:
  * `PUBKEY_FROM` : a [Public key](#publickey) doing the certification
  * `PUBKEY_TO` : a [Public key](#publickey) being certified
  * `BLOCK_ID` : a positive integer
  * `SIGNATURE` : a [Signature](#signature) of the certification
* `Transactions` is a multiline field composed of [compact transactions](#compact-format)
* `Parameters` is a simple line field, composed of 1 float, 12 integers and 1 last float all separated by a colon `:`, and representing [currency parameters](#protocol-parameters) (a.k.a Protocol parameters, but valued for a given currency) :

        c:dt:ud0:sigDelay:sigPeriod:sigStock:sigValidity:sigQty:xpercent:msValidity:stepMax:medianTimeBlocks:avgGenTime:dtDiffEval:blocksRot:percentRot

The document must be ended with a `BOTTOM_SIGNATURE` [Signature](#signature).

##### Data
* `Version` equals `1`
* `Type` equals `Block`

### Peer

UCP uses P2P networks to manage community & money data. Since only members can write to the Blockchain, it is important to have authenticated peers so newly validated blocks can be efficiently sent to them, without any ambiguity.

For that purpose, UCP defines a peering table containing, for a given node public key:

* a currency name
* a list of endpoints to contact the node

This link is made through a document called *Peer* whose format is described below.

#### Structure
  
    Version: VERSION
    Type: Peer
    Currency: CURRENCY_NAME
    PublicKey: NODE_PUBLICKEY
    Block: BLOCK
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
`Type`  | The document type.
`Currency` | contains the name of the currency.
`PublicKey` | the node's public key.
`Block` | Block number and hash. Value is used to target a blockchain and precise time reference.
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

#### Coherence
To be a valid, a peer document must match the following rules:

##### Format
* `Version` equals `1`
* `Type` equals `Peer`
* `Currency` is a valid currency name
* `PublicKey` is a [Public key](#publickey)
* `Endpoints` is a multiline field

The document must be ended with a `BOTTOM_SIGNATURE` [Signature](#signature).

#### Example

    Version: 1
    Type: Peer
    Currency: beta_brousouf
    PublicKey: HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
    Block: 8-1922C324ABC4AF7EF7656734A31F5197888DDD52
    Endpoints:
    BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001
    BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002
    OTHER_PROTOCOL 88.77.66.55 9001

## Variables

### Protocol parameters

Parameter   | Goal
----------- | ----
c           | The %growth of the UD every `[dt]` period
dt          | Time period between two UD
ud0         | UD(0), i.e. initial Universal Dividend
sigDelay    | Minimum delay between 2 identical certifications (same pubkeys). Must be superior to `sigValidity`.
sigPeriod   | Minimum delay between 2 certifications of a same issuer, in seconds. Must be positive or zero.
sigStock    | Maximum quantity of active certifications made by member.
sigValidity | Maximum age of a active signature (in seconds)
sigQty      | Minimum quantity of signatures to be part of the WoT
xpercent    | Minimum percent of sentries to reach to match the distance rule
msValidity  | Maximum age of an active membership (in seconds)
stepMax     | Maximum distance between each WoT member and a newcomer
medianTimeBlocks | Number of blocks used for calculating median time.
avgGenTime  | The average time for writing 1 block (wished time)
dtDiffEval  | The number of blocks required to evaluate again `PoWMin` value
blocksRot   | The number of previous blocks to check for personalized difficulty
percentRot  | The percent of previous issuers to reach for personalized difficulty

### Computed variables

Variable  | Meaning
--------- | ----
members   | Synonym of `members(t = now)`, `wot(t)`, `community(t)` targeting the keys whose last active (non-expired) membership is either in `Joiners` or `Actives`.
maxGenTime  | `= CEIL(avgGenTime * √2)`
minGenTime  | `= FLOOR(avgGenTime / √2)`
maxAcceleration | `= maxGenTime * (CEIL((medianTimeBlocks + 1) / 2) + 1)`
dSen | `= 1.2 x CEIL(EXP(LN(membersCount)/stepMax))`
sentries | Members with at least `dSen` active links *from* them

## Processing

### Block
A Block can be accepted only if it respects a set of rules, here divided in 2 parts : *local* and *global*.

#### Local validation

Local validation verifies the coherence of a well-formatted block, withtout any other context than the block itself.

##### Nonce

* `Nonce` value may be any zero or positive integer. This field is a special field allowing for document hash to change for proof-of-work computation.

##### Block fingerprint
To be valid, a block fingerprint (whole document + signature) must start with a specific number of zeros. Locally, this hash must start with at least `PoWMin` zeros.

##### PreviousHash

* `PreviousHash` must be present if `Number` field is over `0` value.
* `PreviousHash` must not be present if `Number` field equals `0` value.

##### PreviousIssuer

* `PreviousIssuer` must be present if `Number` field is over `0` value.
* `PreviousIssuer` must not be present if `Number` field equals `0` value.

##### Parameters

* `Parameters` must be present if `Number` field equals `0` value.
* `Parameters` must not be present if `Number` field is over `0` value.

##### Signature

* A block must have a valid signature over the block's content, where associated public key is block's `Issuer` field.

##### Dates

* A block must have its `Time` field be between [`MedianTime` ; `MedianTime` + `accelerationMax`].
* Root block's `Time` & `MedianTime` must be equal.

##### Identities

* A block cannot contain identities whose signature does not match identity's content
* A block cannot have two or more identities sharing a same `USER_ID`.
* A block cannot have two or more identities sharing a same `PUBLIC_KEY`.
* Each identity of a block must match a `Joiners` line matching same `PUBLIC_KEY`

##### Memberships (Joiners, Actives, Leavers)

* A block cannot contain memberships whose signature does not match membership's content

##### Members changes (Joiners, Actives, Leavers, Excluded)

* A block cannot contain more than 1 occurrence of a same `PUBLIC_KEY` in `Joiners`, `Actives`, `Leavers` and `Excluded` field as a whole. In other words, a given `PUBLIC_KEY` present in `Joiners` cannot be present in `Joiners` a second time, neither be present one time in `Actives`, `Leavers` or `Excluded`.

##### Certifications

* A block cannot have two certifications from a same `PUBKEY_FROM`, unless it is block#0.
* A block cannot have two identical certifications (same `PUBKEY_FROM` and same `PUBKEY_TO` for the two certifications)
* A block cannot have certifications for public keys present in either `Excluded` or `Leavers` fields.

##### Transactions

* A transaction must have at least 1 issuer, 1 source and 1 recipient
* For each issuer line, starting from line # `0`, it must exist a source with an `INDEX` value equal to this line#
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

###### Block time
Block time is a special discrete time defined by the blocks themselves, where unit is *a block*, and values are *block number + fingerprint*.

So, refering to t<sub>block</sub> = 0-2B7A158B9FD052164005ED5B491699644A846CE2 is valid only if it exists a block#0 in the blockchain whose hash equals 2B7A158B9FD052164005ED5B491699644A846CE2.

###### UD time
UD time is a special discrete time defined by the UDs written in the blockchain where unit is a *UD*.

Refering to UD(t = 1) means UD#1, and refers to the *first UD* written in the blockchain.

> UD(t = 0) means UD#0 which does not exist. However, UD#0 is a currency parameter noted **[ud0]**.

###### Calendar time
Calendar time is the one provided by the blocks under `MedianTime` field. This time is discrete and unit is second.

> *Current time* is to be understood as the last block calendar time written in the blockchain.

###### Certification time
When making a certification, `BLOCK_ID` is a reference to *block time*.

###### Membership time
When making a membership, `NUMBER` is a reference to *block time*.

###### Certification & Membership age
Age is defined as the number of seconds between the certification's or membership's *block time* and *current time*:

    AGE = current_time - block_time

###### Certification validity
A certification is to be considered *valid* if its age is less or equal to `[sigValidity]`:

    VALID   = AGE <= [sigValidity]
    EXPIRED = AGE > [sigValidity]

###### Certification activity
A certification is to be considered *active* if it is both written in the blockchain and *valid* (equivalent to not expired).

###### Certification stock
The stock of certification is defined per member and reflects the number of *active* certifications, i.e. which are not expired:

    STOCK = COUNT(active_certifications)

###### Membership validity
A membership is to be considered valid if its age is less or equal to `[msValidity]`:

    VALID   = AGE <= [msValidity]
    EXPIRED = AGE > [msValidity]

###### Membership activity
A membership is to be considered *active* if it is both written in the blockchain and *valid* (equivalent to not expired).

###### Certification replayability
A written certification is to be considered replayable if its age is greater or equal to `[sigDelay]`:

    REPLAYABLE = AGE >= [sigDelay]

###### Certification chaining
A written certification is to be considered chainable if:

* its age is greater or equal to `[sigPeriod]`:
* the number of active certifications is lower than `[sigStock]`:

    CHAINABLE = AGE >= [sigPeriod] && STOCK < [sigStock]

###### Member
A member is a `PUBLIC_KEY` matching a valid `Identity` whose last occurrence in blockchain is either `Joiners`, `Actives` or `Leavers` **and is not expired**.

A `PUBLIC_KEY` whose last occurrence in blockchain is `Leavers` or `Excluded`, or has no occurrence in the blockchain **is not** a member.

###### Revocation

A member may *revoke* its membership to the currency by sending an `OUT` membership. Public keys under `Leavers` field are to be considered *revoked*.

##### Number

* A block's `Number` must be exactly equal to previous block + 1.
* If blockchain is empty, `Number` must be `0` .

##### PoWMin

###### Définitions
* `speed = dtDiffEval / (medianTime(incomingNumber) - medianTime(incomingNumber - dtDiffEval))`
* `maxSpeed = 1/minGenTime`
* `minSpeed = 1/maxGenTime`

###### Rules

* If incoming block's `Number` is > 0 and a multiple of `dtDiffEval`, then:
  * If `speed` is greater or equal to `maxSpeed`, then `PoWMin = PoWMin + 1`
  * If `speed` is less or equal to `minSpeed`, then `PoWMin = MAX(0, PoWMin - 1)`
* Else
  * If `Number` is > 0, `PoWMin` must be equal to previous block's `PoWMin`

##### PreviousHash

* A block's `PreviousHash` must be exactly equal to previous block's computed hash (a.k.a Proof-of-Work). Note that this hash **must** start with ` powZeroMin` zeros.

##### PreviousIssuer

* A block's `PreviousIssuer` must be exactly equal to previous block's `Issuer` field.

##### Dates

* For any non-root block, `MedianTime` must be equal to the median value of `Time` field for the last `medianTimeBlocks` blocks. If the number of available blocks is an even value, the median is computed over the 2 centered values by an arithmetical median on them, ceil rounded.

##### Identity

* The blockchain cannot contain two or more identities sharing a same `USER_ID`.
* The blockchain cannot contain two or more identities sharing a same `PUBLIC_KEY`.
* Block#0's identities' `BLOCK_UID` must be the special value `0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.
* Other blocks' identities' `BLOCK_UID` field must match an existing block in the blockchain.

##### Joiners, Actives, Leavers (block fingerprint based memberships)

* A membership must not be expired.
* Block#0's memberships' `NUMBER` must be `0` and `HASH` the special value `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` (SHA1 of empty string).
* Other blocks' memberships' `NUMBER` and `HASH` field must match an existing block in the blockchain.
* Each membership's `NUMBER` must be higher than previous membership's `NUMBER` of the same issuer.

##### Joiners, Actives (Web of Trust distance constraint)

* A given `PUBLIC_KEY` cannot be in `Joiners` if it does not exist, for at least `xpercent`% of the sentries, a path using certifications (this block included) leading to the key `PUBLIC_KEY` with a maximum count of `[stepMax]` hops.

##### Joiners

* A revoked public key **cannot** be in `Joiners`
* A given `PUBLIC_KEY` can be in `Joiners` if it is not a member.
* A given `PUBLIC_KEY` cannot be in `Joiners` if it does not have `[sigQty]` active certifications coming *to* it (incoming block included)
* `PUBLIC_KEY` must match for exactly one identity of the blockchain (incoming block included).

##### Actives

* A given `PUBLIC_KEY` **can** be in `Actives` **only if** if it is a member.

##### Leavers

* A given `PUBLIC_KEY` cannot be in `Leavers` if it is not a member.

##### Excluded

* A given `PUBLIC_KEY` cannot be in `Excluded` if public key is not a member
* Each `PUBLIC_KEY` with less than `[sigQty]` active certifications or whose last membership is either in `Joiners` or `Actives` is outdated **must** be present in this field.
* Each `PUBLIC_KEY` whose last membership occurrence is either in `Joiners` or `Actives` *and* is outdated **must** be present in this field.

##### Certifications

* A certification's `PUBKEY_FROM` must be a member.
* A certification must not be expired.
* A certification's `PUBKEY_TO`'s last membership occurrence **must not** be in `Leavers`.
* A certification's `PUBKEY_TO` must be a member **or** be in incoming block's `Joiners`.
* A certification's signature must be valid over `PUBKEY_TO`'s self-certification, where signatory is `PUBKEY_FROM`.
* Replayability: a certification whose `PUBKEY_FROM` and `PUBKEY_TO` are the same than an existing certification in the blockchain can be written **only if** last certification written (incoming block excluded) is considered replayable.
* Chainability: a certification whose `PUBKEY_FROM` is the same than an existing certification in the blockchain can be written **only if** last certification written (incoming block excluded) is considered chainable.

##### MembersCount

`MembersCount` field must be equal to last block's `MembersCount` plus incoming block's `Joiners` count, minus minus this block's `Excluded` count.

##### Proof-of-Work
To be valid, a block fingerprint (whole document + signature) must start with a specific number of zeros. Rules is the following, and **relative to a each particular member**:

    NB_ZEROS = MAX [ PoWMin ; PoWMin * FLOOR (percentRot * (1 + nbPreviousIssuers )/ (1 + nbBlocksSince)) ]

Where:

* `[PoWMin]` is the `PoWMin` value of incoming block
* `[percentRot]` is the protocol parameter
* `[nbPreviousIssuers]` is the number of different block issuers in `blockRot` blocks **before** the last block of the member, **excepted the member**.
* `[nbBlocksSince]` is the number of blocks written **since** the last block of the member (so, incoming block excluded).


* If no block has been written by the member:
  * `[nbPreviousIssuers] = 0`
  * `[nbBlocksSince] = 0`

> Those rules of difficulty adaptation ensures a shared control of the blockchain writing.

##### Universal Dividend

* Root block do not have `UniversalDividend` field.
* Universal Dividend must be present if `MedianTime` value is greater or equal to `lastUDTime` + `dt` **AND** `N(t+1)` is > 0.
* `lastUDTime` is the `MedianTime` of the last block with `UniversalDividend` in it.
* Initial value of `lastUDTime` equals to the root block's `MedianTime`.
* Value of `UniversalDividend` (`UD(t+1)`) equals to:

```
UD(t+1) = CEIL(MAX(UD(t) ; c * M(t) / N(t+1) ))
```

Where:

* `t` is UD time
* `UD(t)` is last UD value
* `c` equals to `[c]` parameter of this protocol
* `N(t+1)` equals to `MembersCount` of the current block (last written block)
* `M(t)` equals to the sum of all `UD(t)*N(t)` of the blockchain (from t = 0, to t = now) where:
  * `N(t)` is the `MembersCount` for `UD(t)`
  * `UD(0)` equals to `[ud0]` parameter of this protocol
  * `N(0) = 0`

##### Transactions

* It cannot exist 2 transactions with an identical source (where `INDEX` is replaced by the correct `PUBLIC_KEY`)
* For `D` sources, public key must be a member for the block `#NUMBER` (so, *before* the block's memberships were applied)
* For `T` sources, public key must be a recipient of the source transaction, written in the block targeted by the source

###### Amounts

* For each UD source, the amount must match the exact targeted UD value
* For each Transaction source, the amount must match the exact Output value

### Peer

#### Global validation

##### Block

* `Block` field must target an existing block in the blockchain, or target special block `0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.

#### Interpretation

* A Peer document SHOULD NOT be interpreted if its `Block` field is anterior to previously recorded Peer document for a same `PublicKey` key.

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

UCP does not imposes a particular API to deal with UCP data. Instead, UCP prefers to allow for any API definition using [Peer](#peer) document, and then leting peers deal themselves with the API(s) they prefer.

At this stage, only [uCoin HTTP API](/HTTP_API.md) (named BASIC_MERKLED_API) is known as a valid UCP API.

## References

* [Relative Money Theory](http://fr.wikipedia.org/wiki/Th%C3%A9orie_relative_de_la_monnaie), the theoretical reference behind Universal Dividend
* [OpenUDC](www.openudc.org), the inspiration project of uCoin
* [Bitcoin](https://github.com/bitcoin/bitcoin), the well known crypto-currency system
