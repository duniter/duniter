var async   = require('async');
var util    = require('util');
var parsers = require('./app/lib/streams/parsers/doc');
var Server  = require('./server');

function WOTServer (dbConf, overrideConf, interceptors, onInit) {

  var logger  = require('./app/lib/logger')(dbConf.name);

  var selfInterceptors = [
    {
      // Identity
      matches: function (obj) {
        return obj.pubkey && obj.uid ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            that.IdentityService.submitIdentity(obj, next);
          },
          function (identity, next){
            that.emit('identity', identity);
            next(null, identity);
          },
        ], next);
      }
    }
  ];

  Server.call(this, dbConf, overrideConf, selfInterceptors.concat(interceptors || []), onInit || []);

  var that = this;

  this._read = function (size) {
  };

  this._initServices = function(conn, done) {
    this.IdentityService = require('./app/service/IdentityService').get(that.conn, that.conf);
    done();
  };

  this._listenBMA = function (app) {
    this.listenWOT(app);
  };

  this.listenWOT = function (app) {
    var wot = require('./app/controllers/wot')(that);
    app.post('/wot/add',                   wot.add);
    app.get( '/wot/lookup/:search',        wot.lookup);
    app.get( '/wot/certifiers-of/:search', wot.certifiersOf);
  };
}

util.inherits(WOTServer, Server);

module.exports = WOTServer;
