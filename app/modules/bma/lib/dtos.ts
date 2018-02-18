// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {DBPeer as DBPeer2} from "../../../lib/dal/sqliteDAL/PeerDAL"
import {WS2PHead} from "../../ws2p/lib/WS2PCluster"

export const Summary = {
  duniter: {
    "software": String,
    "version": String,
    "forkWindowSize": Number
  }
};

export interface HttpSummary {
  duniter: {
    software: string
    version: string
    forkWindowSize: number
  }
}

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

export interface HttpParameters {
  currency: string
  c: number
  dt: number
  ud0: number
  sigPeriod: number
  sigStock: number
  sigWindow: number
  sigValidity: number
  sigQty: number
  idtyWindow: number
  msWindow: number
  xpercent: number
  msValidity: number
  stepMax: number
  medianTimeBlocks: number
  avgGenTime: number
  dtDiffEval: number
  percentRot: number
  udTime0: number
  udReevalTime0: number
  dtReeval: number
}

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

export interface HttpMemberships {
  pubkey: string
  uid: string
  sigDate: string
  memberships: [
    {
      version: number
      currency: string
      membership: string
      blockNumber: number
      blockHash: string
      written: number
    }
  ]
}

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

export interface HttpMembershipList {
  memberships: [
    {
      pubkey: string
      uid: string
      version: number
      currency: string
      membership: string
      blockNumber: number
      blockHash: string
      written: number
    }
  ]
}

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

export function block2HttpBlock(blockDTO:BlockDTO): HttpBlock {
  return {
    version: blockDTO.version,
    currency: blockDTO.currency,
    number: blockDTO.number,
    issuer: blockDTO.issuer,
    issuersFrame: blockDTO.issuersFrame,
    issuersFrameVar: blockDTO.issuersFrameVar,
    issuersCount: blockDTO.issuersCount,
    parameters: blockDTO.parameters,
    membersCount: blockDTO.membersCount,
    monetaryMass: blockDTO.monetaryMass,
    powMin: blockDTO.powMin,
    time: blockDTO.time,
    medianTime: blockDTO.medianTime,
    dividend: blockDTO.dividend,
    unitbase: blockDTO.unitbase,
    hash: blockDTO.hash,
    previousHash: blockDTO.previousHash,
    previousIssuer: blockDTO.previousIssuer,
    identities: blockDTO.identities,
    certifications: blockDTO.certifications,
    joiners: blockDTO.joiners,
    actives: blockDTO.actives,
    leavers: blockDTO.leavers,
    revoked: blockDTO.revoked,
    excluded: blockDTO.excluded,
    transactions: blockDTO.transactions.map((tx):HttpTransactionOfBlock => {
      return {
        version: tx.version,
        currency: tx.currency,
        comment: tx.comment,
        locktime: tx.locktime,
        issuers: tx.issuers,
        signatures: tx.signatures,
        outputs: tx.outputs,
        inputs: tx.inputs,
        unlocks: tx.unlocks,
        block_number: tx.blockNumber,
        blockstamp: tx.blockstamp,
        blockstampTime: tx.blockstampTime,
        time: tx.blockstampTime
      }
    }),
    nonce: blockDTO.nonce,
    inner_hash: blockDTO.inner_hash,
    signature: blockDTO.signature,
    raw: blockDTO.getRawSigned()
  }
}

export const Hardship = {
  "block": Number,
  "level": Number
};

export interface HttpHardship {
  block: number
  level: number
}

export const Difficulty = {
  "uid": String,
  "level": Number
};

export interface HttpDifficulty {
  uid: string
  level: number
}

export const Difficulties = {
  "block": Number,
  "levels": [Difficulty]
};

export interface HttpDifficulties {
  block: number
  levels: HttpDifficulty[]
}

export const Blocks = [Block];

export const Stat = {
  "result": {
    "blocks": [Number]
  }
};

export interface HttpStat {
  result: {
    blocks: number[]
  }
}

export const Branches = {
  "blocks": [Block]
};

export interface HttpBranches {
  blocks: HttpBlock[]
}

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

export interface HttpPeers {
  peers: DBPeer2[]
}

export interface HttpWS2PInfo {
  peers: {
    level1: number,
    level2: number
  }
}

export interface HttpWS2PHeads {
  heads: WS2PHead[]
}

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

export interface HttpMerkleOfPeers {
  depth: number
  nodesCount: number
  leavesCount: number
  root: string
  leaves: string[]
  leaf: {
    hash: string
    value: DBPeer2
  }
}

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

export interface HttpOther {
  pubkey: string,
  meta: {
    block_number: number,
    block_hash: string
  },
  uids: string[],
  isMember: boolean,
  wasMember: boolean,
  signature: string
}

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

export interface HttpUID {
  uid: string,
  meta: {
    timestamp: string
  },
  self: string,
  revocation_sig: string,
  revoked: boolean,
  revoked_on: number,
  others: HttpOther[]
}

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

export interface HttpSigned {
  uid: string,
  pubkey: string,
  meta: {
    timestamp: string
  },
  cert_time: {
    block: number,
    block_hash: string
  },
  isMember: boolean,
  wasMember: boolean,
  signature: string
}

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

