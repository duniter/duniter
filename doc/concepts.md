# uCoin, yet another Bitcoin-like ?

Well, uCoin uses the crypto-currency concept introduced by Bitcoin. In those terms, uCoin is like Bitcoin. But uCoin has completely different fundation principles, such as individuals, web of trust and Universal Dividend (i.e.: money issued directly by every individual) to do *really* better than Bitcoin.

Actually, uCoin has a theoretical reference called [Relativity Theory of Money (french)](http://wiki.creationmonetaire.info/). This theory demonstrates that a currency which aims at respecting individual's economic liberties MUST implement the Universal Dividend, which is the only way to avoid both spatial and temporal asymmetry in money issuance.

## Spatial and temporal what ?

Those concepts refers to the relative access of individuals to newly created money. Concretely, Bitcoin is both a spatially and temporally asymmetrical money for the following reasons:

### Spatially

When new Bitcoins are created, only **some** Bitcoin users are credited of brand new Bitcoins. **We believe this is the first injustice.** Some might say *«but miners used electricity and time to get it»* ... we would answer this work shouldn't be rewarded by newly created Bitcoins. New Bitcoins should spray the whole Bitcoin community. Miners should be rewared another way, not by money issuance.

Of course, Bitcoin can't do this as Bitcoin users are not strongly identified, and one might benefit multiple time of money creation if he owns several wallets. But uCoin can fix this.

### Temporally

Bitcoin has a planned limit of 21 million BTC, which means less and less bitcoins will be created over the time until 0 remains. Hence, once the first adopters mined every bitcoin, how will future joiners do to get bitcoins ? Just like Euros or Dollars, actually: to get money you have to work for the ones who already own it. **We believe this is the second injustice.**

Every member of a monetary community should be equal towards issuing new coins, and get the same relative amount of it over the time, even if he is a later adopter.

uCoin aims at fixing this bug too.

## How to implement such a system ?

To resolve those problems, the whole idea is to lean on OpenPGP mecanisms to create an authentified monetary community. With OpenPGP, such a community could democratically define the rules within it (who joins or leaves the community, what is money, how it is created and exchanged) throught the writing of a common reference approved by a collective signing process : the Monetary Contract.

### The monetary Web of Trust (WoT)

The whole basis of uCoin is made up of individuals who chose to trust each other and constitute a community, aka. Web of Trust. Note that *trust* does not mean considering every member as a trustworthy person: it only means that the community trusts each member is a unique and living person.

Once a WoT is constituted, new members may only join by cooptation of existing members in the WoT. Cooptation is done throught a two step process:

1. signatures from the current WoT members (a minimal amount of signatures recognizing the new member is required)
2. explicit request of the new member to integrate the WoT

The acceptation of members is formalized in the *Monetary Contract*.

### The Monetary Contract

As said earlier, this document details the WoT composition, but it also allows to define money that may be created by individuals. More precisely, this is the commonly agreed reference all the monetary data is based upon.

Such a contract is actually a chained list of amendments, each amendement defining its own data concerning individuals, money, or both. Each amendment requires to gather enough signatures from the WoT voters to be considered as valid. WoT voters is a list defined in each amendment reflecting people who authentically notified their will to participate in the democratic process.

### Coins

Coins are issued directly by WoT members, in accordance with the Monetary Contract specifications. uCoin uses a divisionary money system divided in 9 decimal unities (1..9) completed with a power 10 parameter. When issuing money, each individual may create the unities he desires, in the limits established by the Monetary Contract.

### Transactions

Transactions are the last entity managed by uCoin: it materializes money ownership. Transactions have a huge role in uCoin system: it both carries the role of money issuance and money transfert from one account to another.
