# UCP - uCoin Protocol

uCoin defines its own protocol called UCP which defines messages, interpretation of them and structuration rules in order to build new currencies based on individuals and Universal Dividend.

## Contents

* [Database](#database)
* [Dataflow](#dataflow)
  * [Definition](#definition-1)
  * [PGP keys](#pgp-public-keys-1)
  * [Peering](#peering)
  * [Amendments](#amendments-1)
  * [Transactions](#transactions-1)
* [Bootstraping](#bootstraping)

## Database

### Definition

The whole point of uCoin is to build a database describing a currency in HDC format. For that purpose, UCP considers each node have its own datasource able to manage the following entites.

### PGP public keys

PGP public keys are cryptographic keys representing either an individual or an organization. PGP keys are uniquely identified by their PGP fingerprint.

PGP keys must be available under ASCII-armored format.

### Amendments

Amendments are collectively signed documents refering to [HDC Amendment format](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#amendment) allowing to define a currency, its Community members and voters. It is also the document justifying money issuance *by* the members.

### Votes

A vote is a simple signature of an amendment, refering to [HDC Vote request](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#vote-request). When a voter signs an amendment and submit the signatures to nodes, it expresses the will of this voter (if he can legitimately do it, i.e. if he is part of voters written in Monetary Contract) to promote the signed amendment.

### Transactions

Transaction is a document refering to [HDC Transaction format](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#transaction) whose role is either to create, fusion or transfert money. It is the final support of money and it materializes money ownership.

### Peering Table

uCoin network is made up of peers identified by their PGP fingerprint. Peering table is a hash table linking a PGP fingerprint to connection data: IP address (v4, v6, or both), DNS name and port. This link is made through a document called *peering entry* signed by the owner of the PGP key and giving peer's network informations. Peering table is a set of all peering entries.

### Trust Hash Table

THT is a hash table refering to [UCG THT format](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md#trust-hash-table) whose role is to define, for a given PGP key, the nodes by which every transaction of the key pass through and the nodes the key is likely to trust for incoming transactions.

## Dataflow

### Definition

To feed the database and synchronise with other nodes, UCP defines [HTTP API](https://github.com/c-geek/ucoin/blob/master/doc/HTTP_API.md) used either to receive or send messages.

As a generic overview, it can be noted what are the API inputs of the protocol:

Flow | Interfaces
---- | -----------
IN   | `pks/add`
IN   | `ucg/peering/peers (POST)`
IN   | `ucg/peering/forward`
IN   | `ucg/peering/status`
IN   | `ucg/tht (POST)`
IN   | `hdc/amendments/votes (POST)`
IN   | `hdc/transactions/process/issuance`
IN   | `hdc/transactions/process/transfert`
IN   | `hdc/transactions/process/fusion`

All remainging URLs are only outputs of the protocol allowing consultation, verification, synchronization with other clients or peers.

### PGP public keys

Flow | Interfaces
---- | -----------
IN   | `pks/add`
OUT  | `pks/lookup`
OUT  | `pks/all`

#### `pks/add`

Takes a PGP public key and a signature of the whole key. If the signature matches (key was sent by its owner), adds the key to the PGP public keys database.

#### `pks/lookup`

Serves PGP public keys according to HKP protocol.

#### `pks/all`

Merkle URL pointing to a set of all PGP public key registered by the node. Mainly used for synchronization purposes.

### Peering

#### Self

This API is special, as it does not deal with HTTP received data. This set of URL gives peering informations according to *a node's configuration*.

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

### Amendments

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

### Transactions

Flow | Interfaces
---- | -----------
IN   | `hdc/transactions/process/issuance`
IN   | `hdc/transactions/process/transfert`
IN   | `hdc/transactions/process/fusion`
OUT  | `hdc/transactions/all`
OUT  | `hdc/transactions/sender/[PGP_FINGERPRINT]`
OUT  | `hdc/transactions/recipient/[PGP_FINGERPRINT]`
OUT  | `hdc/transactions/view/[TRANSACTION_ID]`
OUT  | `hdc/coins/[PGP_FINGERPRINT]/list`
OUT  | `hdc/coins/[PGP_FINGERPRINT]/view/[COIN_ID]`

#### `hdc/transactions/process/issuance`

Takes a transaction and a signature of it. If the following conditions matches:

* The signature matches the transaction content
* The `Sender` is handled by this node
* The `Recipient` is handled by this node
* The creation is justified by an amendment
* The creation is justified according to transactions history (money was not already created)

adds the transaction to the transactions' database, and send it to others concerned nodes (through the THT) to validate the transaction and mark it as processed.

#### `hdc/transactions/process/transfert`

Takes a transaction and a signature of it. If the following conditions matches:

* The signature matches the transaction content
* The `Sender` is handled by this node
* The `Recipient` is handled by this node
* The transaction chain matches (may need to ask many nodes for transaction history)

adds the transaction to the transactions' database, and send it to others concerned nodes (through the THT) to validate the transaction and mark it as processed.

#### `hdc/transactions/process/fusion`

Takes a transaction and a signature of it. If the following conditions matches:

* The signature matches the transaction content
* The `Sender` is handled by this node
* The `Recipient` is handled by this node
* The transaction chain matches
* The transaction has a valid fusion content

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

## Bootstraping

### Definition

A node bootstrap is a process consisting in initialization of the node's data in order to integrate a currency.

### From existing currency

For a node to integrate an existing currency, bootstraping consists in fetching all the data from a trusted server. Once server is authenticated, the node fetches:

* PGP keys
* Votes
* Transactions

Once everything is fetched, the node may be started to follow normal protocol events.

### Create a new currency

For a node to create a new currency, it must not synchronize another server. It must be started with no external references, just waiting for new messages feeding the node in HDC and UCG data.

Typically, such a node will a have the following flow to initiate its currency:

* New PGP keys received
* New Votes received - amendment is promoted

This cycle will then repeat to the will of its currency members.
