# NodeCoin [![Build Status](https://api.travis-ci.org/c-geek/nodecoin.png)](https://api.travis-ci.org/c-geek/nodecoin.png)

NodeCoin aims to be a free implementation of the [OpenUDC protocol](https://github.com/Open-UDC/open-udc), which allows to create new crypto-currencies based on individuals and Universal Dividend.

## Oh, yet another Bitcoin-like ?

Well, NodeCoin allows to create and use a new crypto-currency, just like Bitcoin *is*. But NodeCoin has completely different fundation principles, such as individuals, web of trust and Universal Dividend (i.e.: money issuance directly on every individual).
Actually, NodeCoin has a theoretical reference called [Relativity Theory of Money (french)](http://wiki.creationmonetaire.info/). This theory demonstrates that a currency which aims at respecting individuals economic liberties MUST implement the Universal Dividend, which is the only way to allow both a spatial (every living individual) and temporal (individuals yet to be born) symmetry in money issuance.

## How to implement such a system ?

The whole idea leans on OpenPGP mecanisms. The fundamental element is: OpenPGP allows to strongly authenticate individuals and produce signed data. Hence, it is notably possible for them to create an authentified community by a collective signing process, and define rules within it. In NodeCoin, this is materialized by a Monetary Contract defining individuals of the community and the money they can create.

### The monetary Web of Trust (WoT)

The very first data written in a Monetary Contract is the list of individuals constituing the community, aka. Web of Trust. Once a WoT is constituted, new members may join only by cooptation of existing members of the WoT. This cooptation is materialized by the common signin process of OpenPGP, with special OpenUDC data in it. When enough members signed a candidate, he may join the community by expressing it in a formalized way.

### The Monetary Contract

This document not only details the WoT composition, it also allows to define the money that may be created by individuals. More precisely, such a contract is a chained list of amendments, each defining its own data which may concern individuals, money, or both.

Each amendment requires to be signed by at least 2/3 of the WoT voters to be considered as valid, and each amendment redefines the voters list so the democratic process should never be stuck.

### Money issuance

### Transactions

## Disclaimer

NodeCoin only *aims* to be an implementation of the OpenUDC protocol, but it is not. Firstly because OpenUDC protocol is still a in drafting state, and secondly because NodeCoin have some divergences in its mecanisms.
Consequently, NodeCoin proposes its own protocol which differs with OpenUDC. However, we hope that those protocols will join at some point.

# License

Copyright (c) 2013 The nodecoin team.

This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program; if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.