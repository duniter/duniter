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

"use strict";
const BLOCK_UID = /^(0|[1-9]\d{0,18})-[A-F0-9]{64}$/;

const buidFunctions:any = function(number:number, hash:string) {
  if (arguments.length === 2) {
    return [number, hash].join('-');
  }
  if (arguments[0]) {
    return [arguments[0].number, arguments[0].hash].join('-');
  }
  return '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
}

buidFunctions.fromTS = (line:string) => {
  const match = line.match(/TS:(.*)/)
  return (match && match[1]) || ""
}
buidFunctions.fromIdty = (idty:any) => {
  return buidFunctions(idty.ts_number, idty.ts_hash)
}

export const Buid = {

  format: {

    isBuid: (value:any) => {
      return (typeof value === 'string') && value.match(BLOCK_UID) ? true : false;
    },

    buid: buidFunctions
  },

  getBlockstamp: (block:{ number:number, hash:string }) => {
    return [block.number, block.hash].join('-')
  }
};
