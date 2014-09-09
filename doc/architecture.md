# Architecture

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
               |                                
          Implements                            
               |                                
               ▼                                
       -----------------                        
       |      UCP      | uCoin protocol         
       | ------------- |                        
       | |  Ed25519  | | Cryptography features
       -----------------

```
More details on each layer:

Layer | Role
----- | ----
uCoin | The software that implements UCP. May implement UCP throught BMA or any other future protocol.
[BMA](./HTTP_API.md) | A communication protocol to exchange HDC and Network messages over HTTP.
[UCP](./Protocol.md) | A protocol defining how to handle Network and HDC messages in order to build a uCoin network.
Ed25519 | Cryptography format providing authentication features.
