"use strict";

const spawn     = require('child_process').spawn;
const path      = require('path');
const co        = require('co');
const should    = require('should');
const _         = require('underscore');
const toolbox   = require('./tools/toolbox');
const duniter   = require('../../index');
const merkleh   = require('../../app/lib/helpers/merkle');
const hashf     = require('duniter-common').hashf;
const constants = require('../../app/lib/constants');
const Merkle    = require('../../app/lib/entity/merkle');

const DB_NAME = "unit_tests";

describe("CLI", function() {

  let farmOfServers = [], fakeServer;

  before(() => co(function*() {

    const blockchain = require('../data/blockchain.json');
    const peers = [];
    const peersMap = {};
    const leaves = [];

    /********
     * HTTP METHODS
     */
    const onReadBlockchainChunk = (count, from) => Promise.resolve(blockchain.blocks.slice(from, from + count));
    const onReadParticularBlock = (number) => Promise.resolve(blockchain.blocks[number]);
    const onPeersRequested = (req) => co(function*() {
      const merkle = new Merkle();
      merkle.initialize(leaves);
      merkle.leaf = {
        "hash": req.params.leaf,
        "value": peersMap[req.params.leaf] || ""
      };
      return merkleh.processForURL(req, merkle, () => co(function*() {
        return peersMap;
      }));
    });

    /**
     * The fake hash in the blockchain
     */
    const fakeHash = hashf("A wrong content").toUpperCase();

    farmOfServers = yield Array.from({ length: 5 }).map((unused, index) => {
      if (index < 2) {
        
        /***************
         * Normal nodes
         */
        return toolbox.fakeSyncServer(onReadBlockchainChunk, onReadParticularBlock, onPeersRequested);
      } else if (index == 2) {
        
        /***************
         * Node with wrong chaining between 2 chunks of blocks
         */
        return toolbox.fakeSyncServer((count, from) => {
          // We just need to send the wrong chunk
          from = from - count;
          return Promise.resolve(blockchain.blocks.slice(from, from + count));
        }, onReadParticularBlock, onPeersRequested);
      } else if (index == 3) {
        
        /***************
         * Node with wrong chaining between 2 blocks
         */
        return toolbox.fakeSyncServer((count, from) => {
          // We just need to send the wrong chunk
          const chunk = blockchain.blocks.slice(from, from + count).map((block, index) => {
            if (index === 10) {
              const clone = _.clone(block);
              clone.hash = fakeHash;
            }
            return block;
          });
          return Promise.resolve(chunk);
        }, onReadParticularBlock, onPeersRequested);
      } else if (index == 4) {
        
        /***************
         * Node with apparent good chaining, but one of the hashs is WRONG
         */
        return toolbox.fakeSyncServer((count, from) => {
          // We just need to send the wrong chunk
          const chunk = blockchain.blocks.slice(from, from + count).map((block, index) => {
            if (index === 10) {
              const clone = _.clone(block);
              clone.hash = fakeHash;
            } else if (index === 11) {
              const clone = _.clone(block);
              clone.previousHash = fakeHash;
              return clone;
            }
            return block;
          });
          return Promise.resolve(chunk);
        }, onReadParticularBlock, onPeersRequested);
      }
    });
    farmOfServers.map((server, index) => {
      const peer = {
        endpoints: [['BASIC_MERKLED_API', server.host, server.port].join(' ')],
        pubkey: hashf(index + ""),
        hash: hashf(index + "").toUpperCase()
      };
      peers.push(peer);
      leaves.push(peer.hash);
      peersMap[peer.hash] = peer;
    });
    fakeServer = farmOfServers[0];
  }));

  it('config --autoconf', () => co(function*() {
    let res = yield execute(['config', '--autoconf']);
    res.should.have.property("ipv4").not.equal("a wrong string");
    res.should.have.property("ipv4").match(constants.IPV4_REGEXP);
  }));

  it('reset data', () => co(function*() {
    yield execute(['reset', 'data']);
    // const res = yield execute(['export-bc', '--nostdout']);
    // res.slice(0, 1).should.have.length(0);
  }));

  it('sync 7 blocks (fast)', () => co(function*() {
    yield execute(['reset', 'data']);
    yield execute(['sync', fakeServer.host, fakeServer.port, '7', '--nocautious', '--nointeractive', '--noshuffle']);
    const res = yield execute(['export-bc', '--nostdout']);
    res[res.length - 1].should.have.property('number').equal(7);
    res.should.have.length(7 + 1); // blocks #0..#7
  }));

  it('sync 4 blocks (cautious)', () => co(function*() {
    yield execute(['sync', fakeServer.host, fakeServer.port, '11', '--nointeractive']);
    const res = yield execute(['export-bc', '--nostdout']);
    res[res.length - 1].should.have.property('number').equal(11);
    res.should.have.length(11 + 1);
  }));

  it('[spawn] reset data', () => co(function*() {
    yield executeSpawn(['reset', 'data']);
    const res = yield executeSpawn(['export-bc']);
    JSON.parse(res).should.have.length(0);
  }));

  it('[spawn] sync 10 first blocks --memory', () => co(function*() {
    yield execute(['sync', fakeServer.host, fakeServer.port, '10', '--memory', '--cautious', '--nointeractive']);
  }));
});

/**
 * Executes a duniter command, as a command line utility.
 * @param args Array of arguments.
 * @returns {*|Promise} Returns the command output.
 */
function execute(args) {
  const finalArgs = [process.argv[0], __filename].concat(args).concat(['--mdb', DB_NAME]);
  return co(function*() {

    const stack = duniter.statics.autoStack();
    // Executes the command
    return stack.executeStack(finalArgs);
  });
}

/**
 * Executes a duniter command, as a command line utility.
 * @param command Array of arguments.
 * @returns {*|Promise} Returns the command output.
 */
function executeSpawn(command) {
  return co(function*() {
    const finalArgs = [path.join(__dirname, '../../bin/duniter')].concat(command).concat(['--mdb', DB_NAME]);
    const duniter = spawn(process.argv[0], finalArgs);
    return new Promise((resolve, reject) => {
      let res = "";
      duniter.stdout.on('data', (data) => {
        res += data.toString('utf8').replace(/\n/, '');
      });
      duniter.stderr.on('data', (err) => {
        console.log(err.toString('utf8').replace(/\n/, ''));
      });
      duniter.on('close', (code) => code ? reject(code) : resolve(res) );
    });
  });
}
