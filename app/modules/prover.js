"use strict";

const co = require('co');
const util = require('util');
const stream = require('stream');
const constants = require('../lib/constants');
const permanentProver = require('../lib/computation/permanentProver');

const prover = new Prover();

module.exports = {
  duniter: {
    service: {
      output: prover
    },

    methods: {
      prover: () => new Prover()
    }
  }
}

function Prover() {

  const permaProver = this.permaProver = permanentProver();

  stream.Transform.call(this, { objectMode: true });

  this._write = function (obj, enc, done) {
    // Never close the stream
    if (obj && obj.membersCount) {
      permaProver.blockchainChanged(obj);
    }
    done && done();
  };

  this.startService = (server) => co(function*() {
    permaProver.allowedToStart(server);
  });

  this.stopService = () => co(function*() {
    permaProver.stopEveryting();
  });
}

util.inherits(Prover, stream.Transform);
