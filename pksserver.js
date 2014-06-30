var async   = require('async');
var util    = require('util');
var parsers = require('./app/lib/streams/parsers/doc');
var Server  = require('./server');

function HDCServer (dbConf, overrideConf, interceptors, onInit) {

  var logger  = require('./app/lib/logger')(dbConf.name);

  var selfInterceptors = [
    {
      // Pubkey
      matches: function (obj) {
        return typeof obj.email != "undefined";
      },
      treatment: function (server, obj, next) {
        logger.debug('⬇ PUBKEY %s', obj.fingerprint);
        async.waterfall([
          function (next){
            server.PublicKeyService.submitPubkey(obj, next);
          },
          function (pubkey, next){
            logger.debug('✔ PUBKEY %s', pubkey.fingerprint);
            server.emit('pubkey', pubkey);
            next(null, pubkey);
          },
        ], next);
      }
    }
  ];

  Server.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []), onInit || []);

  var that = this;

  this._read = function (size) {
  };

  this.writeRawPubkey = function (raw) {
    var source = parsers.parsePubkey();
    var dest = that.singleWriteStream();
    source.pipe(dest);
    source.end(raw);
  };

  this._initServices = function(conn, done) {
    this.KeyService         = require('./app/service/KeyService').get(conn);
    this.PublicKeyService   = require('./app/service/PublicKeyService').get(conn, that.conf, that.KeyService);
  };

  this._listenBMA = function (app) {
    this.listenPKS(app);
  };

  this.listenPKS = function (app) {
    var pks = require('./app/controllers/pks')(this);
    app.get(  '/pks/all',    pks.getAll);
    app.get(  '/pks/lookup', pks.lookup);
    app.post( '/pks/add',    pks.add);
  };
}

util.inherits(HDCServer, Server);

module.exports = HDCServer;
