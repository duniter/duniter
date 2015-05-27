var async       = require('async');
var util        = require('util');
var Q           = require('q');
var _           = require('underscore');
var base58      = require('./app/lib/base58');
var crypto      = require('./app/lib/crypto');
var dos2unix    = require('./app/lib/dos2unix');
var WOTServer   = require('./wotserver');
var signature   = require('./app/lib/signature');
var parsers     = require('./app/lib/streams/parsers/doc');
var multicaster = require('./app/lib/streams/multicaster');
var constants   = require('./app/lib/constants');
var Peer        = require('./app/lib/entity/peer');

function PeerServer (dbConf, overrideConf, interceptors, onInit) {

  var logger = require('./app/lib/logger')(dbConf.name);

  var selfInterceptors = [
    {
      // Membership
      matches: function (obj) {
        return obj.userid ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            that.BlockchainService.submitMembership(obj, next);
          },
          function (membership, next){
            that.emit('membership', membership);
            next(null, membership);
          }
        ], next);
      }
    },{
      // Block
      matches: function (obj) {
        return obj.type && obj.type == 'Block' ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            server.BlockchainService.submitBlock(obj, true, next);
          },
          function (kb, next){
            server.BlockchainService.addStatComputing();
            server.emit('block', kb);
            next(null, kb);
          },
        ], next);
      }
    },{
      // Peer
      matches: function (obj) {
        return obj.endpoints ? true : false;
      },
      treatment: function (server, obj, next) {
        logger.info('⬇ PEER %s', obj.pubkey);
        async.waterfall([
          function (next){
            that.PeeringService.submit(obj, next);
          },
          function (peer, next){
            logger.info('✔ PEER %s %s:%s', peer.pubkey, peer.getIPv4() || peer.getIPv6(), peer.getPort());
            that.emit('peer', peer);
            next(null, peer);
          }
        ], next);
      }
    }
  ];

  var initFunctions = onInit || [];

  WOTServer.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []), initFunctions);

  var that = this;

  this._read = function (size) {
  };

  this._initServices = function(conn, done) {
    async.waterfall([
      function(next) {
        that.IdentityService     = require('./app/service/IdentityService')(that.conn, that.conf, that.dal);
        that.PeeringService      = require('./app/service/PeeringService')(that, null, null, that.dal);
        that.BlockchainService   = require('./app/service/BlockchainService')(conn, that.conf, that.dal, that.PeeringService);
        that.TransactionsService = require('./app/service/TransactionsService')(conn, that.conf, that.dal);
        that.IdentityService.setBlockchainService(that.BlockchainService);
        // Extract key pair
        if (that.conf.pair)
          next(null, {
            publicKey: base58.decode(that.conf.pair.pub),
            secretKey: base58.decode(that.conf.pair.sec)
          });
        else if (that.conf.passwd || that.conf.salt)
          crypto.getKeyPair(that.conf.passwd, that.conf.salt, next);
        else
          next(null, null);
      },
      function (pair, next){
        if (pair) {
          that.setPair(pair);
          that.createSignFunction(pair, next);
        }
        else next();
      }
    ], done);
  };

  this.setPair = function(pair) {
    that.pair = pair;
    that.BlockchainService.setKeyPair(pair);
    that.PeeringService.setKeyPair(pair);
  };

  this._start = function (done) {
    return that.checkConfig()
      .then(function (){
        // Add signing & public key functions to PeeringService
        that.PeeringService.setSignFunc(that.sign);
        logger.info('Node version: ' + that.version);
        logger.info('Node pubkey: ' + that.PeeringService.pubkey);
        that.initPeer(done);
      })
      .fail(done);
  };

  this.checkConfig = function () {
    return that.checkPeeringConf(that.conf);
  };

  this.checkPeeringConf = function (conf) {
    return Q()
      .then(function(){
        if (!conf.pair && conf.passwd == null) {
          throw new Error('No key password was given.');
        }
        if (!conf.pair && conf.salt == null) {
          throw new Error('No key salt was given.');
        }
        if (!conf.currency) {
          throw new Error('No currency name was given.');
        }
        if(!conf.ipv4 && !conf.ipv6){
          throw new Error("No interface to listen to.");
        }
        if(!conf.remoteipv4 && !conf.remoteipv6){
          throw new Error('No interface for remote contact.');
        }
        if (!conf.remoteport) {
          throw new Error('No port for remote contact.');
        }
      });
  };

  this.createSignFunction = function (pair, done) {
    signature.async(pair, function (err, sigFunc) {
      that.sign = sigFunc;
      done(err);
    });
  };

  this.initPeer = function (done) {
    var conf = that.conf, conn = that.conn;
    async.waterfall([
      function (next){
        that.checkConfig().then(next).fail(next);
      },
      function (next){
        logger.info('Storing self peer...');
        that.PeeringService.regularPeerSignal(next);
      },
      function(next) {
        that.PeeringService.testPeers(next);
      },
      function (next){
        logger.info('Updating list of peers...');
        that.dal.updateMerkleForPeers(next);
      },
      function (next){
        that.PeeringService.regularSyncBlock(next);
      },
      function (next){
        if (conf.participate) {
          async.forever(
            function tryToGenerateNextBlock(next) {
              async.waterfall([
                function (next) {
                  that.BlockchainService.startGeneration(next);
                },
                function (block, next) {
                  if (block) {
                    var peer = new Peer({endpoints: [['BASIC_MERKLED_API', conf.ipv4, conf.port].join(' ')]});
                    multicaster(conf.isolate).sendBlock(peer, block, next);
                  } else {
                    next();
                  }
                }
              ], function (err) {
                next(err);
              });
            },
            function onError(err) {
              logger.error(err);
              logger.error('Block generation STOPPED.');
            }
          );
        }
        next();
      },
      function (next) {
        // Launch a block analysis
        that.BlockchainService.addStatComputing();
        next();
      }
    ], done);
  };

  this._listenBMA = function (app) {
    this.listenNode(app);
    this.listenWOT(app);
    this.listenBlock(app);
    this.listenNET(app);
  };

  this.listenBlock = function (app) {
    var blockchain = require('./app/controllers/blockchain')(that);
    app.get(    '/blockchain/parameters',       blockchain.parameters);
    app.post(   '/blockchain/membership',       blockchain.parseMembership);
    app.get(    '/blockchain/memberships/:search', blockchain.memberships);
    app.post(   '/blockchain/block',            blockchain.parseBlock);
    app.get(    '/blockchain/block/:number',    blockchain.promoted);
    app.get(    '/blockchain/blocks/:count/:from',    blockchain.blocks);
    app.get(    '/blockchain/current',          blockchain.current);
    app.get(    '/blockchain/hardship/:pubkey', blockchain.hardship);
    app.get(    '/blockchain/with/newcomers',   blockchain.with.newcomers);
    app.get(    '/blockchain/with/certs',       blockchain.with.certs);
    app.get(    '/blockchain/with/joiners',     blockchain.with.joiners);
    app.get(    '/blockchain/with/actives',     blockchain.with.actives);
    app.get(    '/blockchain/with/leavers',     blockchain.with.leavers);
    app.get(    '/blockchain/with/excluded',    blockchain.with.excluded);
    app.get(    '/blockchain/with/ud',          blockchain.with.ud);
    app.get(    '/blockchain/with/tx',          blockchain.with.tx);
  };

  this.listenNET = function (app) {
    var net = require('./app/controllers/network')(that, that.conf);
    app.get(    '/network/peering',             net.peer);
    app.get(    '/network/peering/peers',       net.peersGet);
    app.post(   '/network/peering/peers',       net.peersPost);
  }
}

util.inherits(PeerServer, WOTServer);

module.exports = PeerServer;
