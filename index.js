"use strict";

var Server     = require('./server');
var WOTServer  = require('./wotserver');
var PeerServer = require('./peerserver');
var TxServer   = require('./txserver');

module.exports = {
  connect: function (dbConf, overConf) {
    return new Server(dbConf, overConf);
  },
  createWOTServer: function (dbConf, overConf) {
    return new WOTServer(dbConf, overConf);
  },
  createPeerServer: function (dbConf, overConf) {
    return new PeerServer(dbConf, overConf);
  },
  createTxServer: function (dbConf, overConf) {
    return new TxServer(dbConf, overConf);
  }
}
