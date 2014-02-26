# UCP - uCoin Protocol

As a mean to build new currencies based on individuals and Universal Dividend, *uCoin defines its own protocol called UCP* which defines messages, interpretation of them and structuration rules *allowing to build a uCoin distributed data network*.

This document is divided in two parts:

* [Definitions](#definitions), which describes uCoin actors (human, machines) and data, and their mutual behaviors.
* [Data flow](#data-flow), which is an overview of [uCoin HTTP API](https://github.com/c-geek/ucoin/blob/master/doc/HTTP_API.md) - a guide to understand API purposes detailing each method's responsability.

## Contents

* [Contents](#contents)
* [Definitions](#definitions)
  * [uCoin HDC data](#ucoin-hdc-data)
    * [Public keys](#pgp-public-keys)
    * [Amendments](#amendaments)
    * [Transactions](#transactions)
  * [uCoin UCG data](#ucoin-ucg-data)
    * [Peers](#peers)
    * [Forwards](#forwards)
    * [Status](#status)
    * [Trust entries](#trust-entries)
  * [uCoin network](#ucoin-network)
    * [Peering](#peering)
    * [Status](#status-1)
    * [Data routing](#data-routing)
      * [General case](#general-case)
      * [Forward routes](#forward-routes)
* [Data flow](#data-flow)
  * [Public keys](#public-keys)
  * [UCG messages](#ucg-messages)
  * [HDC Amendments](#hdc-amendments)
  * [HDC Transactions](#hdc-transactions)

## Definitions

uCoin (upper-cased *C*) word is the generic name covering uCoin project, whose goal is to build a P2P crypto-currency system. In its technical details, uCoin can be divided in two parts:

1. uCoin node: a unit running a uCoin software on personal or company servers listening for and storing uCoin data
2. uCoin network: a network of uCoin nodes, sharing data between them and displaying this data to whoever wants to check it

UCP defines what should be a uCoin node and its behavior according to uCoin messages over the network. A network of such nodes holding uCoin data can *then* be seen as a *Distributed uCoin Transactions Database*.

### uCoin HDC data

The whole point of a uCoin node is to build a database of [HDC data](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md). For that purpose, a node will listen to incoming data over the network an store it according to UCP rules.

#### PGP public keys

PGP public keys are the foundation of uCoin data. In uCoin, any data is signed using a PGP key giving it authenticity, and *then* the eligibility to be stored. A non-signed data is just to be thrown away from UCP point of view.

A key represents an actor, which may be either an individual or an organization, or even a robot under their control. PGP keys are uniquely identified by their PGP fingerprint and are used under their ASCII-armored format.

#### Amendments

Amendments are inner parts of a document called the *Monetary Contract*. In uCoin, the Monetary Contract is the main document defining currency name, Community members, voters and monetary unities. Amendments are just the parts which, placed end-to-end, *constitue* the Monetary Contract.

Amendments are collectively signed documents refering to [HDC Amendment format](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#amendment) allowing to define a currency, members or voters joining or leaving, and periodical Universal Dividend.

##### Votes

A vote is a simple signature of an amendment, refering to [HDC Vote request](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#vote-request). When a voter signs an amendment and submit the signatures to a node, it expresses the will of this voter (if he can legitimately do it, i.e. if he is part of voters written in Monetary Contract) to promote the signed amendment.

#### Transactions

Transaction is a document refering to [HDC Transaction format](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#transaction) whose role is either to create, change or transfer money. It is the final support of money and it materializes money ownership.

### uCoin UCG data

UCG data is a list of messages used for uCoin peering features. This is what make a network of nodes possible.

#### Peers

uCoin network is made up of peers identified by their PGP fingerprint. In UCP, each node maintains a Peering table which is a hash table linking a PGP fingerprint to network data: IP address (v4, v6, or both), DNS name and port. This link is made through a document called [peering entry](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md#peering-table) signed by the owner of the PGP key and giving peer's network informations. Peering table is a set of all peering entries.

#### Forwards

[Forward](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md#forward-request) is a document signed by a node giving rules for data forwarding. Forward can be seen a routing rule that nodes use to know where to send received data. This mecanism helps not to broadcast all transactions to the whole network each time, but only to the interested nodes.

#### Status

[Status](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md#status-request) messages are just notifications nodes use between them to know their state and eventually trigger exchanges of informations between them.

#### Trust entries

Trust entries are part of a hash table refering to [UCG THT format](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md#trust-hash-table) whose role is to define, for a given PGP key, the nodes by which every transaction of the key pass through and the nodes the key is likely to trust for incoming transactions. Such entries are written and signed by PGP keys managing money units.

### uCoin network

A uCoin node is a simple unit of a uCoin network, unit by which circulate uCoin HDC data. To be able to be part of a network, uCoin units uses UCG messages to introduce each other and exchange HDC data. Below are definitions of UCG messages events and behaviors.

#### Peering

When a node is started, it already knows its remote peering informations, i.e. IP address and port plus its own public key PGP fingerprint. This informations are to be gathered and represent peering entry of the node. Thus, any node has its own peering entry and must display it.

To be known by others peers, a node should broadcast his signed peering entry to them using `/ucg/peering/peers (POST)` interface. Of course, those peers has to be notified the node's key first so then cas verify peering entry's signature.

*The way the node is aware of other peers addresses to send them his peering entry is implementation specific.*

#### Status

Each node may send Status requests. Such requests send either status:

* `NEW` to say the node consider itself as new to requested node
* `UP` to say the node consider itself as waking up to requested node (i.e. a `NEW` request was already sent before)
* `DOWN` to say the node consider itself as waking down to requested node (i.e. an `UP` request was already sent before)

*The way other nodes may react asynchronously to such requests is implementation specific.*

#### Data routing

When receiving new data such as Public key or Transaction, a uCoin node should forward it to other known peers. However, uCoin recommend 2 different behavior according to the following rules.

##### General case

For any data that is not either:

* Transaction related
* Forward related

then data should be broadcasted to all other known peers. Note that a data passing two times through a node should be broadcasted only once.

##### Forward routes

For Transaction or Forward case, data should be smartly forwarded. That is:

* if a Transaction matches Forward rules for its issuer or recipient, then it should forward this transaction to the peer pointed by the `From` field of a Forward document.
* if a Forward document is received, then it should be forwarded to the peer pointed by the `To` field of the Forward. Indeed, this document is destinated to pointed peer and should be given to it.

## Data flow

### Definition

To feed a node and synchronise it with other nodes, UCP defines an [HTTP API](https://github.com/c-geek/ucoin/blob/master/doc/HTTP_API.md) used either to receive or send messages.

As a generic overview, it can be noted what are the API inputs of the protocol:

Flow | Interfaces
---- | -----------
IN   | `pks/add`
IN   | `ucg/peering/peers (POST)`
IN   | `ucg/peering/forward`
IN   | `ucg/peering/status`
IN   | `ucg/tht (POST)`
IN   | `hdc/amendments/votes (POST)`
IN   | `hdc/transactions/process`

All remainging URLs only have consultation purposes, used for verification and synchronization with other clients or peers.

### Public keys

Flow | Interfaces
---- | -----------
IN   | `pks/add`
OUT  | `pks/lookup`
OUT  | `pks/all`

#### `pks/add`

Takes a PGP public key and a signature of the whole key (ascii-armored format). If the signature matches (key was sent by its owner), adds the key to the PGP public keys database.

#### `pks/lookup`

Serves PGP public keys according to HKP protocol.

#### `pks/all`

Merkle URL pointing to a set of all PGP public key registered by the node. Mainly used for synchronization purposes.

### UCG messages

#### Self

This API is special, as it does not deal with HTTP received data. This set of URLs gives peering informations according to *a node's configuration*.

Flow | Interfaces
---- | -----------
OUT  | `ucg/pubkey`
OUT  | `ucg/peering`
OUT  | `ucg/peering/keys`
OUT  | `ucg/peering/peer`

##### `ucg/pubkey`

Get the public key of the node, ASCII-armored format. This key is used to authentify the node's responses by other peers.

##### `ucg/peering`

Get a sum up of node's informations, notably peering and Monetary Contract state.

##### `ucg/peering/keys`

Merkle URL referencing the PGP keys' fingerprint whose transactions are stored by this node.

##### `ucg/peering/peer`

Peering entry of the node.

#### Peers

Interface whose role is to network informations of peers.

Flow | Interfaces
---- | -----------
IN   | `ucg/peering/peers (POST)`
OUT  | `ucg/peering/peers (GET)`


##### `ucg/peering/peers (POST)`

Receive peering entry with signature of it. Signature must match PGP fingerprint written in the entry.

##### `ucg/peering/peers (GET)`

Merkle URL referencing a set of all peering entries. Used for synchronizing peering entries between peers.

#### Forwarding

Interface whose role is to define network rules for transactions propagation.

Flow | Interfaces
---- | -----------
IN   | `ucg/peering/forward`
OUT  | `ucg/peering/peers/upstream`
OUT  | `ucg/peering/peers/upstream/[PGP_FINGERPRINT]`
OUT  | `ucg/peering/peers/downstream`
OUT  | `ucg/peering/peers/downstream/[PGP_FINGERPRINT]`

##### `ucg/peering/forward`

Receive forward rule issued by a peer to be forwarded transactions of precised keys (either some, or all).

##### `ucg/peering/peers/upstream`

GET a list of peering entries **of nodes who asked** to be forwarded of ALL incoming transactions.

##### `ucg/peering/peers/upstream/[PGP_FINGERPRINT]`

GET a list of peering entries **of nodes who asked** to be forwarded of PGP_FINGERPRINT's incoming transactions.

##### `ucg/peering/peers/downstream`

GET a list of peering entries **to whom this node asked** to be forwarded of ALL incoming transactions.

##### `ucg/peering/peers/downstream/[PGP_FINGERPRINT]`

GET a list of peering entries **to whom this node asked** to be forwarded of PGP_FINGERPRINT's incoming transactions.

#### Status

This interface does not provide output information. It is only here to notify the status of a node.

Flow | Interfaces
---- | -----------
IN   | `ucg/peering/status`

Receive a status notification from another peer.

#### Trust Hash Table (THT)

Interface whose role is to gather informations of transactions storage distribution troughout peers network.

Flow | Interfaces
---- | -----------
IN   | `ucg/tht (POST)`
OUT  | `ucg/tht (GET)`
OUT  | `ucg/tht/[PGP_FINGERPRINT]`

##### `ucg/tht (POST)`

Receive a THT entry, issued by the owner of the key precised in the entry.

##### `ucg/tht (GET)`

Merkle URL referencing a set of ALL THT entries.

##### `ucg/tht/[PGP_FINGERPRINT]`

GET the THT entry issued by key whose fingerprint is PGP_FINGERPRINT.

### HDC Amendments

Interface whose role is to handle Monetary Contract amendments.

Flow | Interfaces
---- | -----------
IN   | `hdc/amendments/votes (POST)`
OUT  | `hdc/amendments/votes (GET)`
OUT  | `hdc/amendments/votes/[AMENDMENT_ID]`
OUT  | `hdc/amendments/current`
OUT  | `hdc/amendments/current/votes`
OUT  | `hdc/amendments/promoted`
OUT  | `hdc/amendments/promoted/[AMENDMENT_NUMBER]`
OUT  | `hdc/amendments/view/[AMENDMENT_ID]/self`
OUT  | `hdc/amendments/view/[AMENDMENT_ID]/members`
OUT  | `hdc/amendments/view/[AMENDMENT_ID]/voters`
OUT  | `hdc/amendments/view/[AMENDMENT_ID]/signatures`

#### `hdc/amendments/votes (POST)`

Takes an amendment and a signature of it. If the following conditions matches:

* The signature matches the amendment content
* The signing key is a member eligible to voting
* The amendment voting chain is either 1) already recorded on the node or 2) available to download on another node, and can be verified (i.e, can be authenticated)

add the amendment to pending amendment database with the signature attached.

If the resulting pending amendment have enough votes (this requirement is implementation specific), then the amendment has to be promoted to `hdc/amendments/current`.

#### `hdc/amendments/votes (GET)`

GET an index containing all received amendments (through voting), and number of votes for each amendment (amendment is represented by a number and hash).

#### `hdc/amendments/votes/[AMENDMENT_ID]`

Merkle URL referencing a set of ALL votes received by this node for amendment AMENDMENT_ID.

#### `hdc/amendments/current`

Serves the currently promoted amendment.

#### `hdc/amendments/current/votes`

Same as `hdc/amendments/votes/[AMENDMENT_ID]`, but for currently promoted amendment.

#### `hdc/amendments/promoted`

Same as `hdc/amendments/current`.

#### `hdc/amendments/promoted/[AMENDMENT_NUMBER]`

Serves an amendment is the promoted chain whose number is AMENDMENT_NUMBER.

#### `hdc/amendments/view/[AMENDMENT_ID]/self`

Serves amendment with given identifier.

#### `hdc/amendments/view/[AMENDMENT_ID]/members`

Merkle URL referencing a set of PGP public keys fingerprints considered as the members of the monetary community for amendment AMENDMENT_ID.

#### `hdc/amendments/view/[AMENDMENT_ID]/voters`

Merkle URL referencing a set of PGP public keys fingerprints considered as the voters of the monetary community for amendment AMENDMENT_ID.

#### `hdc/amendments/view/[AMENDMENT_ID]/signatures`

Merkle URL referencing a set of signatures recognized as votes of the previous amendment, and whose Merkle root matches `PreviousVotesRoot` of the amendment AMENDMENT_ID.

### HDC Transactions

Flow | Interfaces
---- | -----------
IN   | `hdc/transactions/process`
OUT  | `hdc/transactions/all`
OUT  | `hdc/transactions/sender/[PGP_FINGERPRINT]`
OUT  | `hdc/transactions/recipient/[PGP_FINGERPRINT]`
OUT  | `hdc/transactions/view/[TRANSACTION_ID]`
OUT  | `hdc/coins/[PGP_FINGERPRINT]/list`
OUT  | `hdc/coins/[PGP_FINGERPRINT]/view/[COIN_ID]`

#### `hdc/transactions/process`

Takes a transaction and a signature of it.

##### Transaction type: ISSUANCE

If the following conditions matches:

* The signature matches the transaction content
* The `Sender` is handled by this node
* The `Recipient` is handled by this node
* The creation is justified by an amendment
* The creation is justified according to transactions history (money was not already created)

adds the transaction to the transactions' database, and send it to others concerned nodes (through the THT) to validate the transaction and mark it as processed.

##### Transaction type: TRANSFER

If the following conditions matches:

* The signature matches the transaction content
* The `Sender` is handled by this node
* The `Recipient` is handled by this node
* The transaction chain matches (may need to ask many nodes for transaction history)

adds the transaction to the transactions' database, and send it to others concerned nodes (through the THT) to validate the transaction and mark it as processed.

##### Transaction type: CHANGE

Takes a transaction and a signature of it. If the following conditions matches:

* The signature matches the transaction content
* The `Sender` is handled by this node
* The `Recipient` is handled by this node
* The transaction chain matches
* The transaction has a valid change content

adds the transaction to the transactions' database, and send it to others concerned nodes (through the THT) to validate the transaction and mark it as processed.

#### `hdc/transactions/all`

Serves a Merkle tree containing all the transactions stored by this node.

#### `hdc/transactions/sender/[PGP_FINGERPRINT]`

Serves a Merkle tree containing all the transactions stored by this node, filtered for a given `Sender`.

#### `hdc/transactions/recipient/[PGP_FINGERPRINT]`

Serves a Merkle tree containing all the transactions stored by this node, filtered for a given `Recipient`.

#### `hdc/transactions/view/[TRANSACTION_ID]`

Serves a transaction content by its ID.

#### `hdc/coins/[PGP_FINGERPRINT]/list`

Serves a list of coins considered as owned by the given `PGP_FINGERPRINT`.

#### `hdc/coins/[PGP_FINGERPRINT]/view/[COIN_ID]`

Serves a transaction chain (may not be complete, i.e. long enough to reach issuance transaction) justifying money ownership.
