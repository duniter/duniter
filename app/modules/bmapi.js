"use strict";

const co = require('co');
const util = require('util');
const stream = require('stream');
const constants = require('../lib/constants');
const bma = require('../lib/streams/bma');

const api = new BMAPI();

module.exports = {
  duniter: {
    service: {
      input: api
    }
  }
}

function BMAPI() {

  // Public http interface
  let bmapi;

  stream.Transform.call(this, { objectMode: true });

  this.startService = (server, conf) => co(function*() {
    bmapi = yield bma(server, null, conf.httplogs);
    yield bmapi.openConnections();
  });

  this.stopService = () => co(function*() {
    yield bmapi.closeConnections();
  });
}

util.inherits(BMAPI, stream.Transform);
