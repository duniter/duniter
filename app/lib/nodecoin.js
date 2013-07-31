var express    = require('express');
var fs         = require('fs');
var async      = require('async');
var config     = require('../../config/config');
var path       = require('path');
var mongoose   = require('mongoose');
var connectPgp = require('connect-pgp');
var _          = require('underscore');
var nodecoin   = require('../lib/nodecoin');
var configurer = require('../lib/configurer');

module.exports.database = {
  init: function () {
    var models_path = __dirname + '/../models';
    fs.readdirSync(models_path).forEach(function (file) {
      if (~file.indexOf('.js')) require(models_path + '/' + file);
    });
  },

  connect: function (config, done) {
    mongoose.connect('mongodb://' + config.db.host + (config.db.port ? ':' + config.db.port : '') + '/' + config.db.database);
    var db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function (err) {
      done(err);
    });
  }
};
module.exports.express = {

  route: function(app){

    function notImplemented (req, res) {
      res.writeHead(501);
      res.end();
    }

    var amend = require('../controllers/amendments');
    var pks   = require('../controllers/pks');
    var web   = require('../controllers/web');

    app.get(    '/pks/lookup',                                  pks.lookup);
    app.post(   '/pks/add',                                     pks.add);
    app.get(    '/udc/amendments/init',                         _(amend.init).partial(app.get('config').initKeys));
    app.post(   '/udc/amendments/submit',                       _(amend.submit).partial(app.get('config').currency));
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

    app.get(    '/pks/add',                                     web.pks.add);
    app.get(    '/udc/amendments/submit',                       web.amendments.submit);
  },

  app: function (config, onLoaded) {

    async.parallel({
      loadInitKeys: function(callback){
        configurer(config).parseFiles(function (err) {
          if(!err){
            console.log("Initkeys loaded.");
          }
          else{
            console.log(err);
          }
          callback(err);
        });
      },
      loadMongoDB: function(callback){
        // Bootstraps models
        nodecoin.database.init();
        nodecoin.database.connect(config, function (err) {
          if(!err)
            console.log("Connected to MongoDB.");
          else
            console.log("Error connecting to DB: " + err);
          callback(err);
        });
      }
    },
    function(err, results) {
      var app = express();

      // all environments
      app.set('config', config);
      app.set('port', process.env.PORT || config.server.port);
      app.use(express.favicon(__dirname + '/../public/favicon.ico'));
      app.use(express.static(__dirname + '/../public'));
      app.use(express.logger('dev'));
      app.use(express.bodyParser());
      app.use(express.methodOverride());
      app.use(express.cookieParser('your secret here'));
      app.use(express.session());

      // PGP signature of requests
      if(config.server.pgp && config.server.pgp.key && config.server.pgp.password){
        var privateKey = fs.readFileSync(config.server.pgp.key, 'utf8');
        app.use(connectPgp(privateKey, config.server.pgp.password))
        console.log('Signed requests with PGP: enabled.');
      }

      // Routing
      app.use(app.router);

      // development only
      if ('development' == app.get('env')) {
        app.use(express.errorHandler());
      }
      this.route(app);

      onLoaded(err, app);
    }.bind(this));
  }
};


String.prototype.trim = function(){
  return this.replace(/^\s+|\s+$/g, '');
};

String.prototype.unix2dos = function(){
  return this.dos2unix().replace(/\n/g, '\r\n');
};

String.prototype.dos2unix = function(){
  return this.replace(/\r\n/g, '\n');
};
