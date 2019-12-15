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

import {hashf} from "../common"
import {Cloneable} from "./Cloneable"
import {verify, verifyBuggy} from "../common-libs/crypto/keyring"

export interface BaseDTO {
  base: number
}

export class InputDTO implements BaseDTO {
  constructor(
    public amount: number,
    public base: number,
    public type: 'T'|'D',
    public identifier: string,
    public pos: number,
    public raw: string
  ) {}
}

export class OutputDTO implements BaseDTO {
  constructor(
    public amount: number,
    public base: number,
    public conditions: string,
    public raw: string
  ) {}
}

export interface TxSignatureResult {
  sigs:{
    k:string
    ok:boolean
  }[]
}

export class TxSignatureResultImpl implements TxSignatureResult {

  // The signature results
  public sigs:{
    k:string
    ok:boolean
  }[]

  constructor(issuers:string[]) {
    this.sigs = issuers.map(k => {
      return { k, ok: false }
    })
  }

  get allMatching() {
    return this.sigs.reduce((ok, s) => ok && s.ok, true)
  }
}

export class TransactionDTO implements Cloneable {

  clone(): any {
    return TransactionDTO.fromJSONObject(this)
  }

  constructor(
    public version: number,
    public currency: string,
    public locktime: number,
    public hash: string,
    public blockstamp: string,
    public blockstampTime: number,
    public issuers: string[],
    public inputs: string[],
    public outputs: string[],
    public unlocks: string[],
    public signatures: string[],
    public comment: string
  ) {
    // Compute the hash if not given
    if (!hash) {
      this.hash = this.getHash()
    }
  }

  get signature() {
    return this.signatures[0]
  }

  get output_amount() {
    return this.outputs.reduce((maxBase, output) => Math.max(maxBase, parseInt(output.split(':')[0])), 0)
  }

  get output_base() {
    return this.outputs.reduce((sum, output) => sum + parseInt(output.split(':')[1]), 0)
  }

  get blockNumber() {
    return parseInt(this.blockstamp)
  }

  get block_hash() {
    return this.blockstamp.split('-')[1]
  }

  getLen() {
    return 2 // header + blockstamp
      + this.issuers.length * 2 // issuers + signatures
      + this.inputs.length * 2 // inputs + unlocks
      + (this.comment ? 1 : 0)
      + this.outputs.length
  }

  getHash() {
    const raw = TransactionDTO.toRAW(this)
    return hashf(raw)
  }

  getRawTxNoSig() {
    return TransactionDTO.toRAW(this, true)
  }

  inputsAsObjects(): InputDTO[] {
    return this.inputs.map(input => {
      const [amount, base, type, identifier, pos] = input.split(':')
      return new InputDTO(
        parseInt(amount),
        parseInt(base),
        type as 'T'|'D',
        identifier,
        parseInt(pos),
        input
      )
    })
  }

  outputsAsObjects(): OutputDTO[] {
    return this.outputs.map(output => {
      const [amount, base, conditions] = output.split(':')
      return new OutputDTO(
        parseInt(amount),
        parseInt(base),
        conditions,
        output
      )
    })
  }

  outputsAsRecipients(): string[] {
    return this.outputs.map((out) => {
      const recipent = out.match('SIG\\((.*)\\)');
      return (recipent && recipent[1]) || 'UNKNOWN';
    })
  }

  getRaw() {
    let raw = ""
    raw += "Version: " + (this.version) + "\n"
    raw += "Type: Transaction\n"
    raw += "Currency: " + this.currency + "\n"
    raw += "Blockstamp: " + this.blockstamp + "\n"
    raw += "Locktime: " + this.locktime + "\n"
    raw += "Issuers:\n";
    (this.issuers || []).forEach((issuer) => {
      raw += issuer + '\n'
    })
    raw += "Inputs:\n";
    this.inputs.forEach((input) => {
      raw += input + '\n'
    })
    raw += "Unlocks:\n";
    this.unlocks.forEach((unlock) => {
      raw += unlock + '\n'
    })
    raw += "Outputs:\n";
    this.outputs.forEach((output) => {
      raw += output + '\n'
    })
    raw += "Comment: " + (this.comment || "") + "\n";
    this.signatures.forEach((signature) => {
      raw += signature + '\n'
    })
    return raw
  }

