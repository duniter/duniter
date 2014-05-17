var express    = require('express');
var request    = require('request');
var http       = require('http');
var fs         = require('fs');
var async      = require('async');
var path       = require('path');
var mongoose   = require('mongoose');
var connectPgp = require('connect-pgp');
var _          = require('underscore');
var common     = require('./common');
var server     = require('../lib/server');
var service    = require('../service');
var openpgp    = require('openpgp');
var jpgp       = require('./jpgp');
var sha1       = require('sha1');
var logger     = require('./logger')('http');
var pgplogger  = require('./logger')('PGP');
var log4js     = require('log4js');

var models = ['Amendment', 'Coin', 'Configuration', 'Forward', 'Key', 'Merkle', 'Peer', 'PublicKey', 'Wallet', 'Transaction', 'Vote', 'TxMemory', 'Membership', 'Voting'];

function initModels() {
  models.forEach(function (entity) {
    require(__dirname + '/../models/' + entity.toLowerCase() + '.js');
  });
};

module.exports.pgp = openpgp;

var privateKey;

module.exports.privateKey = function () {
  return privateKey;
};

module.exports.publicKey = function () {
  var privateKey = module.exports.privateKey();
  return privateKey ? privateKey.toPublic().armor() : "";
};

module.exports.fingerprint = function () {
  var ascciiPubkey = module.exports.publicKey();
  return ascciiPubkey ? jpgp().certificate(ascciiPubkey).fingerprint : '';
};

module.exports.sign = function (message, done) {
  done("Signature not implemented.");
};

module.exports.database = {

  init: function () {
    initModels();
  },

  connect: function (databaseName, host, port, reset, done) {
    if (arguments.length == 4) {
      done = reset;
      reset = false;
    }
    var that = this;
    initModels();
    // bad parameters
    if(!host && !port && !done){
      throw new Error('Bad parameters for database connection');
    }
    // host and port not provided
    if(!done && !port){
      done = host;
      host = 'localhost';
      port = undefined;
    }
    // port not provided
    if(!done && !port){
      done = port;
      port = undefined;
    }
    host = host ? host : 'localhost';
    mongoose.connect('mongodb://' + host + (port ? ':' + port : '') + '/' + databaseName);
    var db = mongoose.connection;
    db.on('error', function (err) {
      logger.error('connection error:', err);
    });
    var Configuration = mongoose.model('Configuration');
    var confs;
    async.waterfall([
      function (next){
        db.once('open', next);
      },
      function (next){
        Configuration.find(next);
      },
      function (foundConf, next){
        confs = foundConf;
        if (reset) {
          that.reset(next);
          return;
        }
        next();
      },
      function (next){
        next(null, confs[0]);
      },
    ], done);
  },

  reset: function(done) {
    var deletableCollections = [
      'amendments',
      'coins',
      'forwards',
      'keys',
      'merkles',
      'peers',
      'publickeys',
      'wallets',
      'transactions',
      'votes',
      'txmemories',
      'memberships',
      'votings'];
    async.forEachSeries(deletableCollections, function(collection, next){
      mongoose.connection.collections[collection].drop(function (err) {
        next();
      });
    }, function (err) {
      if (!err) {
        logger.warn('Data successfuly reseted.');
      }
      done(err);
    });
  },

  resetConf: function(done) {
    mongoose.model('Configuration').remove({}, function (err) {
      if (!err) {
        logger.warn('Configuration successfuly reseted.');
      }
      done(err);
    });
  },

  disconnect: function(done) {
    mongoose.disconnect(function (err) {
      if(err)
        logger.error(err);
      if (typeof done == 'function')
        done(err);
    });
  }
};

function initServices (currency, conf, withoutNetworker, done) {
  // Init ALL services
  service.init(openpgp, currency, conf, withoutNetworker);
  // Load services contexts
  service.load(done);
}

module.exports.services = {
  init: initServices
};

