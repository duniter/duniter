# NCM - NodeCoin Messages format

NCM HDC Messages Format: it adds rules on top of HDC messages in order to implement a system compliant with NodeCoin monetary rules.

## Certificates

### Acceptance

NCCP adds a rule on how should be accepted new members inside the HDC Community. Indeed, HDC only describes *where* new members are to be written to officialize the members is joining the Community.

The added rule is the following:

> To join the Community, a new member should have enough signatures for its OpenUDC User ID either signed by:
> * by 2/3 of the members of thow whole Community
> * by 5 members belonging to the 1/3 of the Community who received the most members's signatures count

### Request for joining

To join the Community, an individual just needs to send a two part message:

* his entire public key
* a signature of the entire key

This mecanism ensure that the request was sent by the owner of the key, and allows to check the key integrity.

## Amendments

HDC aims at defining how Amendments should be chained together. Technical chaining is done trought the `Number` and `PreviousHash` fields of an Amendment.

But NCCP introduces a legitimity constraint. Such a constraint can be resumed this sentence:

> An Amendment is considered eligible if it contains **AT LEAST** 2/3 voters of its previous Amendment.

Of course, root Amendment (Amendment with `Number: 0`) does not follow this rule. But each other does.

With HDC format, such rule can be validated with this other sentence:

> An Amendment is considered **INELIGIBLE** if it contains more than 1/3 leaving voters.

That is to say:

* if AM(1) has `VotersCount: 6` and AM(2) has **2** `VotersChanges` starting with a `-` character, AM(2) is considered **ELIGIBLE**.
* if AM(1) has `VotersCount: 6` and AM(2) has **3** `VotersChanges` starting with a `-` character, AM(2) is considered **INELIGIBLE**.

This mecanism ensure a certain control of both money and community growth, directly handled by the community members.

### Precisions

Voting mecanism is a two-times step. Indeed, when a member votes for the first time (AM+0), his vote has no impact on the acceptance of the amendment. But if his vote is the same as the 2/3 majority, then his vote will be included in next amendment's `VotersChanges` (AM+1), hence making the voter to be part of the required 2/3 majority for this amendment (AM+1).

Such mecanisms aims at giving stability and control to the system.

## Transactions

NCCP introduces a new data structure called *Trust Hash Table* (THT). Such a structure is a simple Hash Table whose entries are OpenPGP key fingerprint, and values are two ojects describing which are the nodes **this** key does trust for trading, and which are the keys that manage the transactions of **this** key.

This is a very important feature for two points:

* it makes decentralization possible, as a random individual's computer can't handle a humanity scale transactions database
* it aims at preventing double-spending issue

### THT Structure

In JSON format, a THT entry would look like:

    "KEY_FINGERPRINT"

as hash table key, and:

    {
      "number", "1",
      "dateTime": "1374852192",
      "managedBy": [
        {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "11.11.11.11", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1"},
        {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "22.22.22.22", "ipv6": "2A02:E35:2421:4BE0:CDBC:C04E:A7AB:ECF2"},
        {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "33.33.33.33", "ipv6": "3A03:E35:2421:4BE0:CDBC:C04E:A7AB:ECF3"},
        {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "44.44.44.44", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1"}
      ],
      "trusts": [
        {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "77.77.77.77", "ipv6": "1A01:E35:2421:4BE0:CDBC:C04E:A7AB:ECF1"},
        {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "88.88.88.88", "ipv6": "2A02:E35:2421:4BE0:CDBC:C04E:A7AB:ECF2"},
        {"key": "SOME_KEY_FINGERPRINT", "dns": "name.example.com", "ipv4": "99.99.99.99", "ipv6": "3A03:E35:2421:4BE0:CDBC:C04E:A7AB:ECF3"}
      ]
    }

as hash table value. Of course this example has bad values, but it shows the global structure.

### THT Signification

#### managedBy

The `managedBy` field is a list of *nodes* a given key declares as the ones that **officialy manages this key transactions**. That is, which are the nodes by which **every transactions of this key pass** trough.

#### trusts

The `trusts` field is a list of *nodes* a given key does trust for receiving transactions. This means, for a given `Recipient`, that he would rather accept transactions from `Sender` if the sender's transactions are managed by one of the trusted nodes of `Recipient`.

> Indeed, if the owner of a key is not an honest man/organization and wants to cheat, he probably will declare a corrupted node *he controls* for his transactions managment. Thus, he would be able to declare wrong transactions and steal people he trades with.

> If the owner of a key declares a node he *trusts* is not subject to corruption as trading node, then the dishonest man can't cheat against him as he does not control the trusted node.

### THT Protections

Of course, a THT entry is a critical data. Thus, **it has to be signed** by the owner of the key. If an entry is not signed by the owner of the key, it should not be considered as trustworthy information.
