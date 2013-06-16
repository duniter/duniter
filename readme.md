# NodeCoin [![Build Status](https://api.travis-ci.org/c-geek/nodecoin.png)](https://api.travis-ci.org/c-geek/nodecoin.png)

NodeCoin aims to be a free implementation of the [OpenUDC protocol](https://github.com/Open-UDC/open-udc), which allows to create new P2P crypto-currencies based on individuals and Universal Dividend.

## Installation

NodeCoin is powered by Node.js v0.10+, so you need it installed first. Here is an example for Ubuntu installation:

	sudo apt-get update
	sudo apt-get install python-software-properties python g++ make
	sudo add-apt-repository ppa:chris-lea/node.js
	sudo apt-get update
	sudo apt-get install nodejs

And then, just install NodeCoin:

	sudo npm install -g nodecoin

## Oh, yet another Bitcoin-like ?

Well, NodeCoin uses the crypto-currency concept introduced by Bitcoin. In those terms, NodeCoin is another *Bitcoin-like*. But NodeCoin has completely different fundation principles, such as individuals, web of trust and Universal Dividend (i.e.: money issuance directly on every individual) to do *really* better than Bitcoin.

Actually, NodeCoin has a theoretical reference called [Relativity Theory of Money (french)](http://wiki.creationmonetaire.info/). This theory demonstrates that a currency which aims at respecting individuals economic liberties MUST implement the Universal Dividend, which is the only way to avoid both spatial and temporal asymmetry in money issuance.

### Spatial and temporal what ?

Those concepts refers to the relative access of individuals to newly created money. Concretely, Bitcoin is both a spatially and temporally asymmetrical money for the following reasons:

#### Spatially

When new Bitcoins are created, only **some** Bitcoin users are credited of brand new Bitcoins. **We believe this is the first injustice.** Some might say *«but miners used electricity and time to get it»* ... we would answer this work shouldn't be rewarded by newly created Bitcoins. New Bitcoins should spray every Bitcoin user. Miners should be rewared another way, but not by money issuance.

Of course, Bitcoin can't do this as Bitcoin users are not strongly identified, and one might benefit multiple time of money creation if he owns several wallets. But NodeCoin and OpenUDC can fix this.

#### Temporally

And what about futur users ? Bitcoin has a planned limit of 21 million BTC. And then ? First adopters are the ones who createted Bitcoins, what about the others ? Just like Euros or Dollars, to get money you have to work for the ones who already own it. **We believe this is the second injustice.**

Every member of a monetary community should be equal towards money issuance, and get the same relative amount of newly created money over the time, even if he is a later adopter.

NodeCoin and OpenUDC aims at fixing this bug too.

## How to implement such a system ?

To resolve those problems, the whole idea is to lean on OpenPGP mecanisms to create an authentified monetary community. With OpenPGP, such a community could democratically define the rules within it (who joins or leaves the community, what is money and how it is be created and exchanged) throught the writing of a common reference approved by a collective signing process : the Monetary Contract.

### The monetary Web of Trust (WoT)

The whole basis of OpenUDC (and thus, NodeCoin) is made up of individuals who chose to trust each other and constitute a community, aka. Web of Trust. Note that *trust* does not mean considering every member as a trustworthy person: it only means that the community trusts each member is a unique and living person.

Once a WoT is constituted, new members may only join by cooptation of existing members in the WoT. Cooptation is done throught a two step process:

1. signatures from the current WoT members (a minimal amount of signatures recognizing the new member is required)
2. explicit request of the new member to integrate the WoT

The acceptation of members is formalized in a special document called *Monetary Contract*.

### The Monetary Contract

As said earlier, this document details the WoT composition, but it also allows to define money that may be created by individuals. More precisely, this is the commonly agreed reference all the monetary data is based upon.

Such a contract is actually a chained list of amendments, each amendement defining its own data which may concern individuals, money, or both. Each amendment requires to be signed by at least 2/3 of the WoT voters to be considered as valid. Furthermore, each amendment also specifies a voters list reflecting people who desire to participate in the democratic process.

### Money issuance

Money issuance is made by WoT members, in accordance with the Monetary Contract specifications. NodeCoin uses a divisionary money system divided in 3 decimal unities (1, 2, 5) completed with a POW 10 parameter. When issuing money, each individual may create the unities he desires, in the limits established by the Monetary Contract. Newly issued money is not usable as such, it needs to be affected to someone by its issuer throught a transaction process.

### Transactions

Transactions are the last entity managed by NodeCoin: a transaction is the link between money and its owner, it materializes money ownership. Clearly, this is the last step after defining individuals and money, and maybe the most sensible part of NodeCoin. Indeed, NodeCoin assumes that transactions, in a decentralized system, can't be fully managed by each peer. So we need mecanisms to ensure that members do not cheat, and if they try, to _at least_ detect it.

## Disclaimer

NodeCoin only *aims* to be an implementation of the OpenUDC protocol, but it is not. Firstly because OpenUDC protocol is still a in drafting state, and secondly because NodeCoin have some divergences in its mecanisms.
Consequently, NodeCoin proposes its own protocol which differs with OpenUDC. However, we hope that those protocols will join at some point.

## Get involved in NodeCoin project

For the moment NodeCoin is developed only by its author. If you wish to participate/debate on it, you may join OpenUDC XMPP chatroom (open-udc@muc.jappix.com) on [OpenUDC blog](http://www.openudc.org/) (chat is available on the bottom-right corner of the blog) and contact *cgeek*.

# License

Copyright (c) 2013 The nodecoin team.

This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program; if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.