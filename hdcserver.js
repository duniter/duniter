var async  = require('async');
var util   = require('util');
var logger = require('./app/lib/logger')('hdcserver');
var Server = require('./server');

function HDCServer (dbConf, overrideConf, interceptors) {

  var selfInterceptors = [
    {
      // Pubkey
      matches: function (obj) {
        return typeof obj.email != "undefined";
      },
      treatment: function (server, obj, next) {
        logger.debug('⬇ PUBKEY %s', obj.fingerprint);
        async.waterfall([
          function (next){
            server.PublicKeyService.submitPubkey(obj, next);
          },
          function (pubkey, next){
            logger.debug('✔ PUBKEY %s', pubkey.fingerprint);
            server.emit('pubkey', pubkey);
            next(null, pubkey.json());
          },
        ], next);
      }
    },{
      // Vote
      matches: function (obj) {
        return obj.amendment ? true : false;
      },
      treatment: function (server, obj, next) {
        logger.debug('⬇ VOTE of %s for %s-%s', "0x" + obj.issuer.substr(32), obj.amendment.number, obj.amendment.hash);
        async.waterfall([
          function (next){
            server.VoteService.submit(obj, next);
          },
          function (am, vote, next){
            server.emit('vote', vote);
            next();
          },
        ], next);
      }
    },{
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
            next();
          },
        ], next);
      }
    }
  ];

  Server.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []));

  var that = this;

  this._read = function (size) {
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
