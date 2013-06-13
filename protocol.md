# NodeCoin protocol

Like Bitcoin, NodeCoin follows its own protocol to exchange monetary data (individuals, amendments, money, transactions). Such a protocol is subject to changes over the time because of potential weaknesses but mainly to match OpenUDC protocol, which aims to be the reference. Anyway, here is NodeCoin protocol.

# Entities

## Individuals

An individual is represented by a OpenUDC certificate, which basically is an OpenPGP certificate (i.e.: an OpenPGP public key) with a OpenUDC-specific string for the comment field for one of its OpenPGP UID.

An OpenUDC certificate MUST be entirely stored, not just some parts of it. It may either be stored in binary or ASCII-Armored format (see [OpenPGP RFC (4880)](http://tools.ietf.org/html/rfc4880) for more details).

The specific string is defined in [OpenUDC specifications](https://github.com/Open-UDC/open-udc/blob/master/docs/OpenUDC_Authentication_Mechanisms.draft.txt#L164) as "udid2". Such a string looks like:

	udid2;c;MOREAU;CEDRIC;1988-04-29;e+47.47-000.56;0;

Which makes, for my OpenUDC certificate, the following OpenPGP "uid":

	cgeek twicedd (udid2;c;MOREAU;CEDRIC;1988-04-29;e+47.47-000.56;0;) <cem.moreau@gmail.com>

The complete OpenPGP public key corresponding to this uid is (in ASCII-Armored format):

	-----BEGIN PGP PUBLIC KEY BLOCK-----
	Version: SKS 1.1.0

	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
	tGMseERMCbPZEi+Ggg==
	=dLy8
	-----END PGP PUBLIC KEY BLOCK-----

This is concretely what needs to be stored as a OpenUDC certificate. This OpenPGP certificate contains (among others) the mentionned uid.

## Amendments
## Money issuances
## Transactions