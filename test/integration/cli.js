"use strict";

const spawn     = require('child_process').spawn;
const path      = require('path');
const co        = require('co');
const should    = require('should');
const toolbox   = require('./tools/toolbox');
const cli       = require('../../app/cli');
const constants = require('../../app/lib/constants');

const DB_NAME = "unit_tests";

describe("CLI", function() {

  let farmOfServers = [], fakeServer;

  before(() => co(function*() {

    const blockchain = require('../data/blockchain.json');
    const onReadBlockchainChunk = (count, from) => Promise.resolve(blockchain.blocks.slice(from, from + count));
    const onReadParticularBlock = (number) => Promise.resolve(blockchain.blocks[number]);

    farmOfServers = yield Array.from({ length: 3 }).map(() => toolbox.fakeSyncServer(onReadBlockchainChunk, onReadParticularBlock));
    fakeServer = farmOfServers[0];
  }));

  it('config --autoconf', () => co(function*() {
    let res = yield execute(['config', '--autoconf']);
    res.should.have.property("ipv4").not.equal("a wrong string");
    res.should.have.property("ipv4").match(constants.IPV4_REGEXP);
  }));

  it('reset data', () => co(function*() {
    yield execute(['reset', 'data']);
    const res = yield execute(['export-bc', '--nostdout']);
    res.should.have.length(0);
  }));

  it('sync 2200 blocks (fast)', () => co(function*() {
    yield execute(['reset', 'data']);
    yield execute(['sync', fakeServer.host, fakeServer.port, '2200', '--nocautious', '--nointeractive']);
    const res = yield execute(['export-bc', '--nostdout']);
    res[res.length - 1].should.have.property('number').equal(2200);
    res.should.have.length(2200 + 1);
  }));

  it('sync 5 blocks (cautious)', () => co(function*() {
    yield execute(['sync', fakeServer.host, fakeServer.port, '2204', '--nointeractive']);
    const res = yield execute(['export-bc', '--nostdout']);
    res[res.length - 1].should.have.property('number').equal(2204);
    res.should.have.length(2204 + 1);
  }));

  it('[spawn] reset data', () => co(function*() {
    yield executeSpawn(['reset', 'data']);
    const res = yield executeSpawn(['export-bc']);
    JSON.parse(res).should.have.length(0);
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
    const command = cli(finalArgs);
    // Executes the command
    return command.execute();
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