module.exports.express = {

  app: function (conf, onLoaded) {

    var app = express();
    var port = process.env.PORT || conf.port;
    var currency = conf.currency;

    // Checking configuration
    privateKey = openpgp.key.readArmored(conf.pgpkey).keys[0];
    if (!privateKey) {
      onLoaded('A private key for this node is mandatory. Relaunch with --pgpkey <pathToKey>.');
      return;
    }
    try {
      if(!privateKey.decrypt(conf.pgppasswd)) {
        onLoaded('Wrong private key password. Relaunch with --pgppasswd <password>.');
        return;
      }
    } catch(ex) {
      onLoaded('Not a valid private key, message was: "' + ex.message + '"');
      return;
    }
    if (!conf.currency) {
      onLoaded('No currency name was given. Relaunch with --currency <currencyName> parameter.');
      return;
    }
    if(!conf.ipv4 && !conf.ipv6){
      onLoaded("No interface to listen to. Relaunch with either --ipv4 or --ipv6 parameters.");
      return;
    }
    if(!conf.remoteipv4 && !conf.remoteipv6){
      onLoaded('Either --remote4 or --remote6 must be given');
      return;
    }
    if (!conf.remoteport) {
      onLoaded('--remotep is mandatory');
      return;
    }
    if (conf.sync.AMDaemon == "ON") {
      if (!conf.sync.AMStart) {
        onLoaded('--amstart is mandatory when --amdaemon is set to ON');
        return;
      }
      if (!conf.sync.AMFreq) {
        onLoaded('--amfreq is mandatory when --amdaemon is set to ON');
        return;
      }
      if (!conf.sync.UDFreq) {
        onLoaded('--udfreq is mandatory when --amdaemon is set to ON');
        return;
      }
      if (!conf.sync.UD0) {
        onLoaded('--ud0 is mandatory when --amdaemon is set to ON');
        return;
      }
      if (!conf.sync.UDPercent) {
        onLoaded('--udpercent is mandatory when --amdaemon is set to ON');
        return;
      }
      if (!conf.sync.Consensus) {
        onLoaded('--consensus is mandatory when --amdaemon is set to ON');
        return;
      }
      if (!conf.sync.MSExpires) {
        onLoaded('--msvalidity is mandatory when --amdaemon is set to ON');
        return;
      }
      if (!conf.sync.VTExpires) {
        onLoaded('--vtvalidity is mandatory when --amdaemon is set to ON');
        return;
      }
    }

    // all environments
    app.set('conf', conf);
    app.set('port', port);
    app.use(express.favicon(__dirname + '/../public/favicon.ico'));
    app.use(express.static(__dirname + '/../public'));
    app.use(log4js.connectLogger(logger, { level: 'auto', format: '\x1b[90m:remote-addr - :method :url HTTP/:http-version :status :res[content-length] - :response-time ms\x1b[0m' }));
    app.use(express.urlencoded())
    app.use(express.json())
    app.use(express.methodOverride());
    app.use(express.cookieParser('your secret here'));
    app.use(express.session());

    async.series([
      function (next){
        initServices(currency, conf, false, next);
      },
      function (next){
        // HTTP Signatures
        httpgp(app, conf, next);
      },
    ], function(err) {

      // HTTPGP OK?
      if (err) {
        pgplogger.error(err);
        process.exit(1);
        return;
      }

      // Routing
      app.use(app.router);

      // development only
      if ('development' == app.get('env')) {
        app.use(express.errorHandler());
      }

      // Init Daemon
      var daemon = require('./daemon');
      daemon.init(conf, module.exports.fingerprint());

      var pks   = require('../controllers/pks')(openpgp, currency, conf);
      var net   = require('../controllers/network')(openpgp, currency, conf);
      var hdc   = require('../controllers/hdc')(openpgp, currency, conf);
      var reg   = require('../controllers/registry')(openpgp, currency, conf);

      app.get(    '/pks/all',                                       pks.getAll);
      app.get(    '/pks/lookup',                                    pks.lookup);
      app.post(   '/pks/add',                                       pks.add);
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
      app.get(    '/hdc/amendments/promoted',                       hdc.amendments.promoted);
      app.get(    '/hdc/amendments/promoted/:amendment_number',     hdc.amendments.promotedNumber);
      app.get(    '/hdc/amendments/view/:amendment_id/self',        hdc.amendments.viewAM.self);
      app.get(    '/hdc/amendments/view/:amendment_id/signatures',  hdc.amendments.votes.sigs);
      app.get(    '/hdc/amendments/votes',                          hdc.amendments.votes.get);
      app.post(   '/hdc/amendments/votes',                          hdc.amendments.votes.post);
      app.post(   '/hdc/transactions/process',                      hdc.transactions.processTx);
      app.get(    '/hdc/transactions/last/:count',                  hdc.transactions.lastNAll);
      app.get(    '/hdc/transactions/sender/:fpr',                  hdc.transactions.sender.get);
      app.get(    '/hdc/transactions/sender/:fpr/view/:number',     hdc.transactions.viewtx);
      app.get(    '/hdc/transactions/sender/:fpr/last/:count',      hdc.transactions.sender.lastNofSender);
      app.get(    '/hdc/transactions/sender/:fpr/last/:count/:from',hdc.transactions.sender.lastNofSender);
      app.get(    '/hdc/transactions/recipient/:fpr',               hdc.transactions.recipient);
      app.get(    '/hdc/transactions/refering/:fpr/:number',        hdc.transactions.refering);
      app.get(    '/hdc/coins/list/:fpr',                           hdc.coins.list);
      app.get(    '/hdc/coins/view/:coin_id/owner',                 hdc.coins.view);
      app.get(    '/hdc/coins/view/:coin_id/history',               hdc.coins.history);
      app.get(    '/registry/parameters',                           reg.parameters);
      app.get(    '/registry/community/members',                    reg.membershipGet);
      app.post(   '/registry/community/members',                    reg.membershipPost);
      app.get(    '/registry/community/members/:fpr/current',       reg.membershipCurrent);
      app.get(    '/registry/community/members/:fpr/history',       reg.membershipHistory);
      app.get(    '/registry/community/voters',                     reg.votingGet);
      app.post(   '/registry/community/voters',                     reg.votingPost);
      app.get(    '/registry/community/voters/:fpr/current',        reg.votingCurrent);
      app.get(    '/registry/community/voters/:fpr/history',        reg.votingHistory);
      app.get(    '/registry/amendment',                            reg.amendmentCurrent);
      app.get(    '/registry/amendment/:amendment_number',          reg.amendmentNext);
      app.get(    '/registry/amendment/:amendment_number/vote',     reg.askVote);

      // If the node's peering entry does not exist or is outdated,
      // a new one is generated.
      var PeeringService = service.Peering;
      var SyncService    = service.Sync;

      async.waterfall([
        function (next) {
          if(conf.ipv4){
            logger.info('Connecting on interface %s...', conf.ipv4);
            http.createServer(app).listen(conf.port, conf.ipv4, function(){
              logger.info('uCoin server listening on ' + conf.ipv4 + ' port ' + conf.port);
              next();
            });
          }
          else next();
        },
        function (next) {
          if(conf.ipv6){
            logger.info('Connecting on interface %s...', conf.ipv6);
            http.createServer(app).listen(conf.port, conf.ipv6, function(){
              logger.info('uCoin server listening on ' + conf.ipv6 + ' port ' + conf.port);
            });
          }
          else next();
        },
        function (next) {
          mongoose.model('Peer').find({ fingerprint: module.exports.fingerprint() }, next);
        },
        function (peers, next) {
          var Peer = mongoose.model('Peer');
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
          var p2 = new Peer({
            version: 1,
            currency: currency,
            fingerprint: module.exports.fingerprint(),
            endpoints: [endpoint]
          });
          var raw1 = p1.getRaw().unix2dos();
          var raw2 = p2.getRaw().unix2dos();
          if (raw1 != raw2) {
            logger.debug('Generating server\'s peering entry...');
            async.waterfall([
              function (next){
                jpgp().sign(raw2, module.exports.privateKey(), next);
              },
              function (signature, next) {
                signature = signature.substring(signature.indexOf('-----BEGIN PGP SIGNATURE'));
                PeeringService.submit(raw2 + signature, module.exports.fingerprint(), next);
              },
            ], function (err) {
              next(err);
            });
          } else {
            next();
          }
        },
        function (next){
          mongoose.model('Peer').getTheOne(module.exports.fingerprint(), next);
        },
        function (peer, next){
          // Set peer's statut to UP
          PeeringService.peer(peer);
          PeeringService.peer().status = 'UP';
          PeeringService.peer().save(function (err) {
            // Update it in memory
            PeeringService.addPeer(PeeringService.peer());
            next(err);
          });
        },
        function (next){
          // Add selfkey as managed
          mongoose.model('Key').setManaged(server.fingerprint(), true, next);
        },
        function (next){
          // Submit its own public key to it
          logger.info('Submitting its own key for storage...');
          mongoose.model('Peer').getTheOne(server.fingerprint(), next);
        },
        function (peer, next) {
          logger.info('Peer found...');
          mongoose.model('PublicKey').getForPeer(peer, next);
        },
        function (pubkey, next) {
          logger.info('Pubkey found...');
          logger.info('Broadcasting UP/NEW signals...');
          PeeringService.sendUpSignal(next);
        },
        function (next){
          mongoose.model('Amendment').current(function (err, am) {
            next(null, am);
          });
        },
        function (currentAM, next) {
          var nextAMNumber = currentAM && currentAM.number + 1 || 0;
          // Create NEXT AM proposal if not existing
          mongoose.model('Amendment').getTheOneToBeVoted(nextAMNumber, function (err, am) {
            if (err || !am) {
              logger.info('Creating next AM (#%d) proposal...', nextAMNumber);
              SyncService.createNext(currentAM, next);
              return;
            }
            next();
          });
        },
        function (next){
          // Start autonomous contract daemon
          daemon.start();
          next();
        },
      ], function (err) {
        onLoaded(err, app);
      });
    });
  }
};

/**
This stuff should be refactorized elsewhere
**/
function httpgp(app, conf, done) {
  // PGP signature of requests
  if(conf.pgpkey){
    var privateKey = conf.pgpkey;
    async.waterfall([
      function (next) {
        var keyring = 'ucoin_' + module.exports.fingerprint();
        pgplogger.debug("Keyring = %s", keyring);
        var gnupg = new (require('./gnupg'))(privateKey, conf.pgppasswd, module.exports.fingerprint(), keyring);
        gnupg.init(function (err) {
          next(err, function (message, done) {
            gnupg.sign(message, done);
          });
        });
      },
      function (signFunc, next){
        module.exports.sign = signFunc;
        try{
          module.exports.sign("some test\nwith line return", next);
        } catch(ex){
          next("Wrong private key password.");
        }
      },
    ], function (err) {
      if (err) {
        logger.error(err);
        process.exit(1);
        return;
      } else {
        app.use(connectPgp(module.exports.sign));
        logger.debug('Signed requests with PGP: enabled.');
        done();
      }
    });
  }
}

function notImplemented (req, res) {
  res.send(501, "Not implemented.");
  res.end();
}
