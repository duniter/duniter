![Duniter logo](https://raw.github.com/ucoin-io/ucoin/master/duniter-logos/250×250.png)

# uCoin [![Build Status](https://api.travis-ci.org/ucoin-io/ucoin.png)](https://travis-ci.org/ucoin-io/ucoin) [![Coverage Status](https://coveralls.io/repos/ucoin-io/ucoin/badge.svg?branch=master&service=github)](https://coveralls.io/github/ucoin-io/ucoin?branch=master)

uCoin is a libre software allowing to create a new kind of P2P crypto-currencies based on individuals and Universal Dividend.

Inspired by [Bitcoin](https://github.com/bitcoin/bitcoin) and [OpenUDC project](https://github.com/Open-UDC/open-udc).

## Development state

Software is still under development, and **no production currency using uCoin exists for now**.

However, it already exists a testing currency named [MetaBrouzouf](http://ucoin.io/try/). Want to test it? Two ways.

### Add your node to the network

```
$ wget -qO- https://raw.githubusercontent.com/ucoin-io/ucoin/master/install.sh | bash
$ ucoind init
$ ucoind sync metab.ucoin.io 9201
$ ucoind start
```

and you are done! See [Install documentation](https://github.com/ucoin-io/ucoin/wiki/Install-uCoin-node) for further details.

### Try Sakia Wallet

In the world of crypto-currencies, [Sakia Wallet](http://sakia-wallet.org/) would be called a [SPV](https://en.bitcoin.it/wiki/Thin_Client_Security#Simplified_Payment_Verification_.28SPV.29_Clients) client. It is a graphical client connecting to the network. See this [tutorial](http://forum.ucoin.io/t/subscribing-to-meta-brouzouf-testing-currency/199) to join in the testing currency with Sakia.

![](http://sakia-wallet.org/img/Dividends.png)

## Going further

### Documentation

Visit [ucoin.io](http://ucoin.io) website: it gathers theoretical informations, FAQ and several useful links. If you want to learn, this is the first place to visit.

### Talk about/get involved in uCoin project

If you wish to participate/debate on uCoin, you can:

* visit [uCoin Forum](http://forum.ucoin.io)
* join XMPP chatroom [ucoin@muc.jappix.com](https://jappix.com/)
* join diffusion list [https://groups.google.com/forum/?hl=fr#!forum/ucoin](https://groups.google.com/forum/?hl=fr#!forum/ucoin)
* contact me directly at [admin@ucoin.io](mailto:admin@ucoin.io)

# References

## Theoretical
* [[en] Relative theory of money](http://vit.free.fr/TRM/en_US/)
* [[fr] Théorie relative de la monaie](http://trm.creationmonetaire.info/)

## OpenUDC

* [Official OpenUDC project website](http://www.openudc.org)
* [Official OpenUDC repository](https://github.com/Open-UDC/open-udc)
* [Other project trying to implement OpenUDC in python](https://github.com/canercandan/django-openudc)

# License

This software is distributed under [GNU GPLv3](https://raw.github.com/ucoin-io/ucoin/master/LICENSE).
