var async      = require('async');
var util       = require('util');
var parsers    = require('./app/lib/streams/parsers/doc');
var PeerServer = require('./peerserver');

function TxServer (dbConf, overrideConf, interceptors, onInit) {

  var logger  = require('./app/lib/logger')(dbConf.name);

  var selfInterceptors = [
    {
      // Transaction
      matches: function (obj) {
        return obj.recipient ? true : false;
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

  var that = this;

  this._read = function (size) {
  };

  this._listenBMA = function (app) {
    this.listenPKS(app);
    this.listenWOT(app);
    this.listenNET(app);
    this.listenCTX(app);
  };

  this.listenCTX = function (app) {
    var hdc = require('./app/controllers/hdc')(that);
    app.get(    '/contract/am/:am_number',                        hdc.amendments.promotedNumber);
    app.post(   '/tx/transactions/process',                       hdc.transactions.processTx);
    app.get(    '/tx/transactions/last/:count',                   hdc.transactions.lastNAll);
    app.get(    '/tx/transactions/sender/:fpr',                   hdc.transactions.sender.get);
    app.get(    '/tx/transactions/sender/:fpr/view/:number',      hdc.transactions.viewtx);
    app.get(    '/tx/transactions/sender/:fpr/last/:count',       hdc.transactions.sender.lastNofSender);
    app.get(    '/tx/transactions/sender/:fpr/last/:count/:from', hdc.transactions.sender.lastNofSender);
    app.get(    '/tx/transactions/recipient/:fpr',                hdc.transactions.recipient);
    app.get(    '/tx/transactions/refering/:fpr/:number',         hdc.transactions.refering);
    app.get(    '/tx/coins/list/:fpr',                            hdc.coins.list);
    app.get(    '/tx/coins/view/:coin_id/owner',                  hdc.coins.view);
    app.get(    '/tx/coins/view/:coin_id/history',                hdc.coins.history);
  };
}

util.inherits(TxServer, PeerServer);

module.exports = TxServer;
