"use strict";

var Server     = require('./server');
var WOTServer  = require('./wotserver');
var PeerServer = require('./peerserver');
var TxServer   = require('./txserver');

module.exports = {
  connect: function (overConf) {
    return new Server(overConf);
  },
  createWOTServer: function (overConf) {
    return new WOTServer(overConf);
  },
  createPeerServer: function (overConf) {
    return new PeerServer(overConf);
  },
  createTxServer: function (overConf) {
    return new TxServer(overConf);
  }
}
