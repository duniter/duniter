"use strict";

const spawn  = require('child_process').spawn;
const path   = require('path');
const co     = require('co');
const should = require('should');
const cli    = require('../../app/cli');

describe("CLI", function() {

  it('reset data', () => co(function*() {
    yield execute(['reset', 'data']);
    const res = yield execute(['export-bc', '--nostdout']);
    res.should.have.length(0);
  }));

  it('sync 2200 blocks (fast)', () => co(function*() {
    yield execute(['reset', 'data']);
    yield execute(['sync', 'duniter.org', '8999', '2200']);
    const res = yield execute(['export-bc', '--nostdout']);
    res.should.have.length(2200 + 1);
  }));

  it('sync 5 blocks (cautious)', () => co(function*() {
    yield execute(['sync', 'duniter.org', '8999', '2204', '--nointeractive']);
    const res = yield execute(['export-bc', '--nostdout']);
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
  return co(function*() {
    const command = cli([process.argv[0], __filename].concat(args));
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
    const duniter = spawn(process.argv[0], [path.join(__dirname, '../../bin/ucoind')].concat(command));
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
