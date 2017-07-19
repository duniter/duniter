import {RevocationDTO} from "./RevocationDTO"
import {hashf} from "../common"
import {DBIdentity, NewDBIdentity} from "../dal/sqliteDAL/IdentityDAL"
const DEFAULT_DOCUMENT_VERSION = 10

export interface HashableIdentity {
  buid: string
  uid: string
  pubkey: string
}

export interface BasicIdentity {
  buid: string
  uid: string
  pubkey: string
  sig: string
}

export class IdentityDTO {

  constructor(
    public version: number,
    public currency: string,
    public pubkey: string,
    public sig: string,
    public buid: string,
    public uid: string
  ) {}

  get hash() {
    return this.getTargetHash()
  }

  private getTargetHash() {
    return hashf(this.uid + this.buid + this.pubkey)
  }

  inline() {
    return [this.pubkey, this.sig, this.buid, this.uid].join(':')
  }

  rawWithoutSig() {
    let raw = ""
    raw += "Version: " + this.version + "\n"
    raw += "Type: Identity\n"
    raw += "Currency: " + this.currency + "\n"
    raw += "Issuer: " + this.pubkey + "\n"
    raw += "UniqueID: " + this.uid + '\n'
    raw += "Timestamp: " + this.buid + '\n'
    return raw
  }

  getRawSigned() {
    return this.rawWithoutSig() + this.sig + "\n"
  }

  static fromInline(inline:string, currency:string = ""): IdentityDTO {
    const [pubkey, sig, buid, uid] = inline.split(':')
    return new IdentityDTO(
      DEFAULT_DOCUMENT_VERSION,
      currency,
      pubkey,
      sig,
      buid,
      uid
    )
  }

  static getTargetHash(idty:HashableIdentity) {
    return hashf(idty.uid + idty.buid + idty.pubkey)
  }

  static fromJSONObject(obj:any) {
    return new IdentityDTO(
      obj.version || DEFAULT_DOCUMENT_VERSION,
      obj.currency,
      obj.issuer || obj.pubkey || obj.pub,
      obj.signature || obj.sig,
      obj.buid || obj.blockstamp,
      obj.uid
    )
  }

  static fromBasicIdentity(basic:BasicIdentity): DBIdentity {
    return new NewDBIdentity(
      basic.pubkey,
      basic.sig,
      basic.buid,
      basic.uid,
      IdentityDTO.getTargetHash({
        pubkey: basic.pubkey,
        buid: basic.buid,
        uid: basic.uid
      })
    )
  }

  static fromRevocation(revoc:RevocationDTO): DBIdentity {
    return new NewDBIdentity(
      revoc.pubkey,
      revoc.idty_sig,
      revoc.idty_buid,
      revoc.idty_uid,
      IdentityDTO.getTargetHash({
        pubkey: revoc.pubkey,
        buid: revoc.idty_buid,
        uid: revoc.idty_uid
      })
    )
  }
}