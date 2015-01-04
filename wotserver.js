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
        return obj.pubkey && obj.uid && !obj.revocation ? true : false;
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
    },
    {
      // Revocation
      matches: function (obj) {
        return obj.pubkey && obj.uid && obj.revocation ? true : false;
      },
      treatment: function (server, obj, next) {
        async.waterfall([
          function (next){
            that.IdentityService.submitRevocation(obj, next);
          },
          function (revocation, next){
            next(null, revocation);
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
    app.post('/wot/revoke',                wot.revoke);
    app.get( '/wot/lookup/:search',        wot.lookup);
    app.get( '/wot/members',               wot.members);
    app.get( '/wot/certifiers-of/:search', wot.certifiersOf);
    app.get( '/wot/certified-by/:search',  wot.certifiedBy);
  };
}

util.inherits(WOTServer, Server);

module.exports = WOTServer;
