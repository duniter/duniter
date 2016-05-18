<p align="center"><img src="https://raw.github.com/duniter/duniter/master/duniter-logos/duniter-logo.svg" width="250" height="250"></p>

# Duniter [![Build Status](https://api.travis-ci.org/duniter/duniter.png)](https://travis-ci.org/duniter/duniter) [![Coverage Status](https://coveralls.io/repos/duniter/duniter/badge.svg?branch=master&service=github)](https://coveralls.io/github/duniter/duniter?branch=master)

Duniter (previously uCoin) is a libre software allowing to create a new kind of P2P crypto-currencies based on individuals and Universal Dividend.

Inspired by [Bitcoin](https://github.com/bitcoin/bitcoin) and [OpenUDC](https://github.com/Open-UDC/open-udc) projects.

## Development state

Software is still under development, and **no production currency using Duniter exists for now**.

However, it already exists a testing currency named [Test_Net](https://forum.duniter.org/t/join-our-new-testnet-currency/813). Want to test it? Two ways.

### Add your node to the network

```
$ wget -qO- https://raw.githubusercontent.com/duniter/duniter/master/install.sh | bash
$ duniter init
$ duniter sync duniter.org 8999
$ duniter start
```

and you are done! See [Install documentation](https://github.com/duniter/duniter/wiki/Install-Duniter-node) for further details.

### Try Sakia Wallet

In the world of crypto-currencies, [Sakia Wallet](http://sakia-wallet.org/) would be called a [SPV](https://en.bitcoin.it/wiki/Thin_Client_Security#Simplified_Payment_Verification_.28SPV.29_Clients) client. It is a graphical client connecting to the network. See this [tutorial](https://forum.duniter.org/t/join-our-new-testnet-currency/813) to join in the testing currency with Sakia.

<p align="center"><img src="http://sakia-wallet.org/img/Dividends.png"></p>

## Going further

### Documentation

Visit [Duniter website](https://duniter.org): it gathers theoretical informations, FAQ and several useful links. If you want to learn, this is the first place to visit.

### Talk about/get involved in Duniter project

If you wish to participate/debate on Duniter, you can:

* visit [Duniter Forum](http://forum.duniter.org)
* join XMPP chatroom [duniter@muc.duniter.org](https://jappix.com/)
* join diffusion list [https://groups.google.com/forum/?hl=fr#!forum/ucoin](https://groups.google.com/forum/?hl=fr#!forum/ucoin)
* contact us directly at [contact@duniter.org](mailto:contact@duniter.org)

# References

## Theoretical
* [[en] Relative theory of money](http://en.trm.creationmonetaire.info)
* [[fr] Théorie relative de la monaie](http://trm.creationmonetaire.info)

## OpenUDC

* [Official OpenUDC project website](http://www.openudc.org)
* [Official OpenUDC repository](https://github.com/Open-UDC/open-udc)
* [Other project trying to implement OpenUDC in python](https://github.com/canercandan/django-openudc)

# License

This software is distributed under [GNU GPLv3](https://raw.github.com/duniter/duniter/master/LICENSE).
