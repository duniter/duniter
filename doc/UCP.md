# UCP - uCoin Protocol

uCoin defines its own protocol called UCP which defines messages, interpretation of them and structuration rules in order to build new currencies based on individuals and Universal Dividend.

## Database

### Definition

The whole point of uCoin is to build a database describing a currency and its state. For that purpose, UCP considers each node have its own datasource able to manage the following entites.

### PGP public keys

PGP public keys are cryptographic keys representing either an individual or an organization. PGP keys are uniquely identified by their PGP fingerprint.

UCP consider two type of PGP keys:
* OpenUDC keys: such keys matches [HDC Certificate format](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#certificate) and may **only** represent individuals.
* Other keys: may represent either individuals or organizations.

Only OpenUDC keys may be used for joining the Community, hence why it is necessary to have 2 types of keys.

### Registrations

Registration is a signed document refering to [HDC Membership request](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#membership-request). Such document must be interpreted as a will of an individual to register or actualize his status inside the Community using his OpenUDC key.

### Amendments

Amendments are collectively signed documents refering to [HDC Amendment format](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#amendment) allowing to define a currency, its Community members and voters. It is also the document justifying money issuance *by* the members.

### Votes

A vote is a simple signature of an amendment, refering to [HDC Vote request](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#vote-request). When a member signs an amendment and submit the signatures to nodes, it express the will of this member (if he can legitimately do it) to promote the signed amendment.

### Transactions

Transaction is a document refering to [HDC Transaction format](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md#transaction) whose role is either to create, fusion or transfert money. It is the final support of money and it materializes money ownership.

### Trust Hash Table

THT is a hash table refering to [UCG THT format](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md#trust-hash-table) whose role is to define, for a given PGP key, the nodes by which every transaction of the key pass through and the nodes the key is likely to trust for incoming transactions.

## Dataflow

### Definition

To feed the database and synchronise with other nodes, UCP defines HTTP interfaces used either to receive or send messages.

### PGP public keys

Flow | Interfaces
---- | -----------
IN   | `pks/add`
OUT  | `pks/lookup`

#### `pks/add`

Takes a PGP public key and a signature of the whole key. If the signature matches, adds the key to the PGP public keys database.

#### `pks/lookup`

Serves PGP public keys according to HKP protocol.

### Registrations

Flow | Interfaces
---- | -----------
IN   | `community/join`
OUT  | `community/members`
OUT  | `amendments/view/[AMENDMENT_ID]/members`

#### `community/join`

Takes a membership request and a signature of it. If the signature matches and the corresponding OpenUDC key have enough members signatures on it (this requirement is implementation specific), adds the document to pending membership requests to be integrated in next amendment.

#### `community/members`

Serves membership requests received by `community/join` since last amendment promotion.

#### `amendments/view/[AMENDMENT_ID]/members`

Serves membership requests received and treated for the given amendment.

### Amendments

Flow | Interfaces
---- | -----------
IN   | `amendments/votes (POST)`
OUT  | `amendments/current`
OUT  | `amendments/view/[AMENDMENT_ID]/self`

#### `amendments/votes (POST)`

Takes an amendment and a signature of it. If the following conditions matches:

* The signature matches the amendment content
* The signing key is a member eligible to voting
* The amendment `PreviousHash` field matches `amendments/current` hash
* The amendment `MembersStatusRoot` field matches received registrations
* The amendment `VotersSignaturesRoot` field matches received votes for previous amendment

add the amendment to pending amendment database with the signature attached.

If the resulting pending amendment have enough votes (this requirement is implementation specific), then the amendment has to be promoted to `amendments/current`.

#### `amendments/current`

Serves the currently promoted amendment.

#### `amendments/view/[AMENDMENT_ID]/self`

Serves amendment with the given identifier.

### Votes

Flow | Interfaces
---- | -----------
IN   | `amendments/votes (POST)`
OUT  | `amendments/votes (GET)`
OUT  | `amendments/view/[AMENDMENT_ID]/voters`
OUT  | `amendments/votes/[AMENDMENT_ID]/signatures`
OUT  | `community/votes`

#### `amendments/votes (POST)`

Refer to the same section in [Amendments - amendments/votes (POST)](#amendmentsvotes-POST).

#### `amendments/votes (GET)`

Serves an index of all the received votes. Index gives, for each amendment number, the different hashes and the number of votes for each hash.

#### `amendments/view/[AMENDMENT_ID]/voters`

Serves, for a given amendment, a Merkle tree of the signatures refering to the `VotersSigRoot` field of the amendment.

#### `amendments/votes/[AMENDMENT_ID]/signatures`

Serves, for a given amendment, a Merkle tree of the signatures already received for the amendment's promotion.

Note that is the amendment is promoted, those signatures will be available under the `amendments/view/[AMENDMENT_ID]/voters` URL.

#### `community/votes`

Serves a Merkle tree of the signatures already received for the currently promoted amendment.

### Transactions

Flow | Interfaces
---- | -----------
IN   | `transactions/process/issuance`
IN   | `transactions/process/transfert`
IN   | `transactions/process/fusion`
OUT  | `transactions/all`
OUT  | `transactions/sender/[PGP_FINGERPRINT]`
OUT  | `transactions/recipient/[PGP_FINGERPRINT]`
OUT  | `transactions/view/[TRANSACTION_ID]`
OUT  | `coins/[PGP_FINGERPRINT]/list`
OUT  | `coins/[PGP_FINGERPRINT]/view/[COIN_ID]`

#### `transactions/process/issuance`

Takes a transaction and a signature of it. If the following conditions matches:

* The signature matches the transaction content
* The `Sender` is handled by this node
* The `Recipient` is handled by this node
* The creation is justified by an amendment
* The creation is justified according to transactions history (money was not already created)

adds the transaction to the transactions' database, and send it to others concerned nodes (through the THT) to validate the transaction and mark it as processed.

#### `transactions/process/transfert`

Takes a transaction and a signature of it. If the following conditions matches:

* The signature matches the transaction content
* The `Sender` is handled by this node
* The `Recipient` is handled by this node
* The transaction chain matches (may need to ask many nodes for transaction history)

adds the transaction to the transactions' database, and send it to others concerned nodes (through the THT) to validate the transaction and mark it as processed.

#### `transactions/process/fusion`

Takes a transaction and a signature of it. If the following conditions matches:

* The signature matches the transaction content
* The `Sender` is handled by this node
* The `Recipient` is handled by this node
* The transaction chain matches
* The transaction has a valid fusion content

adds the transaction to the transactions' database, and send it to others concerned nodes (through the THT) to validate the transaction and mark it as processed.

#### `transactions/all`

Serves a Merkle tree containing all the transactions stored by this node.

#### `transactions/sender/[PGP_FINGERPRINT]`

Serves a Merkle tree containing all the transactions stored by this node, filtered for a given `Sender`.

#### `transactions/recipient/[PGP_FINGERPRINT]`

Serves a Merkle tree containing all the transactions stored by this node, filtered for a given `Recipient`.

#### `transactions/view/[TRANSACTION_ID]`

Serves a transaction content by its ID.

#### `coins/[PGP_FINGERPRINT]/list`

Serves a list of coins considered as owned by the given `PGP_FINGERPRINT`.

#### `coins/[PGP_FINGERPRINT]/view/[COIN_ID]`

Serves a transaction chain (may not be complete, i.e. long enough to reach issuance transaction) justifying money ownership.

### THT

Flow | Interfaces
---- | -----------
IN   | `tht (POST)`
OUT  | `tht (GET)`
OUT  | `tht/[PGP_FINGERPRINT]`

#### `tht (POST)``

Takes a THT entry and its signature, and according to the following:

* Signature matches
* `Number` is either a good increment, or no entry exists and has value `1`
* `DateTime` is superior to the previous entry

adds the entry in the node THT and broadcast it to its peers.
 
#### `tht (GET)``

Serves the whole THT content.

#### `tht/[PGP_FINGERPRINT]`

Serves the THT entry of the given key fingerprint.
