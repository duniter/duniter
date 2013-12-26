# uCoin architecture
```
         -------------
         |   UBMA    | uCoin Basic Merkled API (HTTP)
         -------------
               ▲
               |
            Trought
               |
         -------------
         |   ucoin   | The software
         -------------
               |
          Implements
               |
               ▼
       -----------------
       |      UCP      | uCoin protocol
       | ------------- | 
       | |    UCG    | | uCoin Gossip messages format
       | ------------- |
       | |    HDC    | | Human Dividend Currency format
       | ------------- |
       | |  OpenPGP  | | Cryptography features
       -----------------

```
More details on each layer:

Layer | Role
----- | ----
uCoin | The software that implements UCP. May implement UCP throught UBMA or any other future protocol.
[UBMA](https://github.com/c-geek/ucoin/blob/master/doc/HTTP_API.md) | A communication protocol to exchange HDC and UCG messages over HTTP.
[UCP](https://github.com/c-geek/ucoin/blob/master/doc/UCP.md) | A protocol defining how to handle UCG and HDC messages in order to build a uCoin network.
[UCG](https://github.com/c-geek/ucoin/blob/master/doc/UCG.md) | A format defining gossip messages used by uCoin to build a network layer on top of HDC.
[HDC](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md) | A format defining messages to describe an HDC-based currency.
OpenPGP | Cryptography format providing horizontal authentication features.
