import {TransactionDTO} from "./TransactionDTO"
export class BlockDTO {

  version: number
  number: number
  currency: string
  hash: string
  inner_hash: string
  previousHash: string
  issuer: string
  previousIssuer: string
  dividend: number
  time: number
  powMin: number
  unitbase: number
  membersCount: number
  issuersCount: number
  issuersFrame: number
  issuersFrameVar: number
  identities: string[]
  joiners: string[]
  actives: string[]
  leavers: string[]
  revoked: string[]
  excluded: string[]
  certifications: string[]
  transactions: TransactionDTO[]
  medianTime: number
  nonce: number
  fork: boolean
  parameters: string
  signature: string
  monetaryMass: number
  UDTime: number

  constructor(
) {}

  getInlineIdentity(pubkey:string): string | null {
    let i = 0;
    let found = null;
    while (!found && i < this.identities.length) {
      if (this.identities[i].match(new RegExp('^' + pubkey)))
        found = this.identities[i];
      i++;
    }
    return found;
  }

  getRawSigned() {
    return this.getRawInnerPart() + this.getSignedPart() + this.signature + "\n"
  }

  getSignedPart() {
    return "InnerHash: " + this.inner_hash + "\n" +
      "Nonce: " + this.nonce + "\n"
  }

  getRawInnerPart() {
    let raw = "";
    raw += "Version: " + this.version + "\n";
    raw += "Type: Block\n";
    raw += "Currency: " + this.currency + "\n";
    raw += "Number: " + this.number + "\n";
    raw += "PoWMin: " + this.powMin + "\n";
    raw += "Time: " + this.time + "\n";
    raw += "MedianTime: " + this.medianTime + "\n";
    if (this.dividend)
      raw += "UniversalDividend: " + this.dividend + "\n";
    raw += "UnitBase: " + this.unitbase + "\n";
    raw += "Issuer: " + this.issuer + "\n";
    raw += "IssuersFrame: " + this.issuersFrame + "\n";
    raw += "IssuersFrameVar: " + this.issuersFrameVar + "\n";
    raw += "DifferentIssuersCount: " + this.issuersCount + "\n";
    if(this.previousHash)
      raw += "PreviousHash: " + this.previousHash + "\n";
    if(this.previousIssuer)
      raw += "PreviousIssuer: " + this.previousIssuer + "\n";
    if(this.parameters)
      raw += "Parameters: " + this.parameters + "\n";
    raw += "MembersCount: " + this.membersCount + "\n";
    raw += "Identities:\n";
    for (const idty of (this.identities || [])){
      raw += idty + "\n";
    }
    raw += "Joiners:\n";
    for (const joiner of (this.joiners || [])){
      raw += joiner + "\n";
    }
    raw += "Actives:\n";
    for (const active of (this.actives || [])){
      raw += active + "\n";
    }
    raw += "Leavers:\n";
    for (const leaver of (this.leavers || [])){
      raw += leaver + "\n";
    }
    raw += "Revoked:\n";
    for (const revoked of (this.revoked || [])){
      raw += revoked + "\n";
    }
    raw += "Excluded:\n";
    for (const excluded of (this.excluded || [])){
      raw += excluded + "\n";
    }
    raw += "Certifications:\n";
    for (const cert of (this.certifications || [])){
      raw += cert + "\n";
    }
    raw += "Transactions:\n";
    for (const tx of (this.transactions || [])){
      raw += tx.getCompactVersion();
    }
    return raw
  }

  static fromJSONObject(obj:any) {
    const dto = new BlockDTO()
    dto.version = parseInt(obj.version)
    dto.number = parseInt(obj.number)
    dto.currency = obj.currency
    dto.hash = obj.hash
    dto.inner_hash = obj.inner_hash
    dto.previousHash = obj.previousHash
    dto.issuer = obj.issuer
    dto.previousIssuer = obj.previousIssuer
    dto.dividend = obj.dividend || null
    dto.time = parseInt(obj.time)
    dto.powMin = parseInt(obj.powMin)
    dto.unitbase = parseInt(obj.unitbase)
    dto.membersCount = parseInt(obj.membersCount)
    dto.issuersCount = parseInt(obj.issuersCount)
    dto.issuersFrame = parseInt(obj.issuersFrame)
    dto.issuersFrameVar = parseInt(obj.issuersFrameVar)
    dto.identities = obj.identities
    dto.joiners = obj.joiners
    dto.actives = obj.actives
    dto.leavers = obj.leavers
    dto.revoked = obj.revoked
    dto.excluded = obj.excluded
    dto.certifications = obj.certifications
    dto.transactions = obj.transactions.map(TransactionDTO.fromJSONObject)
    dto.medianTime = parseInt(obj.medianTime)
    dto.fork = !!obj.fork
    dto.parameters = obj.parameters
    dto.signature = obj.signature
    dto.nonce = parseInt(obj.nonce)
    return dto
  }
}