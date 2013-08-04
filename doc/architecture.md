# uCoin architecture

                    ------------
                    |  uCoin   | The software
                    ------------
                         |
                         ▼
                    ------------
                    |   UCP    | Implements uCoin Protocol
                    ------------
                         |
                ,--------+---------,
                ▼                  ▼
          ------------        ------------
          |   HDC    |◀-------|   UCM    | Based on HDC and UCM messages formats
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
uCoin | The software that implements UCP. One instance of uCoin handles only one currency.
[UCP](https://github.com/c-geek/ucoin/blob/master/doc/UCP.md) | A protocol defining how to handle messages in order to build an HDC system.
[HDC](https://github.com/c-geek/ucoin/blob/master/doc/HDC.md) | A format defining messages to describe an HDC system.
[UCM](https://github.com/c-geek/ucoin/blob/master/doc/UCM.md) | A format defining messages used by UCP.
[HTTP API](https://github.com/c-geek/ucoin/blob/master/doc/HTTP_API.md) | The communication protocol to exchange HDC and UCM messages over HTTP.
