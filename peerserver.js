var async     = require('async');
var util      = require('util');
var jpgp      = require('./app/lib/jpgp');
var openpgp   = require('openpgp');
var logger    = require('./app/lib/logger')('peerserver');
var plogger   = require('./app/lib/logger')('peer');
var flogger   = require('./app/lib/logger')('forward');
var HDCServer = require('./hdcserver');
var parsers   = require('./app/lib/streams/parsers/doc');

function PeerServer (dbConf, overrideConf, interceptors) {

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
            next(null, peer.json());
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
            next(null, forward.json());
          },
        ], next);
      }
    },{
      // Status
      matches: function (obj) {
        return obj.status ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            that.PeeringService.submitStatus(obj, next);
          },
          function (status, peer, wasStatus, next){
            that.emit('status', status);
            next(null, status.json());
          },
        ], next);
      }
    },{
      // Wallet
      matches: function (obj) {
        return obj.requiredTrusts ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            that.WalletService.submit(obj, next);
          },
          function (wallet, next){
            that.emit('wallet', wallet);
            next(null, wallet.json());
          },
        ], next);
      }
    }
  ];

  HDCServer.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []));

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
        that.StrategyService     = require('./app/service/StrategyService').get(conn, that.conf, that.ContractService);
        that.VoteService         = require('./app/service/VoteService').get(conn, that.StrategyService);
        that.PeeringService      = require('./app/service/PeeringService').get(conn, that.conf, that.PublicKeyService, that.ParametersService);
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
        function (next){
          that.initPeer(that.conn, that.conf, next);
        },
      ], done);
    } else {
      done();
    }
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
    async.waterfall([
      function (next) {
        if (conf.openpgpjs) {
          var pgp = jpgp();
          var privateKey = openpgp.key.readArmored(conf.pgpkey).keys[0];
          privateKey.decrypt(conf.pgppasswd);
          var signingFunc = async.apply(pgp.sign.bind(pgp.sign), privateKey);
          next(null, function (message, done) {
            jpgp().sign(message, privateKey, done);
          });
        } else {
          var asciiPrivateKey = conf.pgpkey;
          var keyring = '~/.gnupg/ucoin_' + that.PeeringService.cert.fingerprint;
          logger.debug("Keyring = %s", keyring);
          var gnupg = new (require('./app/lib/gnupg'))(asciiPrivateKey, conf.pgppasswd, that.PeeringService.cert.fingerprint, keyring);
          gnupg.init(function (err) {
            next(err, function (message, done) {
              gnupg.sign(message, done);
            });
          });
        }
      },
      function (signFunc, next){
        that.sign = signFunc;
        try{
          that.sign("some test\nwith line return", next);
        } catch(ex){
          next("Wrong private key password.");
        }
      },
    ], function (err) {
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
        next();
      },
    ], done);
  };

  this.initPubkey = function (conn, conf, done) {
    var parser = parsers.parsePubkey();
    parser.end(that.PeeringService.cert.raw);
    parser.on('readable', function () {
      var parsed = parser.read();
      that._write(parsed, null, done);
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
              that.PeeringService.submit(p2, next);
            },
          ], function (err) {
            next(err);
          });
        } else {
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
    this.listenHDC(app);
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

util.inherits(PeerServer, HDCServer);

module.exports = PeerServer;
