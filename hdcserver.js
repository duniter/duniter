var async  = require('async');
var util   = require('util');
var logger = require('./app/lib/logger')('hdcserver');
var Server = require('./server');

function HDCServer (dbConf, overrideConf) {

  Server.call(this, dbConf, overrideConf);

  var that = this;
  var queue = [];

  this._read = function (size) {
  };

  this._write = function (obj, enc, done) {
    async.waterfall([
      async.apply(that.initServer.bind(that)),
      function (next){
        if (obj.pubkey) {
          // Pubkey
          async.waterfall([
            function (next){
              var PublicKey = that.conn.model('PublicKey');
              var pubkey = new PublicKey({ raw: obj.pubkey });
              pubkey.construct(function (err) {
                next(err, pubkey);
              });
            },
            function (pubkey, next){
              that.PublicKeyService.submitPubkey(pubkey, next);
            },
            function (pubkey, next){
              that.emit('pubkey', pubkey);
              next();
            },
          ], next);
        } else if (obj.amendment) {
          // Vote
          async.waterfall([
            function (next){
              that.VoteService.submit(obj, next);
            },
            function (am, vote, next){
              that.emit('vote', vote);
              next();
            },
          ], next);
        } else if (obj.recipient) {
          // Transaction
          async.waterfall([
            function (next){
              that.TransactionsService.processTx(obj, next);
            },
            function (tx, next){
              that.emit('transaction', tx);
              next();
            },
          ], next);
        } else {
          var err = 'Unknown document type';
          that.emit('error', Error(err));
          next(err);
        }
      },
    ], function (err) {
      if (err){
        logger.debug(err);
      }
      done();
    });
  };

  this.initServer = function (done) {
    if (!that.peerInited) {
      that.peerInited = true;
      async.waterfall([
        function (next){
          that.connect(next);
        },
        function (next){
          that.initServices(next);
        },
      ], done);
    } else {
      done();
    }
  };

  this._initServices = function(conn, done) {
    this.KeyService         = require('./app/service/KeyService').get(conn);
    this.PublicKeyService   = require('./app/service/PublicKeyService').get(conn, that.conf, that.KeyService);
    this.ContractService    = require('./app/service/ContractService').get(conn, that.conf);
    this.StrategyService    = require('./app/service/StrategyService').get(conn, that.conf, that.ContractService);
    this.VoteService        = require('./app/service/VoteService').get(conn, that.StrategyService);
    // this.PeeringService     = require('./app/service/PeeringService').get(conn, that.conf, that.PublicKeyService, that.ParametersService);
    this.TransactionsService = require('./app/service/TransactionsService').get(conn, that.MerkleService);
    async.parallel({
      contract: function(callback){
        that.ContractService.load(callback);
      },
      peering: function(callback){
        // that.PeeringService.load(callback);
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
    var hdc = require('./app/controllers/hdc')(this);
    app.get(    '/hdc/amendments/promoted',                        hdc.amendments.promoted);
    app.get(    '/hdc/amendments/promoted/:am_number',             hdc.amendments.promotedNumber);
    app.get(    '/hdc/amendments/view/:amendment_id/self',         hdc.amendments.viewAM.self);
    app.get(    '/hdc/amendments/view/:amendment_id/signatures',   hdc.amendments.votes.sigs);
    app.get(    '/hdc/amendments/votes',                           hdc.amendments.votes.get);
    app.post(   '/hdc/amendments/votes',                           hdc.amendments.votes.post);
    app.post(   '/hdc/transactions/process',                       hdc.transactions.processTx);
    app.get(    '/hdc/transactions/last/:count',                   hdc.transactions.lastNAll);
    app.get(    '/hdc/transactions/sender/:fpr',                   hdc.transactions.sender.get);
    app.get(    '/hdc/transactions/sender/:fpr/view/:number',      hdc.transactions.viewtx);
    app.get(    '/hdc/transactions/sender/:fpr/last/:count',       hdc.transactions.sender.lastNofSender);
    app.get(    '/hdc/transactions/sender/:fpr/last/:count/:from', hdc.transactions.sender.lastNofSender);
    app.get(    '/hdc/transactions/recipient/:fpr',                hdc.transactions.recipient);
    app.get(    '/hdc/transactions/refering/:fpr/:number',         hdc.transactions.refering);
    app.get(    '/hdc/coins/list/:fpr',                            hdc.coins.list);
    app.get(    '/hdc/coins/view/:coin_id/owner',                  hdc.coins.view);
    app.get(    '/hdc/coins/view/:coin_id/history',                hdc.coins.history);
  };
}

util.inherits(HDCServer, Server);

module.exports = HDCServer;
