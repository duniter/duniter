import {Cloneable} from "./Cloneable";
const DEFAULT_DOCUMENT_VERSION = 10

export interface ShortRevocation {
  pubkey: string
  revocation: string
}

export class RevocationDTO implements ShortRevocation, Cloneable {

  clone(): any {
    return RevocationDTO.fromJSONObject(this)
  }

  constructor(
    public version: number,
    public currency: string,
    public pubkey: string,
    public idty_uid: string,
    public idty_buid: string,
    public idty_sig: string,
    public revocation: string
  ) {}

  rawWithoutSig() {
    let raw = ""
    raw += "Version: " + this.version + "\n"
    raw += "Type: Revocation\n"
    raw += "Currency: " + this.currency + "\n"
    raw += "Issuer: " + this.pubkey + "\n"
    raw += "IdtyUniqueID: " + this.idty_uid+ '\n'
    raw += "IdtyTimestamp: " + this.idty_buid + '\n'
    raw += "IdtySignature: " + this.idty_sig + '\n'
    return raw
  }

  getRaw() {
    return this.rawWithoutSig() + this.revocation + "\n"
  }

  // TODO: to remove when BMA has been merged in duniter/duniter repo
  json() {
    return {
      result: true
    }
  }

  static fromInline(inline:string): ShortRevocation {
    const [pubkey, revocation] = inline.split(':')
    return { pubkey, revocation }
  }

  static fromJSONObject(json:any) {
    return new RevocationDTO(
      json.version || DEFAULT_DOCUMENT_VERSION,
      json.currency,
      json.pubkey || json.issuer,
      json.idty_uid || json.uid,
      json.idty_buid || json.buid,
      json.idty_sig || json.sig,
      json.revocation || json.revocation
    )
  }
}