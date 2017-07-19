import {IdentityDTO} from "./IdentityDTO"
import * as moment from "moment"

const DEFAULT_DOCUMENT_VERSION = 10

export class MembershipDTO {

  sigDate?:number
  date?:number

  constructor(
    public version: number,
    public currency: string,
    public issuer: string,
    public type: string,
    public blockstamp:string,
    public userid:string,
    public certts:string,
    public signature:string
  ) {}

  get pubkey() {
    return this.issuer
  }

  get pub() {
    return this.issuer
  }

  get membership() {
    return this.type
  }

  get fpr() {
    return this.blockstamp.split('-')[1]
  }

  get number() {
    return parseInt(this.blockstamp)
  }

  get block_number() {
    return parseInt(this.blockstamp)
  }

  getIdtyHash() {
    return IdentityDTO.getTargetHash({
      buid: this.certts,
      uid: this.userid,
      pubkey: this.issuer
    })
  }

  getRaw() {
    let raw = ""
    raw += "Version: " + this.version + "\n"
    raw += "Type: Membership\n"
    raw += "Currency: " + this.currency + "\n"
    raw += "Issuer: " + this.issuer + "\n"
    raw += "Block: " + this.blockstamp + "\n"
    raw += "Membership: " + this.type + "\n"
    raw += "UserID: " + this.userid + "\n"
    raw += "CertTS: " + this.certts + "\n"
    return raw
  }

  getRawSigned() {
    return this.getRaw() + this.signature + "\n"
  }

  json() {
    return {
      signature: this.signature,
      membership: {
        version: this.version,
        currency: this.currency,
        issuer: this.issuer,
        membership: this.type,
        date: this.date && moment(this.date).unix(),
        sigDate: this.sigDate && moment(this.sigDate).unix(),
        raw: this.getRaw()
      }
    };
  }

  static fromInline(inlineMS:string, type:string = "", currency:string = "") {
    const [issuer, sig, blockstamp, certts, userid] = inlineMS.split(':');
    return new MembershipDTO(
      DEFAULT_DOCUMENT_VERSION,
      currency,
      issuer,
      type,
      blockstamp,
      userid,
      certts,
      sig
    )
  }

  static fromJSONObject(obj:any) {
    return new MembershipDTO(
      obj.version,
      obj.currency,
      obj.issuer || obj.pubkey,
      obj.type || obj.membership,
      obj.blockstamp || obj.block,
      obj.userid,
      obj.certts,
      obj.signature
    )
  }
}
