var pks  = require('./pks'),
udc      = require('./udc'),
express  = require('express'),
orm      = require('orm'),
async    = require('async'),
config   = require('../config'),
path     = require('path'),
_        = require('underscore'),
nodecoin = require('../lib/nodecoin');

module.exports.pks = pks;
module.exports.udc = udc;
module.exports.express = {

  route: function(app){

    function notImplemented (req, res) {
      res.writeHead(501);
      res.end();
    }

    app.get(    '/pks/lookup',                                  pks.lookup);
    app.get(    '/pks/add',                                     pks.add.get);
    app.post(   '/pks/add',                                     pks.add.post);
    app.post(   '/udc/amendments/init',                         notImplemented);
    app.post(   '/udc/amendments/submit',                       notImplemented);
    app.post(   '/udc/amendments/vote',                         notImplemented);
    app.get(    '/udc/amendments/view/:amendment_id/members',   notImplemented);
    app.get(    '/udc/amendments/view/:amendment_id/self',      notImplemented);
    app.get(    '/udc/amendments/view/:amendment_id/voters',    notImplemented);
    app.get(    '/udc/coins/:pgp_fpr/list',                     notImplemented);
    app.get(    '/udc/coins/:pgp_fpr/view/:coin_number',        notImplemented);
    app.post(   '/udc/community/declare',                       notImplemented);
    app.post(   '/udc/community/join',                          notImplemented);
    app.get(    '/udc/transactions/sender/:fingerprint',        notImplemented);
    app.post(   '/udc/transactions/process/issuance',           notImplemented);
    app.post(   '/udc/transactions/process/transfert',          notImplemented);
    app.get(    '/udc/transactions/view/:transaction_id',       notImplemented);
  },

  app: function (someConfig) {
    var app = express();
    var config = someConfig || {
      server: { port: 8001 },
      db: {
        database : "nodecoin_test",
        protocol : "sqlite",
        dropAll: false
      }
    };

    // all environments
    app.set('port', process.env.PORT || config.server.port);
    app.use(express.favicon(__dirname + '/../public/favicon.ico'));
    app.use(express.static(__dirname + '/../public'));
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser('your secret here'));
    app.use(express.session());
    app.use(orm.express(config.db, {
      define: function (db, models) {

        db.load(__dirname + '/entities/load', function (err) {
          // loaded !
          var PublicKey = db.models.pubkey;
          var PrivateKey = db.models.privkey;

          function createTables(callback){
            PublicKey.sync(function (err2) {
              if(!err)
                console.log("Table 'PublicKey' created.");
              callback(err);
            });
          }

          function dropTables(callback){
            PublicKey.drop(function (err2) {
              if(!err)
                console.log("Table 'PublicKey' dropped.");
              callback(err);
            });
          }

          if(config.db.dropAll){
            dropTables(function (err2) {
              createTables(function (err3) {});
            });
          }
          else{
            createTables(function (err2) {});
          }

          models.PublicKey = PublicKey;
          models.PrivateKey = PrivateKey;
        });
      }
    }));
    app.use(app.router);

    // development only
    if ('development' == app.get('env')) {
      app.use(express.errorHandler());
    }

    this.route(app);
    return app;
  }
};