var express    = require('express');
var fs         = require('fs');
var async      = require('async');
var path       = require('path');
var mongoose   = require('mongoose');
var connectPgp = require('connect-pgp');
var _          = require('underscore');
var server     = require('../lib/server');
var openpgp    = require('./openpgp').openpgp;
var jpgp       = require('./jpgp');

openpgp.init();

function initModels() {
  var models_path = __dirname + '/../models';
  fs.readdirSync(models_path).forEach(function (file) {
    if (~file.indexOf('.js')) require(models_path + '/' + file);
  });
}

module.exports.pgp = openpgp;

module.exports.privateKey = function () {
  return openpgp.keyring.privateKeys[0];
}

module.exports.publicKey = function () {
  var privateKey = module.exports.privateKey();
  return (openpgp && privateKey) ? privateKey.obj.extractPublicKey() : '';
}

module.exports.fingerprint = function () {
  var ascciiPubkey = module.exports.publicKey();
  return ascciiPubkey ? jpgp().certificate(ascciiPubkey).fingerprint : '';
};

module.exports.database = {

  init: function () {
    initModels();
  },

  connect: function (currency, host, port, done) {
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
    var database = currency.replace(/\r/g, '').replace(/\n/g, '').replace(/\s/g, '_');
    mongoose.connect('mongodb://' + host + (port ? ':' + port : '') + '/' + database);
    var db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function (err) {
      if(!err){
        var Configuration = mongoose.model('Configuration');
        Configuration.find(function (err, confs) {
          if(!err){
            // Returns found conf or default one
            done(null, confs[0] || new Configuration({
              port: 8081,
              ipv4: "localhost",
              ipv6: null,
              remotehost: null,
              remoteipv4: null,
              remoteipv6: null,
              remoteport: null,
              pgpkey: null,
              pgppasswd: null,
              kmanagement: 'KEYS'
            }));
          }
          else done(err);
        });
      }
      else done(err);
    });
  },

  reset: function(done) {
    async.waterfall([
      function (next){
        mongoose.model('Merkle').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('Membership').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('Amendment').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('PublicKey').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('Vote').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('Transaction').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('Coin').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('Key').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('Peer').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('Forward').remove({}, function (err) {
          next(err);
        });
      },
      function (next){
        mongoose.model('THTEntry').remove({}, function (err) {
          next(err);
        });
      }
    ], done);
  },

  resetConf: function(done) {
    mongoose.model('Configuration').remove({}, done);
  },

  disconnect: function() {
    mongoose.disconnect(function (err) {
      if(err)
        console.error(err);
    });
  }
};

