var async      = require('async');
var util       = require('util');
var logger     = require('./app/lib/logger')('regserver');
var PeerServer = require('./peerserver');

function RegistryServer (dbConf, overrideConf, interceptors) {

  var selfInterceptors = [
    {
      // Membership
      matches: function (obj) {
        return obj.type && obj.type == "MEMBERSHIP" ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            that.SyncService.submit(obj, next);
          },
          function (membership, next){
            that.emit('membership', membership);
            next(null, membership);
          },
        ], next);
      }
    },{
      // Voting
      matches: function (obj) {
        return obj.type && obj.type == "VOTING" ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            logger.debug('⬇ %s\'s voting', "0x" + obj.issuer.substr(32));
            that.SyncService.submitVoting(obj, next);
          },
          function (voting, next){
            logger.debug('✔ %s\'s voting', "0x" + obj.issuer.substr(32));
            that.emit('voting', voting);
            next(null, voting);
          },
        ], next);
      }
    },{
      // Statement
      matches: function (obj) {
        return obj.algorithm ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            logger.debug('⬇ Statement based on AM#%s from %s', obj.amendmentNumber, obj.issuer);
            that.SyncService.submitStatement(obj, next);
          },
          function (statement, next){
            logger.debug('✔ Statement based on AM#%s from %s', obj.amendmentNumber, obj.issuer);
            that.emit('statement', statement);
            next(null, statement);
          },
        ], next);
      }
    }
  ];

  var initFunctions = [
    function (done) {
      that.initRegistry(that.conn, that.conf, done);
    }
  ];

  PeerServer.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []), initFunctions);

  var that = this;

  this._read = function (size) {
  };

  this._initServices = function(conn, done) {
    async.waterfall([
      function (next){
        that.checkConfig(next);
      },
      function (next){
        that.KeyService          = require('./app/service/KeyService').get(conn);
        that.ContractService     = require('./app/service/ContractService').get(conn, that.conf);
        that.PublicKeyService    = require('./app/service/PublicKeyService').get(conn, that.conf, that.KeyService);
        that.PeeringService      = require('./app/service/PeeringService').get(conn, that.conf, that.PublicKeyService, that.ParametersService);
        next();
      },
      function (next){
        that.createSignFunction(that.conf, next);
      },
      function (next){
        that.SyncService         = require('./app/service/SyncService').get(conn, that.conf, that.sign, that.ContractService, that.PeeringService, that.daemonJudgesTimeForVote);
        that.StrategyService     = require('./app/service/StrategyService').get(conn, that.conf, that.ContractService, that.SyncService);
        that.VoteService         = require('./app/service/VoteService').get(conn, that.StrategyService);
        that.TransactionsService = require('./app/service/TransactionsService').get(conn, that.MerkleService, that.PeeringService);
        that.WalletService       = require('./app/service/WalletService').get(conn);
        async.parallel({
          contract: function(callback){
            that.ContractService.load(callback);
          },
          peering: function(callback){
            that.PeeringService.load(callback);
          },
        }, function (err) {
          next(err);
        });
      },
    ], done);
  };

  this.checkConfig = function (done) {
    async.waterfall([
      function (next){
        that.checkPeeringConf(that.conf, next);
      },
      function (next){
        that.checkDaemonConf(that.conf, next);
      }
    ], done);
  };

  this.initRegistry = function (conn, conf, done) {
    async.waterfall([
      function (next){
        // Init Daemon
        that.daemon = require('./app/lib/daemon')(that);
        that.daemon.init(conf, that.PeeringService.cert.fingerprint);
        // Start autonomous contract daemon
        that.daemon.start();
        next();
      },
    ], done);
  };

  this.daemonJudgesTimeForVote = function (amNext) {
    return that.daemon.judges.timeForVote(amNext);
  };

  this.checkDaemonConf = function (conf, done) {
    var errors = [];
    if (conf.sync.AMDaemon == "ON") {
      if (!conf.sync.AMStart) {
        errors.push('Autovoting enabled but starting date not given');
      }
      if (!conf.sync.AMFreq) {
        errors.push('Autovoting enabled but amendment frequency not given');
      }
      if (!conf.sync.UDFreq) {
        errors.push('Autovoting enabled but dividend frequency not given');
      }
      if (conf.sync.UDFreq % conf.sync.AMFreq != 0) {
        errors.push('UD frequency must be a multiple of Amendment frequency');
      }
      if (!conf.sync.UD0) {
        errors.push('Autovoting enabled but initial dividend not given');
      }
      if (!conf.sync.UDPercent) {
        errors.push('Autovoting enabled but %dividend not given');
      }
      if (!conf.sync.Consensus) {
        errors.push('Autovoting enabled but %required votes not given');
      }
    }
    done(errors[0]);
  };

  this._listenBMA = function (app) {
    this.listenPKS(app);
    this.listenHDC(app);
    this.listenNET(app);
    this.listenREG(app);
  };

  this.listenREG = function (app) {
    var reg = require('./app/controllers/registry')(that, that.conf);
    app.get(    '/registry/parameters',                             reg.parameters);
    app.post(   '/registry/community/members',                      reg.membershipPost);
    app.get(    '/registry/community/members/:fpr/current',         reg.membershipCurrent);
    app.get(    '/registry/community/members/:fpr/history',         reg.membershipHistory);
    app.post(   '/registry/community/voters',                       reg.votingPost);
    app.get(    '/registry/community/voters/:fpr/current',          reg.votingCurrent);
    app.get(    '/registry/community/voters/:fpr/history',          reg.votingHistory);
    app.post(   '/registry/amendment/statement',                    reg.statementPost);
    app.get(    '/registry/amendment/:am_number/:algo/members/in',  reg.membersIn);
    app.get(    '/registry/amendment/:am_number/:algo/members/out', reg.membersOut);
    app.get(    '/registry/amendment/:am_number/:algo/voters/in',   reg.votersIn);
    app.get(    '/registry/amendment/:am_number/:algo/voters/out',  reg.votersOut);
    app.get(    '/registry/amendment/:am_number/:algo/self',        reg.askSelf);
    app.get(    '/registry/amendment/:am_number/:algo/statement',   reg.askStatement);
    app.get(    '/registry/amendment/:am_number/:algo/vote',        reg.askVote);
  }

  var SELF_ACTUALIZATION_FREQUENCY = 3600*24*10;

  this.on('promoted', function (amendment) {
    var nextTimestamp = amendment.generated + that.conf.sync.AMFreq;
    async.waterfall([
      function (next){
        that.SyncService.getLastVoterOn(that.PeeringService.cert.fingerprint, next);
      },
      function (voterOn, next){
        if (!voterOn || (voterOn + SELF_ACTUALIZATION_FREQUENCY - nextTimestamp <= 0)) {
          actualizeVoting(amendment, next);
        }
        else next();
      },
    ], function (err, vt) {
      if (err) logger.error(err);
      var now = new Date().timestamp();
      that.daemon.nextIn((nextTimestamp - now)*1000);
    });
  });

  function actualizeVoting (amendmentBasis, done) {
    async.waterfall([
      function (next){
        that.SyncService.createSelfVoting(amendmentBasis, next);
      },
      function (vt, pubkey, next){
        var json = vt.json();
        var obj = json.voting;
        obj.type = obj.registry;
        obj.signature = json.signature;
        obj.pubkey = pubkey;
        obj.date = new Date(obj.date*1000);
        obj.sigDate = new Date();
        that.singleWriteStream(next)._write(obj, null, next);
      },
    ], done);
  }
}

util.inherits(RegistryServer, PeerServer);

module.exports = RegistryServer;
