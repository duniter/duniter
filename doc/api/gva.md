# GVA API

GVA is a [graphql] API.

## Schema

See the playground of a GVA node:

* https://g1.librelois.fr/gva
* https://duniter-g1.p2p.legal/gva

## Batch support

It is possible to send a batch of graphql requests. The size of a batch is limited to 5 requests (No limit for whitelisted ip).

This is useful when the same query is repeated multiple times, and to allow the server to execute the queries in parallel.

The playground does not support batch requests.

## Anti-spam limitations

These limitations apply only to non-whitelisted IPs:

* The maximum number of requests per 20 seconds is 10.
* The size of a batch is limited to 5 requests.
* For paged requests, the pageSize parameter must be between 1 and 1000.

[graphql]: https://graphql.org/

## Examples

### Send a transaction

```
mutation {
  tx(
    rawTx: "Raw transaction..."
  ) {
    hash
  }
}
```

### Get transactions

```
query {
  txsHistoryBc(script: "78ZwwgpgdH5uLZLbThUQH7LKwPgjMunYfLiCfUCySkM8") {
    both {
      pageInfo {
        hasNextPage
        startCursor
        endCursor
      }
      edges {
        node {
          inputs
          outputs
        }
      }
    }
  }
  txsHistoryMp(pubkey: "78ZwwgpgdH5uLZLbThUQH7LKwPgjMunYfLiCfUCySkM8") {
    sending {
      inputs
      outputs
    }
    receiving {
      inputs
      outputs
    }
  }
}
```

### Batch request

```
[
  {"query": "{
    idty(pubkey: \"D2meevcAHFTS2gQMvmRW5Hzi25jDdikk4nC4u1FkwRaU\") {
      isMember
      username
    }
  }"},
  {"query": "{
    idty(pubkey: \"Ds1z6Wd8hNTexBoo3LVG2oXLZN4dC9ZWxoWwnDbF1NEW\") {
      isMember
      username
    }
  }"}
]
```
