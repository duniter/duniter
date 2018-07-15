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

import {cleanLongDownPeers} from "../../../../app/modules/crawler/lib/garbager"
import {Server} from "../../../../server"

const should = require('should');
const duniter = require('../../../../index')

let stack:any

describe('Peers garbaging', () => {

  before(() => {

    stack = duniter.statics.autoStack([{
      name: 'garbager',
      required: {
        duniter: {

          cli: [{
            name: 'garbage',
            desc: 'Garbage testing',
            logs: false,
            onDatabaseExecute: async (server:Server) => {
              await server.dal.peerDAL.savePeer({ pubkey: 'A', version: 1, currency: 'c', lastContact: null,       statusTS: 1485000000000, block: '2393-H' } as any);
              await server.dal.peerDAL.savePeer({ pubkey: 'B', version: 1, currency: 'c', lastContact: 1484827199, statusTS: 1485000000000, block: '2393-H' } as any);
              await server.dal.peerDAL.savePeer({ pubkey: 'C', version: 1, currency: 'c', lastContact: 1484827200, statusTS: 1485000000000, block: '2393-H' } as any);
              await server.dal.peerDAL.savePeer({ pubkey: 'D', version: 1, currency: 'c', lastContact: 1484820000, statusTS: 1485000000000, block: '2393-H' } as any);
              (await server.dal.peerDAL.listAll()).should.have.length(4);
              const now = 1485000000000
              await cleanLongDownPeers(server, now);
              (await server.dal.peerDAL.listAll()).should.have.length(1);
            }
          }]
        }
      }
    }]);
  })

  it('should be able to garbage some peers', async () => {
    await stack.executeStack(['node', 'b.js', '--memory', 'garbage']);
  })
})
