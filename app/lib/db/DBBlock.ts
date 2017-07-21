import {BlockDTO} from "../dto/BlockDTO"
import {TransactionDTO} from "../dto/TransactionDTO"

export class DBBlock {

  version: number
  number: number
  currency: string
  hash: string
  inner_hash: string
  signature: string
  previousHash: string
  issuer: string
  previousIssuer: string
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
  monetaryMass: number
  dividend: number | null
  UDTime: number
  wrong = false

  constructor(
  ) {
  }

  toBlockDTO() {
    return BlockDTO.fromJSONObject(this)
  }

  static fromBlockDTO(b:BlockDTO) {
    const dbb = new DBBlock()
    dbb.version = b.version
    dbb.number = b.number
    dbb.currency = b.currency
    dbb.hash = b.hash
    dbb.previousHash = b.previousHash
    dbb.issuer = b.issuer
    dbb.previousIssuer = b.previousIssuer
    dbb.dividend = b.dividend
    dbb.time = b.time
    dbb.powMin = b.powMin
    dbb.unitbase = b.unitbase
    dbb.membersCount = b.membersCount
    dbb.issuersCount = b.issuersCount
    dbb.issuersFrame = b.issuersFrame
    dbb.issuersFrameVar = b.issuersFrameVar
    dbb.identities = b.identities
    dbb.joiners = b.joiners
    dbb.actives = b.actives
    dbb.leavers = b.leavers
    dbb.revoked = b.revoked
    dbb.excluded = b.excluded
    dbb.certifications = b.certifications
    dbb.transactions = b.transactions
    dbb.medianTime = b.medianTime
    dbb.fork = b.fork
    dbb.parameters = b.parameters
    dbb.inner_hash = b.inner_hash
    dbb.signature = b.signature
    dbb.nonce = b.nonce
    dbb.UDTime = b.UDTime
    dbb.monetaryMass = b.monetaryMass
    return dbb
  }
}