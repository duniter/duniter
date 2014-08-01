var async   = require('async');
var util    = require('util');
var parsers = require('./app/lib/streams/parsers/doc');
var PKSServer  = require('./pksserver');

function HDCServer (dbConf, overrideConf, interceptors, onInit) {

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

  PKSServer.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []), onInit || []);

  var that = this;

  this._read = function (size) {
  };

  this._initServices = function(conn, done) {
    this.KeyService         = require('./app/service/KeyService').get(conn);
    this.PublicKeyService   = require('./app/service/PublicKeyService').get(conn, that.conf, that.KeyService);
    this.ContractService    = require('./app/service/ContractService').get(conn, that.conf);
    this.TransactionsService = require('./app/service/TransactionsService').get(conn, that.MerkleService);
    async.parallel({
      contract: function(callback){
        that.ContractService.load(callback);
      },
      peering: function(callback){
        callback();
      },
    }, function (err) {
      done(err);
    });
  };

  this._listenBMA = function (app) {
    this.listenPKS(app);
    this.listenHDC(app);
  };

  this.listenHDC = function (app) {
    var hdc = require('./app/controllers/hdc')(that);
    app.get(    '/contract/amendments/promoted/:am_number',       hdc.amendments.promotedNumber);
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

util.inherits(HDCServer, PKSServer);

module.exports = HDCServer;
