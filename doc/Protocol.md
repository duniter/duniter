# UCP - uCoin Protocol

> This document is to be updated regularly during August 2014

## Contents

* [Contents](#contents)
* [Formats](#formats)
  * [Keyblock](#keyblock)
  * [Keychain](#keychain)
* [Variables](#variables)
  * [Protocol parameters](#protocol-parameters)
  * [Computed variables](#computed-variables)
* [Processing](#processing)
  * [Keyblock](#keyblock-1)

## Formats

This section deals with the various data format used by UCP.

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

### Keychain
A Keychain is a chaining of Keyblock. Such a document describes a WoT over the time.

#### Data
Each keyblock, other than the keyblock#0 must follow the following rules:

* Its `Number` field has the same value as preceding keyblock + 1
* Its `Currency` field has exactly the same value as preceding keyblock
* Its `PreviousHash` field match the uppercased SHA-1 fingerprint of the whole previous block
* Its `PreviousIssuer` field match the key fingerprint of the previous block's signatory
* Its `MembersCount` field is the sum of all `+` count minus the sum of all `-` count from `MembersChanges` field since keyblock#0, this block included

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