module.exports.express = {

  app: function (currency, conf, onLoaded) {

    var app = express();

    // all environments
    app.set('conf', conf);
    app.set('port', process.env.PORT || conf.port);
    app.use(express.favicon(__dirname + '/../public/favicon.ico'));
    app.use(express.static(__dirname + '/../public'));
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser('your secret here'));
    app.use(express.session());

    // HTTP Signatures
    sign(currency, app, conf);

    // Routing
    app.use(app.router);

    // development only
    if ('development' == app.get('env')) {
      app.use(express.errorHandler());
    }

    var pks   = require('../controllers/pks')(openpgp, currency, conf);
    var ucg   = require('../controllers/ucg')(openpgp, currency, conf);
    var hdc   = require('../controllers/hdc')(openpgp, currency, conf);

    app.get(    '/pks/all',                                       pks.getAll);
    app.get(    '/pks/lookup',                                    pks.lookup);
    app.post(   '/pks/add',                                       pks.add);
    app.get(    '/ucg/pubkey',                                    ucg.pubkey);
    app.get(    '/ucg/peering',                                   ucg.peering);
    app.get(    '/ucg/peering/keys',                              ucg.managedKeys);
    app.get(    '/ucg/peering/peer',                              ucg.peer);
    app.get(    '/ucg/peering/peers',                             ucg.peersGet);
    app.post(   '/ucg/peering/peers',                             ucg.peersPost);
    app.get(    '/ucg/peering/peers/upstream',                    ucg.upstreamAll);
    app.get(    '/ucg/peering/peers/upstream/:fingerprint',       ucg.upstreamKey);
    app.get(    '/ucg/peering/peers/downstream',                  ucg.downstreamAll);
    app.get(    '/ucg/peering/peers/downstream/:fingerprint',     ucg.downstreamKey);
    app.post(   '/ucg/peering/forward',                           ucg.forward);
    app.post(   '/ucg/peering/status',                            notImplemented);
    app.get(    '/ucg/tht',                                       ucg.thtGET);
    app.post(   '/ucg/tht',                                       ucg.thtPOST);
    app.get(    '/ucg/tht/:fpr',                                  ucg.thtFPR);
    app.get(    '/hdc/amendments/current',                        hdc.amendments.current);
    app.get(    '/hdc/amendments/promoted',                       hdc.amendments.promoted);
    app.get(    '/hdc/amendments/promoted/:amendment_number',     hdc.amendments.promotedNumber);
    app.get(    '/hdc/amendments/view/:amendment_id/memberships', hdc.amendments.viewAM.status);
    app.get(    '/hdc/amendments/view/:amendment_id/members',     hdc.amendments.viewAM.members);
    app.get(    '/hdc/amendments/view/:amendment_id/self',        hdc.amendments.viewAM.self);
    app.get(    '/hdc/amendments/view/:amendment_id/signatures',  hdc.amendments.viewAM.signatures);
    app.get(    '/hdc/amendments/view/:amendment_id/voters',      hdc.amendments.viewAM.voters);
    app.get(    '/hdc/amendments/votes',                          hdc.amendments.votes.get);
    app.post(   '/hdc/amendments/votes',                          hdc.amendments.votes.post);
    app.get(    '/hdc/amendments/votes/:amendment_id',            hdc.amendments.votes.sigs);
    app.get(    '/hdc/coins/:fpr/list',                           hdc.coins.list);
    app.get(    '/hdc/coins/:fpr/view/:coin_number',              hdc.coins.view);
    app.get(    '/hdc/coins/:fpr/view/:coin_number/history',      hdc.coins.history);
    app.post(   '/hdc/community/join',                            hdc.community.join);
    app.get(    '/hdc/community/memberships',                     hdc.community.memberships);
    app.get(    '/hdc/community/votes',                           hdc.community.currentVotes);
    app.post(   '/hdc/transactions/process',                      hdc.transactions.processTx);
    app.get(    '/hdc/transactions/all',                          hdc.transactions.all);
    app.get(    '/hdc/transactions/keys',                         hdc.transactions.keys);
    app.get(    '/hdc/transactions/last',                         hdc.transactions.lastAll);
    app.get(    '/hdc/transactions/last/:count',                  hdc.transactions.lastNAll);
    app.get(    '/hdc/transactions/sender/:fpr',                  hdc.transactions.sender.get);
    app.get(    '/hdc/transactions/sender/:fpr/last',                      hdc.transactions.sender.last);
    app.get(    '/hdc/transactions/sender/:fpr/last/:count',               hdc.transactions.sender.lastNofSender);
    app.get(    '/hdc/transactions/sender/:fpr/issuance',                  hdc.transactions.sender.issuance);
    app.get(    '/hdc/transactions/sender/:fpr/issuance/last',             hdc.transactions.sender.dividendLast);
    app.get(    '/hdc/transactions/sender/:fpr/issuance/dividend',         hdc.transactions.sender.dividend);
    app.get(    '/hdc/transactions/sender/:fpr/issuance/dividend/:amnum',  hdc.transactions.sender.amDividend);
    app.get(    '/hdc/transactions/sender/:fpr/issuance/fusion',           hdc.transactions.sender.fusion);
    app.get(    '/hdc/transactions/sender/:fpr/transfert',                 hdc.transactions.sender.transfert);
    app.get(    '/hdc/transactions/recipient/:fpr',               hdc.transactions.recipient);
    app.get(    '/hdc/transactions/view/:transaction_id',         hdc.transactions.viewtx);

    async.waterfall([
      function (next) {
        mongoose.model('Peer').find({ fingerprint: module.exports.fingerprint() }, next);
      },
      function (peers, next) {
        if(peers == 0){
          console.log('Generating server\'s peering entry...');
          var Peer = mongoose.model('Peer');
          var p = new Peer({
            version: 1,
            currency: currency,
            fingerprint: module.exports.fingerprint(),
            dns: conf.remotehost ? conf.remotehost : '',
            ipv4: conf.remoteipv4 ? conf.remoteipv4 : '',
            ipv6: conf.remoteipv6 ? conf.remoteipv6 : '',
            port: conf.remoteport ? conf.remoteport : ''
          });
          async.waterfall([
            function (next){
              jpgp().sign(p.getRaw(), module.exports.privateKey(), next);
            },
            function (signature, next) {
              var PeeringService = require('../service/PeeringService').get(module.exports.pgp, currency, conf);
              PeeringService.persistPeering(p.getRaw() + signature, module.exports.publicKey(), next);
            }
          ], function (err) {
            next(err);
          });
        }
        else next();
      },
    ], function (err) {
      onLoaded(err, app);
    });
  }
};

function sign(currency, app, conf) {
  // PGP signature of requests
  if(conf.pgpkey){
    try{
      var privateKey = conf.pgpkey;
      openpgp.keyring.importPrivateKey(privateKey, conf.pgppasswd);
      // Try to use it...
      openpgp.write_signed_message(openpgp.keyring.privateKeys[0].obj, "test");
      // Success: key is able to sign
      app.use(connectPgp(privateKey, conf.pgppasswd, 'ucoin_' + currency));
      console.log('Signed requests with PGP: enabled.');
    }
    catch(ex){
      throw new Error("Wrong private key password.");
    }
  }
}

function notImplemented (req, res) {
  res.writeHead(501);
  res.end();
}

String.prototype.trim = function(){
  return this.replace(/^\s+|\s+$/g, '');
};

String.prototype.unix2dos = function(){
  return this.dos2unix().replace(/\n/g, '\r\n');
};

String.prototype.dos2unix = function(){
  return this.replace(/\r\n/g, '\n');
};
