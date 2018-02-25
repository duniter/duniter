export class DBHead {

  // TODO: some properties are not registered in the DB, we should create another class

  version: number
  currency: string | null
  bsize: number
  avgBlockSize: number
  udTime: number
  udReevalTime: number
  massReeval: number
  mass: number
  hash: string
  previousHash: string | null
  previousIssuer: string | null
  issuer: string
  time: number
  medianTime: number
  number: number
  powMin: number
  diffNumber: number
  issuersCount: number
  issuersFrame: number
  issuersFrameVar: number
  dtDiffEval: number
  issuerDiff: number
  powZeros: number
  powRemainder: number
  speed: number
  unitBase: number
  membersCount: number
  dividend: number
  new_dividend: number | null
  issuerIsMember: boolean

  constructor(
  ) {}
}