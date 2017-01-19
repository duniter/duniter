"use strict";

const co = require('co');
const async = require('async');
const constants = require('../lib/constants');

module.exports = {
  duniter: {
    service: {
      neutral: (server, conf, logger) => new PeerSignalEmitter(server, conf, logger)
    }
  }
}

/**
 * Service which triggers the server's peering generation (actualization of the Peer document).
 * @constructor
 */
function PeerSignalEmitter(server, conf) {

  let INTERVAL = null;

  const peerFifo = async.queue(function (task, callback) {
    task(callback);
  }, 1);

  this.startService = () => co(function*() {

    // The interval duration
    const SIGNAL_INTERVAL = 1000 * conf.avgGenTime * constants.NETWORK.STATUS_INTERVAL.UPDATE;

    // We eventually clean an existing interval
    if (INTERVAL)
      clearInterval(INTERVAL);

    // Create the new regular algorithm
    INTERVAL = setInterval(function () {
      peerFifo.push((done) => co(function*(){
        try {
          yield server.PeeringService.generateSelfPeer(conf, SIGNAL_INTERVAL);
          done();
        } catch (e) {
          done(e);
        }
      }))
    }, SIGNAL_INTERVAL);

    // Launches it a first time, immediately
    yield server.PeeringService.generateSelfPeer(conf, SIGNAL_INTERVAL);
  });

  this.stopService = () => co(function*() {
    // Stop the interval
    clearInterval(INTERVAL);
    // Empty the fifo
    peerFifo.kill();
  });
}
