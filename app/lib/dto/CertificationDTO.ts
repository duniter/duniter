import {IdentityDTO} from "./IdentityDTO"

const DEFAULT_DOCUMENT_VERSION = 10

export class ShortCertificationDTO {

  constructor(
    public pubkey: string,
    public block_number: number,
    public sig: string,
    public idty_issuer: string
  ) {}

  get issuer() {
    return this.pubkey
  }

  get from() {
    return this.pubkey
  }

  get to() {
    return this.idty_issuer
  }
}

export class CertificationDTO extends ShortCertificationDTO {

  constructor(
    public version: number,
    public currency: string,
    public pubkey: string,
    public buid: string,
    public sig: string,
    public idty_issuer:string,
    public idty_uid:string,
    public idty_buid:string,
    public idty_sig:string
  ) {
    super(pubkey, parseInt(buid.split(':')[0]), sig, idty_issuer)
  }

  getTargetHash() {
    return IdentityDTO.getTargetHash({
      uid: this.idty_uid,
      buid: this.idty_buid,
      pubkey: this.idty_issuer
    })
  }

  getRaw() {
    let raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Type: Certification\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Issuer: " + this.pubkey + "\n";
    raw += "IdtyIssuer: " + this.idty_issuer + '\n';
    raw += "IdtyUniqueID: " + this.idty_uid + '\n';
    raw += "IdtyTimestamp: " + this.idty_buid + '\n';
    raw += "IdtySignature: " + this.idty_sig + '\n';
    raw += "CertTimestamp: " + this.buid + '\n';
    raw += this.sig + '\n'
    return raw
  }

  json() {
    return {
      "issuer": this.pubkey,
      "timestamp": this.buid,
      "sig": this.sig,
      "target": {
        "issuer": this.idty_issuer,
        "uid": this.idty_uid,
        "timestamp": this.idty_buid,
        "sig": this.idty_sig
      }
    }
  }

  static fromInline(inline:string): ShortCertificationDTO {
    const [pubkey, to, block_number, sig]: string[] = inline.split(':')
    return new ShortCertificationDTO(pubkey, parseInt(block_number), sig, to)
  }

  static fromJSONObject(obj:any) {
    return new CertificationDTO(
      obj.version || DEFAULT_DOCUMENT_VERSION,
      obj.currency,
      obj.pubkey || obj.issuer,
      obj.buid,
      obj.sig,
      obj.idty_issuer || obj.to,
      obj.idty_uid,
      obj.idty_buid,
      obj.idty_sig
    )
  }
}