# uCoin Synchronization messages format

## Contents
* [Introduction](#introduction)
* [Membership](#membership)
* [Voting](#voting)

## Introduction

uCoin already defines several messages describing a currency ([HDC messages](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md)) and its network ([UCG messages](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md)). As it also aims at building an autonomous network regarding Monetary Contract evolution, it requires to define few more messages to handle members and voters changes.

## Membership

In uCoin, member is represented by a PGP key he is supposed to be the owner. To be integrated in an autonomous network of uCoin nodes, the potential member owning the PGP key *has to express its will* to integrate the Community.

This step is done by issuing a the following document:

```bash
Version: 1
Currency: beta_brousouf
Issuer: 405715EC64289D1F43808F57EC51F273CBC0FA17
Membership: JOIN
```

### Fields details

Field | Description
----- | -----------
`Version` | Denotes the current structure version.
`Currency` | Contains the name of the currency.
`Issuer` | Full PGP key fingerprint issuing this message.
`Membership` | Membership message. Value is either `JOIN`, `ACTUALIZE` or `LEAVE` to express wether a member wishes to join, confirm its status in, or leave the community.

## Voting

Added to membership, a notion of *voting* is handled by uCoin nodes: uCoin nodes will accept Amendments of Monetary Contract only if it gathers enough votes of the Community voters.

Thus, it is required to define who are the voters. In an automated uCoin network, this step is done using the following document:

```bash
Version: 1
Currency: beta_brousouf
Issuer: 405715EC64289D1F43808F57EC51F273CBC0FA17
VotingKey: 8E02FAFC90EDECB451086285DDD99C17AE19CF3F
```

### Fields details

Field | Description
----- | -----------
`Version` | Denotes the current structure version.
`Currency` | Contains the name of the currency.
`Issuer` | Full PGP key fingerprint issuing this message.
`VotingKey` | Defines the key to be used by `Issuer` for voting.

With such message, uCoin node will be able to know that member `Issuer` *wants its votes to be considered when accepting new Amendments, and that this member will use key `VotingKey` to express its future votes.
