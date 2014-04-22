# HDC Messages Format

HDC is an acronym for Human Dividend Currency. HDC aims at defining messages and an interpretation of it in order to describe a monetary system based on Humans and allowing to apply Universal Dividend on its community.

## Contents
* [Contents](#contents)
* [Vocabluary](#vocabulary)
* [Public key](#public-key)
  * [Definition](#definition)
  * [Validity](#validity)
  * [Representation](#representation)
* [Amendment](#amendment)
  * [Definition](#definition-1)
  * [Validity](#validity-1)
* [Transaction](#transaction)
  * [Definition](#definition-2)
  * [Validity](#validity-2)
  * [Coins format](#coins-format)
  * [Issuance transaction](#issuance-transaction)
  * [Transfer transaction](#transfert-transaction)
  * [Money ownership](#money-ownership)
  * [Transactions chain](#transactions-chain)

## Vocabulary

Word | Description
---- | -------------
Universal Dividend | Money issuance **directly** and **exclusively** on community members.
Community | A groupment of individuals linked together trought a Monetary Contract.
Monetary Contract | A document gathering the informations defining the community members, voters and monetary mass inside it.

## Conventions

### HDC Data

#### Line endings

Please not **very carefully** that every HDC document's line **ENDS with a newline character Windows-style**, that is to say **<CR><LF>**.

This is a *very important information* as every document is subject to hashes, and Unix-style endings won't produce the expected hashes.

#### Numbering

For [Amendments](#amendment) and [Transactions](#transaction), number starts from `0`. That is, first amendments is `AM#0`, and first transaction of a node is `TX#0`.

## Public key

### Definition

In HDC, a public key is to be understood as a OpenPGP public key. Public keys are at the heart of HDC data as it allows to:

* identify Community members
* materialize money ownership

A key may be used either to fit those two functions, or only one at a time. Hence, one individual may use either one, two or more keys in HDC system.

For more informations on OpenPGP, see [RFC 4880 - OpenPGP Message Format](http://tools.ietf.org/html/rfc4880).

### Validity
There is no particular requirement about PGP keys to be valid. A key simply need to fit OpenPGP format.

However, any Community is free to add some restrictions to it: for example, to accept only PGP keys containing at least one User ID in [OpenUDC format](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_Authentication_Mechanisms.draft.txt#L164), a minimum number of signatures, etc.

### Representation

#### Fingerprint

HDC format considers the 40 alphanumeric SHA1 hash of a key as its identifier, also known as fingerprint of the key.

#### ASCII-armored format

Classically, OpenPGP keys can be represented in ASCII-armored format which allows it to be transfered in a textual way.

An example of such a certificate could be:

    -----BEGIN PGP PUBLIC KEY BLOCK-----
    Version: GnuPG v1.4.12 (GNU/Linux)

    mQENBFHHC/EBCADWTLSN7EGP+n30snndS3ZNcB02foL+0opcS6LK2coPDJLg2noo
    keJRHZxF3THmZQrKwZOjiuDBinOc5DWlzIS/gD/RaXwntgPFlGKBlBU+g255fr28
    ziSb5Y1lW4N//nUFdPZzoMmPgRj0b17T0UPCoMR8ZZ/Smk5LINbQwt+A+LEoxEdE
    Vcq+Tyc0OlEabqO6RFqiKDRiPhGPiCwVQA3yPjb6iCp5gTchObCxCnDbxA0Mfj9F
    mHrGbepNHGXxStO4xT0woCb7y02S1E8K08kOc5Bq9e1Yj5I/mdaw4Hn/Wp28lZl1
    mnO1u1z9ZU/rcglhEyaEOTwasheb44QcdGSfABEBAAG0TUxvTCBDYXQgKHVkaWQy
    O2M7Q0FUO0xPTDsyMDAwLTA0LTE5O2UrNDMuNzAtMDc5LjQyOzA7KSA8Y2VtLm1v
    cmVhdUBnbWFpbC5jb20+iQE9BBMBCAAnBQJRxwvxAhsDBQkLR5jvBQsJCAcDBRUK
    CQgLBRYCAwEAAh4BAheAAAoJEOnKt20ZqGUeZYcH/0ItH4b/O0y7V1Jzc1DZAdn4
    iDiI7/SF3fN4f6cJCu/SOVb+ERFIb6JK+HNHdVAcMHKaPW625R0FahHUkcXWkkGm
    Q6+sLIsVZwVN1oeZtlD12cq9A4UJyfJUXkinMKkI8xpdV8J7s5wFRavOS/qaF5be
    ah0Z+IGwQK0nuXxWpT6UZWbpUfXPQB2Mz2/rpjSWKwO3X4FwwOfDiuZExyH2JPDY
    shdPcj/x+gnzYW9XfWCJw3rOK42vtM+aLtUpJO0Jh6X/sj/iqyS4rPB4DVCmEgSX
    Px1P+kqnsz3aNTOIujXS8Faz+TC+eNhn+z3SoTl5gBlNNM171fWFr0BR3nIfIu65
    AQ0EUccL8QEIAPAQaxK6s4DjDHiOwrMotvb479QD5PsHU6S0VG0+naoPlNJb2d5w
    YhnFAn4aYLiXx4IIl38rHnV+yWATOUe2rdCe4enTXkxyWJVaxIcNJLFpUjHYGbrC
    nNwiXpuQfSDuRN/wcVNSBKXhWNUPY9IsbgERWhS5YTFnuQcBjMqDwF6JImQ8O4nZ
    wno811nqK1XaMuLVvXZAsO1Vi1k3NArM5+jdlq9e3BA0NcHJmGEcQdTw0Tk5Oq6r
    mE8ux7pS0bn6OUkkseR5DyRlFtzqi4wp30GeggeFExx7ZCVuctpJX9ZoC3cJoZT0
    s3LuUtV0EW50yCtP+3Vpkek2WtjfVbM6kDkAEQEAAYkBJQQYAQgADwUCUccL8QIb
    DAUJC0eY7wAKCRDpyrdtGahlHg7+B/95xEoSrFQ7/mc7g6sbisvx3s547gUXXYSu
    FHS03IMDWJrfGKqXtBf9ETBx4OLeBXY7z1lL4WCN6/xtrL+mSQ9dbDqdXv/1EhkS
    v0s+IvJ34KYGAkFXSCoTE7rnkPwQjoMYVSFkf5e8g9adyKvndq/QSPNuv+FPL6sH
    m1N9nmus5Ebr0zTVDmmfoqzokuDfHm5h6YrkFscMGjrCKWuXSiTaGj9Hm3MqeZ3T
    Kva5isa/h0h7Ai3wJ5XJpMrFNN6BU/wIt7fM2hsNAOwaG+WUfgjYEkOua8gPPtpL
    ZJJPb/89yrs9F7JkLi/oiAl5VpItm+hlFpLe1TE7oa6k53eZ2a+V
    =rOj9
    -----END PGP PUBLIC KEY BLOCK-----

## Amendment

### Definition

An amendment is the atomic part **constituting** a Monetary Contract. A Monetary Contract is nothing but a chained list of Amendments.
An Amendment is an ASCII document defining:

* A currency name
* A date of generation (timestamp format)
* A list of incoming/outcoming members
* A list of incoming/outcoming voters
* The minimum votes count for *next* amendment to be eligible
* Eventually, a Universal Dividend amount
* Eventually, a minimum limit to new coins' value
* Eventually, a reference to its preceding Amendment (every Amendment have a predecessor, excepted first)

Amendments, forming the Monetary Contract, are to be *collectively signed* and thus should be considered as the only authentic reference document towards money community and potential monetary mass.

Amendments have the following structure:

    Version: VERSION
    Currency: CURRENCY_NAME
    Number: INCREMENT
    GeneratedOn: TIMESTAMP
    UniversalDividend: UNIVERSAL_DIVIDEND
    CoinBase: COIN_BASE_POWER
    CoinList: COIN_LIST
    NextRequiredVotes: REQUIRED_VOTES_COUNT
    PreviousHash: PREVIOUS_HASH
    MembersRoot: WOT_MERKLE_ROOT
    MembersCount: WOT_SIZE
    MembersChanges:
    +NEW_INDIVIDUAL_FPR
    -LEAVING_INDIVIDUAL_FPR
    VotersRoot: WOT_MERKLE_ROOT
    VotersCount: WOT_SIZE
    VotersChanges:
    +NEW_VOTER_FPR
    -LEAVING_VOTER_FPR

All fields are not mandatory for a given amendment. Note that this precise structure is the version 1 amendment structure, and that any other structure may be proposed with a different version number. The only requirement is to have a `Version: VERSION` starting the text structure.

Here is the interpretation of each field:

Field | Description | Required
----- | ----------- | --------
`Version` | denotes the current structure version. | **Required**
`Currency` | contains the name of the currency. This is used to identify the target of the amendment, as several moneys may be HDC-based. | **Required**
`Number` | references the position of the amendment in the amendment chain. Initial amendment has the value `0`. | **Required**
`GeneratedOn` | references the generation date of the amendment. | **Required**
`UniversalDividend` | if provided, is a positive integer. It defines the amount of money each member of the community may create for **THIS** amendment. | *Not Required*
`CoinBase` | **is mandatory if `UniversalDividend` is positive**. Gives the power value of first coin in `CoinList`. | *Not Required*
`CoinList` | **is mandatory if `UniversalDividend` is positive**. List of integers telling how much coins are issued for a given power. First integer gives the number of coins of value 2^`CoinBase`, second gives the number of coins of value 2^(`CoinBase` + 1), and so on. | *Not Required*
`NextRequiredVotes` | give the minimum votes count for next amendment to be considered a valid following amendment. | **Required**
`PreviousHash` | **is mandatory if `Number` is positive**. It is a hash of the previous amendment content, and is used for people to identify without ambiguity the previous amendment (`Number` field is not enough for that purpose, `PreviousHash` is an authentication mecanism to do this job). | *Not Required*
`MembersRoot` | is the root hash of a Merkle tree listing the current members of the whole community. It is a checksum mecanism. Note that `MembersChanges` are included in the Merkle. | **Required**
`MembersCount` | is used in combination of `MembersRoot`, it defines how many leaves were used to generate the Merkle tree. | **Required**
`MembersChanges` | contains a list of members joining or leaving the community. A joining member has a line starting with `+` and a leaving one with `-`. | **Required**
`VotersRoot` | **is mandatory if `Number` is positive**. It is the root hash of a Merkle tree listing the current voters of the whole community. It is a checksum mecanism. Note that `VotersChanges` are included in the Merkle. | **Required**
`VotersCount` | **is mandatory if `Number` is positive**. It is used in combination of `VotersRoot`, it defines how many leaves were used to generate the Merkle tree. | **Required**
`VotersChanges` | **is mandatory if `Number` is positive**. It contains a list of members whose voting state change. A new voting member has a line starting with `+` and a no more voting one with `-`. Members who voted ante previous amendment and voted previous is not considered a change, thus does not appear in this list. | **Required**

And `AMENDMENT_ID` has the following format:

    AMENDMENT_NUMBER-AMENDMENT_HASH

Where `AMENDMENT_NUMBER` is the `Number`, and `AMENDMENT_HASH` is the computed hash of the Amendment #`Number`.

### Validity

In HDC, an Amendment structure is considered *valid* if:

* Every line ends with a DOS `<CR><LN>` new line character.
* Every required field is present, **with** consideration of fields order.
* Every present field ends with a DOS `<CR><LN>` new line character.
* Fields `Version`, `Number`, `GeneratedOn`, `UniversalDividend` (if present), `CoinBase` (if present), `NextRequiredVotes`, `MembersCount`, `VotersCount` are zero or positive integer values.
* Fields `CoinList` is a list of space separated integers.
* Fields `PreviousHash`, `MembersRoot`, `VotersRoot` are upper-cased SHA-1 hashes.
* Fields `MembersChanges` and `VotersChanges` are upper-cased SHA-1 hashes, preceded either by a `+` or `-` character. Furthermore, lists must be string sorted.
* When `Number` field is positive, Amendment has a `PreviousHash` value.

Note that having an Amendment with a `CoinMinimalPower` without `UniversalDividend` field (or `0` valued) is not a considerated as invalid, but is a non-sense from HDC point of view.

### Root Amendment

The root Amendment is special in that it has *no previous Amendment* and inventories the root members and voters of the Community.

#### Example

    Version: 1
    Currency: beta_brousouf
    Number: 0
    UniversalDividend: 1184
    CoinBase: 4
    CoinList: 14 6 2 3 1
    MembersRoot: F5ACFD67FC908D28C0CFDAD886249AC260515C90
    MembersCount: 3
    MembersChanges:
    +2E69197FAB029D8669EF85E82457A1587CA0ED9C
    +33BBFC0C67078D72AF128B5BA296CC530126F372
    +C73882B64B7E72237A2F460CE9CAB76D19A8651E
    VotersRoot: 2E69197FAB029D8669EF85E82457A1587CA0ED9C
    VotersCount: 1
    VotersChanges:
    +2E69197FAB029D8669EF85E82457A1587CA0ED9C


Issuing a dividend composed of:
* 14 coins of value 2^4
* 6 coins of value 2^5
* 2 coins of value 2^6
* 3 coins of value 2^7
* 1 coin of value 2^8

## Transaction

### Definition

Transactions are the last step after defining Certificates and Amendments. Transactions are the conceptual support of money inside HDC: it allows to materialize money ownership.

A transaction is used **only** to transfer *existing* money.

A transaction is defined by the following format:

    Version: VERSION
    Currency: CURRENCY_NAME
    Sender: SENDER_FINGERPRINT
    Number: INCREMENT
    PreviousHash: PREVIOUS_TRANSACTION_HASH
    Recipient: RECIPIENT_FINGERPRINT
    Coins:
    COIN_ID[:TRANSACTION_ID]
    COIN_ID[:TRANSACTION_ID]
    COIN_ID[:TRANSACTION_ID]
    ...
    Comment:
    [Some multiple line
    comment here...]

Here is a description of each field:

Field | Description
----- | -----------
`Version` | denotes the current structure version.
`Currency` | contains the name of the currency. This is used to identify the target of the transaction, as several moneys may be HDC-based.
`Sender` | the current owner's OpenPGP fingerprint of the coins to be sent.
`Number` | an increment number identifying this transaction among all others sender's transactions.
`PreviousHash` | **is mandatory if `Number` is positive**. It is a hash of the previous transaction (content AND signature), and is used to identify without ambiguity the previous transaction (it is an integrity mecanism).
`Recipient` | the recipient's OpenPGP fingerprint to whom the coins are to be sent.
`Coins` | a list of coins to be transfered, eventually followed by a colon and a transaction ID justifying the ownership. Lines are sorted by `COIN_ID`.
`Comment` | comment for transaction. May be used for any future purpose. Multiline field, ends at the end of the transaction message.

`COIN_ID` has following format:

    FINGERPRINT-AM_NUMBER-COIN_NUMBER

Field      | Description
---------- | -----------
`FINGERPRINT`  | uppercased SHA1 hash of the member for whom this was coin was issued in the Contract
`AM_NUMBER` | integer identifying the amendment justifying this coin's existence
`COIN_NUMBER` | integer identifying the coin into promoted amendment #`AM_NUMBER`

For example, in above amendment, coin `33BBFC0C67078D72AF128B5BA296CC530126F372-0-26` is:
* A coin issued for member `33BBFC0C67078D72AF128B5BA296CC530126F372`
* A coin issued in amendment `#0`
* A coin of value 2^8, as it is the 26th coin in `CoinList`

### Validity

In HDC, a Transaction structure is considered *valid* if:

* Field `Currency` is not empty.
* Fields `Sender`, `Recipient` are upper-cased SHA-1 hashes.
* Fields `Version`, `Number` are zero or positive integer values.
* Field `PreviousHash` is an upper-cased SHA-1 hash, if present.
* Field `Coins` have at least one line, with lines sorted and not have twice same `COIN_ID`. Each line may be completed with a colon (':') and a transaction ID.

A transaction ID has following format:

    ISSUER-TRANSACTION_NUMBER

Field      | Description
---------- | -----------
`ISSUER`  | uppercased SHA1 hash of the member for whom this was coin was issued in the Contract
`TRANSACTION_NUMBER` | integer identifying the transaction number of issuer `ISSUER`

### Example

    Version: 1
    Currency: beta_brousouf
    Sender: 31A6302161AC8F5938969E85399EB3415C237F93
    Number: 1
    PreviousHash: AE5780D605097BA393B4F32DC858C46D4344339D
    Recipient: 31A6302161AC8F5938969E85399EB3415C237F93
    Coins:
    1C5F94BEC2ADBCE799FBD9C61F3245B64118E1FA-54-4:4DEC4AC8D7A6BBE1D65E4CF3BFD99A5E2B7672A6-99
    2035C0C29784D01C74B3F3530F95A381E0E0522E-88-20:20935EFBC0103C121EF5918714AEBAFF780CB3F9-54
    4001FE568F055848DEED454C1E67FD59779D21F5-104-10:32A1C96E3DB2282692C2F27E366248512095BE88-11
    31A6302161AC8F5938969E85399EB3415C237F93-67-1
    Comment:
    Transfering 4 coins.
    * First 3 coins are coins Sender received from other members.
    * Last coin is a coin never transfered by Sender from Universal Dividend of AM#67

### Money ownership

Money ownership **IS NOT** limited to members of the Community. Any owner (an individual or an organization) of an OpenPGP certificate may own money: it only requires the key's fingerprint to match `Recipient` fingerprint to become an owning key.

### Transactions chain

It is obvious that an amount a sender does not own CAN NOT be sent by him. That is why a transaction refers to other transactions, to prove that the sender actually owns the coins he wants to send.
