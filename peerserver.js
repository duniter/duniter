var async       = require('async');
var util        = require('util');
var crypto      = require('./app/lib/crypto');
var dos2unix    = require('./app/lib/dos2unix');
var logger      = require('./app/lib/logger')('peerserver');
var plogger     = require('./app/lib/logger')('peer');
var slogger     = require('./app/lib/logger')('status');
var WOTServer   = require('./wotserver');
var signature   = require('./app/lib/signature');
var parsers     = require('./app/lib/streams/parsers/doc');
var multicaster = require('./app/lib/streams/multicaster');
var constants   = require('./app/lib/constants');

function PeerServer (dbConf, overrideConf, interceptors, onInit) {

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
            server.BlockchainService.submitBlock(obj, next);
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
        plogger.debug('⬇ PEER %s', obj.pub);
        async.waterfall([
          function (next){
            that.PeeringService.submit(obj, next);
          },
          function (peer, next){
            plogger.debug('✔ PEER %s %s:%s', peer.pub, peer.getIPv4() || peer.getIPv6(), peer.getPort());
            that.emit('peer', peer);
            next(null, peer);
          },
        ], next);
      }
    },{
      // Status
      matches: function (obj) {
        return obj.status ? true : false;
      },
      treatment: function (server, obj, next) {
        slogger.debug('⬇ STATUS %s %s', obj.from, obj.status);
        async.waterfall([
          function (next){
            that.PeeringService.submitStatus(obj, next);
          },
          function (status, peer, wasStatus, next){
            slogger.debug('✔ STATUS %s %s', status.from, status.status);
            next(null, status);
          },
        ], next);
      }
    }
  ];

  var initFunctions = onInit || [];

  WOTServer.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []), initFunctions);

  var that = this;

  that.peerInited = false;

  this._read = function (size) {
  };

  this._initServices = function(conn, done) {
    async.waterfall([
      function (next){
        that.IdentityService     = require('./app/service/IdentityService').get(that.conn, that.conf);
        that.PeeringService      = require('./app/service/PeeringService').get(conn, that.conf, null, null, that.ParametersService);
        that.BlockchainService   = require('./app/service/BlockchainService').get(conn, that.conf, that.IdentityService, that.PeeringService);
        that.TransactionsService = require('./app/service/TransactionsService').get(conn, that.conf, that.PeeringService);
        async.parallel({
          peering: function(callback){
            that.PeeringService.load(callback);
          }
        }, function (err) {
          next(err);
        });
      }
    ], done);
  };

  this._start = function (done) {
    async.waterfall([
      function (next){
        that.createSignFunction(that.conf, next);
      },
      function (next){
        // Extract key pair
        crypto.getKeyPair(that.conf.passwd, that.conf.salt, next);
      },
      function (pair, next){
        // Overrides PeeringService so we do benefit from registered privateKey
        that.IdentityService     = require('./app/service/IdentityService').get(that.conn, that.conf);
        that.PeeringService      = require('./app/service/PeeringService').get(that.conn, that.conf, pair, that.sign, that.ParametersService);
        that.BlockchainService   = require('./app/service/BlockchainService').get(that.conn, that.conf, that.IdentityService, that.PeeringService);
        that.TransactionsService = require('./app/service/TransactionsService').get(that.conn, that.conf, that.PeeringService);
        that.IdentityService.setBlockchainService(that.BlockchainService);
        logger.info('Node version: ' + that.version);
        logger.info('Node pubkey: ' + that.PeeringService.pubkey);
        async.waterfall([
          function (next){
            async.parallel({
              peering: function(callback){
                that.PeeringService.load(callback);
              }
            }, function (err) {
              next(err);
            });
          },
          function (next) {
            that.initPeer(that.conn, that.conf, next);
          },
          function (next) {
            that.emit('peerInited');
            next();
          }
        ], next);
      },
    ], done);
  };

  this.checkConfig = function (done) {
    async.waterfall([
      function (next){
        that.checkPeeringConf(that.conf, next);
      }
    ], done);
  };

  this.checkPeeringConf = function (conf, done) {
    var errors = [];

    if (conf.passwd == null) {
      errors.push('No key password was given.');
    }
    if (conf.salt == null) {
      errors.push('No key salt was given.');
    }
    if (!conf.currency) {
      errors.push('No currency name was given.');
    }
    if(!conf.ipv4 && !conf.ipv6){
      errors.push("No interface to listen to.");
    }
    if(!conf.remoteipv4 && !conf.remoteipv6){
      errors.push('No interface for remote contact.');
    }
    if (!conf.remoteport) {
      errors.push('No port for remote contact.');
    }
    done(errors[0]);
  };

  this.createSignFunction = function (conf, done) {
    signature.async(conf.salt, conf.passwd, function (err, sigFunc) {
      that.sign = sigFunc;
      done(err);
    });
  }

  this.initPeer = function (conn, conf, done) {
    async.waterfall([
      function (next){
        that.checkConfig(next);
      },
      function (next){
        logger.info('Storing self peer...');
        that.initPeeringEntry(conn, conf, next);
      },
      function (next){
        logger.info('Updating list of peers...');
        that.conn.model('Merkle').updateForPeers(next);
      },
      function (next){
        logger.info('Broadcasting UP/NEW signals...');
        that.PeeringService.on('status', function (status) {
          // Readable status to be multicasted
          that.push(status);
        });
        that.PeeringService.sendUpSignal(next);
      },
      function (next){
        that.PeeringService.regularUpSignal(next);
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
                    var Peer = that.conn.model('Peer');
                    var peer = new Peer({endpoints: [['BASIC_MERKLED_API', conf.ipv4, conf.port].join(' ')]});
                    multicaster().sendBlock(peer, block, next);
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

  this.initPeeringEntry = function (conn, conf, done) {
    var Peer = conn.model('Peer');
    var currency = conf.currency;
    var current = null;
    async.waterfall([
      function (next) {
        that.BlockchainService.current(next);
      },
      function (currentBlock, next) {
        current = currentBlock;
        Peer.find({ pub: that.PeeringService.pubkey }, next);
      },
      function (peers, next) {
        var p1 = new Peer({});
        if(peers.length != 0){
          p1 = peers[0];
        }
        var endpoint = 'BASIC_MERKLED_API';
        if (conf.remotehost) {
          endpoint += ' ' + conf.remotehost;
        }
        if (conf.remoteipv4) {
          endpoint += ' ' + conf.remoteipv4;
        }
        if (conf.remoteipv6) {
          endpoint += ' ' + conf.remoteipv6;
        }
        if (conf.remoteport) {
          endpoint += ' ' + conf.remoteport;
        }
        var p2 = {
          version: 1,
          currency: currency,
          pub: that.PeeringService.pubkey,
          block: current ? [current.number, current.hash].join('-') : constants.PEER.SPECIAL_BLOCK,
          endpoints: [endpoint]
        };
        var raw1 = p1.getRaw().dos2unix();
        var raw2 = new Peer(p2).getRaw().dos2unix();
        if (raw1 != raw2) {
          logger.debug('Generating server\'s peering entry...');
          async.waterfall([
            function (next){
              that.sign(raw2, next);
            },
            function (signature, next) {
              p2.signature = signature;
              p2.pubkey = that.PeeringService.pubkey;
              that.submit(p2, false, next);
            },
          ], function (err) {
            next(err);
          });
        } else {
          that.push(p1);
          next();
        }
      },
      function (next){
        Peer.getTheOne(that.PeeringService.pubkey, next);
      },
      function (peer, next){
        // Set peer's statut to UP
        that.PeeringService.peer(peer);
        that.PeeringService.peer().status = 'UP';
        that.PeeringService.peer().save(function (err) {
          // Update it in memory
          that.PeeringService.addPeer(that.PeeringService.peer());
          next(err);
        });
      },
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
    app.post(   '/network/peering/status',      net.statusPOST);
  }
}

util.inherits(PeerServer, WOTServer);

module.exports = PeerServer;
