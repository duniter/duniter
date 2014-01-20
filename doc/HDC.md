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
  * [Fusion transaction](#fusion-transaction)
  * [Division transaction](#division-transaction)
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
    CoinMinimalPower: COIN_MINIMAL_POWER
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
`UniversalDividend` | if provided, is a positive number. It defines the amount of money each member of the community may create for **THIS** amendment. | *Not Required*
`CoinMinimalPower` | if provided, is a zero or positive number. It restricts the newly issued coins to a minimal decimal power. For example, with a value of 2, only coins with a value starting from 100 may be created from this amendment. This field is used to avoid abuses linked to money issuance. | *Not Required*
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
* Fields `Version`, `Number`, `GeneratedOn`, `UniversalDividend` (if present), `CoinMinimalPower` (if present), `NextRequiredVotes`, `MembersCount`, `VotersCount` are zero or positive integer values.
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

## Transaction

### Definition

Transactions are the last step after defining Certificates and Amendments. Transactions are the conceptual support of money inside HDC: it allows to materialize money ownership.

A transaction is used either to:

* Transfer *new* money
* Transfer *existing* money
* Transfer *fusionned* money
* Transfer *divided* money

A transaction is defined by the following format:

    Version: VERSION
    Currency: CURRENCY_NAME
    Sender: SENDER_FINGERPRINT
    Number: INCREMENT
    PreviousHash: PREVIOUS_TRANSACTION_HASH
    Recipient: RECIPIENT_FINGERPRINT
    Type: TRANSACTION_TYPE
    Coins:
    COIN_ID1[, TRANSACTION_ID1]
    COIN_ID2[, TRANSACTION_ID1]
    COIN_ID3[, TRANSACTION_ID7]
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
`Type` | gives information on how to to interprete the coin list. Value is either `TRANSFER`, `ISSUANCE`, `FUSION` or `DIVISION`.
`Coins` | a list of coins that are to be sent. Each line starts with a `COIN_ID` identifying the coin, eventually followed by a comma and a `TRANSACTION_ID` justifying the ownership of the coin.
`Comment` | comment for transaction. May be used for any future purpose. Multiline field, ends at the end of the transaction message.

And `TRANSACTION_ID` has the following format:

    SENDER_FINGERPRINT-INCREMENT

### Validity

In HDC, a Transaction structure is considered *valid* if:

* Field `Currency` is not empty.
* Fields `Sender`, `Recipient` are upper-cased SHA-1 hashes.
* Fields `Version`, `Number` are zero or positive integer values.
* Field `PreviousHash` is an upper-cased SHA-1 hash, if present.
* Field `Type` has either `TRANSFER`, `ISSUANCE`, `FUSION` or `DIVISION` value.
* In case of `Type: TRANSFER`:
  * `Coins` must have at least one coin.
  * Each line must be **with** `TRANSACTION_ID` provided.
* In case of `Type: ISSUANCE`:
  * `Sender` equals to `Recipient`
  * `Coins` must have at least one coin.
  * Each line must be **without** `TRANSACTION_ID` provided.
  * Coins must follow a sequential numbering.
* In case of `Type: FUSION`:
  * `Sender` equals to `Recipient`
  * `Coins` must have its first coin, matching a `F-TRANSACTION_NUMBER` format (it is the result coin).
  * Following coins must have lines **with** `TRANSACTION_ID` provided.
  * Following coins sum of values **must be exactly** the same value as the first coin (result coin)
* In case of `Type: DIVISION`:
  * `Sender` equals to `Recipient`
  * `Coins` must have *at least* 3 coins
  * First coins must be matching `F-TRANSACTION_NUMBER` format *without* `TRANSACTION_ID`. Such coins are known as *resulting coins*.
  * Following coins must have lines **with** `TRANSACTION_ID` provided.
  * It is required to have at least 2 *resulting coins*.
  * *Resulting coins* must follow a sequential numbering.
  * *Material coins*' sum of values **must be exactly** the same value as sum of *resulting coins*.

### Coins format

A `COIN_ID` has the following format:

    ISSUER_FINGERPRINT-COIN_NUMBER-COIN_BASE-COIN_POWER-COIN_ORIGIN

Here is a description of each field:

Field | Description
----- | -----------
`ISSUER_FINGERPRINT` | is the issuer's OpenPGP fingerprint issuing this coin (not necessarily a member).
`COIN_NUMBER` | is an increment number identifying this coin among all others issued by this individual.
`COIN_BASE` | is a decimal number between 1 and 9 defining the base value of the coin.
`COIN_POWER` | is a decimal number with no maximum power, but with a minimal value defined in the Monetary Contract.
`COIN_ORIGIN` | is a special string used to identify this coin origin.

`COIN_ORIGIN` is one of the following structure:

    A-AMENDMENT_NUMBER
    F-TRANSACTION_NUMBER
    D-TRANSACTION_NUMBER

With the following meaning:

Field | Description
----- | -----------
`A, F or D` | `A` indicates the coin is issued from an amendment, `F` indicates the coin is issued by fusion of other coins, while `D` indicates the coin is issued by division of other coin(s).
`AMENDMENT_NUMBER` | is the unique Amendment number from which this coin is created (justifying the issuance).
`TRANSACTION_NUMBER` | is the unique Transaction number of the individual from which this coin is created (fusion or division cases).

#### Examples

For a *new coin* of value 500 issued by individual's key 31A6302161AC8F5938969E85399EB3415C237F93, `COIN_ID` would be:

    31A6302161AC8F5938969E85399EB3415C237F93-1-5-2-A-1

and his next coins would have a value of 40 and 60 respectively:

    31A6302161AC8F5938969E85399EB3415C237F93-2-4-1-A-1
    31A6302161AC8F5938969E85399EB3415C237F93-3-6-1-A-1

if he wanted to forge coins 2 and 3 thereafter (say in his 14th transaction), the future coin id of value 100 would be:

    31A6302161AC8F5938969E85399EB3415C237F93-4-1-2-F-14

### Issuance transaction

Such a transaction is used to *create* new money, i.e. new coins. To be a valid money issuance transaction, it MUST have the `Type: ISSUANCE` value. With this information, `Coins` field MUST be filled with coins WITHOUT `TRANSACTION_ID` besides them. Indeed, `TRANSACTION_ID` is used to justify an anterior ownership, as transactions materializes ownership. And of course, a new coin have no anterior ownership, because it is a *new* coin.

#### Example

    Version: 1
    Currency: beta_brousouf
    Sender: 31A6302161AC8F5938969E85399EB3415C237F93
    Number: 1
    PreviousHash: AE5780D605097BA393B4F32DC858C46D4344339D
    Recipient: 31A6302161AC8F5938969E85399EB3415C237F93
    Type: ISSUANCE
    Coins:
    31A6302161AC8F5938969E85399EB3415C237F93-1-5-2-A-1
    31A6302161AC8F5938969E85399EB3415C237F93-2-2-2-A-1
    31A6302161AC8F5938969E85399EB3415C237F93-3-1-2-A-1
    31A6302161AC8F5938969E85399EB3415C237F93-4-1-2-A-1
    31A6302161AC8F5938969E85399EB3415C237F93-5-5-1-A-1
    31A6302161AC8F5938969E85399EB3415C237F93-6-3-1-A-1
    31A6302161AC8F5938969E85399EB3415C237F93-7-1-1-A-1
    31A6302161AC8F5938969E85399EB3415C237F93-8-1-1-A-1
    Comment:
    Creating 8 new coins according to Amendment 1
    (imaginary one, with Universal Dividend 1000)
    Coins are:
        - 1 value 500
        - 1 value 200
        - 2 value 100
        - 1 value 50
        - 1 value 30
        - 2 value 10
    Note that this comment is part of transaction thus
    il also signed.

### Transfer transaction

Transfer transaction is identified by having `Type: TRANSFER` value. Such a transaction alter the ownership of one or more coins from `Sender` to `Recipient`. Ownership can be proved by the `Recipient` simply by showing this transaction.

Thereafter, when `Recipient` wants to send those coins to someone else, he will put himself as sender, put those coins in the `Coins` field, adding the previous transaction's `TRANSACTION_ID` besides the coins to justify he is the owner of the coins.

#### Example

    Version: 1
    Currency: beta_brousouf
    Sender: 31A6302161AC8F5938969E85399EB3415C237F93
    Number: 92
    PreviousHash: 45D873050A5F63F4A801B626C0E95D1CACA6B8AF
    Recipient: 86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8
    Type: TRANSFER
    Coins:
    31A6302161AC8F5938969E85399EB3415C237F93-1-5-2-A-1, 31A6302161AC8F5938969E85399EB3415C237F93-1
    31A6302161AC8F5938969E85399EB3415C237F93-2-2-2-A-1, 31A6302161AC8F5938969E85399EB3415C237F93-1
    Comment:
    Here I am sending coins 500 and 200 to someone else (either an individual or organization).

### Fusion transaction

Fusion transaction is identified by having `Type: FUSION` value. Such a transaction allows to fusion *existing* coins into a *new* one with a value equals to the sum of the material coins.

#### Example

    Version: 1
    Currency: beta_brousouf
    Sender: 31A6302161AC8F5938969E85399EB3415C237F93
    Number: 92
    PreviousHash: 3121CAB678CAC26D8E2E285812719672E3430A75
    Recipient: 31A6302161AC8F5938969E85399EB3415C237F93
    Type: FUSION
    Coins:
    31A6302161AC8F5938969E85399EB3415C237F93-9-5-1-F-92
    31A6302161AC8F5938969E85399EB3415C237F93-6-3-1-A-1, 31A6302161AC8F5938969E85399EB3415C237F93-1
    31A6302161AC8F5938969E85399EB3415C237F93-7-1-1-A-1, 31A6302161AC8F5938969E85399EB3415C237F93-1
    31A6302161AC8F5938969E85399EB3415C237F93-8-1-1-A-1, 31A6302161AC8F5938969E85399EB3415C237F93-1
    Comment:
    Here I am fusioning my coins 6,7,8 (of respective value 30,10,10) to make a new coin of value 50.
    Of course, coins 6,7,8 are therefore unusable as they are no more part of monetary mass.

### Division transaction

Division transaction is identified by having `Type: DIVISION` value. Such a transaction allows to divide *existing* coins into *several new ones* whose sum of values equals to the sum of the material coins.

#### Example

    Version: 1
    Currency: beta_brousouf
    Sender: 31A6302161AC8F5938969E85399EB3415C237F93
    Number: 93
    PreviousHash: 3121CAB678CAC26D8E2E285812719672E3430A75
    Recipient: 31A6302161AC8F5938969E85399EB3415C237F93
    Type: DIVISION
    Coins:
    31A6302161AC8F5938969E85399EB3415C237F93-10-2-1-D-93
    31A6302161AC8F5938969E85399EB3415C237F93-11-2-1-D-93
    31A6302161AC8F5938969E85399EB3415C237F93-12-1-1-D-93
    31A6302161AC8F5938969E85399EB3415C237F93-9-5-1-F-92, 31A6302161AC8F5938969E85399EB3415C237F93-92
    Comment:
    Here I am dividing my coin of value `50` to make a 3 new coins of respective value `20`, `20` and `10`.
    Coin 9 (value `50`) is therefore unusable as it is no more part of monetary mass.

### Money ownership

Money ownership **IS NOT** limited to members of the Community. Any owner (an individual or an organization) of an OpenPGP certificate may own money: it only requires the key's fingerprint to match `Recipient` fingerprint to become an owning key.

### Transactions chain

It is obvious that a coin a sender does not own CAN NOT be sent by him. That is why a transaction refers to other transactions, to prove that the sender actually owns the coins he wants to send.
