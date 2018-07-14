import {PeerDTO} from "../dto/PeerDTO"

export class DBPeer {

  version: number
  currency: string
  status: string
  statusTS: number
  hash: string
  first_down: number | null
  last_try: number | null
  pubkey: string
  block: string
  signature: string
  endpoints: string[]
  raw: string

  static json(peer:DBPeer): JSONDBPeer {
    return {
      version: peer.version,
      currency: peer.currency,
      status: peer.status,
      first_down: peer.first_down,
      last_try: peer.last_try,
      pubkey: peer.pubkey,
      block: peer.block,
      signature: peer.signature,
      endpoints: peer.endpoints
    }
  }

  static fromPeerDTO(peer:PeerDTO): DBPeer {
    return peer.toDBPeer()
  }
}

export class JSONDBPeer {
  version: number
  currency: string
  status: string
  first_down: number | null
  last_try: number | null
  pubkey: string
  block: string
  signature: string
  endpoints: string[]
}
