# GVA API

GVA is a [graphql] API.

## Schema

See the playground of a GVA node:

* https://g1.librelois.fr/gva
* https://duniter-g1.p2p.legal/gva

## Batch support

It is possible to send a batch of graphql requests. The size of a batch is limited to 5 requests (No limit for whitelisted ip).

## Anti-spam limitations

These limitations apply only to non-whitelisted IPs:

* The maximum number of requests per 20 seconds is 10.
* The size of a batch is limited to 5 requests.
* For paged requests, the pageSize parameter must be between 1 and 1000.

[graphql]: https://graphql.org/
