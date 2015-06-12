var async   = require('async');
var util    = require('util');
var Server  = require('./server');

function WOTServer (dbConf, overrideConf, interceptors, onInit) {

  "use strict";

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
          }
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
    this.IdentityService = require('./app/service/IdentityService')(that.conn, that.conf);
    done();
  };
}

util.inherits(WOTServer, Server);

module.exports = WOTServer;
