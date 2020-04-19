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

export class DBHead {
  // TODO: some properties are not registered in the DB, we should create another class

  version: number;
  currency: string | null;
  bsize: number;
  avgBlockSize: number;
  udTime: number;
  udReevalTime: number;
  massReeval: number;
  mass: number;
  hash: string;
  previousHash: string | null;
  previousIssuer: string | null;
  issuer: string;
  time: number;
  medianTime: number;
  number: number;
  powMin: number;
  diffNumber: number;
  issuersCount: number;
  issuersFrame: number;
  issuersFrameVar: number;
  dtDiffEval: number;
  issuerDiff: number;
  powZeros: number;
  powRemainder: number;
  speed: number;
  unitBase: number;
  membersCount: number;
  dividend: number;
  new_dividend: number | null;
  issuerIsMember: boolean;
  written_on: string;
  writtenOn: number;

  constructor() {}
}
