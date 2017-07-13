
import {hashf} from "../common"

export class IdentityDTO {

  currency:string

  constructor(
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

  static fromInline(inline:string): IdentityDTO {
    const [pubkey, sig, buid, uid] = inline.split(':')
    return new IdentityDTO(
      pubkey,
      sig,
      buid,
      uid
    )
  }
}