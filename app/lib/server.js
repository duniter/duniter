var express    = require('express');
var fs         = require('fs');
var async      = require('async');
var path       = require('path');
var mongoose   = require('mongoose');
var connectPgp = require('connect-pgp');
var _          = require('underscore');
var server     = require('../lib/server');
var openpgp    = require('./openpgp').openpgp;

openpgp.init();

function initModels() {
  var models_path = __dirname + '/../models';
  fs.readdirSync(models_path).forEach(function (file) {
    if (~file.indexOf('.js')) require(models_path + '/' + file);
  });
}

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
              pgpkey: null,
              pgppasswd: null
            }));
          }
          else done(err);
        });
      }
      else done(err);
    });
  },

  disconnect: function() {
    mongoose.disconnect(function (err) {
      if(err)
        console.error(err);
    });
  }
};

module.exports.express = {

  app: function (conf, onLoaded) {

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
    sign(app, conf);

    // Routing
    app.use(app.router);

    // development only
    if ('development' == app.get('env')) {
      app.use(express.errorHandler());
    }

    var amend = require('../controllers/amendments');
    var pks   = require('../controllers/pks');
    var ucg   = require('../controllers/ucg');

    app.get(    '/pks/lookup',                                  pks.lookup);
    app.post(   '/pks/add',                                     pks.add);
    app.get(    '/ucg/pubkey',                                  _(ucg.pubkey).partial(openpgp));
    app.post(   '/hdc/amendments/submit',                       _(amend.submit).partial(app.get('conf').currency));
    app.get(    '/hdc/amendments/view/:amendment_id/members',   notImplemented);
    app.get(    '/hdc/amendments/view/:amendment_id/self',      notImplemented);
    app.get(    '/hdc/amendments/view/:amendment_id/voters',    notImplemented);
    app.post(   '/hdc/amendments/vote',                         notImplemented);
    app.get(    '/hdc/coins/:pgp_fpr/list',                     notImplemented);
    app.get(    '/hdc/coins/:pgp_fpr/view/:coin_number',        notImplemented);
    app.post(   '/hdc/community/declare',                       notImplemented);
    app.post(   '/hdc/community/join',                          notImplemented);
    app.post(   '/hdc/transactions/process/issuance',           notImplemented);
    app.post(   '/hdc/transactions/process/transfert',          notImplemented);
    app.get(    '/hdc/transactions/view/:transaction_id',       notImplemented);

    onLoaded(null, app);
  }
};

function sign(app, conf) {
  // PGP signature of requests
  if(conf.pgpkey){
    try{
      var privateKey = conf.pgpkey;
      openpgp.keyring.importPrivateKey(privateKey, conf.pgppasswd);
      // Try to use it...
      openpgp.write_signed_message(openpgp.keyring.privateKeys[0].obj, "test");
      // Success: key is able to sign
      app.use(connectPgp(privateKey, conf.pgppasswd));
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
