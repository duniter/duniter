
export const Summary = {
  duniter: {
    "software": String,
    "version": String,
    "forkWindowSize": Number
  }
};

export const Parameters = {
  currency: String,
  c: Number,
  dt: Number,
  ud0: Number,
  sigPeriod: Number,
  sigStock: Number,
  sigWindow: Number,
  sigValidity: Number,
  sigQty: Number,
  idtyWindow: Number,
  msWindow: Number,
  xpercent: Number,
  msValidity: Number,
  stepMax: Number,
  medianTimeBlocks: Number,
  avgGenTime: Number,
  dtDiffEval: Number,
  percentRot: Number,
  udTime0: Number,
  udReevalTime0: Number,
  dtReeval: Number
};

export const Membership = {
  "signature": String,
  "membership": {
    "version": Number,
    "currency": String,
    "issuer": String,
    "membership": String,
    "date": Number,
    "sigDate": Number,
    "raw": String
  }
};

export interface HttpMembership {
  signature: string
  membership: {
    version: number
    currency: string
    issuer: string
    membership: string
    date: number
    sigDate: number
    raw: string
  }
}

export const Memberships = {
  "pubkey": String,
  "uid": String,
  "sigDate": String,
  "memberships": [
    {
      "version": Number,
      "currency": String,
      "membership": String,
      "blockNumber": Number,
      "blockHash": String,
      "written": Number
    }
  ]
};

export const MembershipList = {
  "memberships": [
    {
      "pubkey": String,
      "uid": String,
      "version": Number,
      "currency": String,
      "membership": String,
      "blockNumber": Number,
      "blockHash": String,
      "written": Number
    }
  ]
};

export const TransactionOfBlock = {
  "version": Number,
  "currency": String,
  "comment": String,
  "locktime": Number,
  "signatures": [String],
  "outputs": [String],
  "inputs": [String],
  "unlocks": [String],
  "block_number": Number,
  "blockstamp": String,
  "blockstampTime": Number,
  "time": Number,
  "issuers": [String]
};

export interface HttpTransactionOfBlock {
  version: number
  currency: string
  comment: string
  locktime: number
  signatures: string[]
  outputs: string[]
  inputs: string[]
  unlocks: string[]
  block_number: number
  blockstamp: string
  blockstampTime: number
  time: number
  issuers: string[]
}

export const Block = {
  "version": Number,
  "currency": String,
  "number": Number,
  "issuer": String,
  "issuersFrame": Number,
  "issuersFrameVar": Number,
  "issuersCount": Number,
  "parameters": String,
  "membersCount": Number,
  "monetaryMass": Number,
  "powMin": Number,
  "time": Number,
  "medianTime": Number,
  "dividend": Number,
  "unitbase": Number,
  "hash": String,
  "previousHash": String,
  "previousIssuer": String,
  "identities": [String],
  "certifications": [String],
  "joiners": [String],
  "actives": [String],
  "leavers": [String],
  "revoked": [String],
  "excluded": [String],
  "transactions": [TransactionOfBlock],
  "nonce": Number,
  "inner_hash": String,
  "signature": String,
  "raw": String
};

export interface HttpBlock {
  version: number
  currency: string
  number: number
  issuer: string
  issuersFrame: number
  issuersFrameVar: number
  issuersCount: number
  parameters: string
  membersCount: number
  monetaryMass: number
  powMin: number
  time: number
  medianTime: number
  dividend: number
  unitbase: number
  hash: string
  previousHash: string
  previousIssuer: string
  identities: string[]
  certifications: string[]
  joiners: string[]
  actives: string[]
  leavers: string[]
  revoked: string[]
  excluded: string[]
  transactions: HttpTransactionOfBlock[]
  nonce: number
  inner_hash: string
  signature: string
  raw: string
}

export const Hardship = {
  "block": Number,
  "level": Number
};

export const Difficulty = {
  "uid": String,
  "level": Number
};

export const Difficulties = {
  "block": Number,
  "levels": [Difficulty]
};

export const Blocks = [Block];

export const Stat = {
  "result": {
    "blocks": [Number]
  }
};

export const Branches = {
  "blocks": [Block]
};

export const Peer = {
  "version": Number,
  "currency": String,
  "pubkey": String,
  "block": String,
  "endpoints": [String],
  "signature": String,
  "raw": String
};

export interface HttpPeer {
  version: number
  currency: string
  pubkey: string
  block: string
  endpoints: string[]
  signature: string
  raw: string
}

export const DBPeer = {
  "version": Number,
  "currency": String,
  "pubkey": String,
  "block": String,
  "status": String,
  "first_down": Number,
  "last_try": Number,
  "endpoints": [String],
  "signature": String,
  "raw": String
};

export const Peers = {
  "peers": [DBPeer]
};

export const MerkleOfPeers = {
  "depth": Number,
  "nodesCount": Number,
  "leavesCount": Number,
  "root": String,
  "leaves": [String],
  "leaf": {
    "hash": String,
    "value": DBPeer
  }
};

export const Other = {
  "pubkey": String,
  "meta": {
    "block_number": Number,
    "block_hash": String
  },
  "uids": [String],
  "isMember": Boolean,
  "wasMember": Boolean,
  "signature": String
};

