# NodeCoin protocol

NodeCoin defines its own protocol called NCP. NCP is actually a stack of two protocols using HDC messages format:

                ------------
                | NodeCoin | The software
                ------------
                     ▼
                ------------
            ,-- |   NCTP   | NodeCoin Transport Protocol
            |   ------------
            |        ▼
            |   ------------
    NCP --- +-- |   NCCP   | NodeCoin Currency Protocol
            |   ------------
            |        ▼
            |   ------------
            `-- |   HDC    | Human Dividend Currency Format
                ------------

More details on each layer:

Layer | Role
----- | ----
NodeCoin | The software that implements NCP. One instance of NodeCoin handles only one currency.
[NCTP](https://github.com/c-geek/nodecoind/blob/master/doc/NCTP.md) | The protocol allowing to exchange HDC messages over HTTP.
[NCCP](https://github.com/c-geek/nodecoind/blob/master/doc/NCCP.md) | The protocol defining rules on HDC messages (the currency rules).
[HDC](https://github.com/c-geek/nodecoind/blob/master/doc/HDC.md) | A format defining messages to describe an HDC system.