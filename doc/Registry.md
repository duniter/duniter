# uCoin Registry protocol

## Contents
* [Introduction](#introduction)
* [Messages](#messages)
    * [Membership](#membership)
    * [Voting](#voting)
    * [Community flow](#community_flow)
* [Algorithms](#algorithms)
  * [AnyKey](#anyey)
  * [1Sig](#1sig)
  * [Common rules](#common_rules)
  * [Computing community flows](#computing_community_flows)

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
AmendmentNumber: AM_NUMBER
AmendmentHash: AM_HASH
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
`AmendmentNumber` | Amendment number from which the issuer wants to join. This field identify the amendment of a currency.
`AmendmentHash` | Amendment hash from which the issuer wants to join. Coupled with `AmendmentNumber`, this field helps to identify a precise amendment of a targeted Contract without any ambiguity.

#### Validity

A [Membership](#membership) is to be considered valid if:
* `Issuer` matches signature's key ID
* `Membership` matches either `IN` or `OUT` value

### Voting

Added to membership, a notion of *voting* is handled by uCoin nodes: uCoin nodes will accept Amendments of Monetary Contract only if it gathers enough votes of the Community voters.

Thus, it is required to define who are the voters. In an automated uCoin network, this step is done using the following document:

```bash
Version: 1
Currency: beta_brousouf
Registry: VOTING
Issuer: 405715EC64289D1F43808F57EC51F273CBC0FA17
Date: TIMESTAMP
AmendmentNumber: AM_NUMBER
AmendmentHash: AM_HASH
```

#### Fields details

Field | Description
----- | -----------
`Version` | Denotes the current structure version.
`Currency` | Contains the name of the currency.
`Registry` | Identify the type of document within Registry context.
`Issuer` | Full PGP key fingerprint issuing this message.
`Date` | Creation date of this message. Timestamp. This date may be different from signature's date.
`AmendmentNumber` | Amendment number from which the issuer wants to join. This field identify the amendment of a currency.
`AmendmentHash` | Amendment hash from which the issuer wants to join. Coupled with `AmendmentNumber`, this field helps to identify a precise amendment of a targeted Contract without any ambiguity.

With such message, uCoin node will be able to know that member `Issuer` *wants* its votes to be considered when accepting new Amendments.

#### Validity

A [Voting](#voting) is to be considered valid if:
* `Issuer` matches signature's key ID
* `Registry` matches `VOTING` value

### Community flow

Message whose role is to sum up, for a given node, the variations of members & voters to impact for next amendment. Such variations are resulting from [Membership](#membership), [Voting](#voting) and [Public Key](./HDC.md#public-key) documents received for next amendment.

Here is an example of Community Flow:

```bash
Version: 1
Currency: beta_brousouf
Amendment: 54-7F64036BF4ED24027865F0BC17861E23D9CE4CA8
Issuer: 405715EC64289D1F43808F57EC51F273CBC0FA17
Date: 1401798895
Algorithm: AnyKey
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
`Algorithm`      | Algorithm used for computing community changes. May be either `AnyKey` or `1Sig`.
`MembersJoining` | [Merkle summary](#merkle_summary) of members potentially joining
`MembersLeaving` | [Merkle summary](#merkle_summary) of members potentially leaving
`VotersJoining`  | [Merkle summary](#merkle_summary) of voters potentially joining
`VotersLeaving`  | [Merkle summary](#merkle_summary) of voters potentially leaving

Note that for Merkle summaries, the reasons why a Merkle summary has some leave or not *is directly linked by `Algorithm` field*. Indeed, `Algorithm` identifying the rules to follow for computing community changes.

##### Merkle summary

A Merkle summary field is the concatenation of 2 merkle informations: number of leaves and root hash of a [Merkle resource](./HTTP_API.md#merkle-urls).

Format: `LEAVES_COUNT-ROOT_HASH`.

###### Example

Value `90-8518C1F053B6F5BB9D27ED37F4061AE5CC083511` is a Merkle summary of a Merkle resource holding `90` leaves and whose root hash is `8518C1F053B6F5BB9D27ED37F4061AE5CC083511`.

## Algorithms

Algorithms are sets of rules defining how to settle community variations: joins and leaves of members & voters. In this document, 2 algorithms will be described: `1Sig` and `AnyKey` which are rather simple and more "testing" algorithms to understand the principles. Those algos share the same common pattern, and only differs in the acceptance of the members' public key signatures.

### `AnyKey`

This algorithms accepts **any key** as valid for a membership. Thus, a key asking for joining will always be accepted in the community, without checking any signature on the key. Furthermore, the key will always be valid while key hasn't been revoked.

> Once a key has been accepted, this algorithm will never exclude it

### `1Sig`

This algorithm *accepts* any key that have *at least* 1 signature from an existing member in the community. Others are simply refused. Furthermore, the key will always be valid while key hasn't been revoked.

### Common rules

`1Sig` and `AnyKey` algorithms relies on Membership & Voting documents.

Both algorithms **only accepts** keys with an [OpenUDC udid2](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_Authentication_Mechanisms.draft.txt#L164) in it. For `1Sig` algorithm, checked signatures are those on `udid2` user ID.

#### Membership computing

When receiving a valid [Membership](#membership), node SHOULD interprete it for each [membership algorithm](#membership-algorithms) it handles, *if this membership's `Date` is in interval [ CURRENT_AM_GENERATED_ON ; NEXT_AM_GENERATED_ON [*. If it does so, the impact MUST be visible under [CommunityFlow](#community-flow) document thereafter (no directly, but present behind the afferent [Merkle summary](#merkle-summary)): `MembersJoining` for `IN` membership, and `MembersLeaving` for `OUT` membership.

#### Voting computing

When receiving a valid [Voting](#voting), node SHOULD interprete it. The impact MUST be visible under [CommunityFlow](#community-flow) document thereafter (no directly, but present behind the `VotersJoining` [Merkle summary](#merkle-summary)).

### Computing community flows

Here are 2 tables on how to compute analitically members & voters changes:

#### Membership computing

        |  PKx  |  IN  |   OUT
------  | ----- | ---- | -----
Member  |  -2   |   0  |  -1
!Member |  -2   |  +1  |   0

Where:
* `Member` has value `1` if the computed key is currently a member, otherwise `0`.
* `!Member` has value `1` if the computed key is NOT currently a member, otherwise `0`.
* `PKx` has value `1` if the public key of the member is no more valid, otherwise `0`.
* `IN` has value `1` if a membership `IN` document was received, otherwise `0`.
* `OUT` has value `1` if a membership `OUT` document was received, otherwise `0`.

Resulting formula giving the variation of the member is:
```
Mvar = Member*(-PKx -OUT) + !Member*(-PKx +IN)
```
To also limit the variation, the formula MUST be bounded between [-1;1]:
```
Mvar = MAX[-1, MIN[1, Member*(-PKx -OUT) + !Member*(-PKx +IN)]]
```

Using this formula, it can be known at any moment how to apply variation of the member for next amendment.

> N.B.: `PKx` parameter **is membership algorithm dependant**, so its interpretation varies. For ex., `AnyKey` and `1Sig` algorithms consider `PKx = 0`, at any time. This leads to algorithms where members joins & leaves ONLY by asking for it and are never automatically ejected by expiration of their key.

> N.B.: `Member` and `!Member` fields are exclusive, so at any time `Member + !Member = 1`.

#### Voting computing

        |     | VT  | ML
------  | --- | --- | ---
!Voter  |  0  | +2  | -3
Voter   |  0  | +2  | -3
Voterx  | -1  | +2  | -3

Where:
* `Voter` has value `1` if the computed key is currently a voter, otherwise `0`.
* `!Voter` has value `1` if the computed key is NOT currently a voter, otherwise `0`.
* `Voterx` has value `1` if the voter's eligibility has expired, otherwise `0`.
* `VT` has value `1` if a voting document was received, otherwise `0`.
* `ML` has value `1` if the voter is currently leaving as a member, otherwise `0`.

Resulting formula giving the variation of the member is:
```
Vvar = (!Voter + Voter)*(+2VT -3ML) + Voterx*(-1 +2VT -3ML)
```
To also limit the variation, the formula MUST be bounded between [-1;1]:
```
Vvar = MAX[-1, MIN[1, (!Voter + Voter)*(+2VT -3ML) + Voterx*(-1 +2VT -3ML)]]
```

Using this formula, it can be known at any moment how to apply variation of the voter for next amendment.

> N.B.: `Voterx` parameter: voter is considered **eligibile** if his last appearance's date according to the Contract does not exceeds a certain duration `vtvalidity` which is algorithm dependent. For `AnyKey` and `1Sig`, this value is **14 days**, inclusive.

> N.B.: `Voter`, `!Voter` and `Voterx` fields are exclusive, so at any time `Voter + !Voter + Voterx = 1`.

#### Impacts on members & voters changes

The above formulas are utilities allowing us, for each key, the changes to apply to [Merkle summary](#merkle-summary) fields of [CommunityFlow](#community-flow) document.

Below are the rules on how to interprete `Mvar` and `Vvar` for such fields:

Value | Changes
----- | -------
 0    | No changes for the key
-1    | Key is leaving
 1    | Key is joining

 For example, if `Mvar = 1` for key `2E69197FAB029D8669EF85E82457A1587CA0ED9C` is joining, this will lead this key to be present under `MembersJoining` of the community flow. If `Mvar = -1`, the key will be present under `MembersLeaving`. If `Mvar = 0` however, nothing happens.

### Community flow impacts & voting

Community flows may be seen as a "pre-vote" process for nodes to agree on changes about members & voters, which are data that may vary a lot depending on how the data was correctly submitted (or not) to all the nodes.

Here is how a node should process while receiving community flows:

###### 1. Compare Merkle summary fields

During this step, the node checks wether the Merkle summary fields **matches** local summaries. That is, wether are not the 2 nodes agrees on the same data about which member is joining or leaving, which voter is joining or leaving.

###### 2. Eventually retrieve complete data of remote node

If some Merkle summaries do not match, local node will have to retrieve remote node's leaves behind each non-matching Merkle summary.

###### 3. Increment count of nodes agreeing

For each leave behind each Merkle summary, increment by `1` the value of how many nodes agree with this leave.

###### 4. Eventually vote by selecting common agreement

If local node estimates enough CommunityFlows were received to have a common agreement, then:

a. Compute the average number of witnesses for each key (note: a special key named "nokey" also exists for empty Merkle summaries): AVG
b. Compute the standard variation of witnesses for each key: STDVAR
c. Picks the keys having witnesses count [AVG - STDVAR ; AVG + STDVAR]
d. Vote for next amendment using those keys
