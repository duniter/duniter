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

import {ProverConstants} from "../../../app/modules/prover/lib/constants"
import {NewTestingServer, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {BmaDependency} from "../../../app/modules/bma/index"
import {ProverDependency} from "../../../app/modules/prover/index"
import {HttpBlock, HttpDifficulties} from "../../../app/modules/bma/lib/dtos"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {BlockDTO} from "../../../app/lib/dto/BlockDTO"
import {shutDownEngine} from "../tools/shutdown-engine"
import {expectAnswer, expectError} from "../tools/http-expect"
import {WebSocket} from "../../../app/lib/common-libs/websocket"
import {PeerDTO} from "../../../app/lib/dto/PeerDTO"

const should    = require('should');
const assert    = require('assert');
const rp        = require('request-promise');

ProverConstants.CORES_MAXIMUM_USE_IN_PARALLEL = 1

let server:TestingServer, server2:TestingServer, cat:TestUser, toc:TestUser

describe("HTTP API", function() {

  const now = 1500000000
  let commit:(options:any) => Promise<BlockDTO>

  before(async () => {

    server = NewTestingServer(
      {
        name: 'bb11',
        ipv4: '127.0.0.1',
        port: '7777',
        currency: 'bb',
        httpLogs: true,
        sigQty: 1,
        dt: 240,
        dtReeval: 240,
        udTime0: now,
        medianTimeBlocks: 1,
        udReevalTime0: now + 20000000,
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        }
      });

    server2 = NewTestingServer(
      {
        name: 'bb12',
        ipv4: '127.0.0.1',
        port: '30410',
        currency: 'bb',
        httpLogs: true,
        sigQty: 1,
        dt: 240,
        dtReeval: 240,
        udTime0: now,
        medianTimeBlocks: 1,
        udReevalTime0: now + 20000000,
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        }
      });

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: server });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: server });

    commit = makeBlockAndPost(server);

    let s = await server.initWithDAL();
    let bmapi = await BmaDependency.duniter.methods.bma(s);
    await bmapi.openConnections();

    let s2 = await server2.initWithDAL();
    let bmapi2 = await BmaDependency.duniter.methods.bma(s2);
    await bmapi2.openConnections();

    await cat.createIdentity();
    await toc.createIdentity();
    await toc.cert(cat);
    await cat.cert(toc);
    await cat.join();
    await toc.join();
    const b0 = await commit({ time: now });
    const b1 = await commit({ time: now + 120 });
    await server2.writeBlock(b0)
    await server2.writeBlock(b1)
    server._server.addEndpointsDefinitions(() => Promise.resolve('SOME_FAKE_ENDPOINT_P1'))
    server2._server.addEndpointsDefinitions(() => Promise.resolve('SOME_FAKE_ENDPOINT_P2'))
    const p1 = await server.PeeringService.generateSelfPeer(server.conf)
    await server2.PeeringService.generateSelfPeer(server2.conf)
    await server2.writePeer(p1)
    server2.writeBlock(await commit({ time: now + 120 * 2 }))
    server2.writeBlock(await commit({ time: now + 120 * 3 }))
    server2.writeBlock(await commit({ time: now + 120 * 4 }))
  })

  after(() => {
    return Promise.all([
      shutDownEngine(server)
    ])
  })

  function makeBlockAndPost(theServer:TestingServer) {
    return async function(options:any) {
      const block = await ProverDependency.duniter.methods.generateAndProveTheNext(theServer._server, null, null, options)
      const res = await postBlock(theServer)(block)
      return JSON.parse(res)
    }
  }

  describe("/blockchain", function() {

    it('/parameters/ should give the parameters', function() {
      return expectJSON(rp('http://127.0.0.1:7777/blockchain/parameters', { json: true }), {
        udTime0: now,
        udReevalTime0: now + 20000000,
        dt: 240,
        dtReeval: 240
      });
    });

    it('/block/0 should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7777/blockchain/block/0', { json: true }), {
        number: 0,
        dividend: null,
        monetaryMass: 0
      });
    });

    it('/block/1 should exist and have integer Dividend', function() {
      return expectJSON(rp('http://127.0.0.1:7777/blockchain/block/1', { json: true }), {
        number: 1,
        dividend: 100,
        monetaryMass: 200
      });
    });

    it('/block/2 should exist and have NULL Dividend', () => {
      return expectJSON(rp('http://127.0.0.1:7777/blockchain/block/2', { json: true }), {
        number: 2,
        dividend: null,
        monetaryMass: 200
      });
    })

    it('/block/3 should exist and have NULL Dividend', () => {
      return expectJSON(rp('http://127.0.0.1:7777/blockchain/block/3', { json: true }), {
        number: 3,
        dividend: 100,
        monetaryMass: 400
      });
    })

    it('/block/88 should not exist', function() {
      return expectError(404, rp('http://127.0.0.1:7777/blockchain/block/88'));
    });

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7777/blockchain/current', { json: true }), {
        number: 4
      });
    });

    it('/membership should not accept wrong signature', function() {
      return expectError(400, 'wrong signature for membership', rp.post('http://127.0.0.1:7777/blockchain/membership', {
        json: {
          membership: 'Version: 10\n' +
          'Type: Membership\n' +
          'Currency: bb\n' +
          'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
          'Block: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n' +
          'Membership: IN\n' +
          'UserID: someuid\n' +
          'CertTS: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n' +
          'cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==\n'
        }
      }));
    });

    it('/membership should not accept wrong signature 2', function() {
      return expectError(400, 'Document has unkown fields or wrong line ending format', rp.post('http://127.0.0.1:7777/blockchain/membership', {
        json: {
          membership: 'Version: 2\n' +
          'Type: Membership\n' +
          'Currency: bb\n' +
          'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
          'Block: 0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n' +
          'UserID: someuid\n' +
          'CertTS: 1421787800\n' +
          'cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==\n'
        }
      }));
    });

    it('/membership should not accept wrong signature 3', function() {
      return expectError(400, 'Document has unkown fields or wrong line ending format', rp.post('http://127.0.0.1:7777/blockchain/membership', {
        json: {
          membership: 'Version: 2\n' +
          'Type: Membership\n' +
          'Currency: bb\n' +
          'Issuer: 6upqFiJ66WV6N3bPc8x8y7rXT3syqKRmwnVyunCtEj7o\n' +
          'Block: 0--E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855\n' +
          'Membership: IN\n' +
          'UserID: someuid\n' +
          'CertTS: 1421787800\n' +
          'cJohoG/qmxm7KwqCB71RXRSIvHu7IcYB1zWE33OpPLGmedH mdPWad32S7G9j9IDpI8QpldalhdT4BUIHlAtCw==\n'
        }
      }));
    });

    it('/difficulties should have current block number + 1', function() {
      return expectAnswer(rp('http://127.0.0.1:7777/blockchain/difficulties', { json: true }), function(res:HttpDifficulties) {
        res.should.have.property('block').equal(5);
        res.should.have.property('levels').have.length(1);
      });
    });
  });

  describe("/ws", function() {

    it('/block should exist', function(done) {
      const client = new WebSocket('ws://127.0.0.1:7777/ws/block');
      client.on('open', function open() {
        client.terminate();
        done();
      });
    });

    it('/block should send a block', function(done) {
      let completed = false
      const client = new WebSocket('ws://127.0.0.1:7777/ws/block');
      client.once('message', function message(data:any) {
        const block = JSON.parse(data);
        should(block).have.property('number', 4);
        should(block).have.property('dividend').equal(null)
        should(block).have.property('monetaryMass').equal(400)
        should(block).have.property('monetaryMass').not.equal("400")
        if (!completed) {
          completed = true;
          done();
        }
      });
    });

    it('/block (number 5,6,7) should send a block', async () => {
      server2.writeBlock(await commit({ time: now + 120 * 5 }))
      const client = new WebSocket('ws://127.0.0.1:7777/ws/block');
      let resolve5:any, resolve6:any, resolve7:any
      const p5 = new Promise(res => resolve5 = res)
      const p6 = new Promise(res => resolve6 = res)
      const p7 = new Promise(res => resolve7 = res)
      client.on('message', function message(data:string) {
        const block = JSON.parse(data);
        if (block.number === 5) resolve5(block)
        if (block.number === 6) resolve6(block)
        if (block.number === 7) resolve7(block)
      })
      server2.writeBlock(await commit({ time: now + 120 * 6 }))
      server2.writeBlock(await commit({ time: now + 120 * 7 }))
      const b5 = await p5
      should(b5).have.property('number', 5);
      should(b5).have.property('dividend').equal(100)
      should(b5).have.property('monetaryMass').equal(600)
      should(b5).have.property('monetaryMass').not.equal("600")
      const b6 = await p6
      should(b6).have.property('number', 6);
      should(b6).have.property('dividend').equal(null)
      should(b6).have.property('monetaryMass').equal(600)
      should(b6).have.property('monetaryMass').not.equal("600")
      const b7 = await p7
      should(b7).have.property('number', 7);
      should(b7).have.property('dividend').equal(100)
      should(b7).have.property('monetaryMass').equal(800)
      should(b7).have.property('monetaryMass').not.equal("800")
    })

    it('/block should answer to pings', function(done) {
      const client = new WebSocket('ws://127.0.0.1:7777/ws/block');
      client.on('pong', function message() {
        client.terminate();
        done();
      });
      client.on('open', function open() {
        client.ping();
      });
    });

    it('/peer (number 5,6,7) should send a peer document', async () => {
      const client = new WebSocket('ws://127.0.0.1:30410/ws/peer');
      let resolve5:any, resolve6:any
      const p5 = new Promise(res => resolve5 = res)
      const p6 = new Promise(res => resolve6 = res)
      server._server.addEndpointsDefinitions(() => Promise.resolve("BASIC_MERKLED_API localhost 7777"))
      client.on('message', function message(data:any) {
        const peer = JSON.parse(data);
        if (peer.block.match(/2-/)) {
          server2.PeeringService.generateSelfPeer(server.conf)
          return resolve5(peer)
        }
        if ((peer.block.match(/1-/) || peer.block.match(/3-/)) && peer.pubkey === 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo') {
          return resolve6(peer)
        }
      })
      const p1 = await server.PeeringService.generateSelfPeer({
        currency: server.conf.currency
      }, 0)
      await server2._server.writeRawPeer(PeerDTO.fromJSONObject(p1).getRawSigned())
      const b5 = await p5
      should(b5).have.property('version', 10)
      const b6 = await p6
      should(b6).have.property('version', 10)
    })
  })
})

async function expectJSON<T>(promise:Promise<T>, json:any) {
  try {
    const resJson = await promise;
    Underscore.keys(json).forEach(function(key){
      should(resJson).have.property(String(key)).equal(json[key]);
    });
  } catch (err) {
    if (err.response) {
      assert.equal(err.response.statusCode, 200);
    }
    else throw err;
  }
}

function postBlock(server2:TestingServer) {
  return function(block:any) {
    return post(server2, '/blockchain/block')({
      block: typeof block == 'string' ? block : block.getRawSigned()
    })
      .then(async (result:HttpBlock) => {
        const numberToReach = block.number
        await new Promise((res) => {
          const interval = setInterval(async () => {
            const current = await server2.dal.getCurrentBlockOrNull()
            if (current && current.number == numberToReach) {
              res()
              clearInterval(interval)
            }
          }, 1)
        })
        return result
      })
  };
}

function post(server2:TestingServer, uri:string) {
  return function(data:any) {
    return rp.post('http://' + [server2.conf.ipv4, server2.conf.port].join(':') + uri, {
      form: data
    });
  };
}
