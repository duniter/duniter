# Architecture

```
         -------------
         |    BMA    | Duniter Basic Merkled API (HTTP)
         -------------
               ▲
               |
            Trought
               |
         -------------
         |  duniter   | The software
         -------------
               |
               |                                
          Implements                            
               |                                
               ▼                                
       -----------------                        
       |      UCP      | Duniter protocol
       | ------------- |                        
       | |  Ed25519  | | Cryptography features
       -----------------

```
More details on each layer:

Layer | Role
----- | ----
Duniter | The software that implements UCP. May implement UCP throught BMA or any other future protocol.
[BMA](./HTTP_API.md) | A communication protocol to exchange HDC and Network messages over HTTP.
[UCP](./Protocol.md) | A protocol defining how to handle Network and HDC messages in order to build a Duniter network.
Ed25519 | Cryptography format providing authentication features.
