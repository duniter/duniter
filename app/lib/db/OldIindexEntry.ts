import {IindexEntry} from "../indexer"

export interface OldIindexEntry extends IindexEntry {
  pubkey: string
  buid: string | null
  revocation_sig:string | null
}
