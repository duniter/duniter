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

  var Block         = conn.model('Block');
  var Identity      = conn.model('Identity');
  var Certification = conn.model('Certification');

  this.lookup = function (req, res) {
    res.type('application/json');
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

  this.members = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        Identity.getMembers(next);
      },
    ], function (err, identities) {
      if(err){
        res.send(400, err);
        return;
      }
      var json = {
        results: []
      };
      identities.forEach(function(identity){
        json.results.push({ pubkey: identity.pubkey, uid: identity.uid });
      });
      res.send(200, JSON.stringify(json, null, "  "));
    });
  };

  this.certifiersOf = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        ParametersService.getSearch(req, next);
      },
      function (search, next){
        IdentityService.findMember(search, next);
      },
      function (idty, next){
        async.waterfall([
          function (next){
            Certification.toTarget(idty.getTargetHash(), next);
          },
          function (certs, next){
            idty.certs = [];
            async.forEach(certs, function (cert, callback) {
              async.waterfall([
                function (next) {
                  Identity.getMember(cert.from, next);
                },
                function (idty, next) {
                  if (!idty) {
                    next('Not a member');
                    return;
                  }
                  cert.uid = idty.uid;
                  Block.findByNumber(cert.block_number, next);
                },
                function (block, next) {
                  cert.cert_time = {
                    block: block.number,
                    medianTime: block.medianTime
                  };
                  idty.certs.push(cert);
                  next();
                }
              ], function (err) {
                callback();
              });
            }, next);
          },
          function (next) {
            next(null, idty);
          }
        ], next);
      },
    ], function (err, idty) {
      if(err){
        res.send(400, err);
        return;
      }
      var json = {
        pubkey: idty.pubkey,
        uid: idty.uid,
        certifications: []
      };
      idty.certs.forEach(function(cert){
        json.certifications.push({
          pubkey: cert.pubkey,
          uid: cert.uid,
          cert_time: cert.cert_time,
          written: cert.linked,
          signature: cert.sig
        });
      });
      res.send(200, JSON.stringify(json, null, "  "));
    });
  };

  this.certifiedBy = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        ParametersService.getSearch(req, next);
      },
      function (search, next){
        IdentityService.findMember(search, next);
      },
      function (idty, next){
        async.waterfall([
          function (next){
            Certification.from(idty.pubkey, next);
          },
          function (certs, next){
            idty.certs = [];
            async.forEach(certs, function (cert, callback) {
              async.waterfall([
                function (next) {
                  Identity.getMember(cert.to, next);
                },
                function (idty, next) {
                  if (!idty) {
                    next('Not a member');
                    return;
                  }
                  cert.pubkey = idty.pubkey;
                  cert.uid = idty.uid;
                  Block.findByNumber(cert.block_number, next);
                },
                function (block, next) {
                  cert.cert_time = {
                    block: block.number,
                    medianTime: block.medianTime
                  };
                  idty.certs.push(cert);
                  next();
                }
              ], function (err) {
                callback();
              });
            }, next);
          },
          function (next) {
            next(null, idty);
          }
        ], next);
      },
    ], function (err, idty) {
      if(err){
        res.send(400, err);
        return;
      }
      var json = {
        pubkey: idty.pubkey,
        uid: idty.uid,
        certifications: []
      };
      idty.certs.forEach(function(cert){
        json.certifications.push({
          pubkey: cert.pubkey,
          uid: cert.uid,
          cert_time: cert.cert_time,
          written: cert.linked,
          signature: cert.sig
        });
      });
      res.send(200, JSON.stringify(json, null, "  "));
    });
  };

  this.add = function (req, res) {
    res.type('application/json');
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
