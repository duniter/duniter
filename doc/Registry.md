# uCoin Registry protocol

## Contents
* [Introduction](#introduction)
* [Messages](#messages)
    * [Membership](#membership)
    * [Voting](#voting)
    * [Community flow](#community_flow)
* [Rules](#rules)

## Introduction

uCoin already defines several messages describing a currency ([HDC messages](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md)) and its network ([UCG messages](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md)). As it also aims at building an autonomous network regarding Monetary Contract evolution, it requires to define few more messages to handle members and voters changes.

### Membership

In uCoin, member is represented by a PGP key he is supposed to be the owner. To be integrated in an autonomous network of uCoin nodes, the potential member owning the PGP key *has to express its will* to integrate the Community.

This step is done by issuing a the following document:

```bash
Version: 1
Currency: beta_brousouf
Registry: MEMBERSHIP
Issuer: 405715EC64289D1F43808F57EC51F273CBC0FA17
Date: TIMESTAMP
Membership: IN
```

#### Fields details

Field | Description
----- | -----------
`Version` | Denotes the current structure version.
`Currency` | Contains the name of the currency.
`Registry` | Identify the type of document within Registry context.
`Issuer` | Full PGP key fingerprint issuing this message.
`Date` | Creation date of this message. Timestamp. This date may be different from signature's date.
`Membership` | Membership message. Value is either `IN` or `OUT` to express wether a member wishes to opt-in or opt-out the community.

### Voting

Added to membership, a notion of *voting* is handled by uCoin nodes: uCoin nodes will accept Amendments of Monetary Contract only if it gathers enough votes of the Community voters.

Thus, it is required to define who are the voters. In an automated uCoin network, this step is done using the following document:

```bash
Version: 1
Currency: beta_brousouf
Registry: VOTING
Issuer: 405715EC64289D1F43808F57EC51F273CBC0FA17
Date: TIMESTAMP
```

#### Fields details

Field | Description
----- | -----------
`Version` | Denotes the current structure version.
`Currency` | Contains the name of the currency.
`Registry` | Identify the type of document within Registry context.
`Issuer` | Full PGP key fingerprint issuing this message.
`Date` | Creation date of this message. Timestamp. This date may be different from signature's date.

With such message, uCoin node will be able to know that member `Issuer` *wants* its votes to be considered when accepting new Amendments.


### Community flow

Message whose role is to sum up, for a given node, the variations of members & voters to impact for next amendment. Such variations are resulting from [Membership](#membership), [Voting](#voting) and [Public Key](./HDC.md#public-key) documents received for next amendment.

Here is an example of Community Flow:

```bash
Version: 1
Currency: beta_brousouf
Amendment: 54-7F64036BF4ED24027865F0BC17861E23D9CE4CA8
Issuer: 405715EC64289D1F43808F57EC51F273CBC0FA17
Date: 1401798895
MembersJoining: 90-8518C1F053B6F5BB9D27ED37F4061AE5CC083511
MembersLeaving: 2-5A0CEE18613AEEBBBE39B1CDBE627D879CD357EB
VotersJoining: 8-B91D119FE7A22013190B89614BC4A409AC51D149
VotersLeaving: 2-5A0CEE18613AEEBBBE39B1CDBE627D879CD357EB
```

With such message, a node may notify other nodes what Members & Voters changes it is about to vote for next amendment.

This message may be seen as a synchronization & pre-voting protocol concerning members & voters changes, which may potentially differ a lot from one and another.

#### Fields details

Field            | Description
-----            | -----------
`Version`        | Denotes the current structure version.
`Currency`       | Contains the name of the currency.
`Amendment`      | Identify current amendment this node is based upon, thus on which members & voters changes are based.
`Issuer`         | Full PGP key fingerprint issuing this message.
`Date`           | Creation date of this message. Timestamp. This date may be different from signature's date.
`MembersJoining` | [Merkle summary](#merkle_summary) of members potentially joining
`MembersLeaving` | [Merkle summary](#merkle_summary) of members potentially leaving
`VotersJoining`  | [Merkle summary](#merkle_summary) of voters potentially joining
`VotersLeaving`  | [Merkle summary](#merkle_summary) of voters potentially leaving

Note that for Merkle summaries, the reasons why a Merkle summary has some leave or not *is not defined here*, but the Merkles should follow [Registry rules](#rules).

##### Merkle summary

A Merkle summary field is the concatenation of 2 merkle informations: number of leaves and root hash of a [Merkle resource](./HTTP_API.md#merkle-urls).

Format: `LEAVES_COUNT-ROOT_HASH`.

###### Example

Value `90-8518C1F053B6F5BB9D27ED37F4061AE5CC083511` is a Merkle summary of a Merkle resource holding `90` leaves and whose root hash is `8518C1F053B6F5BB9D27ED37F4061AE5CC083511`.

## Rules