export const UID = {
  "uid": String,
  "meta": {
    "timestamp": String
  },
  "self": String,
  "revocation_sig": String,
  "revoked": Boolean,
  "revoked_on": Number,
  "others": [Other]
};

export const Signed = {
  "uid": String,
  "pubkey": String,
  "meta": {
    "timestamp": String
  },
  "cert_time": {
    "block": Number,
    "block_hash": String
  },
  "isMember": Boolean,
  "wasMember": Boolean,
  "signature": String
};

export const CertIdentity = {
  "issuer": String,
  "uid": String,
  "timestamp": String,
  "sig": String
};

export interface HttpCertIdentity {
  issuer: string
  uid: string
  timestamp: string
  sig: string
}

export const Cert = {
  "issuer": String,
  "timestamp": String,
  "sig": String,
  "target": CertIdentity
};

export interface HttpCert {
  issuer: string
  timestamp: string
  sig: string
  target: HttpCertIdentity
}

export const Identity = {
  "pubkey": String,
  "uids": [UID],
  "signed": [Signed]
};

export const Result = {
  "result": Boolean
};

export const Lookup = {
  "partial": Boolean,
  "results": [Identity]
};

export const Members = {
  "results": [{
    pubkey: String,
    uid: String
  }]
};

export const RequirementsCert = {
  from: String,
  to: String,
  expiresIn: Number,
  sig: String
};

export const RequirementsPendingCert = {
  from: String,
  to: String,
  blockstamp: String,
  sig: String
};

export const RequirementsPendingMembership = {
  type: String,
  blockstamp: String,
  sig: String
};

export const Requirements = {
  "identities": [{
    pubkey: String,
    uid: String,
    meta: {
      timestamp: String
    },
    sig: String,
    revocation_sig: String,
    revoked: Boolean,
    revoked_on: Number,
    expired: Boolean,
    outdistanced: Boolean,
    isSentry: Boolean,
    wasMember: Boolean,
    certifications: [RequirementsCert],
    pendingCerts: [RequirementsPendingCert],
    pendingMemberships: [RequirementsPendingMembership],
    membershipPendingExpiresIn: Number,
    membershipExpiresIn: Number
  }]
};

export const Certification = {
  "pubkey": String,
  "uid": String,
  "isMember": Boolean,
  "wasMember": Boolean,
  "cert_time": {
    "block": Number,
    "medianTime": Number
  },
  "sigDate": String,
  "written": {
    "number": Number,
    "hash": String
  },
  "signature": String
};

export const Certifications = {
  "pubkey": String,
  "uid": String,
  "sigDate": String,
  "isMember": Boolean,
  "certifications": [Certification]
};

export const SimpleIdentity = {
  "pubkey": String,
  "uid": String,
  "sigDate": String
};

export const Transaction = {
  "version": Number,
  "currency": String,
  "issuers": [String],
  "inputs": [String],
  "unlocks": [String],
  "outputs": [String],
  "comment": String,
  "locktime": Number,
  "signatures": [String],
  "raw": String,
  "written_block": Number,
  "hash": String
};

export const Source = {
  "type": String,
  "noffset": Number,
  "identifier": String,
  "amount": Number,
  "base": Number,
  "conditions": String
};

export const Sources = {
  "currency": String,
  "pubkey": String,
  "sources": [Source]
};

export const TxOfHistory = {
  "version": Number,
  "issuers": [String],
  "inputs": [String],
  "unlocks": [String],
  "outputs": [String],
  "comment": String,
  "locktime": Number,
  "received": Number,
  "signatures": [String],
  "hash": String,
  "block_number": Number,
  "time": Number,
  "blockstamp": String,
  "blockstampTime": Number
};

export const TxHistory = {
  "currency": String,
  "pubkey": String,
  "history": {
    "sent": [TxOfHistory],
    "received": [TxOfHistory],
    "sending": [TxOfHistory],
    "receiving": [TxOfHistory],
    "pending": [TxOfHistory]
  }
};

export const TxPending = {
  "currency": String,
  "pending": [Transaction]
};

export const UD = {
  "block_number": Number,
  "consumed": Boolean,
  "time": Number,
  "amount": Number,
  "base": Number
};

export const UDHistory = {
  "currency": String,
  "pubkey": String,
  "history": {
    "history": [UD]
  }
};

export const BooleanDTO = {
  "success": Boolean
};

export const SummaryConf = {
  "cpu": Number
};

export const AdminSummary = {
  "version": String,
  "host": String,
  "current": Block,
  "rootBlock": Block,
  "pubkey": String,
  "seckey": String,
  "conf": SummaryConf,
  "parameters": Parameters,
  "lastUDBlock": Block
};

export const PoWSummary = {
  "total": Number,
  "mirror": Boolean,
  "waiting": Boolean
};

export const PreviewPubkey = {
  "pubkey": String
};

export const Sandbox = {
  size: Number,
  free: Number
};

export const IdentitySandbox = Sandbox;
export const MembershipSandbox = Sandbox;
export const TransactionSandbox = Sandbox;

export const Sandboxes = {
  identities: IdentitySandbox,
  memberships: MembershipSandbox,
  transactions: TransactionSandbox
};

export const LogLink = {
  link: String
};
