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

import {hashf} from "../../../app/lib/common"
import {fakeSyncServer} from "../tools/toolbox"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {Statics} from "../../../index"

const spawn     = require('child_process').spawn;
const path      = require('path');
const should    = require('should');

const DB_NAME = "unit_tests";

describe("CLI", function() {

  let farmOfServers:{ host:string, port:number}[] = [], fakeServer:{ host:string, port:number}

  before(async () => {

    const blockchain = require('../../data/blockchain.json');
    const peersMap:any = {};
    const leaves:string[] = [];

    /********
     * HTTP METHODS
     */
    const onReadBlockchainChunk = (count:number, from:number) => Promise.resolve(blockchain.blocks.slice(from, from + count));
    const onReadParticularBlock = (number:number) => Promise.resolve(blockchain.blocks[number]);
    const onPeersRequested = async () => []

    /**
     * The fake hash in the blockchain
     */
    const fakeHash = hashf("A wrong content").toUpperCase();

    farmOfServers = await Promise.all(Array.from({ length: 5 }).map(async (unused, index) => {
      if (index < 2) {
        
        /***************
         * Normal nodes
         */
        return fakeSyncServer('duniter_unit_test_currency', onReadBlockchainChunk, onReadParticularBlock, onPeersRequested);
      } else if (index == 2) {
        
        /***************
         * Node with wrong chaining between 2 chunks of blocks
         */
        return fakeSyncServer('duniter_unit_test_currency', (count:number, from:number) => {
          // We just need to send the wrong chunk
          from = from - count;
          return Promise.resolve(blockchain.blocks.slice(from, from + count));
        }, onReadParticularBlock, onPeersRequested);
      } else if (index == 3) {
        
        /***************
         * Node with wrong chaining between 2 blocks
         */
        return fakeSyncServer('duniter_unit_test_currency', (count:number, from:number) => {
          // We just need to send the wrong chunk
          const chunk = blockchain.blocks.slice(from, from + count).map((block:any, index2:number) => {
            if (index2 === 10) {
              const clone = Underscore.clone(block);
              clone.hash = fakeHash;
            }
            return block;
          });
          return Promise.resolve(chunk);
        }, onReadParticularBlock, onPeersRequested);
      } else {
        
        /***************
         * Node with apparent good chaining, but one of the hashs is WRONG
         */
        return fakeSyncServer('duniter_unit_test_currency', (count:number, from:number) => {
          // We just need to send the wrong chunk
          const chunk = blockchain.blocks.slice(from, from + count).map((block:any, index2:number) => {
            if (index2 === 10) {
              const clone = Underscore.clone(block);
              clone.hash = fakeHash;
            } else if (index2 === 11) {
              const clone = Underscore.clone(block);
              clone.previousHash = fakeHash;
              return clone;
            }
            return block;
          });
          return Promise.resolve(chunk);
        }, onReadParticularBlock, onPeersRequested);
      }
    }))
    farmOfServers.map((server, index) => {
      const peer = {
        currency: 'duniter_unit_test_currency',
        endpoints: [['BASIC_MERKLED_API', server.host, server.port].join(' ')],
        pubkey: hashf(index + ""),
        hash: hashf(index + "").toUpperCase()
      };
      leaves.push(peer.hash);
      peersMap[peer.hash] = peer;
    });
    fakeServer = farmOfServers[0];
  })

  it('config --autoconf', async () => {
    let res = await execute(['config', '--autoconf', '--noupnp']);
    res.should.have.property("pair").property('pub').not.equal("");
    res.should.have.property("pair").property('sec').not.equal("");
  })

  it('reset data', async () => {
    await execute(['reset', 'data']);
    // const res = await execute(['export-bc', '--nostdout']);
    // res.slice(0, 1).should.have.length(0);
  })

  it('sync 7 blocks (fast)', async () => {
    // await execute(['reset', 'data']);
    await execute(['sync', fakeServer.host + ':' + String(fakeServer.port), '--nocautious', '--nointeractive', '--noshuffle', '7']);
    const res = await execute(['export-bc', '--nostdout']);
    res[res.length - 1].should.have.property('number').equal(7);
    res.should.have.length(7 + 1); // blocks #0..#7
  })

  // it('sync 4 blocks (cautious)', async () => {
  //   await execute(['sync', fakeServer.host + ':' + String(fakeServer.port), '--nointeractive', '11']);
  //   const res = await execute(['export-bc', '--nostdout']);
  //   res[res.length - 1].should.have.property('number').equal(11);
  //   res.should.have.length(11 + 1);
  // })
  //
  // it('[spawn] reset data', async () => {
  //   await executeSpawn(['reset', 'data']);
  //   const res = await executeSpawn(['export-bc']);
  //   JSON.parse(res).should.have.length(0);
  // })
  //
  // it('[spawn] sync 10 first blocks --memory', async () => {
  //   await execute(['sync', fakeServer.host + ':' + String(fakeServer.port), '--memory', '--cautious', '--nointeractive', '10']);
  // })
});

/**
 * Executes a duniter command, as a command line utility.
 * @param args Array of arguments.
 * @returns {*|Promise} Returns the command output.
 */
async function execute(args:(string)[]) {
  const finalArgs = [process.argv[0], __filename].concat(args).concat(['--mdb', DB_NAME]);
  const stack = Statics.autoStack();
  // Executes the command
  return stack.executeStack(finalArgs);
}

/**
 * Executes a duniter command, as a command line utility.
 * @param command Array of arguments.
 * @returns {*|Promise} Returns the command output.
 */
async function executeSpawn(command:string[]): Promise<string> {
  const finalArgs = [path.join(__dirname, '../../../bin/duniter')].concat(command).concat(['--mdb', DB_NAME]);
  const duniterCmd = spawn(process.argv[0], finalArgs);
  return new Promise<string>((resolve, reject) => {
    let res = "";
    duniterCmd.stdout.on('data', (data:any) => {
      res += data.toString('utf8').replace(/\n/, '');
    });
    duniterCmd.stderr.on('data', (err:any) => {
      console.log(err.toString('utf8').replace(/\n/, ''));
    });
    duniterCmd.on('close', (code:any) => code ? reject(code) : resolve(res) );
  });
}
