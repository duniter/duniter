"use strict";
const should = require('should');
const co = require('co');

const garbager = require('../../../../app/modules/crawler/lib/garbager')
const duniter = require('../../../../index')

let stack

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
            onDatabaseExecute: (server, conf, program, params) => co(function*() {
              yield server.dal.peerDAL.savePeer({ pubkey: 'A', version: 1, currency: 'c', first_down: null,          statusTS: 1485000000000, block: '2393-H' });
              yield server.dal.peerDAL.savePeer({ pubkey: 'B', version: 1, currency: 'c', first_down: 1484827199999, statusTS: 1485000000000, block: '2393-H' });
              yield server.dal.peerDAL.savePeer({ pubkey: 'C', version: 1, currency: 'c', first_down: 1484827200000, statusTS: 1485000000000, block: '2393-H' });
              yield server.dal.peerDAL.savePeer({ pubkey: 'D', version: 1, currency: 'c', first_down: 1484820000000, statusTS: 1485000000000, block: '2393-H' });
              (yield server.dal.peerDAL.sqlListAll()).should.have.length(4);
              const now = 1485000000000;
              yield garbager.cleanLongDownPeers(server, now);
              (yield server.dal.peerDAL.sqlListAll()).should.have.length(2);
            })
          }]
        }
      }
    }]);
  })

  it('should be able to garbage some peers', () => co(function*() {
    yield stack.executeStack(['node', 'b.js', '--memory', 'garbage']);
  }));
});
