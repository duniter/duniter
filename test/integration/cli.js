"use strict";

const spawn  = require('child_process').spawn;
const path   = require('path');
const co     = require('co');
const should = require('should');
const cli    = require('../../app/cli');

describe("CLI", function() {

  describe("Initializing", () => {

    it('reset data', () => co(function*() {
      yield execute(['reset', 'data']);
      const res = yield execute(['export-bc']);
      JSON.parse(res).should.have.length(0);
    }));
  });
});

/**
 * Executes a duniter command, as a command line utility.
 * @param command Array of arguments.
 * @returns {*|Promise} Returns the command output.
 */
function execute(command) {
  return co(function*() {
    const duniter = spawn(process.argv[0], [path.join(__dirname, '../../bin/ucoind')].concat(command));
    return new Promise((resolve, reject) => {
      let res = "";
      duniter.stdout.on('data', (data) => {
        res += data.toString('utf8').replace(/\n/, '');
      });
      duniter.stderr.on('data', (err) => reject(err.toString('utf8')));
      duniter.on('close', (code) => code ? reject(code) : resolve(res) );
    });
  });
}
