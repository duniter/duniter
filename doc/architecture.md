# NodeCoin architecture

                    ------------
                    | NodeCoin | The software
                    ------------
                         |
                         ▼
                    ------------
                    |   NCP    | Implements NodeCoin Protocol
                    ------------
                         |
                ,--------+---------,
                ▼                  ▼
          ------------        ------------
          |   HDC    |◀-------|   NCM    | Based on HDC and NCM messages formats
          ------------        ------------
                |                  |
                '--------+---------'
                         |
                         ▼
                    ------------
                    | HTTP API | Trought HTTP Protocol
                    ------------
                            
More details on each layer:

Layer | Role
----- | ----
NodeCoin | The software that implements NCP. One instance of NodeCoin handles only one currency.
[NCP](https://github.com/c-geek/nodecoind/blob/master/doc/NCP.md) | A protocol defining how to handle messages in order to build an HDC system.
[HDC](https://github.com/c-geek/nodecoind/blob/master/doc/HDC.md) | A format defining messages to describe an HDC system.
[NCM](https://github.com/c-geek/nodecoind/blob/master/doc/NCM.md) | A format defining messages used by NCP.
[HTTP API](https://github.com/c-geek/nodecoind/blob/master/doc/HTTP_API.md) | The communication protocol to exchange HDC and NCM messages over HTTP.