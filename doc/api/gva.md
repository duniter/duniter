# GVA API

GVA is a [graphql] API.

## Endpoints

Each Duniter node with GVA enabled have three endpoints :

| Path | Usage |
|:-|:-:|
| `/gva` | for graphql queries and mutations |
| `/gva/subscription` | for graphql subscriptions |
| `/gva/playground` | for [graphql playground] |

To learn how to use the GVA API, we recommend you to use the playground, which provides you with a documentation of all requests in the DOCS tab on the right of the screen.

## List of known GVA playgrounds

* https://g1.librelois.fr/gva/playground
* https://duniter-g1.p2p.legal/gva/playground

## Schema

See the tab SCHEMA of a GVA playground.

## Batch support

It is possible to send a batch of graphql requests. The size of a batch is limited to 5 requests (No limit for whitelisted ip).

This is useful when the same query is repeated multiple times, and to allow the server to execute the queries in parallel.

The playground does not support batch requests.

## Anti-spam limitations

These limitations apply only to non-whitelisted IPs:

* The maximum number of requests per 20 seconds is 10.
* The size of a batch is limited to 5 requests.
* For paged requests, the pageSize parameter must be between 1 and 1000.

## Examples

### Send a transaction

```graphql
mutation {
  tx(
    rawTx: "Raw transaction..."
  ) {
    hash
  }
}
```

### Get transactions

```graphql
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

```json
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

[graphql]: https://graphql.org/
[graphql playground]: https://github.com/graphql/graphql-playground
