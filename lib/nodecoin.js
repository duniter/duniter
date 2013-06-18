var pks      = require('./pks'),
    udc      = require('./udc'),
    express  = require('express'),
    orm     = require('orm'),
    path     = require('path'),
    nodecoin = require('../lib/nodecoin');
// orm         = require('orm');

module.exports.pks = pks;
module.exports.udc = udc;
module.exports.express = {

  route: function(app){

    function notImplemented (req, res) {
      res.writeHead(501);
      res.end();
    }

    app.get(    '/pks/lookup',                                  notImplemented);
    app.get(    '/pks/add',                                     pks.add.get);
    app.post(   '/pks/add',                                     pks.add.post);
    app.post(   '/udc/amendments/submit',                       notImplemented);
    app.get(    '/udc/amendments/view/:amendment_id/members',   notImplemented);
    app.get(    '/udc/amendments/view/:amendment_id/self',      notImplemented);
    app.get(    '/udc/amendments/view/:amendment_id/voters',    notImplemented);
    app.post(   '/udc/coins/submit',                            notImplemented);
    app.get(    '/udc/coins/view/:coin_id',                     notImplemented);
    app.get(    '/udc/peer/list',                               notImplemented);
    app.post(   '/udc/peer/register',                           notImplemented);
    app.get(    '/udc/peer/self',                               notImplemented);
    app.get(    '/udc/transactions/coin/:coin_id',              notImplemented);
    app.get(    '/udc/transactions/recipient/:fingerprint',     notImplemented);
    app.get(    '/udc/transactions/search',                     notImplemented);
    app.get(    '/udc/transactions/sender/:fingerprint',        notImplemented);
    app.post(   '/udc/transactions/submit',                     notImplemented);
    app.get(    '/udc/transactions/view/:transaction_id',       notImplemented);
  },

  app: function (someConfig) {
    var app = express();
    var config = someConfig || {
      server: { port: 8001 }
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
    app.use(app.router);

    // development only
    if ('development' == app.get('env')) {
      app.use(express.errorHandler());
    }

    this.route(app);
    return app;
  }
};