  getCompactVersion() {
    let issuers = this.issuers;
    let raw = ["TX", this.version, issuers.length, this.inputs.length, this.unlocks.length, this.outputs.length, this.comment ? 1 : 0, this.locktime || 0].join(':') + '\n';
    raw += this.blockstamp + "\n";
    (issuers || []).forEach((issuer) => {
      raw += issuer + '\n';
    });
    (this.inputs || []).forEach((input) => {
      raw += input + '\n';
    });
    (this.unlocks || []).forEach((input) => {
      raw += input + '\n';
    });
    (this.outputs || []).forEach((output) => {
      raw += output + '\n';
    });
    if (this.comment)
      raw += this.comment + '\n';
    (this.signatures || []).forEach((signature) => {
      raw += signature + '\n'
    })
    return raw
  }

  computeAllHashes() {
    this.hash = hashf(this.getRaw()).toUpperCase();
  }

  json() {
    return {
      'version': this.version,
      'currency': this.currency,
      'issuers': this.issuers,
      'inputs': this.inputs,
      'unlocks': this.unlocks,
      'outputs': this.outputs,
      'comment': this.comment,
      'locktime': this.locktime,
      'blockstamp': this.blockstamp,
      'blockstampTime': this.blockstampTime,
      'signatures': this.signatures,
      'raw': this.getRaw(),
      'hash': this.hash
    }
  }

  getTransactionSigResult(dubp_version: number) {
    const sigResult = new TxSignatureResultImpl(this.issuers.slice())
    let i = 0
    const raw = this.getRawTxNoSig()
    let matching = true
    while (matching && i < this.signatures.length) {
      const sig = this.signatures[i]
      const pub = this.issuers[i]
      if (dubp_version >= 12) {
        sigResult.sigs[i].ok = verify(raw, sig, pub)
      } else {
        sigResult.sigs[i].ok = verifyBuggy(raw, sig, pub)
      }
      matching = sigResult.sigs[i].ok 
      i++
    }
    return sigResult
  }

  checkSignatures(dubp_version: number) {
    return this.getTransactionSigResult(dubp_version).allMatching
  }

  static fromJSONObject(obj:any, currency:string = "") {
    return new TransactionDTO(
      obj.version || 10,
      currency || obj.currency || "",
      obj.locktime || 0,
      obj.hash || "",
      obj.blockstamp || "",
      obj.blockstampTime || 0,
      obj.issuers || [],
      obj.inputs || [],
      obj.outputs || [],
      obj.unlocks || [],
      obj.signatures || [],
      obj.comment || ""
    )
  }

  static toRAW(json:TransactionDTO, noSig = false) {
    let raw = ""
    raw += "Version: " + (json.version) + "\n"
    raw += "Type: Transaction\n"
    raw += "Currency: " + json.currency + "\n"
    raw += "Blockstamp: " + json.blockstamp + "\n"
    raw += "Locktime: " + json.locktime + "\n"
    raw += "Issuers:\n";
    (json.issuers || []).forEach((issuer) => {
      raw += issuer + '\n'
    })
    raw += "Inputs:\n";
    (json.inputs || []).forEach((input) => {
      raw += input + '\n'
    })
    raw += "Unlocks:\n";
    (json.unlocks || []).forEach((unlock) => {
      raw += unlock + '\n'
    })
    raw += "Outputs:\n";
    (json.outputs  || []).forEach((output) => {
      raw += output + '\n'
    })
    raw += "Comment: " + (json.comment || "") + "\n";
    if (!noSig) {
      (json.signatures || []).forEach((signature) => {
        raw += signature + '\n'
      })
    }
    return raw
  }

  static outputObj2Str(o:OutputDTO) {
    return [o.amount, o.base, o.conditions].join(':')
  }

  static inputObj2Str(i:InputDTO) {
    return [i.amount, i.base, i.type, i.identifier, i.pos].join(':')
  }

  static outputStr2Obj(outputStr:string) {
    const sp = outputStr.split(':');
    return {
      amount: parseInt(sp[0]),
      base: parseInt(sp[1]),
      conditions: sp[2],
      raw: outputStr
    };
  }

  static inputStr2Obj(inputStr:string) {
    const sp = inputStr.split(':')
    return {
      amount:     sp[0],
      base:       sp[1],
      type:       sp[2],
      identifier: sp[3],
      pos:        parseInt(sp[4]),
      raw:        inputStr
    }
  }

  static unlock2params(unlock:string) {
    const match = unlock.match(/^\d+:(.*)$/)
    if (match) {
      return match[1].split(' ')
    }
    return []
  }

  static mock() {
    return new TransactionDTO(1, "", 0, "", "", 0, [], [], [], [], [], "")
  }
}
