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

import {TransactionDTO} from "../dto/TransactionDTO"

export class DBTransaction extends TransactionDTO {

  constructor(
    public version: number,
    public currency: string,
    public locktime: number,
    public hash: string,
    public blockstamp: string,
    public issuers: string[],
    public inputs: string[],
    public outputs: string[],
    public unlocks: string[],
    public signatures: string[],
    public comment: string,
    public blockstampTime: number,
    public written: boolean,
    public removed: boolean,
    public block_number: number,
    public time: number,
  ) {
    super(
      version,
      currency,
      locktime,
      hash,
      blockstamp,
      blockstampTime,
      issuers,
      inputs,
      outputs,
      unlocks,
      signatures,
      comment
    )
  }

  static fromTransactionDTO(dto:TransactionDTO, blockstampTime:number, written: boolean, removed: boolean, block_number:number, block_medianTime:number) {
    return new DBTransaction(
      dto.version,
      dto.currency,
      dto.locktime,
      dto.hash,
      dto.blockstamp,
      dto.issuers,
      dto.inputs,
      dto.outputs,
      dto.unlocks,
      dto.signatures,
      dto.comment || "",
      blockstampTime,
      written,
      removed,
      block_number,
      block_medianTime
    )
  }
}