export interface HttpIdentity {
  pubkey: string,
  uids: HttpUID[],
  signed: HttpSigned[]
}

export const Result = {
  "result": Boolean
};

export interface HttpResult {
  result: boolean
}

export const Lookup = {
  "partial": Boolean,
  "results": [Identity]
};

export interface HttpLookup {
  partial: boolean
  results: HttpIdentity[]
}

export const Members = {
  "results": [{
    pubkey: String,
    uid: String
  }]
};

export interface HttpMembers {
  results: {
    pubkey: string,
    uid: string
  }[]
}

export const RequirementsCert = {
  from: String,
  to: String,
  expiresIn: Number,
  sig: String
};

export interface HttpRequirementsCert {
  from: string
  to: string
  expiresIn: number
  sig: string
}

export const RequirementsPendingCert = {
  from: String,
  to: String,
  blockstamp: String,
  sig: String
};

export interface HttpRequirementsPendingCert {
  from: string
  to: string
  blockstamp: string
  sig: string
}

export const RequirementsPendingMembership = {
  type: String,
  blockstamp: String,
  sig: String
};

export interface HttpRequirementsPendingMembership {
  type: string,
  blockstamp: string,
  sig: string
}

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

export interface HttpRequirements {
  identities: HttpIdentityRequirement[]
}

export interface HttpIdentityRequirement {
  pubkey: string
  uid: string
  meta: {
    timestamp: string
  }
  sig: string
  revocation_sig: string | null
  revoked: boolean
  revoked_on: number | null
  expired: boolean
  outdistanced: boolean
  isSentry: boolean
  wasMember: boolean
  certifications: HttpRequirementsCert[]
  pendingCerts: HttpRequirementsPendingCert[]
  pendingMemberships: HttpRequirementsPendingMembership[]
  membershipPendingExpiresIn: number
  membershipExpiresIn: number
}

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

export interface HttpCertification {
  pubkey: string
  uid: string
  isMember: boolean
  wasMember: boolean
  cert_time: {
    block: number
    medianTime: number
  }
  sigDate: string
  written: {
    number: number
    hash: string
  }
  signature: string
}

export const Certifications = {
  "pubkey": String,
  "uid": String,
  "sigDate": String,
  "isMember": Boolean,
  "certifications": [Certification]
};

export interface HttpCertifications {
  pubkey: string
  uid: string
  sigDate: string
  isMember: boolean
  certifications: HttpCertification[]
}

export const SimpleIdentity = {
  "pubkey": String,
  "uid": String,
  "sigDate": String
};

export interface HttpSimpleIdentity {
  pubkey: string
  uid: string
  sigDate: string
}

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

export interface HttpTransaction {
  version: number
  currency: string
  issuers: string[]
  inputs: string[]
  unlocks: string[]
  outputs: string[]
  comment: string
  locktime: number
  signatures: string[]
  raw: string
  written_block: number|null
  hash: string
}

export const Source = {
  "type": String,
  "noffset": Number,
  "identifier": String,
  "amount": Number,
  "base": Number,
  "conditions": String
};

export interface HttpSource {
  type: string
  noffset: number
  identifier: string
  amount: number
  base: number
  conditions: string
}

export const Sources = {
  "currency": String,
  "pubkey": String,
  "sources": [Source]
};

export interface HttpSources {
  currency: string
  pubkey: string
  sources: HttpSource[]
}

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

export interface HttpTxOfHistory {
  version: number
  issuers: string[]
  inputs: string[]
  unlocks: string[]
  outputs: string[]
  comment: string
  locktime: number
  received: number
  signatures: string[]
  hash: string
  block_number: number|null
  time: number|null
  blockstamp: string
  blockstampTime: number|null
}

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

export interface HttpTxHistory {
  currency: string
  pubkey: string
  history: {
    sent: HttpTxOfHistory[]
    received: HttpTxOfHistory[]
    sending: HttpTxOfHistory[]
    receiving: HttpTxOfHistory[]
    pending: HttpTxOfHistory[]
  }
}

export const TxPending = {
  "currency": String,
  "pending": [Transaction]
};

export interface HttpTxPending {
  currency: string
  pending: HttpTransaction[]
}

export const UD = {
  "block_number": Number,
  "consumed": Boolean,
  "time": Number,
  "amount": Number,
  "base": Number
};

export interface HttpUD {
  block_number: number
  consumed: boolean
  time: number
  amount: number
  base: number
}

export const UDHistory = {
  "currency": String,
  "pubkey": String,
  "history": {
    "history": [UD]
  }
};

export interface HttpUDHistory {
  currency: string
  pubkey: string
  history: {
    history: HttpUD[]
  }
}

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

export interface HttpSandbox {
  size: number
  free: number
}

export const IdentitySandbox = Sandbox;
export const MembershipSandbox = Sandbox;
export const TransactionSandbox = Sandbox;

export const Sandboxes = {
  identities: IdentitySandbox,
  memberships: MembershipSandbox,
  transactions: TransactionSandbox
};

export interface HttpSandboxes {
  identities: HttpSandbox
  memberships: HttpSandbox
  transactions: HttpSandbox
}

export const LogLink = {
  link: String
};
