"use strict";

const co = require('co');
const util = require('util');
const stream = require('stream');
const permanentProver = require('./permanentProver');

module.exports = Prover;

function Prover(server) {

  const permaProver = this.permaProver = permanentProver(server);

  stream.Transform.call(this, { objectMode: true });

  this._write = function (obj, enc, done) {
    // Never close the stream
    if (obj && obj.membersCount) {
      permaProver.blockchainChanged(obj);
    } else if (obj.nodeIndexInPeers !== undefined) {
      permaProver.prover.changePoWPrefix((obj.nodeIndexInPeers + 1) * 10); // We multiply by 10 to give room to computers with < 100 cores
    } else if (obj.cpu !== undefined) {
      permaProver.prover.changeCPU(obj.cpu); // We multiply by 10 to give room to computers with < 100 cores
    } else if (obj.pulling !== undefined) {
      if (obj.pulling === 'processing') {
        permaProver.pullingDetected();
      }
      else if (obj.pulling === 'finished') {
        permaProver.pullingFinished();
      }
    }
    done && done();
  };

  this.startService = () => co(function*() {
    permaProver.allowedToStart();
  });

  this.stopService = () => co(function*() {
    permaProver.stopEveryting();
  });
}

util.inherits(Prover, stream.Transform);
