export interface DBDocument {
  pubkey?: string     // idty table
  from?: string       // cert table
  issuer?: string     // membership table
  issuers?: string[]  // txs table
}