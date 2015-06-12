var async      = require('async');
var util       = require('util');
var parsers    = require('./app/lib/streams/parsers/doc');
var PeerServer = require('./peerserver');

function TxServer (dbConf, overrideConf, interceptors, onInit) {

  "use strict";

  var selfInterceptors = [
    {
      // Transaction
      matches: function (obj) {
        return obj.inputs ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            server.TransactionsService.processTx(obj, next);
          },
          function (tx, next){
            server.emit('transaction', tx);
            next(null, tx);
          },
        ], next);
      }
    }
  ];

  PeerServer.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []), onInit || []);

  this._read = function (size) {
  };
}

util.inherits(TxServer, PeerServer);

module.exports = TxServer;
