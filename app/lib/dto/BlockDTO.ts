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

import {TransactionDTO} from "./TransactionDTO"
import {CurrencyConfDTO} from "./ConfDTO"
import {hashf} from "../common"
import {Cloneable} from "./Cloneable"
import {MonitorExecutionTime} from "../debug/MonitorExecutionTime"

const DEFAULT_DOCUMENT_VERSION = 10

export class BlockDTO implements Cloneable {

  clone(): any {
    return BlockDTO.fromJSONObject(this)
  }

  version: number
  number: number
  currency: string
  hash: string
  inner_hash: string
  previousHash: string
  issuer: string
  previousIssuer: string
  dividend: number|null
  time: number
  powMin: number
  unitbase: number
  membersCount: number
  issuersCount: number
  issuersFrame: number
  issuersFrameVar: number
  identities: string[] = []
  joiners: string[] = []
  actives: string[] = []
  leavers: string[] = []
  revoked: string[] = []
  excluded: string[] = []
  certifications: string[] = []
  transactions: TransactionDTO[] = []
  medianTime: number
  nonce: number
  fork: boolean
  parameters: string
  signature: string
  monetaryMass: number
  UDTime: number

  constructor() {
  }

  json() {
    return {
      version: this.version,
      nonce: this.nonce,
      number: this.number,
      powMin: this.powMin,
      time: this.time,
      medianTime: this.medianTime,
      membersCount: this.membersCount,
      monetaryMass: this.monetaryMass,
      unitbase: this.unitbase,
      issuersCount: this.issuersCount,
      issuersFrame: this.issuersFrame,
      issuersFrameVar: this.issuersFrameVar,
      len: this.len,
      currency: this.currency,
      issuer: this.issuer,
      signature: this.signature,
      hash: this.hash,
      parameters: this.parameters,
      previousHash: this.previousHash,
      previousIssuer: this.previousIssuer,
      inner_hash: this.inner_hash,
      dividend: this.dividend,
      identities: this.identities,
      joiners: this.joiners,
      actives: this.actives,
      leavers: this.leavers,
      revoked: this.revoked,
      excluded: this.excluded,
      certifications: this.certifications,
      transactions: this.transactions.map((tx) => {
        return {
          version: tx.version,
          currency: tx.currency,
          locktime: tx.locktime,
          blockstamp: tx.blockstamp,
          blockstampTime: tx.blockstampTime,
          issuers: tx.issuers,
          inputs: tx.inputs,
          outputs: tx.outputs,
          unlocks: tx.unlocks,
          signatures: tx.signatures,
          comment: tx.comment
        }
      })
    }
  }

  get len() {
    return this.identities.length +
      this.joiners.length +
      this.actives.length +
      this.leavers.length +
      this.revoked.length +
      this.certifications.length +
      this.transactions.reduce((sum, tx) => sum + tx.getLen(), 0)
  }

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

  getRawUnSigned() {
    return this.getRawInnerPart() + this.getSignedPart()
  }

  getRawSigned() {
    return this.getRawUnSigned() + this.signature + "\n"
  }

  getSignedPart() {
    return "InnerHash: " + this.inner_hash + "\n" +
      "Nonce: " + this.nonce + "\n"
  }

  getSignedPartSigned() {
    return this.getSignedPart() + this.signature + "\n"
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

  getHash() {
    return hashf(this.getSignedPartSigned())
  }

  get blockstamp() {
    return [this.number, this.getHash()].join('-')
  }

  @MonitorExecutionTime()
  static fromJSONObject(obj:any) {
    const dto = new BlockDTO()
    dto.version = parseInt(obj.version) || DEFAULT_DOCUMENT_VERSION
    dto.number = parseInt(obj.number)
    dto.currency = obj.currency || ""
    dto.hash = obj.hash || ""
    dto.inner_hash = obj.inner_hash
    dto.previousHash = obj.previousHash
    dto.issuer = obj.issuer || ""
    dto.previousIssuer = obj.previousIssuer
    dto.dividend = obj.dividend || null
    dto.time = parseInt(obj.time)
    dto.powMin = parseInt(obj.powMin)
    dto.monetaryMass = parseInt(obj.monetaryMass)
    if (isNaN(dto.monetaryMass) && obj.mass !== undefined) {
      dto.monetaryMass = parseInt(obj.mass)
    }
    if (isNaN(dto.monetaryMass)) {
      dto.monetaryMass = 0
    }
    dto.unitbase = parseInt(obj.unitbase)
    dto.membersCount = parseInt(obj.membersCount)
    dto.issuersCount = parseInt(obj.issuersCount)
    dto.issuersFrame = parseInt(obj.issuersFrame)
    dto.issuersFrameVar = parseInt(obj.issuersFrameVar)
    dto.identities = obj.identities || []
    dto.joiners = obj.joiners || []
    dto.actives = obj.actives || []
    dto.leavers = obj.leavers || []
    dto.revoked = obj.revoked || []
    dto.excluded = obj.excluded || []
    dto.certifications = obj.certifications || []
    dto.transactions = (obj.transactions || []).map((tx:any) => TransactionDTO.fromJSONObject(tx))
    dto.medianTime = parseInt(obj.medianTime)
    dto.fork = !!obj.fork
    dto.parameters = obj.parameters || ""
    dto.signature = obj.signature || ""
    dto.nonce = parseInt(obj.nonce)
    return dto
  }

  static getConf(block:BlockDTO): CurrencyConfDTO {
    const sp = block.parameters.split(':');
    return {
      currency: block.currency,
      c: parseFloat(sp[0]),
      dt: parseInt(sp[1]),
      ud0: parseInt(sp[2]),
      sigPeriod: parseInt(sp[3]),
      sigStock: parseInt(sp[4]),
      sigWindow: parseInt(sp[5]),
      sigValidity: parseInt(sp[6]),
      sigQty: parseInt(sp[7]),
      idtyWindow: parseInt(sp[8]),
      msWindow: parseInt(sp[9]),
      xpercent: parseFloat(sp[10]),
      msValidity: parseInt(sp[11]),
      stepMax: parseInt(sp[12]),
      medianTimeBlocks: parseInt(sp[13]),
      avgGenTime: parseInt(sp[14]),
      dtDiffEval: parseInt(sp[15]),
      percentRot: parseFloat(sp[16]),
      udTime0: parseInt(sp[17]),
      udReevalTime0: parseInt(sp[18]),
      dtReeval: parseInt(sp[19]),
      // New parameter, defaults to msWindow
      msPeriod: parseInt(sp[9])
    }
  }

  static getLen(block:any) {
    return BlockDTO.fromJSONObject(block).len
  }

  static getHash(block:any) {
    return BlockDTO.fromJSONObject(block).getHash()
  }
}