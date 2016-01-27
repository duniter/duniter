"use strict";

let dtos;

module.exports = dtos = {};

dtos.Summary = {
  ucoin: {
    "software": String,
    "version": String,
    "forkWindowSize": Number
  }
};

dtos.Parameters = {
  currency: String,
  c: Number,
  dt: Number,
  ud0: Number,
  sigDelay: Number,
  sigPeriod: Number,
  sigValidity: Number,
  sigQty: Number,
  sigWoT: Number,
  msValidity: Number,
  stepMax: Number,
  medianTimeBlocks: Number,
  avgGenTime: Number,
  dtDiffEval: Number,
  blocksRot: Number,
  percentRot: Number
};

dtos.Membership = {
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

dtos.Memberships = {
  "pubkey": String,
  "uid": String,
  "sigDate": Number,
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

dtos.TransactionOfBlock = {
  "version": Number,
  "currency": String,
  "comment": String,
  "signatures": [String],
  "outputs": [String],
  "inputs": [String],
  "signatories": [String],
  "block_number": Number,
  "time": Number,
  "issuers": [String]
};

dtos.Block = {
  "version": Number,
  "currency": String,
  "nonce": Number,
  "number": Number,
  "issuer": String,
  "parameters": String,
  "membersCount": Number,
  "monetaryMass": Number,
  "powMin": Number,
  "time": Number,
  "medianTime": Number,
  "dividend": Number,
  "hash": String,
  "previousHash": String,
  "previousIssuer": String,
  "identities": [String],
  "certifications": [String],
  "joiners": [String],
  "actives": [String],
  "leavers": [String],
  "excluded": [String],
  "transactions": [dtos.TransactionOfBlock],
  "signature": String,
  "raw": String
};

dtos.Hardship = {
  "block": Number,
  "level": Number
};

dtos.Difficulty = {
  "uid": String,
  "level": Number
};

dtos.Difficulties = {
  "block": Number,
  "levels": [dtos.Difficulty]
};

dtos.Blocks = [dtos.Block];

dtos.Stat = {
  "result": {
    "blocks": [Number]
  }
};

dtos.Branches = {
  "blocks": [dtos.Block]
};

dtos.Peer = {
  "version": Number,
  "currency": String,
  "pubkey": String,
  "block": String,
  "endpoints": [String],
  "signature": String,
  "raw": String
};

dtos.DBPeer = {
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

dtos.Peers = {
  "peers": [dtos.DBPeer]
};

dtos.MerkleOfPeers = {
  "depth": Number,
  "nodesCount": Number,
  "leavesCount": Number,
  "root": String,
  "leaves": [String],
  "leaf": {
    "hash": String,
    "value": dtos.DBPeer
  }
};

dtos.Other = {
  "pubkey": String,
  "meta": {
    "block_number": Number
  },
  "uids": [String],
  "isMember": Boolean,
  "wasMember": Boolean,
  "signature": String
};

dtos.UID = {
  "uid": String,
  "meta": {
    "timestamp": Number
  },
  "self": String,
  "others": [dtos.Other]
};

dtos.Signed = {
  "uid": String,
  "pubkey": String,
  "meta": {
    "timestamp": Number
  },
  "isMember": Boolean,
  "wasMember": Boolean,
  "signature": String
};

dtos.Identity = {
  "pubkey": String,
  "uids": [dtos.UID],
  "signed": [dtos.Signed]
};

dtos.Result = {
  "result": Boolean
};

dtos.Lookup = {
  "partial": Boolean,
  "results": [dtos.Identity]
};

dtos.Members = {
  "results": [{
    pubkey: String,
    uid: String
  }]
};

dtos.RequirementsCert = {
  from: String,
  to: String,
  expiresIn: Number
};

dtos.Requirements = {
  "identities": [{
    pubkey: String,
    uid: String,
    meta: {
      timestamp: Number
    },
    outdistanced: Boolean,
    certifications: [dtos.RequirementsCert],
    membershipPendingExpiresIn: Number,
    membershipExpiresIn: Number
  }]
};

dtos.Certification = {
  "pubkey": String,
  "uid": String,
  "isMember": Boolean,
  "wasMember": Boolean,
  "cert_time": {
    "block": Number,
    "medianTime": Number
  },
  "sigDate": Number,
  "written": {
    "number": Number,
    "hash": String
  },
  "signature": String
};

dtos.Certifications = {
  "pubkey": String,
  "uid": String,
  "sigDate": Number,
  "isMember": Boolean,
  "certifications": [dtos.Certification]
};

dtos.SimpleIdentity = {
  "pubkey": String,
  "uid": String,
  "sigDate": Number
};

dtos.Transaction = {
  "version": Number,
  "currency": String,
  "issuers": [String],
  "inputs": [String],
  "outputs": [String],
  "comment": String,
  "signatures": [String],
  "raw": String,
  "hash": String
};

dtos.Source = {
  "pubkey": String,
  "type": String,
  "number": Number,
  "fingerprint": String,
  "amount": Number
};

dtos.Sources = {
  "currency": String,
  "pubkey": String,
  "sources": [dtos.Source]
};

dtos.TxOfHistory = {
  "version": Number,
  "issuers": [String],
  "inputs": [String],
  "outputs": [String],
  "comment": String,
  "signatures": [String],
  "hash": String,
  "block_number": Number,
  "time": Number
};

dtos.TxHistory = {
  "currency": String,
  "pubkey": String,
  "history": {
    "sent": [dtos.TxOfHistory],
    "received": [dtos.TxOfHistory],
    "sending": [dtos.TxOfHistory],
    "receiving": [dtos.TxOfHistory],
    "pending": [dtos.TxOfHistory]
  }
};

dtos.TxPending = {
  "currency": String,
  "pending": [dtos.Transaction]
};

dtos.UD = {
  "block_number": Number,
  "consumed": Boolean,
  "time": Number,
  "amount": Number
};

dtos.UDHistory = {
  "currency": String,
  "pubkey": String,
  "history": {
    "history": [dtos.UD]
  }
};
