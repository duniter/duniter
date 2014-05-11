# UCP - uCoin Protocol

As a mean to build new currencies based on individuals and Universal Dividend, **uCoin defines its own protocol** called *UCP* which defines messages, interpretation of them and structuration rules *allowing to build a uCoin distributed data network*.

This document is divided in two parts:

* [Definitions](#definitions), which describes uCoin actors and data
* [Data flow](#data-flow), which defines few rules and recommandations on how manage uCoin data.

## Contents

* [Contents](#contents)
* [Definitions](#definitions)
  * [HDC data](#hdc-data)
    * [Public keys](#pgp-public-keys)
    * [Amendments](#amendaments)
    * [Transactions](#transactions)
  * [Network data](#network-data)
    * [Peers](#peers)
    * [Forwards](#forwards)
    * [Status](#status)
    * [Trust entries](#trust-entries)
* [Data flow](#data-flow)
  * [Definitions](#definitions2)
  * [APIs](#apis)
  * [General behaviours](#general-behaviors)
      * [Public keys reponsability](#public-keys-reponsability)
      * [Wallet content](#wallet-content)
  * [Particular behaviours](#particular-behaviors)
      * [Peers discovering](#peers-discovering)

## Definitions

uCoin (upper-cased *C*) word is the generic name covering uCoin project, whose goal is to build a P2P crypto-currency system. In its technical details, uCoin can be divided in two parts:

1. uCoin node: a unit running uCoin software on personal or company server listening for and storing uCoin data
2. uCoin network: a network of uCoin nodes, or peers, sharing data between them and displaying this data to whoever wants to check it

UCP defines what should be a uCoin node and how it should behave to spread uCoin messages over the network, in order to create a uCoin based currency.

### HDC data

The whole point of a uCoin node is to build a database of [HDC data](./HDC.md), which is a structure to describe a Universal Dividend currency. For that purpose, a node will listen to incoming data over the network an store it according to UCP rules.

#### PGP public keys

PGP public keys are the foundation of uCoin data. In uCoin, any data is signed using a PGP key giving it authenticity, and *then* the eligibility to be stored. A non-signed data is just to be thrown away from UCP point of view.

A key represents an actor, which may be either an individual or an organization, or even a robot under their control. PGP keys are uniquely identified by their PGP fingerprint and are used under their ASCII-armored format.

> Note: it is well known that fingerprint should not be considered as unique. UCP answers this below in the protocol under the title [Public keys reponsability](./#public-keys-reponsability)

#### Amendments

Amendments are inner parts of a document called the *Monetary Contract*. In uCoin, the Monetary Contract is the main document defining currency name, Community members, voters and monetary unities. Amendments are just the parts which, placed end-to-end, *constitue* the Monetary Contract.

Amendments are collectively signed documents refering to [HDC Amendment format](./HDC.md#amendment) allowing to define a currency, members, voters and periodical Universal Dividend.

##### Votes

A vote is a simple signature of an amendment, and is then submitted to the network. When a voter signs an amendment and submit the signatures to a node, it expresses the will of this voter to promote the signed amendment.

> A vote is not to be taken in account if the voter does not belong to voters, whose composition is given by the Contract

#### Transactions

Transaction is a document refering to [HDC Transaction format](./HDC.md#transaction) whose role is transfer coins from one wallet to another. It is the final support of money and it materializes money ownership.

### Network data

Network data is a list of messages used for uCoin peering features. This is what make a network of nodes possible.

#### Peers

uCoin network is made up of peers identified by their PGP fingerprint. In UCP, each node maintains a Peering table which is a hash table linking a PGP fingerprint to one or several network protocols. This link is made through a document called [Peering entry](./Network.md#peering-table) signed by the owner of the PGP key and giving peer's network informations. Peering table is a set of all peering entries.

#### Forwards

[Forward](./Network.md#forward-request) is a document signed by a node giving rules for data forwarding. Forward can be seen as a routing rule nodes use to find where to send received data. This is a multicast mecanism.

#### Status

[Status](./Network.md#status-request) messages are notifications nodes exchanges to introduce them to other nodes, notify their state and eventually trigger exchanges of informations between them.

#### Wallets

[Wallet](./Network.md#wallet-message-structure) is a document whose role is to define a wallet, a uCoin entity used for storing coins. A Wallet notably defines: 
* its key for managing the coins
* the nodes storing this wallet
* the nodes the key requires validatin for incoming transactions

Wallets are the conceptual container of transactions, which are themselves the conceptual support of money ownership.

## Data flow

### Definition

Data flow in uCoin refers to the circulation of data inside a uCoin network. Indeed, a uCoin network is made up of uCoin nodes, represented by their own public key, and displaying their own and unique monetary point of view for a given currency.

> It is important to note that nodes **MAY NOT** share the exactly same point of view, i.e. storing different data on one hand, and/or storing data with same name but different content. Thus, an implementation **SHOULD NOT** consider a given identified data to be the same on different nodes.

The sum of each nodes' point of view is to be seen as the *network* point of view.

**The goal of a uCoin network is to do its best to share a common point of view of monetary data.**

### APIs

APIs are left to uCoin implementations. Such implementations are described in each peer's [record](./Network.md#peering-entry). Any node may have any number of available APIs.

Obviously, a node with no API at all is a non-sense.

To be valid, any API **MUST** provide ways to:
* Submit HDC Data
* Submit Network Data
* Display the node's public key
* Display the node's peering entry
* Access to stored public keys
* Access to stored HDC data
* Access to stored Network data

### General behaviours

Any uCoin node **SHOULD BE** considered as a passive entity of the network. Nodes can be seen as witnesses of the monetary activity: public keys, contract and transactions, and do not particularly need to talk with each other.

However, this behavior is to balanced with the need to collaborate in order to share a common point of view. That is why at least 2 exceptions exist:
* when receiving data, nodes **SHOULD** try spread the network of this data using multicast rules. This behavior is left to implementations' will.
* to build a network, nodes need to introduce themselves to know each other. Futhermore, nodes **SHOULD** try to build routes for transactions' multicasting. This behavior **MUST** be implemented, and is described below.

#### Public keys reponsability

As a consequence of the preceding assumption that "nodes may not share the exactly same point of view", public keys may not be the same from a node to another. **This has a huge impact**: fr a given KeyID (key fingerprint), 2 nodes may refer to 2 different keys, if such keys exist.

In uCoin protocol, **nodes are considered responsible in the way they accept public keys** and are not told how to handle it. Such ways are implementation specific. Obviously, if it was wanted to make a uCoin network, nodes of such network should agree on a common way to accept/reject keys.

#### Wallet content

Just like the above paragraph about Public keys, wallet content is purely relative point of view to nodes handling the wallet. An implementation **SHOULD** consider the content of a wallet in coins following the below rule of Wallet message:

> A node should consider a transaction as valid for a wallet either if:
> * the sending wallet is handled by the node
> * or the recepient wallet is handled by the node **AND** the number of nodes confirming the transaction, among those trusted by the recipient wallet, reach at least the minimum number or confirmations asked by it

### Particular behaviors

The general behavior of a node as a passive entity is balanced with the following behavior about networking purpopses.

#### Peers discovering

The network needs to be able to discover new peers inside it. For that purpose [Status](./#status) messages are used to introduce nodes to each other, and keep a state of them allowing data propagation.

Protocol is the following: for a given node, receives `Receives` message, it should apply `Impacts` rules and MUST answer using `Answers` status type.

Receives   | Answers    | Impacts
--------   | -------    | --------
`ASK`      |            | Answer the estimated status of the node toward asking node. Answer can be any status other than `ASK`.
`NEW`      | `NEW_BACK` | Remove any existing route for transactions form emitting node. Consider the node as able to receive data. Send `NEW_BACK` as a response. May also send new `Forward` rule.
`NEW_BACK` |            | Remove any existing route for transactions form emitting node. Consider the node as able to receive data.
`UP`       |            | Consider the node as able to receive data.
`DOWN`     |            | Consider the node as *no more* able to receive data.
