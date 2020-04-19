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

import { BlockDTO } from "../dto/BlockDTO";
import { TransactionDTO } from "../dto/TransactionDTO";

export class DBBlock {
  version: number;
  number: number;
  currency: string;
  hash: string;
  inner_hash: string;
  signature: string;
  previousHash: string;
  issuer: string;
  previousIssuer: string;
  time: number;
  powMin: number;
  unitbase: number;
  membersCount: number;
  issuersCount: number;
  issuersFrame: number;
  issuersFrameVar: number;
  identities: string[];
  joiners: string[];
  actives: string[];
  leavers: string[];
  revoked: string[];
  excluded: string[];
  certifications: string[];
  transactions: TransactionDTO[];
  medianTime: number;
  nonce: number;
  fork: boolean;
  parameters: string;
  monetaryMass: number;
  dividend: number | null;
  UDTime: number;
  writtenOn: number;
  written_on: string;
  wrong = false;

  constructor() {}

  toBlockDTO() {
    return BlockDTO.fromJSONObject(this);
  }

  static fromBlockDTO(b: BlockDTO) {
    const dbb = new DBBlock();
    dbb.version = b.version;
    dbb.number = b.number;
    dbb.currency = b.currency;
    dbb.hash = b.hash;
    dbb.previousHash = b.previousHash;
    dbb.issuer = b.issuer;
    dbb.previousIssuer = b.previousIssuer;
    dbb.dividend =
      b.dividend === null || b.dividend === undefined
        ? b.dividend
        : parseInt(String(b.dividend));
    dbb.time = b.time;
    dbb.powMin = b.powMin;
    dbb.unitbase = b.unitbase;
    dbb.membersCount = b.membersCount;
    dbb.issuersCount = b.issuersCount;
    dbb.issuersFrame = b.issuersFrame;
    dbb.issuersFrameVar = b.issuersFrameVar;
    dbb.identities = b.identities;
    dbb.joiners = b.joiners;
    dbb.actives = b.actives;
    dbb.leavers = b.leavers;
    dbb.revoked = b.revoked;
    dbb.excluded = b.excluded;
    dbb.certifications = b.certifications;
    dbb.transactions = b.transactions;
    dbb.medianTime = b.medianTime;
    dbb.fork = b.fork;
    dbb.parameters = b.parameters;
    dbb.inner_hash = b.inner_hash;
    dbb.signature = b.signature;
    dbb.nonce = b.nonce;
    dbb.UDTime = b.UDTime;
    dbb.monetaryMass = b.monetaryMass;
    dbb.writtenOn = b.number;
    dbb.written_on = [b.number, b.hash].join("-");
    return dbb;
  }
}
