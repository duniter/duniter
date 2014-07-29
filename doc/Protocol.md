# UCP - uCoin Protocol

> This document is to be updated regularly during August 2014

## Contents

* [Contents](#contents)
* [Formats](#formats)
  * [Keyblock](#keyblock)
  * [Keychain](#keychain)
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

## Processing

### Keyblock
A Keyblock can be accepted only if it respects the following rules.

#### Public key
> TODO: a new public key can be added only if it has a valid joining membership.

#### Members exclusion
`MembersChanges` field may contain `-KEY` without corresponding membership **only if** the `KEY` no more match [signatures requirements](#signature-requirements).

#### Signature requirements
A public key cannot be accepted
> TODO: required WoT signatures (quantity & quality) to join in/stay within the community

#### Block's hash
> TODO