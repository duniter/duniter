var async       = require('async');
var util        = require('util');
var openpgp     = require('openpgp');
var jpgp        = require('./app/lib/jpgp');
var unix2dos    = require('./app/lib/unix2dos');
var logger      = require('./app/lib/logger')('peerserver');
var plogger     = require('./app/lib/logger')('peer');
var flogger     = require('./app/lib/logger')('forward');
var slogger     = require('./app/lib/logger')('status');
var wlogger     = require('./app/lib/logger')('wallet');
var WOT         = require('./wotserver');
var signature   = require('./app/lib/signature');
var parsers     = require('./app/lib/streams/parsers/doc');
var multicaster = require('./app/lib/streams/multicaster');

function PeerServer (dbConf, overrideConf, interceptors, onInit) {

  var selfInterceptors = [
    {
      // Peer
      matches: function (obj) {
        return obj.endpoints ? true : false;
      },
      treatment: function (server, obj, next) {
        plogger.debug('⬇ PEER %s', obj.pubkey.fingerprint);
        async.waterfall([
          function (next){
            that.PeeringService.submit(obj, next);
          },
          function (peer, next){
            plogger.debug('✔ PEER %s %s:%s', peer.fingerprint, peer.getIPv4() || peer.getIPv6(), peer.getPort());
            that.emit('peer', peer);
            next(null, peer);
          },
        ], next);
      }
    },{
      // Forward
      matches: function (obj) {
        return obj.forward ? true : false;
      },
      treatment: function (server, obj, next) {
        flogger.debug('⬇ FWD %s type %s', obj.from, obj.forward);
        async.waterfall([
          function (next){
            that.PeeringService.submitForward(obj, next);
          },
          function (forward, next){
            flogger.debug('✔ FWD %s type %s', forward.from, forward.forward);
            that.emit('forward', forward);
            next(null, forward);
          },
        ], next);
      }
    },{
      // Status
      matches: function (obj) {
        return obj.status ? true : false;
      },
      treatment: function (server, obj, next) {
        slogger.debug('⬇ STATUS %s %s', obj.pubkey.fingerprint, obj.status);
        async.waterfall([
          function (next){
            that.PeeringService.submitStatus(obj, next);
          },
          function (status, peer, wasStatus, next){
            slogger.debug('✔ STATUS %s %s', status.pubkey.fingerprint, status.status);
            that.emit('status', status);
            next(null, status);
          },
        ], next);
      }
    },{
      // Wallet
      matches: function (obj) {
        return obj.requiredTrusts ? true : false;
      },
      treatment: function (server, obj, next) {
        slogger.debug('⬇ WALLET %s', obj.pubkey.fingerprint);
        async.waterfall([
          function (next){
            that.WalletService.submit(obj, next);
          },
          function (wallet, next){
            wlogger.debug('✔ WALLET %s', obj.pubkey.fingerprint);
            that.emit('wallet', wallet);
            next(null, wallet);
          },
        ], next);
      }
    }
  ];

  var initFunctions = [
    function (done) {
      that.initPeer(that.conn, that.conf, done);
    },
    function (done) {
      that.emit('peerInited');
      done();
    }
  ].concat(onInit || []);

  WOT.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []), initFunctions);

  var that = this;

  that.peerInited = false;

  this._read = function (size) {
  };

  this._initServices = function(conn, done) {
    async.waterfall([
      function (next){
        that.KeyService          = require('./app/service/KeyService').get(conn);
        that.PublicKeyService    = require('./app/service/PublicKeyService').get(conn, that.conf, that.KeyService);
        that.ContractService     = require('./app/service/ContractService').get(conn, that.conf);
        that.PeeringService      = require('./app/service/PeeringService').get(conn, that.conf, that.PublicKeyService, that.ParametersService);
        that.KeychainService     = require('./app/service/KeychainService').get(conn, that.conf, that.PublicKeyService, that.PeeringService);
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
      function (next){
        that.checkConfig(next);
      },
      function (next){
        that.createSignFunction(that.conf, next);
      }
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
    var privateKey = openpgp.key.readArmored(conf.pgpkey).keys[0];

    if (conf.pgppasswd == null) {
      conf.pgppasswd = "";
    }
    if (!privateKey) {
      errors.push('This node requires a private key to work.');
    }
    try {
      if(privateKey && !privateKey.decrypt(conf.pgppasswd)) {
        errors.push('Wrong private key password.');
      }
    } catch(ex) {
      errors.push('Not a valid private key, message was: "' + ex.message + '"');
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
    signature(conf.pgpkey, conf.pgppasswd, conf.openpgpjs, function (err, sigFunc) {
      that.sign = sigFunc;
      done(err);
    });
  }

  this.initPeer = function (conn, conf, done) {
    async.waterfall([
      function (next){
        // Add selfkey as managed
        conn.model('Key').setManaged(that.PeeringService.cert.fingerprint, true, next);
      },
      function (next){
        logger.info('Storing self public key...');
        that.initPubkey(conn, conf, next);
      },
      function (next){
        logger.info('Storing self peer...');
        that.initPeeringEntry(conn, conf, next);
      },
      function (next){
        logger.info('Broadcasting UP/NEW signals...');
        that.PeeringService.on('status', function (status) {
          // Readable status to be multicasted
          that.push(status);
        });
        that.PeeringService.on('forward', function (forward) {
          // Readable forward to be multicasted
          that.push(forward);
        });
        that.PeeringService.sendUpSignal(next);
      },
      function (next){
        that.PeeringService.regularUpSignal(next);
      },
      function (next){
        logger.info('Updating forwards...');
        that.PeeringService.updateForwards(next);
      },
      function (next){
        async.forever(
          function tryToGenerateNextBlock(next) {
            async.waterfall([
              function (next){
                that.KeychainService.startGeneration(next);
              },
              function (block, next){
                if (block) {
                  var Peer = that.conn.model('Peer');
                  var peer = new Peer({ endpoints: [['BASIC_MERKLED_API', conf.ipv4, conf.port].join(' ')] });
                  multicaster().sendKeyblock(peer, block, next);
                } else {
                  next();
                }
              },
            ], function (err) {
              next(err);
            });
          },
          function onError (err) {
            logger.error(err);
            logger.error('Keyblock generation STOPPED.');
          }
        );
        next();
      },
    ], done);
  };

  this.initPubkey = function (conn, conf, done) {
    var parser = parsers.parsePubkey();
    parser.end(unix2dos(that.PeeringService.cert.raw));
    parser.on('readable', function () {
      var parsed = parser.read();
      that.submit(parsed, false, done);
    });
  };

  this.initPeeringEntry = function (conn, conf, done) {
    var Peer = conn.model('Peer');
    var currency = conf.currency;
    async.waterfall([
      function (next) {
        Peer.find({ fingerprint: that.PeeringService.cert.fingerprint }, next);
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
          fingerprint: that.PeeringService.cert.fingerprint,
          endpoints: [endpoint]
        };
        var raw1 = p1.getRaw().unix2dos();
        var raw2 = new Peer(p2).getRaw().unix2dos();
        if (raw1 != raw2) {
          logger.debug('Generating server\'s peering entry...');
          async.waterfall([
            function (next){
              jpgp().sign(raw2, that.PeeringService.privateKey, next);
            },
            function (signature, next) {
              signature = signature.substring(signature.indexOf('-----BEGIN PGP SIGNATURE'));
              p2.signature = signature;
              p2.pubkey = { fingerprint: that.PeeringService.cert.fingerprint };
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
        Peer.getTheOne(that.PeeringService.cert.fingerprint, next);
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
    this.listenPKS(app);
    this.listenWOT(app);
    this.listenNET(app);
  };

  this.listenNET = function (app) {
    var net = require('./app/controllers/network')(that, that.conf);
    app.get(    '/network/pubkey',                                net.pubkey);
    app.get(    '/network/peering',                               net.peer);
    app.get(    '/network/peering/peers',                         net.peersGet);
    app.post(   '/network/peering/peers',                         net.peersPost);
    app.get(    '/network/peering/peers/upstream',                net.upstreamAll);
    app.get(    '/network/peering/peers/upstream/:fingerprint',   net.upstreamKey);
    app.get(    '/network/peering/peers/downstream',              net.downstreamAll);
    app.get(    '/network/peering/peers/downstream/:fingerprint', net.downstreamKey);
    app.post(   '/network/peering/forward',                       net.forward);
    app.post(   '/network/peering/status',                        net.statusPOST);
    app.get(    '/network/wallet',                                net.walletGET);
    app.post(   '/network/wallet',                                net.walletPOST);
    app.get(    '/network/wallet/:fpr',                           net.walletFPR);
  }
}

util.inherits(PeerServer, WOT);

module.exports = PeerServer;
