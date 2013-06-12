# NodeCoin [![Build Status](https://api.travis-ci.org/c-geek/nodecoin.png)](https://api.travis-ci.org/c-geek/nodecoin.png)

NodeCoin aims to be a free implementation of the [OpenUDC protocol](https://github.com/Open-UDC/open-udc), which allows to create new crypto-currencies based on individuals and Universal Dividend.

## Oh, yet another Bitcoin-like ?

Well, NodeCoin allows to create and use a new crypto-currency, just like Bitcoin *is*. But NodeCoin has completely different fundation principles, such as individuals, web of trust and Universal Dividend (i.e.: money issuance directly on every individual).
Actually, NodeCoin has a theoretical reference called [Relativity Theory of Money (french)](http://wiki.creationmonetaire.info/). This theory demonstrates that a currency which aims at respecting individuals economic liberties MUST implement the Universal Dividend, which is the only way to allow both a spatial (every living individual) and temporal (individuals yet to be born) symmetry in money issuance.

## How to implement such a system ?

Things are rather simple : as we want to implement Universal Dividend for money issuance, we need to strongly authenticate individuals in a monetary community, make them write and sign a Monetary Contract describing the money rules (notably the Universal Dividend amount and its periodicity) and finally give them tools to ensure everyone is playing the game (and ban some of them if they do not).
For that purpose, OpenUDC and NodeCoin lean on OpenPGP mecanisms.

### First concept : the monetary Web of Trust (WoT)


### Second concept : the Monetary Contract

### Third concept : money issuance

### Last concept : transactions

## Disclaimer

NodeCoin only *aims* to be an implementation of the OpenUDC protocol, but it is not. Firstly because OpenUDC protocol is still a in drafting state, and secondly because NodeCoin have some divergences in its mecanisms.
Consequently, NodeCoin proposes its own protocol which differs with OpenUDC. However, we hope that those protocols will join at some point.

# License

Copyright (c) 2013 The nodecoin team.

This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program; if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.