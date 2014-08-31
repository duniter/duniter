var async   = require('async');
var util    = require('util');
var parsers = require('./app/lib/streams/parsers/doc');
var PKSServer  = require('./pksserver');

function WOTServer (dbConf, overrideConf, interceptors, onInit) {

  var logger  = require('./app/lib/logger')(dbConf.name);

  var selfInterceptors = [
    {
      // Membership
      matches: function (obj) {
        return obj.userid ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            that.KeychainService.submitMembership(obj, next);
          },
          function (membership, next){
            that.emit('membership', membership);
            next(null, membership);
          },
        ], next);
      }
    },{
      // KeyBlock
      matches: function (obj) {
        return obj.type && obj.type == 'KeyBlock' ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            server.KeychainService.submitKeyBlock(obj, next);
          },
          function (kb, next){
            server.emit('keyblock', kb);
            next(null, kb);
          },
        ], next);
      }
    }
  ];

  PKSServer.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []), onInit || []);

  var that = this;

  this._read = function (size) {
  };

  this._initServices = function(conn, done) {
    this.KeyService         = require('./app/service/KeyService').get(conn);
    this.PublicKeyService   = require('./app/service/PublicKeyService').get(conn, that.conf, that.KeyService);
    this.KeychainService    = require('./app/service/KeychainService').get(conn, that.conf, that.PublicKeyService);
    async.parallel({
      contract: function(callback){
        that.KeychainService.load(callback);
      },
      peering: function(callback){
        callback();
      },
    }, function (err) {
      done(err);
    });
  };

  this._listenBMA = function (app) {
    this.listenPKS(app);
    this.listenWOT(app);
  };

  this.listenWOT = function (app) {
    var keychain = require('./app/controllers/keychain')(that);
    app.get(    '/keychain/parameters',       keychain.parameters);
    app.post(   '/keychain/membership',       keychain.parseMembership);
    app.post(   '/keychain/keyblock',         keychain.parseKeyblock);
    app.get(    '/keychain/keyblock/:number', keychain.promoted);
    app.get(    '/keychain/current',          keychain.current);
    app.get(    '/keychain/hardship/:fpr',    keychain.hardship);
  };
}

util.inherits(WOTServer, PKSServer);

module.exports = WOTServer;
