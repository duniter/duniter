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

import {Server} from "../../../server"

const Underscore = require('../../../app/lib/common-libs/underscore').Underscore;
const rp = require('request-promise');

export function sync(fromBlock:number, toBlock:number, fromServer:Server, toServer:Server) {
  // Sync blocks
  return Underscore.range(fromBlock, toBlock + 1).reduce(async (p:Promise<any>, number:number) => {
    await p;
    const json = await rp('http://' + fromServer.conf.ipv4 + ':' + fromServer.conf.port + '/blockchain/block/' + number, { json: true });
    await toServer.writeBlock(json)
  }, Promise.resolve())
}
