var fs       = require('fs');
var util     = require('util');
var async    = require('async');
var _        = require('underscore');
var stream   = require('stream');
var unix2dos = require('../lib/unix2dos');
var dos2unix = require('../lib/dos2unix');
var http2raw = require('../lib/streams/parsers/http2raw');
var jsoner   = require('../lib/streams/jsoner');
var parsers  = require('../lib/streams/parsers/doc');
var es       = require('event-stream');
var http400  = require('../lib/http/http400');
var logger   = require('../lib/logger')();

module.exports = function (wotServer) {
  return new WOTBinding(wotServer);
}

function WOTBinding (wotServer) {

  var conn = wotServer.conn;

  var http              = wotServer.HTTPService;
  var ParametersService = wotServer.ParametersService;
  var IdentityService   = wotServer.IdentityService;

  var Identity      = conn.model('Identity');
  var Certification = conn.model('Certification');

  this.lookup = function (req, res) {
    async.waterfall([
      function (next){
        ParametersService.getSearch(req, next);
      },
      function (search, next){
        IdentityService.search(search, next);
      },
      function (identities, next){
        async.forEach(identities, function(idty, callback){
          async.waterfall([
            function (next){
              Certification.toTarget(idty.getTargetHash(), next);
            },
            function (certs, next){
              idty.certs = certs;
              next();
            },
          ], callback);
        }, function (err) {
          next(err, identities);
        });
      },
    ], function (err, identities) {
      if(err){
        res.send(400, err);
        return;
      }
      var json = {
        partial: false,
        results: []
      };
      identities.forEach(function(identity){
        json.results.push(identity.json());
      });
      res.send(200, JSON.stringify(json, null, "  "));
    });
  };

  this.add = function (req, res) {
    var onError = http400(res);
    http2raw.identity(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseIdentity(onError))
      .pipe(wotServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };
};
