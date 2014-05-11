# uCoin architecture
```
         -------------
         |    BMA    | uCoin Basic Merkled API (HTTP)
         -------------
               ▲
               |
            Trought
               |
         -------------
         |   ucoin   | The software
         -------------
               |
               |----------------------------------------------------
               |                                                   |
          Implements                                         Also implments
               |                                                   |
               ▼                                                   ▼
       -----------------                                   ----------------
       |      UCP      | uCoin protocol                    |   Registry   | 
       | ------------- |                                   ----------------
       | |  Network  | | uCoin network features                    |
       | ------------- |                              Feading HDC  |
       | |    HDC    | | Currency features         ◀----------------
       | ------------- |                                Contract
       | |  OpenPGP  | | Cryptography features
       -----------------

```
More details on each layer:

Layer | Role
----- | ----
uCoin | The software that implements UCP. May implement UCP throught BMA or any other future protocol.
[BMA](./HTTP_API.md) | A communication protocol to exchange HDC and Network messages over HTTP.
[UCP](./Protocol.md) | A protocol defining how to handle Network and HDC messages in order to build a uCoin network.
[Network](./Network.md) | A format defining gossip messages used by uCoin to build a network layer on top of HDC.
[HDC](./HDC.md) | A format defining messages to describe an HDC-based currency.
OpenPGP | Cryptography format providing horizontal authentication features.
[Registry](./Registry.md) | A format defining synchronization messages used by uCoin to make a network of nodes autonomous regarding Monetary Contract evolution.
