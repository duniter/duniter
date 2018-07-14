DifferentIssuersCount# DUP - Duniter Protocol

> This document reflects Duniter in-production protocol. It is updated only for clarifications (2017).

## Contents

* [Contents](#contents)
* [Introduction](#introduction)
* [Conventions](#conventions)
  * [Documents](#documents)
  * [Signatures](#signatures)
* [Formats](#formats)
  * [Public key](#public-key)
  * [Identity](#identity)
  * [Revocation](#revocation)
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
UCP                   | Acronym for *UCoin Protocol*. A set of rules to create Duniter based currencies.
Signature             | The cryptographical act of certifying a document using a private key.
WoT                   | Acronym for *Web of Trust*. A groupment of individuals recognizing each other's identity through public keys and certification mechanisms
UD                    | Acronym for *Universal Dividend*. Means money issuance **directly** and **exclusively** by and to WoT members
realtime              | The time of real life (the habitual time).
blocktime             | The realtime recorded by a block.

## Introduction

UCP aims at defining a data format, an interpretation of it and processing rules in order to build coherent free currency systems in a P2P environment. UCP is to be understood as an *abstract* protocol since it defines currency parameters and rules about them, but not their value which is implementation specific.

This document describes UCP in a bottom-up logic, so you will find first the details of the protocol (data format) to end with general protocol requirements.

## Conventions

### Documents

#### Line endings

Please note **very carefully** that every document's line **ENDS with a newline character**, *Unix-style*, that is to say `<LF>`.

This is a *very important information* as every document is subject to hashes, and Windows-style endings won't produce the expected hashes.

#### Numbering

[Block](#block) numbering starts from `0`. That is, first block is `BLOCK#0`.

#### Block identifiers

There are 2 kinds of [Block](#block) identifiers:

##### `BLOCK_ID`

It is the number of the block. Its format is `INTEGER`, so it is a positive or zero integer.

##### `BLOCK_UID`
It is the concatenation of the `BLOCK_ID` of a block and hash. Its format is `BLOCK_ID-HASH`.

##### Examples

The block ID of the root block is `0`. Its UID *might be* `0-883228A23F8A75B342E912DF439738450AE94F5D`.
The block ID of the block#433 is `433`. Its UID *might be* `433-FB11681FC1B3E36C9B7A74F4DDE2D07EC2637957`.

> Note that it says "might be" because the hash is not known in advance.

#### Currency name

A valid currency name is composed of alphanumeric characters, spaces, `-` or `_` and has a length of 2 to 50 characters.

#### Datesœ

For any document using a date field, targeted date is to be understood as **UTC+0** reference.

#### Integer

Any integer field has a maximum length of 19 digits.

### Signatures

#### Format

Signatures follow the [Ed25519 pattern](http://en.wikipedia.org/wiki/EdDSA), and are written under [Base64](http://en.wikipedia.org/wiki/Base64) encoding.

Here is an example of an expected signature:

    H41/8OGV2W4CLKbE35kk5t1HJQsb3jEM0/QGLUf80CwJvGZf3HvVCcNtHPUFoUBKEDQO9mPK3KJkqOoxHpqHCw==

#### Line endings

No new line character exists in a signature. However, a signature may be followed by a new line character, hence denoting the end of the signature.

## Formats

This section deals with the various data formats used by UCP.

### Public key

#### Definition

A public key is to be understood as an [Ed25519](http://en.wikipedia.org/wiki/EdDSA) public key.

Its format is a [Base58](http://en.wikipedia.org/wiki/Base58) string of 43 or 44 characters, such as the following:

    HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY

A public key is always paired with a private key, which UCP will never deal with. UCP only deals with public keys and signatures.

### Identity

#### Definition

Issuing an identity is the act of creating a link between a *public key* and *an arbitrary identity*. In UCP, this link is done through the signature of an identity string by the private key corresponding to the public key. It is exactly like saying:

> « This identity refers to me ! »

#### Identity unique ID
UCP does not rely on any particular identity format, which remains implementation free. Identity simply has to be a string of length between 2 and 100 characters avoiding usage of line ending characters.

In this document *identifier*, `UserID`, `USER_ID` and `uid` will be indifferently used to refer to this identity string.

#### Format

An identity is a *signed* document containing the identifier:

```yml
Version: 10
Type: Identity
Currency: CURRENCY_NAME
Issuer: PUBLIC_KEY
UniqueID: USER_ID
Timestamp: BLOCK_UID
```

Here, `USER_ID` has to be replaced with a valid identifier, `PUBLIC_KEY` with a valid public key and `BLOCK_UID` with a valid block unique ID. This document **is what signature is based upon**.

The whole identity document is then:

```yml
Version: 10
Type: Identity
Currency: CURRENCY_NAME
Issuer: PUBLIC_KEY
UniqueID: USER_ID
Timestamp: BLOCK_UID
SIGNATURE
```

Where:

* `CURRENCY_NAME` is a valid currency name
* `USER_ID` is a valid user identity string
* `PUBLIC_KEY` is a valid public key (base58 format)
* `BLOCK_UID` refers to a [block unique ID], and represents a time reference.
* `SIGNATURE` is a signature

So the identity issuance is the act of saying:

> « I attest, today, that this identity refers to me. »

##### Example

A valid identity:

```yml
Version: 10
Type: Identity
Currency: beta_brousouf
Issuer: HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
UniqueID: lolcat
Timestamp: 32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
```

### Revocation


#### Definition

An identity revocation is the act, for a given public key's owner, to revoke an identity they created for representing themself. Doing a self-revocation is exactly like saying:

> « This identity I created makes no sense anymore. It has to be definitively locked. »

#### Use case

Its goal is only to inform that a created identity was either made by mistake, or contained a mistake, may have been compromised (private key stolen, lost...), or because for some reason you want to make yourself another identity.

#### Format

A revocation is a *signed* document gathering the identity informations to revoke:

```yml
Version: 10
Type: Revocation
Currency: CURRENCY_NAME
Issuer: PUBLIC_KEY
IdtyUniqueID: USER_ID
IdtyTimestamp: BLOCK_UID
IdtySignature: IDTY_SIGNATURE
REVOCATION_SIGNATURE
```

Where:

* `REVOCATION_SIGNATURE` is the signature over the document, `REVOCATION_SIGNATURE` excluded.

#### Example

If we have the following identity:

```yml
Version: 10
Type: Identity
Currency: beta_brousouf
Issuer: HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
UniqueID: lolcat
Timestamp: 32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
```

A valid revocation could be:

```yml
Version: 10
Type: Revocation
Currency: beta_brousouf
Issuer: HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
IdtyUniqueID: lolcat
IdtyTimestamp: 32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
IdtySignature: J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
SoKwoa8PFfCDJWZ6dNCv7XstezHcc2BbKiJgVDXv82R5zYR83nis9dShLgWJ5w48noVUHimdngzYQneNYSMV3rk
```

> The revocation actually *contains* the identity, so a program receiving a Revocation can extract the Identity and check the validity of its signature before processing the Revocation document.

### Certification

#### Definition

A *certification* in UCP refers to the document *certifying* that someone else's identity is to consider as the unique reference to a living individual.

#### Format

A certification has the following format:

```yml
Version: 10
Type: Certification
Currency: CURRENCY_NAME
Issuer: PUBLIC_KEY
IdtyIssuer: IDTY_ISSUER
IdtyUniqueID: USER_ID
IdtyTimestamp: BLOCK_UID
IdtySignature: IDTY_SIGNATURE
CertTimestamp: BLOCK_UID
CERTIFIER_SIGNATURE
```

Where:

* `BLOCK_UID` refers to a block unique ID.
* `CERTIFIER_SIGNATURE` is the signature of the *certifier*.

#### Inline format

Certifications may exist in an *inline format*, which describes the certification in a simple line. Here is the general structure:

    PUBKEY_FROM:PUBKEY_TO:BLOCK_ID:SIGNATURE

Where:

  * `PUBKEY_FROM` is the certification public key
  * `PUBKEY_TO` is the public key whose identity is being certified
  * `BLOCK_ID` is the certification time reference
  * `SIGNATURE` is the certification signature

> Note: BLOCK_UID is not required in the inline format, since this format aims at being used in the context of a blockchain, where block_uid can be deduced.

#### Example

If we have the following complete self-certification:

```yml
Version: 10
Type: Identity
Currency: beta_brousouf
Issuer: HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
UniqueID: lolcat
Timestamp: 32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
```

A valid certification could be:

```yml
Version: 10
Type: Certification
Currency: beta_brousouf
Issuer: DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV
IdtyIssuer: HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
IdtyUniqueID: lolcat
IdtyTimestamp: 32-DB30D958EE5CB75186972286ED3F4686B8A1C2CD
IdtySignature: J3G9oM5AKYZNLAB5Wx499w61NuUoS57JVccTShUbGpCMjCqj9yXXqNq7dyZpDWA6BxipsiaMZhujMeBfCznzyci
CertTimestamp: 36-1076F10A7397715D2BEE82579861999EA1F274AC
SoKwoa8PFfCDJWZ6dNCv7XstezHcc2BbKiJgVDXv82R5zYR83nis9dShLgWJ5w48noVUHimdngzYQneNYSMV3rk
```

### Membership

In UCP, a member is represented by a public key they are supposed to own. To be integrated in a WoT, the newcomer owner of the key *has to express their will* to integrate the WoT.

This step is done by issuing the following document:

```yml
Version: VERSION
Type: Membership
Currency: CURRENCY_NAME
Issuer: ISSUER
Block: M_BLOCK_UID
Membership: MEMBERSHIP_TYPE
UserID: USER_ID
CertTS: BLOCK_UID
```

followed by a signature of the `Issuer`.

#### Fields details

Field | Description
----- | -----------
`Version` | Denotes the current structure version.
`Type` | Type of the document.
`Currency` | Contains the name of the currency.
`Issuer` | The public key of the issuer.
`Block` | Block number and hash. Value is used to target a blockchain and precise time reference for membership's time validity.
`Membership` | Membership message. Value is either `IN` or `OUT` to express whether a member wishes to opt-in or opt-out the community.
`UserID` | Identity to use for this public key
`CertTS` | Identity's block UID

#### Validity

A [Membership](#membership) is to be considered having valid format if:

* `Version` equals `2`
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

Obviously, coins a sender does not own CANNOT be sent by them. That is why a transaction refers to other transactions, to prove that the sender actually owns the coins they want to send.

#### Format

A transaction is defined by the following format:

```yml
Version: VERSION
Type: Transaction
Currency: CURRENCY_NAME
Blockstamp: BLOCK_UID
Locktime: INTEGER
Issuers:
PUBLIC_KEY
...
Inputs:
INPUT
...
Unlocks:
UNLOCK
...
Outputs:
AMOUNT:BASE:CONDITIONS
...
Comment: COMMENT
SIGNATURES
...
```

Here is a description of each field:

Field | Description
----- | -----------
`Version` | denotes the current structure version
`Type` | type of the document
`Currency` | contains the name of the currency
`Blockstamp` | a block reference as timestamp of the transaction
`Locktime` | waiting delay to be included in the blockchain
`Issuers` | a list of public keys
`Inputs` | a list of money sources
`Unlocks` | a list of values justifying inputs consumption
`Outputs` | a list of amounts and conditions to unlock them
`Comment` | a comment to write on the transaction

#### Validity

A Transaction structure is considered *valid* if:

* Field `Version` equals `2` or `3`.
* Field `Type` equals `Transaction`.
* Field `Currency` is not empty.
* Field `Blockstamp` is a block UID
* Field `Locktime` is an integer
* Field `Issuers` is a multiline field whose lines are public keys.
* Field `Inputs` is a multiline field whose lines match either:
  * `AMOUNT:BASE:D:PUBLIC_KEY:BLOCK_ID` format
  * `AMOUNT:BASE:T:T_HASH:T_INDEX` format
* Field `Unlocks` is a multiline field whose lines follow `INDEX:UL_CONDITIONS` format:
  * `IN_INDEX` must be an integer value
  * `UL_CONDITIONS` must be a valid [Input Condition](#input-condition)
* Field `Outputs` is a multiline field whose lines follow `AMOUNT:BASE:CONDITIONS` format:
  * `AMOUNT` must be an integer value
  * `BASE` must be an integer value
  * `CONDITIONS` must be a valid [Output Condition](#output-condition)
* Field `Comment` is a string of maximum 255 characters, exclusively composed of alphanumeric characters, space, `-`, `_`, `:`, `/`, `;`, `*`, `[`, `]`, `(`, `)`, `?`, `!`, `^`, `+`, `=`, `@`, `&`, `~`, `#`, `{`, `}`, `|`, `\`, `<`, `>`, `%`, `.`. Must be present even if empty.

#### Input condition

It is a suite of values each separated by a space "` `". Values must be either a `SIG(INDEX)` or `HXH(INTEGER)`.

If no values are provided, the valid input condition is an empty string.

##### Input condition examples

* `SIG(0)`
* `XHX(73856837)`
* `SIG(0) SIG(2) XHX(343)`
* `SIG(0) SIG(2) SIG(4) SIG(6)`

#### Output condition

It follows a machine-readable BNF grammar composed of

* `(` and `)` characters
* `&&` and `||` operators
* `SIG(PUBLIC_KEY)`, `XHX(SHA256_HASH)`, `CLTV(INTEGER)`, `CSV(INTEGER)` functions
* ` ` space

**An empty condition or a condition fully composed of spaces is considered an invalid output condition**.

##### Output condition examples

* `SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd)`
* `(SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd) && XHX(309BC5E644F797F53E5A2065EAF38A173437F2E6))`
* `(SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd) && CSV(3600))`
* `(SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd) && (CLTV(1489677041) || CSV(3600)))`
* `(SIG(HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd) || (SIG(DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV) && XHX(309BC5E644F797F53E5A2065EAF38A173437F2E6)))`

#### Condition matching

Considering a transaction `TX` consuming some money: each unlock line `UNLOCK` of TX tries to unlock the input `INPUT = TX.Inputs[IN_INDEX]` refering to an ouput `Output` whose value is:

If `INPUT.TYPE = 'T'`:

    Output = TRANSACTIONS_IN_BLOCKCHAIN_OR_IN_LOCAL_BLOCK[T_HASH].OUPUTS[T_INDEX]

If `INPUT.TYPE = 'D'`:

    Output = BLOCKCHAIN[BLOCK_ID].Dividend[PUBLIC_KEY]

Let's name:

* `CONDITIONS` the conditions of a given output `Output`
* `NB_FUNCTIONS` the number of functions present in `CONDITIONS` (read from left to right)
* `NB_PARAMETERS` the number of parameters present in `UNLOCK`, each separated by a space (read from left to right)

Then, an `UNLOCK` line is considered *successful* if:

* `Output` exists
* `NB_PARAMETERS <= NB_FUNCTIONS`
* Each `UNLOCK` parameter returns TRUE
* `CONDITIONS` evaluated globally with `(`, `)`, `&&`, `||` and its locking functions returns TRUE

##### Example 1

TX1:

```yml
Outputs:
50:2:XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB)
```

Is resolved by TX2:

```yml
Unlocks:
0:XHX(1872767826647264)
```

Because `XHX(1872767826647264) = 8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB` (this will be explained in the next section).

##### Example 2

TX1:

```yml
Outputs:
50:2:SIG(DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo)
```

Is resolved by TX2:

```yml
Issuers:
HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd
DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo
[...]
Unlocks:
0:SIG(1)
```

Because `SIG(1)` refers to the signature `DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo`, considering that signature `DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo` is good over TX2.

#### Locking and unlocking functions

The *locking* functions are present under `Outputs` field.

The *unlocking* functions are present under `Unlocks` field.

##### SIG function

###### Definition

Lock:

    SIG(PUBKEY_A)

Unlock:

    SIG(INDEX)

###### Condition

Lock `SIG(PUBKEY_A)` returns TRUE if it exists a parameter `SIG(INDEX)` returning TRUE where `Issuers[INDEX] == PUBKEY_A`.

Unlock `SIG(INDEX)` returns TRUE if `Signatures[INDEX]` is a valid valid signature of TX against `Issuers[INDEX]` public key.

###### Description

This function is a control over the signature.

* in an `Output` of a transaction TX1, `SIG(PUBKEY_A)` requires from a future transaction TX2 unlocking the output to give as parameter a valid signature of TX2 by `PUBKEY_A`
  * if TX2 does not give `SIG(INDEX)` parameter as [matching parameter](#condition-matching), the condition fails
  * if TX2's `Issuers[INDEX]` does not equal `PUBKEY_A`, the condition fails
  * if TX2's `SIG(INDEX)` does not return TRUE, the condition fails
* in an `Unlock` of TX2, `SIG(INDEX)` returns TRUE if `Signatures[INDEX]` is a valid signature of TX2 against `Issuers[INDEX]`

So if we have, in TX1:

```yml
Version: 10
Type: Transaction
[...]
Outputs
25:2:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)
```

Then the `25` units can be spent *exclusively* in a future transaction TX2 which looks like:

```yml
Version: 10
Type: Transaction
[...]
Issuers:
BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g
Inputs:
25:2:T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:0
Unlocks:
0:SIG(0)
```

Where:

* `SIG(0)` refers to the signature of `Issuers[0]`, here `BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g`
* `6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3` is the hash of TX1.

The necessary condition `SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)` is matched here if **both**:

* the sufficient proof `SIG(0)` is a valid signature of TX2 against `Issuers[0]` public key
* `Issuers[0] = BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g`


##### XHX function

###### Definition

Lock:

    XHX(HASH)

Unlock:

    XHX(PASSWORD)

###### Condition

`XHX(HASH)` returns true if it exists a parameter `XHX(PASSWORD)` where `SHA256(PASSWORD) = HASH`.

`XHX(PASSWORD)` returns true if it exists a locking function `XHX(HASH)` where `SHA256(PASSWORD) = HASH` in the conditions.

###### Description

This function is a password control.

So if we have, in TX1:

```yml
Version: 10
Type: Transaction
[...]
Outputs
25:2:XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB)
```

Then the `25` units can be spent *exclusively* in a future transaction TX2 which looks like:

```yml
Version: 10
Type: Transaction
[...]
Issuers:
BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g
Inputs:
55:1:T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:0
Unlocks:
0:XHX(1872767826647264)
```

Where:

* `6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3` is the hash of TX1.

Then `XHX(PASSWORD)` returns TRUE if it exists `XHX(HASH)` in the output's conditions of TX1, with the relation `SHA256(PASSWORD) = HASH`.

Here `XHX(1872767826647264)` returns TRUE if it exists `XHX(8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB)` in the output's conditions of TX1, as it matches the link `SHA256(1872767826647264) = 8AFC8DF633FC158F9DB4864ABED696C1AA0FE5D617A7B5F7AB8DE7CA2EFCD4CB`.

#### Example 1

Key `HsLShA` sending 25 coins to key `BYfWYF` using 1 source transaction written in block #3.

```yml
Version: 10
Type: Transaction
Currency: beta_brousouf
Blockstamp: 204-00003E2B8A35370BA5A7064598F628A62D4E9EC1936BE8651CE9A85F2E06981B
Locktime: 0
Issuers:
HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
Inputs:
30:0:T:8361C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:3
Unlocks:
0:SIG(0)
Outputs:
25:0:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)
5:0:SIG(HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY)
Comment: First transaction
```

Signatures (fake here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r

#### Example 2

Key `HsLShA` sending 30 coins (base 2) to key `BYfWYF` using 2 sources transaction written in blocks #65 and #77 + 1 UD from block #88.

```yml
Version: 10
Type: Transaction
Currency: beta_brousouf
Blockstamp: 204-00003E2B8A35370BA5A7064598F628A62D4E9EC1936BE8651CE9A85F2E06981B
Locktime: 0
Issuers:
HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
Inputs:
6:2:T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:0
20:2:T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:10
40:1:D:HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:88
Unlocks:
0:SIG(0)
1:SIG(0)
2:SIG(0)
Outputs:
30:2:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)
Comment:
```

Signatures (fake here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r

#### Example 3

Key `HsLShA`,  `CYYjHs` and `9WYHTa` sending 235 coins to key `BYfWYF` using 4 sources transaction + 2 UD from same block #46.

```yml
Version: 10
Type: Transaction
Currency: beta_brousouf
Blockstamp: 204-00003E2B8A35370BA5A7064598F628A62D4E9EC1936BE8651CE9A85F2E06981B
Locktime: 0
Issuers:
HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp
9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB
Inputs:
40:2:T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:2
70:2:T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:8
20:2:D:HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:46
70:2:T:A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956:3
20:2:T:67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B:5
15:2:D:9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:46
Unlocks:
0:SIG(0)
1:XHX(7665798292)
2:SIG(0)
3:SIG(0) SIG(2)
4:SIG(0) SIG(1) SIG(2)
5:SIG(2)
Outputs:
120:2:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)
146:2:SIG(DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx)
49:2:(SIG(6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i) || XHX(3EB4702F2AC2FD3FA4FDC46A4FC05AE8CDEE1A85))
Comment: -----@@@----- (why not this comment?)
```

Signatures (fakes here):

    42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r
    2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX
    2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk

##### CLTV function

###### Definition

Lock:

    CLVT(TIMESTAMP)

Unlock: no unlocking function.

###### Condition

`CLVT(TIMESTAMP)` returns true if and only if the transaction including block's `MedianTime >= TIMESTAMP`.

###### Description

This function locks an output in the future, which will be unlocked at a given date.

So if we have, in TX1:

```yml
Version: 10
Type: Transaction
[...]
Outputs
25:2:CLTV(1489677041)
```

So here, the `25` units can be spent *exclusively* in a block whose `MedianTime >= 1489677041`

`CLTV`'s parameter must be an integer with a length between `1` and `10` chars.

##### CSV function

###### Definition

Lock:

    CSV(DELAY)

Unlock: no unlocking function.

We define `TxTime` as the `MedianTime` of the block referenced by the transaction's `Blockstamp` field.

###### Condition

`CSV(DELAY)` returns true if and only if the transaction including block's `MedianTime - TxTime >= DELAY`.

###### Description

This function locks an output in the future, which will be unlocked after the given amount of time has elapsed.

So if we have, in TX1:

```yml
Version: 10
Type: Transaction
Currency: beta_brousouf
Blockstamp: 204-00003E2B8A35370BA5A7064598F628A62D4E9EC1936BE8651CE9A85F2E06981B
[...]
Outputs
25:2:CSV(3600)
```

Then the `25` units can be spent *exclusively* in a block whose `MedianTime - TxTime >= 3600`.

`CSV`'s parameter must be an integer with a length between `1` and `8` chars.

#### Compact format

A transaction may be described with a more compact format, to be used in a [Block](#block) document. The general format is:

```yml
TX:VERSION:NB_ISSUERS:NB_INPUTS:NB_UNLOCKS:NB_OUTPUTS:HAS_COMMENT:LOCKTIME
BLOCKSTAMP
PUBLIC_KEY
...
INPUT
...
UNLOCK
...
OUTPUT
...
COMMENT
SIGNATURE
...
```

Here is an example compacting [example 2](#example-2) from above:

```yml
TX:10:1:3:1:0:0
204-00003E2B8A35370BA5A7064598F628A62D4E9EC1936BE8651CE9A85F2E06981B
HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
6:2:T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:0
20:2:T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:10
40:1:D:HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:88
0:SIG(0)
1:SIG(0)
2:SIG(0)
30:2:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)
42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r
```

Here is an example compacting [example 3](#example-3) from above:

```yml
TX:10:3:6:3:1:0
204-00003E2B8A35370BA5A7064598F628A62D4E9EC1936BE8651CE9A85F2E06981B
HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
CYYjHsNyg3HMRMpTHqCJAN9McjH5BwFLmDKGV3PmCuKp
9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB
40:2:T:6991C993631BED4733972ED7538E41CCC33660F554E3C51963E2A0AC4D6453D3:2
70:2:T:3A09A20E9014110FD224889F13357BAB4EC78A72F95CA03394D8CCA2936A7435:8
20:2D:HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY:46
70:2:T:A0D9B4CDC113ECE1145C5525873821398890AE842F4B318BD076095A23E70956:3
20:2:T:67F2045B5318777CC52CD38B424F3E40DDA823FA0364625F124BABE0030E7B5B:5
15:2:D:9WYHTavL1pmhunFCzUwiiq4pXwvgGG5ysjZnjz9H8yB:46
0:SIG(0)
1:XHX(7665798292)
2:SIG(0)
3:SIG(0) SIG(2)
4:SIG(0) SIG(1) SIG(2)
5:SIG(2)
120:2:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)
146:2:SIG(DSz4rgncXCytsUMW2JU2yhLquZECD2XpEkpP9gG5HyAx)
49:2:(SIG(6DyGr5LFtFmbaJYRvcs9WmBsr4cbJbJ1EV9zBbqG7A6i) || XHX(3EB4702F2AC2FD3FA4FDC46A4FC05AE8CDEE1A85))
-----@@@----- (why not this comment?)
42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r
2D96KZwNUvVtcapQPq2mm7J9isFcDCfykwJpVEZwBc7tCgL4qPyu17BT5ePozAE9HS6Yvj51f62Mp4n9d9dkzJoX
2XiBDpuUdu6zCPWGzHXXy8c4ATSscfFQG9DjmqMZUxDZVt1Dp4m2N5oHYVUfoPdrU9SLk4qxi65RNrfCVnvQtQJk
```

### Block

A Block is a document gathering both:

  * [Public key](#publickey) data in order to build a Web Of Trust (WoT) representation
  * [Transaction](#transaction) data to identify money units & ownership

but also other informations like:

* time reference (calendar time)
* UD value for money issuance

#### Structure

```yml
Version: VERSION
Type: Block
Currency: CURRENCY
Number: BLOCK_ID
PoWMin: NUMBER_OF_ZEROS
Time: GENERATED_ON
MedianTime: MEDIAN_DATE
UniversalDividend: DIVIDEND_AMOUNT
UnitBase: UNIT_BASE
Issuer: ISSUER_KEY
IssuersFrame: ISSUERS_FRAME
IssuersFrameVar: ISSUERS_FRAME_VAR
DifferentIssuersCount: ISSUER_KEY
PreviousHash: PREVIOUS_HASH
PreviousIssuer: PREVIOUS_ISSUER_KEY
Parameters: PARAMETERS
MembersCount: WOT_MEM_COUNT
Identities:
PUBLIC_KEY:SIGNATURE:I_BLOCK_UID:USER_ID
...
Joiners:
PUBLIC_KEY:SIGNATURE:M_BLOCK_UID:I_BLOCK_UID:USER_ID
...
Actives:
PUBLIC_KEY:SIGNATURE:M_BLOCK_UID:I_BLOCK_UID:USER_ID
...
Leavers:
PUBLIC_KEY:SIGNATURE:M_BLOCK_UID:I_BLOCK_UID:USER_ID
...
Revoked:
PUBLIC_KEY:SIGNATURE
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
InnerHash: BLOCK_HASH
Nonce: NONCE
BOTTOM_SIGNATURE
```

Field                 | Data                                              | Mandatory?
--------------------- | ------------------------------------------------- | ------------
Version               | The document version                              | Always
Type                  | The document type                                 | Always
Currency              | The currency name                                 | Always
Number                | The block number                                  | Always
PoWMin                | The current minimum PoW difficulty                | Always
Time                  | Time of generation                                | Always
MedianTime            | Median date                                       | Always
UniversalDividend     | Universal Dividend amount                         | **Optional**
UnitBase              | Universal Dividend unit base (power of 10)        | Always in V3, **Optional** in V2
Issuer                | This block's issuer's public key                  | Always
IssuersFrame          | The size of the frame to look for issuers         | Always
IssuersFrameVar       | A counter to increment/decrement IssuersFrame     | Always
DifferentIssuersCount | The count of unique issuers of blocks             | Always
PreviousHash          | Previous block fingerprint (SHA256)               | from Block#1
PreviousIssuer        | Previous block issuer's public key                | from Block#1
Parameters            | Currency parameters.                              | **Block#0 only**
MembersCount          | Number of members in the WoT, this block included | Always
Identities            | New identities in the WoT                         | Always
Joiners               | `IN` memberships                                  | Always
Actives               | `IN` memberships (renewal)                        | Always
Leavers               | `OUT` memberships                                 | Always
Revoked               | Revocation documents                              | Always
Excluded              | Exluded members' public key                       | Always
Transactions          | A list of compact transactions                    | Always
InnerHash             | The hash value of the block's inner content       | Always
Nonce                 | An arbitrary nonce value                          | Always
BlockHash             | Hash from `InnerHash: ` to `SIGNATURE`            | Virtual
BlockSize             | Hash from `InnerHash: ` to `SIGNATURE`            | Virtual

##### BlockSize

The block size is defined as the number of lines in multiline fields (`Identities`, `Joiners`, `Actives`, `Leavers`, `Revoked`, `Certifications`, `Transactions`) **except** `Excluded` field.

For example:

* 1 new identity + 1 joiner + 2 certifications = 4 lines sized block
* 1 new identity + 1 joiner + 2 certifications + 5 lines transaction = 9 lines sized block

#### Coherence

To be valid, a block must match the following rules:

##### Format

* `Version`, `Nonce`, `Number`, `PoWMin`, `Time`, `MedianTime`, `MembersCount`, `UniversalDividend`, `UnitBase`, `IssuersFrame`, `IssuersFrameVar` and `DifferentIssuersCount` are integer values
* `Currency` is a valid currency name
* `PreviousHash` is an uppercased SHA256 hash
* `Issuer` and `PreviousIssuer` are [Public keys](#publickey)
* `Identities` is a multiline field composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
  * `SIGNATURE` : a [Signature](#signature)
  * `BLOCK_UID` : a block UID
  * `USER_ID` : an identifier
* `Joiners`, `Actives` and `Leavers` are multiline fields composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
  * `SIGNATURE` : a [Signature](#signature)
  * `M_BLOCK_UID` : a block UID
  * `I_BLOCK_UID` : a block UID
  * `USER_ID` : an identifier
* `Revoked` is a multiline field composed for each line of:
  * `SIGNATURE` : a [Signature](#signature)
  * `USER_ID` : an identifier
* `Excluded` is a multiline field composed for each line of:
  * `PUBLIC_KEY` : a [Public key](#publickey)
* `Certifications` is a multiline field composed for each line of:
  * `PUBKEY_FROM` : a [Public key](#publickey) doing the certification
  * `PUBKEY_TO` : a [Public key](#publickey) being certified
  * `BLOCK_ID` : a positive integer
  * `SIGNATURE` : a [Signature](#signature) of the certification
* `Transactions` is a multiline field composed of [compact transactions](#compact-format)
* `Parameters` is a simple line field, composed of 1 float, 12 integers and 1 last float all separated by a colon `:`, and representing [currency parameters](#protocol-parameters) (a.k.a Protocol parameters, but valued for a given currency):

        c:dt:ud0:sigPeriod:sigStock:sigWindow:sigValidity:sigQty:idtyWindow:msWindow:xpercent:msValidity:stepMax:medianTimeBlocks:avgGenTime:dtDiffEval:percentRot:udTime0:udReevalTime0:dtReeval

The document must be ended with a `BOTTOM_SIGNATURE` [Signature](#signature).

##### Data

* `Version` equals `6`
* `Type` equals `Block`

### Peer

UCP uses P2P networks to manage community and money data. Since only members can write to the Blockchain, it is important to have authenticated peers so newly validated blocks can be efficiently sent to them, without any ambiguity.

For that purpose, UCP defines a peering table containing, for a given node's public key:

* a currency name
* a list of endpoints to contact the node

This link is made through a document called *Peer* whose format is described below.

#### Structure

```yml
Version: VERSION
Type: Peer
Currency: CURRENCY_NAME
Issuer: NODE_PUBLICKEY
Block: BLOCK
Endpoints:
END_POINT_1
END_POINT_2
END_POINT_3
[...]
```

With the signature attached, this document certifies that this public key is owned by this server at given network endpoints.

The aggregation of all *Peer* documents is called the *peering table*, and allows to authentify addresses of all nodes identified by their public keys.

#### Fields details

Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Type`  | the document type.
`Currency` | contains the name of the currency.
`Issuer` | the node's public key.
`Block` | block number and hash. Value is used to target a blockchain and precise time reference.
`Endpoints` | a list of endpoints to interact with the node

`Endpoints` has a particular structure. It is made up of at least one line, with each line following this format:

    PROTOCOL_NAME[ OPTIONS]
    [...]

For example, the first written Duniter peering protocol is BASIC_MERKLED_API, which defines an HTTP API. An endpoint of such protocol would look like:

    BASIC_MERKLED_API[ DNS][ IPv4][ IPv6] PORT

Where :

Field | Description
----- | -----------
`DNS` | is the dns name to access the node.
`IPv4` | is the IPv4 address to access the node.
`IPv6` | is the IPv6 address to access the node.
`PORT` | is the port of the address to access the node.

#### Coherence

To be valid, a peer document must match the following rules:

##### Format

* `Version` equals `2` or `3`
* `Type` equals `Peer`
* `Currency` is a valid currency name
* `PublicKey` is a [Public key](#publickey)
* `Endpoints` is a multiline field

The document must be ended with a `BOTTOM_SIGNATURE` [Signature](#signature).

#### Example

```yml
Version: 10
Type: Peer
Currency: beta_brousouf
PublicKey: HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY
Block: 8-1922C324ABC4AF7EF7656734A31F5197888DDD52
Endpoints:
BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9001
BASIC_MERKLED_API some.dns.name 88.77.66.55 2001:0db8:0000:85a3:0000:0000:ac1f 9002
OTHER_PROTOCOL 88.77.66.55 9001
```

## Variables

### Protocol parameters

Parameter   | Goal
----------- | ----
c           | The %growth of the UD every `[dt]` period
dt          | Time period between two UD.
dtReeval    | Time period between two re-evaluation of the UD.
ud0         | UD(0), i.e. initial Universal Dividend
udTime0     | Time of first UD.
udReevalTime0 | Time of first reevaluation of the UD.
sigPeriod   | Minimum delay between 2 certifications of a same issuer, in seconds. Must be positive or zero.
msPeriod    | Minimum delay between 2 memberships of a same issuer, in seconds. Must be positive or zero.
sigStock    | Maximum quantity of active certifications made by member.
sigWindow   | Maximum delay a certification can wait before being expired for non-writing.
sigValidity | Maximum age of an active signature (in seconds)
sigQty      | Minimum quantity of signatures to be part of the WoT
idtyWindow  | Maximum delay an identity can wait before being expired for non-writing.
msWindow    | Maximum delay a membership can wait before being expired for non-writing.
xpercent    | Minimum percent of sentries to reach to match the distance rule
msValidity  | Maximum age of an active membership (in seconds)
stepMax     | Maximum distance between each WoT member and a newcomer
medianTimeBlocks | Number of blocks used for calculating median time.
avgGenTime  | The average time for writing 1 block (wished time)
dtDiffEval  | The number of blocks required to evaluate again `PoWMin` value
percentRot  | The percent of previous issuers to reach for personalized difficulty
txWindow    | `= 3600 * 24 * 7`. Maximum delay a transaction can wait before being expired for non-writing.

### Computed variables

Variable  | Meaning
--------- | ----
members   | Synonym of `members(t = now)`, `wot(t)`, `community(t)` targeting the keys whose last active (non-expired) membership is either in `Joiners` or `Actives`.
maxGenTime  | `= CEIL(avgGenTime * 1.189)`
minGenTime  | `= FLOOR(avgGenTime / 1.189)`
minSpeed | 1 / maxGenTime
maxSpeed | 1 / minGenTime
maxAcceleration | `= CEIL(maxGenTime * medianTimeBlocks)`

## Processing

### Block

A Block can be accepted only if it respects a set of rules, here divided in 2 parts : *local* and *global*.

#### Local validation

Local validation verifies the coherence of a well-formatted block, without any other context than the block itself.

##### Version

Rule:

    HEAD.version == 10

##### InnerHash

* `InnerHash` is the SHA256 hash of the whole fields from `Version:` to `\InnerHash`, the 'InnerHash' string being excluded from the hash computation.

##### Nonce

* `Nonce` value may be any zero or positive integer. This field is a special field allowing for document hash to change for proof-of-work computation.

##### Proof of work

To be valid, the BlockHash must start with a specific number of zeros. Locally, this hash must start with at least `NB_ZEROS` zeros:

    REMAINDER = PowMin % 16
    NB_ZEROS = (PowMin - REMAINDER) / 16

##### PreviousHash

* `PreviousHash` must be present if the value of the `Number` field is greater than `0`.
* `PreviousHash` must not be present if the value of the `Number` field is equal to `0`.

##### PreviousIssuer

* `PreviousIssuer` must be present if the value of the `Number` field is greater than `0`.
* `PreviousIssuer` must not be present if the value of the `Number` field is equal to `0`.

##### Parameters

* `Parameters` must be present if the value of the `Number` field is equal to `0`.
* `Parameters` must not be present if the value of the `Number` field is greater than `0`.

##### Universal Dividend

If HEAD.number == 0, HEAD.dividend must equal `null`.

##### UnitBase

* Block V2:
  * If `UniversalDividend` field is present, `UnitBase` must be present too.
* Block V3:
  * The field is always present.
  * For root block, `UnitBase` must equal `0`.

##### Signature

* A block must have a valid signature over the content from `Hash: ` to `Nonce: NONCE\n`, where the associated public key is the block's `Issuer` field.

##### Dates

* A block must have its `Time` field be between [`MedianTime` ; `MedianTime` + `maxAcceleration`].
* Root block's `Time` & `MedianTime` must be equal.

##### Identities

A block cannot contain identities whose signature does not match the identity's content

##### Memberships (Joiners, Actives, Leavers)

A block cannot contain memberships whose signature does not match the membership's content

##### Revoked

A block cannot contain revocations whose signature does not match the revocation's content

##### Transactions

* A transaction in compact format cannot measure more than 100 lines
* A transaction must have at least 1 source
* A transaction cannot have `SIG(INDEX)` unlocks with `INDEX >= ` issuers count.
* A transaction **must** have signatures matching its content **for each issuer**
* A transaction's version must be equal to `3`
* Signatures count must be the same as issuers count
* Signatures are ordered by issuer
* Signatures are made over the transaction's content, signatures excepted

##### INDEX GENERATION

##### Identities

Each identity produces 2 new entries:

    IINDEX (
        op = 'CREATE'
        uid = USER_ID
        pub = PUBLIC_KEY
        created_on = BLOCK_UID
        written_on = BLOCKSTAMP
        member = true
        wasMember = true
        kick = false
    )

    MINDEX (
        op = 'CREATE'
        pub = PUBLIC_KEY
        created_on = BLOCK_UID
        written_on = BLOCKSTAMP
        expired_on = 0
        expires_on = MedianTime + msValidity
        revokes_on = MedianTime + msValidity*2
        chainable_on = MedianTime + msPeriod
        type = 'JOIN'
        revoked_on = null
        leaving = false
    )

##### Joiners

Each join whose `PUBLIC_KEY` **does not match** a local MINDEX `CREATE, PUBLIC_KEY` produces 2 new entries:

    IINDEX (
        op = 'UPDATE'
        uid = null
        pub = PUBLIC_KEY
        created_on = null
        written_on = BLOCKSTAMP
        member = true
        wasMember = null
        kick = null
    )

    MINDEX (
        op = 'UPDATE'
        pub = PUBLIC_KEY
        created_on = BLOCK_UID
        written_on = BLOCKSTAMP
        expired_on = 0
        expires_on = MedianTime + msValidity
        revokes_on = MedianTime + msValidity*2
        chainable_on = MedianTime + msPeriod
        type = 'JOIN'
        revoked_on = null
        leaving = null
    )

##### Actives

Each active produces 1 new entry:

    MINDEX (
        op = 'UPDATE'
        pub = PUBLIC_KEY
        created_on = BLOCK_UID
        written_on = BLOCKSTAMP
        expires_on = MedianTime + msValidity
        revokes_on = MedianTime + msValidity*2
        chainable_on = MedianTime + msPeriod
        type = 'RENEW'
        revoked_on = null
        leaving = null
    )

##### Leavers

Each leaver produces 1 new entry:

    MINDEX (
        op = 'UPDATE'
        pub = PUBLIC_KEY
        created_on = BLOCK_UID
        written_on = BLOCKSTAMP
        type = 'LEAVE'
        expires_on = null
        revokes_on = null
        revoked_on = null
        leaving = true
    )

##### Revoked

Each revocation produces 1 new entry:

    MINDEX (
        op = 'UPDATE'
        pub = PUBLIC_KEY
        created_on = BLOCK_UID
        written_on = BLOCKSTAMP
        type = 'REV'
        expires_on = null
        revokes_on = null
        revoked_on = BLOCKSTAMP
        revocation = REVOCATION_SIG
        leaving = false
    )

##### Excluded

Each exclusion produces 1 new entry:

    IINDEX (
        op = 'UPDATE'
        uid = null
        pub = PUBLIC_KEY
        created_on = null
        written_on = BLOCKSTAMP
        member = false
        wasMember = null
        kick = false
    )

##### Certifications

Each certification produces 1 new entry:

    CINDEX (
        op = 'CREATE'
        issuer = PUBKEY_FROM
        receiver = PUBKEY_TO
        created_on = BLOCK_ID
        written_on = BLOCKSTAMP
        sig = SIGNATURE
        expires_on = MedianTime + sigValidity
        chainable_on = MedianTime + sigPeriod
        expired_on = 0
    )

##### Sources

Each transaction input produces 1 new entry:

    SINDEX (
        op = 'UPDATE'
        tx = TRANSACTION_HASH
        identifier = INPUT_IDENTIFIER
        pos = INPUT_INDEX
        created_on = TX_BLOCKSTAMP
        written_on = BLOCKSTAMP
        amount = INPUT_AMOUNT
        base = INPUT_BASE
        conditions = null
        consumed = true
    )

Each transaction output produces 1 new entry:

    SINDEX (
        op = 'CREATE'
        tx = TRANSACTION_HASH
        identifier = TRANSACTION_HASH
        pos = OUTPUT_INDEX_IN_TRANSACTION
        written_on = BLOCKSTAMP
        written_time = MedianTime
        amount = OUTPUT_AMOUNT
        base = OUTPUT_BASE
        locktime = LOCKTIME
        conditions = OUTPUT_CONDITIONS
        consumed = false
    )

##### INDEX RULES

###### UserID and PublicKey unicity

* The local IINDEX has a unicity constraint on `USER_ID`.
* The local IINDEX has a unicity constraint on `PUBLIC_KEY`.
* Each local IINDEX `op = 'CREATE'` operation must match a single local MINDEX `op = 'CREATE', pub = PUBLIC_KEY` operation.

> Functionally: UserID and public key must be unique in a block, an each new identity must have an opt-in document attached.

###### Membership unicity

* The local MINDEX has a unicity constraint on `PUBLIC_KEY`

> Functionally: a user has only 1 status change allowed per block.

###### Revocation implies exclusion

* Each local MINDEX ̀`op = 'UPDATE', revoked_on = BLOCKSTAMP` operations must match a single local IINDEX `op = 'UPDATE', pub = PUBLIC_KEY, member = false` operation.

> Functionally: a revoked member must be immediately excluded.

###### Certifications

* The local CINDEX has a unicity constraint on `PUBKEY_FROM, PUBKEY_TO`
* The local CINDEX has a unicity constraint on `PUBKEY_FROM`, except for block#0
* The local CINDEX must not match a MINDEX operation on `PUBLIC_KEY = PUBKEY_FROM, member = false` or `PUBLIC_KEY = PUBKEY_FROM, leaving = true`

> Functionally:
>
> * a block cannot have 2 identical certifications (A -> B)
> * a block cannot have 2 certifications from a same public key, except in block#0
> * a block cannot have a certification to a leaver or an excluded

###### Sources

* The local SINDEX has a unicity constraint on `UPDATE, IDENTIFIER, POS`
* The local SINDEX has a unicity constraint on `CREATE, IDENTIFIER, POS`

> Functionally: 
> * a same source cannot be consumed twice by the block
> * a same output cannot be produced twice by block
>
> But a source can be both created and consumed in the same block, so a *chain of transactions* can be stored at once.

##### Double-spending control

Definitions:

For each SINDEX unique `tx`:

* **inputs** are the SINDEX row matching `UPDATE, tx`
* **outputs** are the SINDEX row matching `CREATE, tx`

> Functionally: we gather the sources for each transaction, in order to check them.

###### CommonBase

Each input has an `InputBase`, and each output has an `OutputBase`. These bases are to be called `AmountBase`.

The `CommonBase` is the lowest base value among all `AmountBase` of the transaction.

For any amount comparison, the respective amounts must be translated into `CommonBase` using the following rule:

```
AMOUNT(CommonBase) = AMOUNT(AmountBase) x POW(10, AmountBase - CommonBase)
```

So if a transaction only carries amounts with the same `AmountBase`, no conversion is required. But if a transaction carries:

* input_0 of value 45 with `AmountBase = 5`
* input_1 of value 75 with `AmountBase = 5`
* input_2 of value 3 with `AmountBase = 6`
* output_0 of value 15 with `AmountBase = 6`

Then the output value has to be converted before being compared:

```
CommonBase = 5

output_0(5) = output_0(6) x POW(10, 6 - 5)
output_0(5) = output_0(6) x POW(10, 1)
output_0(5) = output_0(6) x 10
output_0(5) = 15 x 10
output_0(5) = 150

input_0(5) = input_0(5)
input_0(5) = 45

input_1(5) = input_1(5)
input_1(5) = 75

input_2(5) = input_2(6) x POW(10, 6 - 5)
input_2(5) = input_2(6) x POW(10, 1)
input_2(5) = input_2(6) x 10
input_2(5) = 3 x 10
input_2(5) = 30
```

The equality of inputs and outputs is then verified because:

```
output_0(5) = 150
input_0(5) = 45
input_1(5) = 75
input_2(5) = 30

output_0(5) = input_0(5) + input_1(5) + input_2(5)
150 = 45 + 75 + 30
TRUE
```

###### Amounts

* *Def.*: `InputBaseSum` is the sum of amounts with the same `InputBase`.
* *Def.*: `OutputBaseSum` is the sum of amounts with the same `OutputBase`.
* *Def.*: `BaseDelta = OutputBaseSum - InputBaseSum`, expressed in `CommonBase`
* *Rule*: For each `OutputBase`:
  * if `BaseDelta > 0`, then it must be inferior or equal to the sum of all preceding `BaseDelta`
* *Rule*: The sum of all inputs in `CommonBase` must equal the sum of all outputs in `CommonBase`

> Functionally: we cannot create nor lose money through transactions. We can only transfer coins we own.
> Functionally: also, we cannot convert a superiod unit base into a lower one.

##### Transactions chaining max depth

    FUNCTION `getTransactionDepth(txHash, LOCAL_DEPTH)`:

        INPUTS = LOCAL_SINDEX[op='UPDATE',tx=txHash]
        DEPTH = LOCAL_DEPTH

        FOR EACH `INPUT` OF `INPUTS`
            CONSUMED = LOCAL_SINDEX[op='CREATE',identifier=INPUT.identifier,pos=INPUT.pos]
            IF (CONSUMED != NULL)
                IF (LOCAL_DEPTH < 5)
                    DEPTH = MAX(DEPTH, getTransactionDepth(CONSUMED.tx, LOCAL_DEPTH +1)
                ELSE
                    DEPTH++
                END_IF
            END_IF
        END_FOR

        RETURN DEPTH

    END_FUNCTION

Then:

    maxTxChainingDepth = 0

For each `TX_HASH` of `UNIQ(PICK(LOCAL_SINDEX, 'tx))`:

    maxTxChainingDepth = MAX(maxTxChainingDepth, getTransactionDepth(TX_HASH, 0))

Rule:

    maxTxChainingDepth <= 5

#### Global

Global validation verifies the coherence of a locally-validated block, in the context of the whole blockchain, including the block.

##### INDEX GENERATION

###### Definitions

Here are some references that will be used in next sections.

BINDEX references:

* *HEAD*: the BINDEX top entry (generated for incoming block, precisely)
* *HEAD~1*: the BINDEX 1<sup>st</sup> entry before HEAD (= entry where `ENTRY.number = HEAD.number - 1`)
* *HEAD~n*: the BINDEX n<sup>th</sup> entry before HEAD (= entry where `ENTRY.number = HEAD.number - n`)
* *HEAD~n[field=value, ...]*: the BINDEX entry at *HEAD~n* if it fulfills the condition, null otherwise
* *HEAD~n..m[field=value, ...]*: the BINDEX entries between *HEAD~n* and *HEAD~m*, included, where each entry fulfills the condition
* *HEAD~n.property*: get a BINDEX entry property. Ex.: `HEAD~1.hash` looks at the hash of the entry preceding HEAD.
* *(HEAD~n..m).property*: get all the values of *property* in BINDEX for entries between *HEAD~n* and *HEAD~m*, included.
* *(HEAD~<n>..<m>).property*: same, but <n> and <m> are variables to be computed

Function references:

* *COUNT* returns the number of values in a list of values
* *AVG* computes the average value in a list of values, floor rounded.
* *MEDIAN* computes the median value in a list of values
* *MAX* computes the maximum value in a list of values

> If values count is even, the median is computed over the 2 centered values by an arithmetical median on them, *NOT* rounded.

* *UNIQ* returns a list of the unique values in a list of values
* *PICK* returns a list of the values by picking a particular property on each record
* *INTEGER_PART* return the integer part of a number
* *FIRST* return the first element in a list of values matching the given condition
* *REDUCE* merges a set of elements into a single one, by extending the non-null properties from each record into the resulting record.
* *REDUCE_BY* merges a set of elements into a new set, where each new element is the reduction of the first set sharing a given key.
* *CONCAT* concatenates two sets of elements into a new one

> If there is no elements, all its properties are `null`.

* *NUMBER* get the number part of blockstamp
* *HASH* get the hash part of blockstamp

###### HEAD

The block produces 1 new entry:

    BINDEX (
      version = Version
      size = BlockSize
      hash = BlockHash
      issuer = Issuer
      time = Time
      number = null
      currency = null
      previousHash = null
      previousIssuer = null
      membersCount = null
      issuersCount = null
      issuersFrame = null
      issuersFrameVar = null
      issuerDiff = null
      avgBlockSize = null
      medianTime = null
      dividend = null
      mass = null
      massReeval = null
      unitBase = null
      powMin = PowMin
      udTime = null
      diffTime = null
      speed = null
    )
    
This entry will be refered to as *HEAD* in the following sections, and is added on the top of the BINDEX.

###### BR_G01 - HEAD.number

If HEAD~1 is defined:

    HEAD.number = HEAD~1.number + 1

Else:

    HEAD.number = 0
    
###### BR_G02 - HEAD.previousHash

If `HEAD.number > 0`:

    HEAD.previousHash = HEAD~1.hash

Else:

    HEAD.previousHash = null
    
###### BR_G99 - HEAD.currency

If `HEAD.number > 0`:

    HEAD.currency = HEAD~1.currency

Else:

    HEAD.currency = null
    
###### BR_G03 - HEAD.previousIssuer

If `HEAD.number > 0`:

    HEAD.previousIssuer = HEAD~1.issuer

Else:

    HEAD.previousIssuer = null
    
###### BR_G100 - HEAD.issuerIsMember

If `HEAD.number > 0`:

    HEAD.issuerIsMember = REDUCE(GLOBAL_IINDEX[pub=HEAD.issuer]).member

Else:

    HEAD.issuerIsMember = REDUCE(LOCAL_IINDEX[pub=HEAD.issuer]).member

###### BR_G04 - HEAD.issuersCount
    
If `HEAD.number == 0`:

    HEAD.issuersCount = 0
    
Else:

    HEAD.issuersCount = COUNT(UNIQ((HEAD~1..<HEAD~1.issuersFrame>).issuer))

###### BR_G05 - HEAD.issuersFrame

If `HEAD.number == 0`:

    HEAD.issuersFrame = 1
    
Else if `HEAD~1.issuersFrameVar > 0`:

    HEAD.issuersFrame = HEAD~1.issuersFrame + 1 
    
Else if `HEAD~1.issuersFrameVar < 0`:

    HEAD.issuersFrame = HEAD~1.issuersFrame - 1 
    
Else:

    HEAD.issuersFrame = HEAD~1.issuersFrame

###### BR_G06 - HEAD.issuersFrameVar

If `HEAD.number == 0`:

    HEAD.issuersFrameVar = 0

Else if `HEAD~1.issuersFrameVar > 0`:

    HEAD.issuersFrameVar = HEAD~1.issuersFrameVar + 5*(HEAD.issuersCount - HEAD~1.issuersCount) - 1
    
Else if `HEAD~1.issuersFrameVar < 0`:

    HEAD.issuersFrameVar = HEAD~1.issuersFrameVar + 5*(HEAD.issuersCount - HEAD~1.issuersCount) + 1
    
Else:

    HEAD.issuersFrameVar = HEAD~1.issuersFrameVar + 5*(HEAD.issuersCount - HEAD~1.issuersCount)


###### BR_G07 - HEAD.avgBlockSize

    HEAD.avgBlockSize = AVG((HEAD~1..<HEAD.issuersCount>).size)

###### BR_G08 - HEAD.medianTime

If `HEAD.number > 0`:

    HEAD.medianTime = MEDIAN((HEAD~1..<MIN(medianTimeBlocks, HEAD.number)>).time)

Else:

    HEAD.medianTime = HEAD.time

###### BR_G09 - HEAD.diffNumber

If `HEAD.number == 0`:

    HEAD.diffNumber = HEAD.number + dtDiffEval

Else if `HEAD~1.diffNumber <= HEAD.number`:

    HEAD.diffNumber = HEAD~1.diffNumber + dtDiffEval

Else:

    HEAD.diffNumber = HEAD~1.diffNumber

###### BR_G10 - HEAD.membersCount

If `HEAD.number == 0`:

    HEAD.membersCount = COUNT(LOCAL_IINDEX[member=true])
    
Else:

    HEAD.membersCount = HEAD~1.membersCount + COUNT(LOCAL_IINDEX[member=true]) - COUNT(LOCAL_IINDEX[member=false])

###### BR_G11 - HEAD.udTime and HEAD.udReevalTime

If `HEAD.number == 0`:

    HEAD.udTime = udTime0

Else if `HEAD~1.udTime <= HEAD.medianTime`:

    HEAD.udTime = HEAD~1.udTime + dt

Else:

    HEAD.udTime = HEAD~1.udTime
    
EndIf

If `HEAD.number == 0`:

    HEAD.udReevalTime = udReevalTime0

Else if `HEAD~1.udReevalTime <= HEAD.medianTime`:

    HEAD.udReevalTime = HEAD~1.udReevalTime + dtReeval

Else:

    HEAD.udReevalTime = HEAD~1.udReevalTime
    
EndIf

###### BR_G12 - HEAD.unitBase

If `HEAD.number == 0`:

    HEAD.unitBase = 0
    
Else:

    HEAD.unitBase = HEAD~1.unitBase

###### BR_G13 - HEAD.dividend and HEAD.new_dividend

If `HEAD.number == 0`:

    HEAD.dividend = ud0
    
Else If `HEAD.udReevalTime != HEAD~1.udReevalTime`:

    HEAD.dividend = HEAD_1.dividend + c² * CEIL(HEAD~1.massReeval / POW(10, HEAD~1.unitbase)) / HEAD.membersCount)

Else:

    HEAD.dividend = HEAD~1.dividend
    
EndIf

If `HEAD.number == 0`:

    HEAD.new_dividend = null

Else If `HEAD.udTime != HEAD~1.udTime`:

    HEAD.new_dividend = HEAD.dividend

Else:

    HEAD.new_dividend = null
    
###### BR_G14 - HEAD.dividend and HEAD.unitbase and HEAD.new_dividend

If `HEAD.dividend >= 1000000`    :

    HEAD.dividend = CEIL(HEAD.dividend / 10)
    HEAD.new_dividend = HEAD.dividend
    HEAD.unitBase = HEAD.unitBase + 1
    
###### BR_G15 - HEAD.mass and HEAD.massReeval

If `HEAD.number == 0`:

    HEAD.mass = 0
    
Else if `HEAD.udTime != HEAD~1.udTime`:

    HEAD.mass = HEAD~1.mass + HEAD.dividend * POWER(10, HEAD.unitBase) * HEAD.membersCount

Else:

    HEAD.mass = HEAD~1.mass

EndIf

If `HEAD.number == 0`:

    HEAD.massReeval = 0

Else if `HEAD.udReevalTime != HEAD~1.udReevalTime`:

    HEAD.massReeval = HEAD~1.mass

Else:

    HEAD.massReeval = HEAD~1.massReeval

EndIf

> Functionnally: the UD is reevaluated on the preceding monetary mass (important!)

###### BR_G16 - HEAD.speed

If `HEAD.number == 0`:

    speed = 0
    
Else:

    range = MIN(dtDiffEval, HEAD.number)
    elapsed = (HEAD.medianTime - HEAD~<range>.medianTime)
    
EndIf

If `elapsed == 0`:

    speed = 100

Else:
    speed = range / elapsed

###### BR_G17 - HEAD.powMin

If `HEAD.number > 0 AND HEAD.diffNumber != HEAD~1.diffNumber AND HEAD.speed >= maxSpeed AND (HEAD~1.powMin + 2) % 16 == 0`:

    HEAD.powMin = HEAD~1.powMin + 2
    
Else if `HEAD.number > 0 AND HEAD.diffNumber != HEAD~1.diffNumber AND HEAD.speed >= maxSpeed`:

    HEAD.powMin = HEAD~1.powMin + 1
     
Else if `HEAD.number > 0 AND HEAD.diffNumber != HEAD~1.diffNumber AND HEAD.speed <= minSpeed AND (HEAD~1.powMin) % 16 == 0`:

    HEAD.powMin = MAX(0, HEAD~1.powMin - 2)
    
Else if `HEAD.number > 0 AND HEAD.diffNumber != HEAD~1.diffNumber AND HEAD.speed <= minSpeed`:

    HEAD.powMin = MAX(0, HEAD~1.powMin - 1)

Else if `HEAD.number > 0`:
    
    HEAD.powMin = HEAD~1.powMin

###### BR_G18 - HEAD.powZeros and HEAD.powRemainder

If `HEAD.number == 0`:

    nbPersonalBlocksInFrame = 0
    medianOfBlocksInFrame = 1
    
Else:

    blocksOfIssuer = HEAD~1..<HEAD~1.issuersFrame>[issuer=HEAD.issuer]
    nbPersonalBlocksInFrame = COUNT(blocksOfIssuer)
    blocksPerIssuerInFrame = MAP(
        UNIQ((HEAD~1..<HEAD~1.issuersFrame>).issuer)
            => ISSUER: COUNT(HEAD~1..<HEAD~1.issuersFrame>[issuer=ISSUER]))
    medianOfBlocksInFrame = MEDIAN(blocksPerIssuerInFrame)
    
EndIf
    
If `nbPersonalBlocksInFrame == 0`:
    
    nbPreviousIssuers = 0
    nbBlocksSince = 0

Else:

    last = FIRST(blocksOfIssuer)
    nbPreviousIssuers = last.issuersCount
    nbBlocksSince = HEAD~1.number - last.number
    
EndIf
    
    PERSONAL_EXCESS = MAX(0, ( (nbPersonalBlocksInFrame + 1) / medianOfBlocksInFrame) - 1)
    PERSONAL_HANDICAP = FLOOR(LN(1 + PERSONAL_EXCESS) / LN(1.189))
    HEAD.issuerDiff = MAX [ HEAD.powMin ; HEAD.powMin * FLOOR (percentRot * nbPreviousIssuers / (1 + nbBlocksSince)) ] + PERSONAL_HANDICAP

If `(HEAD.issuerDiff + 1) % 16 == 0`:

    HEAD.issuerDiff = HEAD.issuerDiff + 1

EndIf

Finally:

    HEAD.powRemainder = HEAD.issuerDiff  % 16
    HEAD.powZeros = (HEAD.issuerDiff - HEAD.powRemainder) / 16

###### Local IINDEX augmentation

####### BR_G19 - ENTRY.age

For each ENTRY in local IINDEX where `op = 'CREATE'`:

    REF_BLOCK = HEAD~<HEAD~1.number + 1 - NUMBER(ENTRY.created_on)>[hash=HASH(ENTRY.created_on)]
    
If `HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'`:
    
    ENTRY.age = 0
    
Else if `REF_BLOC != null`:

    ENTRY.age = HEAD~1.medianTime - REF_BLOCK.medianTime
    
Else:

    ENTRY.age = conf.idtyWindow + 1
    
EndIf

###### BR_G20 - Identity UserID unicity

For each ENTRY in local IINDEX:

If `op = 'CREATE'`:

    ENTRY.uidUnique = COUNT(GLOBAL_IINDEX[uid=ENTRY.uid) == 0
    
Else:

    ENTRY.uidUnique = true

###### BR_G21 - Identity pubkey unicity

For each ENTRY in local IINDEX:

If `op = 'CREATE'`:

    ENTRY.pubUnique = COUNT(GLOBAL_IINDEX[pub=ENTRY.pub) == 0
    
Else:

    ENTRY.pubUnique = true

####### BR_G33 - ENTRY.excludedIsMember

For each ENTRY in local IINDEX where `member != false`:

    ENTRY.excludedIsMember = true 

For each ENTRY in local IINDEX where `member == false`:

    ENTRY.excludedIsMember = REDUCE(GLOBAL_IINDEX[pub=ENTRY.pub]).member

####### BR_G35 - ENTRY.isBeingKicked

For each ENTRY in local IINDEX where `member != false`:

    ENTRY.isBeingKicked = false 

For each ENTRY in local IINDEX where `member == false`:

    ENTRY.isBeingKicked = true

####### BR_G36 - ENTRY.hasToBeExcluded

For each ENTRY in local IINDEX:

    ENTRY.hasToBeExcluded = REDUCE(GLOBAL_IINDEX[pub=ENTRY.pub]).kick

###### Local MINDEX augmentation

####### BR_G22 - ENTRY.age

For each ENTRY in local MINDEX where `revoked_on == null`:

    REF_BLOCK = HEAD~<HEAD~1.number + 1 - NUMBER(ENTRY.created_on)>[hash=HASH(ENTRY.created_on)]
    
If `HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'`:
    
    ENTRY.age = 0
    
Else if `REF_BLOC != null`:

    ENTRY.age = HEAD~1.medianTime - REF_BLOCK.medianTime
    
Else:

    ENTRY.age = conf.msWindow + 1
    
EndIf

####### BR_G23 - ENTRY.numberFollowing

For each ENTRY in local MINDEX where `revoked_on == null`:

    created_on = REDUCE(GLOBAL_MINDEX[pub=ENTRY.pub]).created_on
    
If `created_on != null`:

    ENTRY.numberFollowing = NUMBER(ENTRY.created_ON) > NUMBER(created_on)
    
Else:

    ENTRY.numberFollowing = true
    
EndIf

For each ENTRY in local MINDEX where `revoked_on != null`:

    ENTRY.numberFollowing = true

####### BR_G24 - ENTRY.distanceOK

For each ENTRY in local MINDEX where `type == 'JOIN' OR type == 'ACTIVE'`:

    dSen = CEIL(HEAD.membersCount ^ (1 / stepMax))
    
    GRAPH = SET(LOCAL_CINDEX, 'issuer', 'receiver') + SET(GLOBAL_CINDEX, 'issuer', 'receiver')
    SENTRIES = SUBSET(GRAPH, dSen, 'issuer')

    ENTRY.distanceOK = EXISTS_PATH(xpercent, SENTRIES, GRAPH, ENTRY.pub, stepMax)
    
> Functionally: checks if it exists, for at least `xpercent`% of the sentries, a path using GLOBAL_CINDEX + LOCAL_CINDEX leading to the key `PUBLIC_KEY` with a maximum count of `[stepMax]` hops.

For each ENTRY in local MINDEX where `!(type == 'JOIN' OR type == 'ACTIVE')`:

    ENTRY.distanceOK = true

####### BR_G25 - ENTRY.onRevoked

For each ENTRY in local MINDEX:

    ENTRY.onRevoked = REDUCE(GLOBAL_MINDEX[pub=ENTRY.pub]).revoked_on != null

####### BR_G26 - ENTRY.joinsTwice

For each ENTRY in local MINDEX where `op = 'UPDATE', expired_on = 0`:

    ENTRY.joinsTwice = REDUCE(GLOBAL_IINDEX[pub=ENTRY.pub]).member == true

> This rule ensures that someone who is in the `Joiners` field isn't already a member.

####### BR_G27 - ENTRY.enoughCerts

For each ENTRY in local MINDEX where `type == 'JOIN' OR type == 'ACTIVE'`:

    ENTRY.enoughCerts = COUNT(GLOBAL_CINDEX[receiver=ENTRY.pub,expired_on=null]) + COUNT(LOCAL_CINDEX[receiver=ENTRY.pub,expired_on=null]) >= sigQty 
    
> Functionally: any member or newcomer needs `[sigQty]` certifications coming *to* him to be in the WoT

For each ENTRY in local MINDEX where `!(type == 'JOIN' OR type == 'ACTIVE')`:

    ENTRY.enoughCerts = true

####### BR_G28 - ENTRY.leaverIsMember

For each ENTRY in local MINDEX where `type == 'LEAVE'`:

    ENTRY.leaverIsMember = REDUCE(GLOBAL_IINDEX[pub=ENTRY.pub]).member 
    
For each ENTRY in local MINDEX where `type != 'LEAVE'`:

    ENTRY.leaverIsMember = true

####### BR_G29 - ENTRY.activeIsMember

For each ENTRY in local MINDEX where `type == 'ACTIVE'`:

    ENTRY.activeIsMember = REDUCE(GLOBAL_IINDEX[pub=ENTRY.pub]).member

For each ENTRY in local MINDEX where `type != 'ACTIVE'`:

    ENTRY.activeIsMember = true

####### BR_G30 - ENTRY.revokedIsMember

For each ENTRY in local MINDEX where `revoked_on == null`:

    ENTRY.revokedIsMember = true 

For each ENTRY in local MINDEX where `revoked_on != null`:

    ENTRY.revokedIsMember = REDUCE(GLOBAL_IINDEX[pub=ENTRY.pub]).member

####### BR_G31 - ENTRY.alreadyRevoked

For each ENTRY in local MINDEX where `revoked_on == null`:

    ENTRY.alreadyRevoked = false 

For each ENTRY in local MINDEX where `revoked_on != null`:

    ENTRY.alreadyRevoked = REDUCE(GLOBAL_MINDEX[pub=ENTRY.pub]).revoked_on != null

####### BR_G32 - ENTRY.revocationSigOK

For each ENTRY in local MINDEX where `revoked_on == null`:

    ENTRY.revocationSigOK = true 

For each ENTRY in local MINDEX where `revoked_on != null`:

    ENTRY.revocationSigOK = SIG_CHECK_REVOKE(REDUCE(GLOBAL_IINDEX[pub=ENTRY.pub]), ENTRY)

####### BR_G34 - ENTRY.isBeingRevoked

For each ENTRY in local MINDEX where `revoked_on == null`:

    ENTRY.isBeingRevoked = false

For each ENTRY in local MINDEX where `revoked_on != null`:

    ENTRY.isBeingRevoked = true
   
####### BR_G107 - ENTRY.unchainables

If `HEAD.number > 0 AND ENTRY.revocation == null`:

    ENTRY.unchainables = COUNT(GLOBAL_MINDEX[issuer=ENTRY.issuer, chainable_on > HEAD~1.medianTime]))
    
###### Local CINDEX augmentation

For each ENTRY in local CINDEX:

####### BR_G37 - ENTRY.age

    REF_BLOCK = HEAD~<HEAD~1.number + 1 - NUMBER(ENTRY.created_on)>[hash=HASH(ENTRY.created_on)]
    
If `HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'`:
    
    ENTRY.age = 0
    
Else if `REF_BLOC != null`:

    ENTRY.age = HEAD~1.medianTime - REF_BLOCK.medianTime
    
Else:

    ENTRY.age = conf.sigWindow + 1
    
EndIf
    
####### BR_G38 - ENTRY.unchainables

If `HEAD.number > 0`:

    ENTRY.unchainables = COUNT(GLOBAL_CINDEX[issuer=ENTRY.issuer, chainable_on > HEAD~1.medianTime]))
    
####### BR_G39 - ENTRY.stock

    ENTRY.stock = COUNT(REDUCE_BY(GLOBAL_CINDEX[issuer=ENTRY.issuer], 'receiver', 'created_on')[expired_on=0])
    
####### BR_G40 - ENTRY.fromMember

    ENTRY.fromMember = REDUCE(GLOBAL_IINDEX[pub=ENTRY.issuer]).member
    
####### BR_G41 - ENTRY.toMember

    ENTRY.toMember = REDUCE(GLOBAL_IINDEX[pub=ENTRY.receiver]).member
    
####### BR_G42 - ENTRY.toNewcomer

    ENTRY.toNewcomer = COUNT(LOCAL_IINDEX[member=true,pub=ENTRY.receiver]) > 0
    
####### BR_G43 - ENTRY.toLeaver

    ENTRY.toLeaver = REDUCE(GLOBAL_MINDEX[pub=ENTRY.receiver]).leaving
    
####### BR_G44 - ENTRY.isReplay

    reducable = GLOBAL_CINDEX[issuer=ENTRY.issuer,receiver=ENTRY.receiver,expired_on=0]
    
If `count(reducable) == 0`:

    ENTRY.isReplay = false

Else:

    ENTRY.isReplay = reduce(reducable).expired_on == 0
    
####### BR_G45 - ENTRY.sigOK

    ENTRY.sigOK = SIG_CHECK_CERT(REDUCE(GLOBAL_IINDEX[pub=ENTRY.receiver]), ENTRY)

###### Local SINDEX augmentation

####### BR_G102 - ENTRY.age

For each ENTRY in local SINDEX where `op = 'UPDATE'`:

    REF_BLOCK = HEAD~<HEAD~1.number + 1 - NUMBER(ENTRY.hash)>[hash=HASH(ENTRY.created_on)]
    
If `HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'`:
    
    ENTRY.age = 0
    
Else if `REF_BLOC != null`:

    ENTRY.age = HEAD~1.medianTime - REF_BLOCK.medianTime
    
Else:

    ENTRY.age = conf.txWindow + 1
    
EndIf

####### BR_G46 - ENTRY.available and ENTRY.conditions

For each `LOCAL_SINDEX[op='UPDATE'] as ENTRY`:

    INPUT_ENTRIES = LOCAL_SINDEX[op='CREATE',identifier=ENTRY.identifier,pos=ENTRY.pos,amount=ENTRY.amount,base=ENTRY.base]
    If COUNT(INPUT_ENTRIES) == 0 Then
        INPUT_ENTRIES = GLOBAL_SINDEX[identifier=ENTRY.identifier,pos=ENTRY.pos,amount=ENTRY.amount,base=ENTRY.base]
    EndIf
    INPUT = REDUCE(INPUT_ENTRIES)
    ENTRY.conditions = INPUT.conditions
    ENTRY.available = INPUT.consumed == false

####### BR_G47 - ENTRY.isLocked

    INPUT_ENTRIES = LOCAL_SINDEX[op='CREATE',identifier=ENTRY.identifier,pos=ENTRY.pos,amount=ENTRY.amount,base=ENTRY.base]
    If COUNT(INPUT_ENTRIES) == 0 Then
        INPUT_ENTRIES = GLOBAL_SINDEX[identifier=ENTRY.identifier,pos=ENTRY.pos,amount=ENTRY.amount,base=ENTRY.base]
    EndIf
    INPUT = REDUCE(INPUT_ENTRIES)
    ENTRY.isLocked = TX_SOURCE_UNLOCK(INPUT.conditions, ENTRY)
    
####### BR_G48 - ENTRY.isTimeLocked

    INPUT_ENTRIES = LOCAL_SINDEX[op='CREATE',identifier=ENTRY.identifier,pos=ENTRY.pos,amount=ENTRY.amount,base=ENTRY.base]
    If COUNT(INPUT_ENTRIES) == 0 Then
        INPUT_ENTRIES = GLOBAL_SINDEX[identifier=ENTRY.identifier,pos=ENTRY.pos,amount=ENTRY.amount,base=ENTRY.base]
    EndIf
    INPUT = REDUCE(INPUT_ENTRIES)
    ENTRY.isTimeLocked = ENTRY.written_time - INPUT.written_time < ENTRY.locktime

##### Rules

###### BR_G49 - Version

Rule:

If `HEAD.number > 0`:

    HEAD.version == (HEAD~1.version OR HEAD~1.version + 1)

###### BR_G50 - Block size

Rule:

If `HEAD.number > 0`:

    HEAD.size < MAX(500 ; CEIL(1.10 * HEAD.avgBlockSize))

###### BR_G98 - Currency

Rule:

If `HEAD.number > 0`:

    Currency = HEAD.currency

###### BR_G51 - Number

Rule:

    Number = HEAD.number

###### BR_G52 - PreviousHash

Rule:

    PreviousHash = HEAD.previousHash

###### BR_G53 - PreviousIssuer

Rule:

    PreviousHash = HEAD.previousHash

###### BR_G101 - Issuer

Rule:

    HEAD.issuerIsMember == true

###### BR_G54 - DifferentIssuersCount

Rule:

    DifferentIssuersCount = HEAD.issuersCount

###### BR_G55 - IssuersFrame

Rule:

    IssuersFrame = HEAD.issuersFrame

###### BR_G56 - IssuersFrameVar

Rule:

    IssuersFrameVar = HEAD.issuersFrameVar

###### BR_G57 - MedianTime

Rule:

    MedianTime = HEAD.medianTime

###### BR_G58 - UniversalDividend

Rule:

    UniversalDividend = HEAD.new_dividend

###### BR_G59 - UnitBase

Rule:

    UnitBase = HEAD.unitBase

###### BR_G60 - MembersCount

Rule:

    MembersCount = HEAD.membersCount

###### BR_G61 - PowMin

Rule:

If `HEAD.number > 0`:

    PowMin = HEAD.powMin

###### BR_G62 - Proof-of-work

Rule: the proof is considered valid if:

* `HEAD.hash` starts with at least `HEAD.powZeros` zeros
* `HEAD.hash`'s `HEAD.powZeros + 1`th character is:
  * between `[0-F]` if `HEAD.powRemainder = 0`
  * between `[0-E]` if `HEAD.powRemainder = 1`
  * between `[0-D]` if `HEAD.powRemainder = 2`
  * between `[0-C]` if `HEAD.powRemainder = 3`
  * between `[0-B]` if `HEAD.powRemainder = 4`
  * between `[0-A]` if `HEAD.powRemainder = 5`
  * between `[0-9]` if `HEAD.powRemainder = 6`
  * between `[0-8]` if `HEAD.powRemainder = 7`
  * between `[0-7]` if `HEAD.powRemainder = 8`
  * between `[0-6]` if `HEAD.powRemainder = 9`
  * between `[0-5]` if `HEAD.powRemainder = 10`
  * between `[0-4]` if `HEAD.powRemainder = 11`
  * between `[0-3]` if `HEAD.powRemainder = 12`
  * between `[0-2]` if `HEAD.powRemainder = 13`
  * between `[0-1]` if `HEAD.powRemainder = 14`

> N.B.: it is not possible to have HEAD.powRemainder = 15

###### BR_G63 - Identity writability

Rule:

    ENTRY.age <= [idtyWindow]

###### BR_G64 - Membership writability

Rule:

    ENTRY.age <= [msWindow]

###### BR_G108 - Membership period

Rule:

    ENTRY.unchainables == 0

###### BR_G65 - Certification writability

Rule:

    ENTRY.age <= [sigWindow]

###### BR_G66 - Certification stock

Rule:

    ENTRY.stock <= sigStock

###### BR_G67 - Certification period

Rule:

    ENTRY.unchainables == 0

###### BR_G68 - Certification from member

Rule:

If `HEAD.number > 0`:

    ENTRY.fromMember == true

###### BR_G69 - Certification to member or newcomer

Rule:

    ENTRY.toMember == true
    OR
    ENTRY.toNewcomer == true

###### BR_G70 - Certification to non-leaver

Rule:

    ENTRY.toLeaver == false

###### BR_G71 - Certification replay

Rule:

    ENTRY.isReplay == false

###### BR_G72 - Certification signature

Rule:

    ENTRY.sigOK == true

###### BR_G73 - Identity UserID unicity

Rule:

    ENTRY.uidUnique == true

###### BR_G74 - Identity pubkey unicity

Rule:

    ENTRY.pubUnique == true

###### BR_G75 - Membership succession

Rule:

    ENTRY.numberFollowing == true

###### BR_G76 - Membership distance check

Rule:

    ENTRY.distanceOK == true

###### BR_G77 - Membership on revoked

Rule:

    ENTRY.onRevoked == false

###### BR_G78 - Membership joins twice

Rule:

    ENTRY.joinsTwice == false

###### BR_G79 - Membership enough certifications

Rule:

    ENTRY.enoughCerts == true

###### BR_G80 - Membership leaver

Rule:

    ENTRY.leaverIsMember == true

###### BR_G81 - Membership active

Rule:

    ENTRY.activeIsMember == true

###### BR_G82 - Revocation by a member

Rule:

    ENTRY.revokedIsMember == true

###### BR_G83 - Revocation singleton

Rule:

    ENTRY.alreadyRevoked == false

###### BR_G84 - Revocation signature

Rule:

    ENTRY.revocationSigOK == true
    
###### BR_G85 - Excluded is a member

Rule:

    ENTRY.excludedIsMember == true
    
###### BR_G86 - Excluded contains exclatly those to be kicked

Rule:

For each `REDUCE_BY(GLOBAL_IINDEX[kick=true], 'pub') as TO_KICK`:

    REDUCED = REDUCE(GLOBAL_IINDEX[pub=TO_KICK.pub])
    
If `REDUCED.kick` then:

    COUNT(LOCAL_MINDEX[pub=REDUCED.pub,isBeingKicked=true]) == 1
    
Rule:

For each `IINDEX[member=false] as ENTRY`:

    ENTRY.hasToBeExcluded = true

###### BR_G103 - Trancation writability

Rule:

    ENTRY.age <= [txWindow]
    
###### BR_G87 - Input is available

For each `LOCAL_SINDEX[op='UPDATE'] as ENTRY`:

Rule:

    ENTRY.available == true
    
###### BR_G88 - Input is unlocked

For each `LOCAL_SINDEX[op='UPDATE'] as ENTRY`:

Rule:

    ENTRY.isLocked == false
    
###### BR_G89 - Input is time unlocked

For each `LOCAL_SINDEX[op='UPDATE'] as ENTRY`:

Rule:

    ENTRY.isTimeLocked == false
    
###### BR_G90 - Output base

For each `LOCAL_SINDEX[op='CREATE'] as ENTRY`:

Rule:

    ENTRY.unitBase <= HEAD~1.unitBase

##### Post-rules INDEX augmentation

###### BR_G91 - Dividend

If `HEAD.new_dividend != null`:

For each `REDUCE_BY(GLOBAL_IINDEX[member=true], 'pub') as IDTY` then if `IDTY.member`, add a new LOCAL_SINDEX entry:

    SINDEX (
        op = 'CREATE'
        identifier = IDTY.pub
        pos = HEAD.number
        written_on = BLOCKSTAMP
        written_time = MedianTime
        amount = HEAD.dividend
        base = HEAD.unitBase
        locktime = null
        conditions = REQUIRE_SIG(MEMBER.pub)
        consumed = false
    )

For each `LOCAL_IINDEX[member=true] as IDTY` add a new LOCAL_SINDEX entry:

    SINDEX (
        op = 'CREATE'
        identifier = IDTY.pub
        pos = HEAD.number
        written_on = BLOCKSTAMP
        written_time = MedianTime
        amount = HEAD.dividend
        base = HEAD.unitBase
        locktime = null
        conditions = REQUIRE_SIG(MEMBER.pub)
        consumed = false
    )

###### BR_G106 - Low accounts

Set:

    ACCOUNTS = UNIQ(GLOBAL_SINDEX, 'conditions')

For each `ACCOUNTS as ACCOUNT` then:

Set:

    ALL_SOURCES = CONCAT(GLOBAL_SINDEX[conditions=ACCOUNT.conditions], LOCAL_SINDEX[conditions=ACCOUNT.conditions])
    SOURCES = REDUCE_BY(ALL_SOURCES, 'identifier', 'pos')[consumed=false]
    BALANCE = SUM(MAP(SOURCES => SRC: SRC.amount * POW(10, SRC.base)))

If `BALANCE < 100 * POW(10, HEAD.unitBase)`, then for each `SOURCES AS SRC` add a new LOCAL_SINDEX entry:

    SINDEX (
        op = 'UPDATE'
        identifier = SRC.identifier
        pos = SRC.pos
        written_on = BLOCKSTAMP
        written_time = MedianTime
        consumed = true
    )

###### BR_G92 - Certification expiry

For each `GLOBAL_CINDEX[expires_on<=HEAD.medianTime] as CERT`, add a new LOCAL_CINDEX entry:

If `reduce(GLOBAL_CINDEX[issuer=CERT.issuer,receiver=CERT.receiver,created_on=CERT.created_on]).expired_on == 0`:

    CINDEX (
        op = 'UPDATE'
        issuer = CERT.issuer
        receiver = CERT.receiver
        created_on = CERT.created_on
        expired_on = HEAD.medianTime
    )

###### BR_G93 - Membership expiry

For each `REDUCE_BY(GLOBAL_MINDEX[expires_on<=HEAD.medianTime AND revokes_on>HEAD.medianTime], 'pub') as POTENTIAL` then consider `REDUCE(GLOBAL_MINDEX[pub=POTENTIAL.pub]) AS MS`.

If `MS.expired_on == null OR MS.expired_on == 0`, add a new LOCAL_MINDEX entry:

    MINDEX (
        op = 'UPDATE'
        pub = MS.pub
        written_on = BLOCKSTAMP
        expired_on = HEAD.medianTime
    )
    
###### BR_G94 - Exclusion by membership

For each `LOCAL_MINDEX[expired_on!=0] as MS`, add a new LOCAL_IINDEX entry:

    IINDEX (
        op = 'UPDATE'
        pub = MS.pub
        written_on = BLOCKSTAMP
        kick = true
    )
    
###### BR_G95 - Exclusion by certification

For each `LOCAL_CINDEX[expired_on!=0] as CERT`:

Set:

    CURRENT_VALID_CERTS = REDUCE_BY(GLOBAL_CINDEX[receiver=CERT.receiver], 'issuer', 'receiver', 'created_on')[expired_on=0]

If `COUNT(CURRENT_VALID_CERTS) + COUNT(LOCAL_CINDEX[receiver=CERT.receiver,expired_on=0]) - COUNT(LOCAL_CINDEX[receiver=CERT.receiver,expired_on!=0]) < sigQty`, add a new LOCAL_IINDEX entry:

    IINDEX (
        op = 'UPDATE'
        pub = CERT.receiver
        written_on = BLOCKSTAMP
        kick = true
    )

###### BR_G96 - Implicit revocation

For each `GLOBAL_MINDEX[revokes_on<=HEAD.medianTime,revoked_on=null] as MS`:

    REDUCED = REDUCE(GLOBAL_MINDEX[pub=MS.pub])

If `REDUCED.revokes_on<=HEAD.medianTime AND REDUCED.revoked_on==null`, add a new LOCAL_MINDEX entry:

    MINDEX (
        op = 'UPDATE'
        pub = MS.pub
        written_on = BLOCKSTAMP
        revoked_on = HEAD.medianTime
    )

###### BR_G104 - Membership expiry date correction

For each `LOCAL_MINDEX[type='JOIN'] as MS`:

    MS.expires_on = MS.expires_on - MS.age
    MS.revokes_on = MS.revokes_on - MS.age

For each `LOCAL_MINDEX[type='ACTIVE'] as MS`:

    MS.expires_on = MS.expires_on - MS.age
    MS.revokes_on = MS.revokes_on - MS.age

###### BR_G105 - Certification expiry date correction

For each `LOCAL_CINDEX as CERT`:

    CERT.expires_on = CERT.expires_on - CERT.age

##### BR_G97 - Final INDEX operations

If all the rules [BR_G49 ; BR_G90] pass, then all the LOCAL INDEX values (IINDEX, MINDEX, CINDEX, SINDEX, BINDEX) have to be appended to the GLOBAL INDEX.

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
* A transaction must have exactly the same number of signatures and issuers
* A transaction's indexes' (`Inputs` field) value must be less than or equal to the `Issuers` line count
* A transaction must have its issuers appear at least once in the `Inputs` field, where an issuer is linked to `INDEX` by its position in the `Issuers` field. First issuer is `INDEX = 0`.
* A transaction's `Inputs` amount sum must be equal to the `Ouputs` amount sum.
* A transaction cannot have two identical `Inputs`

## Implementations

### APIs

UCP does not impose any particular APIs to deal with UCP data. Instead, UCP prefers to allow for any API definitions using [Peer](#peer) document, and then letting peers deal with the API(s) they prefer themselves.

At this stage, only the [Duniter HTTP API](/HTTP_API.md) (named BASIC_MERKLED_API) is known as a valid UCP API.

## References

* [Relative Theory of the Money](http://en.trm.creationmonetaire.info), the theoretical reference behind Universal Dividend
* [OpenUDC](http://www.openudc.org/), the inspiration project of Duniter
* [Bitcoin](https://github.com/bitcoin/bitcoin), the well known crypto-currency system
