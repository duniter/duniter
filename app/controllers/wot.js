"use strict";
var co = require('co');
var util     = require('util');
var async    = require('async');
var _        = require('underscore');
var Q        = require('q');
var stream   = require('stream');
var unix2dos = require('../lib/unix2dos');
var dos2unix = require('../lib/dos2unix');
var http2raw = require('../lib/streams/parsers/http2raw');
var jsoner   = require('../lib/streams/jsoner');
var parsers  = require('../lib/streams/parsers/doc');
var es       = require('event-stream');
var http400  = require('../lib/http/http400');
var logger   = require('../lib/logger')();

module.exports = function (server) {
  return new WOTBinding(server);
};

function WOTBinding (server) {

  var ParametersService = server.ParametersService;
  var IdentityService   = server.IdentityService;
  var BlockchainService   = server.BlockchainService;

  var Identity = require('../lib/entity/identity');

  this.lookup = function (req, res) {
    res.type('application/json');
    return co(function *() {
      var search = yield ParametersService.getSearchP(req);
      var identities = yield IdentityService.search(search);
      identities.forEach(function(idty, index){
        identities[index] = new Identity(idty);
      });
      var excluding = yield BlockchainService.getCertificationsExludingBlock();
      yield identities.map((idty) => {
        return co(function *() {
          var certs = yield server.dal.certsToTarget(idty.getTargetHash());
          var validCerts = [];
          yield certs.map((cert) => {
            return co(function *() {
              if (excluding && cert.block <= excluding.number) {
                // Exclude the cert from result
                return;
              }
              var res2 = yield Q.nbind(IdentityService.findIdentities, IdentityService)(cert.from);
              var writtens = res2.written ? [res2.written] : [];
              var nonWrittens = res2.nonWritten || [];
              if (writtens.length > 0) {
                cert.uids = [writtens[0].uid];
                cert.isMember = writtens[0].member;
                cert.wasMember = writtens[0].wasMember;
              } else {
                cert.uids = _(writtens).pluck('uid').concat(_(nonWrittens).pluck('uid'));
                cert.isMember = false;
                cert.wasMember = false;
              }
              validCerts.push(cert);
            });
          });
          idty.certs = validCerts;
          var signed = yield server.dal.certsFrom(idty.pubkey);
          var validSigned = [];
          yield signed.map((cert) => {
            return co(function *() {
              if (excluding && cert.block <= excluding.number) {
                // Exclude the cert from result
                return;
              }
              cert.idty = yield server.dal.getIdentityByHashOrNull(cert.target);
              validSigned.push(cert);
            });
          });
          idty.signed = validSigned;
        });
      });
      return identities;
    })
      .then(function(identities){
        var json = {
          partial: false,
          results: []
        };
        identities.forEach(function(identity){
          json.results.push(identity.json());
        });
        res.send(200, JSON.stringify(json, null, "  "));
      })
      .catch(function(err){
        res.send(400, err);
      });
  };

  this.members = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        server.dal.getMembers(next);
      }
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
            server.dal.certsToTarget(idty.getTargetHash()).then(_.partial(next, null)).catch(next);
          },
          function (certs, next){
            idty.certs = [];
            async.forEach(certs, function (cert, callback) {
              async.waterfall([
                function (next) {
                  server.dal.getWritten(cert.from, next);
                },
                function (idty, next) {
                  if (!idty) {
                    next('Not a member');
                    return;
                  }
                  cert.uid = idty.uid;
                  cert.isMember = idty.member;
                  cert.wasMember = idty.wasMember;
                  server.dal.getBlock(cert.block_number, next);
                },
                function (block, next) {
                  cert.cert_time = {
                    block: block.number,
                    medianTime: block.medianTime
                  };
                  idty.certs.push(cert);
                  next();
                }
              ], function () {
                callback();
              });
            }, next);
          },
          function (next) {
            next(null, idty);
          }
        ], next);
      }
    ], function (err, idty) {
      if(err){
        if (err == 'No member matching this pubkey or uid') {
          res.send(404, err);
          return;
        }
        res.send(400, err);
        return;
      }
      var json = {
        pubkey: idty.pubkey,
        uid: idty.uid,
        isMember: idty.member,
        certifications: []
      };
      idty.certs.forEach(function(cert){
        json.certifications.push({
          pubkey: cert.from,
          uid: cert.uid,
          isMember: cert.isMember,
          wasMember: cert.wasMember,
          cert_time: cert.cert_time,
          written: cert.linked,
          signature: cert.sig
        });
      });
      res.send(200, JSON.stringify(json, null, "  "));
    });
  };

  this.requirements = function (req, res) {
    res.type('application/json');
    async.waterfall([
      function (next){
        ParametersService.getPubkey(req, next);
      },
      function (search, next){
        IdentityService.search(search).then(_.partial(next, null)).catch(next);
      },
      function (identities, next){
        return identities.reduce(function(p, identity) {
          return p
            .then(function(all){
              return BlockchainService.requirementsOfIdentity(new Identity(identity))
                .then(function(requirements){
                  return all.concat([requirements]);
                })
                .catch(function(err){
                  logger.warn(err);
                  return all;
                });
            });
        }, Q([]))
          .then(function(all){
            if (!all || !all.length) {
              return next('No member matching this pubkey or uid');
            }
            next(null, {
              pubkey: all[0].pubkey,
              identities: all.map(function(idty) {
                return _.omit(idty, 'pubkey');
              })
            });
          })
          .catch(next);
      }
    ], function (err, json) {
      if(err){
        if (err == 'No member matching this pubkey or uid') {
          res.send(404, err);
          return;
        }
        res.send(400, err);
        return;
      }
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
            server.dal.certsFrom(idty.pubkey).then(_.partial(next, null)).catch(next);
          },
          function (certs, next){
            idty.certs = [];
            async.forEach(certs, function (cert, callback) {
              async.waterfall([
                function (next) {
                  server.dal.getWritten(cert.to, next);
                },
                function (idty, next) {
                  if (!idty) {
                    next('Not a member');
                    return;
                  }
                  cert.pubkey = idty.pubkey;
                  cert.uid = idty.uid;
                  cert.isMember = idty.member;
                  cert.wasMember = idty.wasMember;
                  server.dal.getBlock(cert.block_number, next);
                },
                function (block, next) {
                  cert.cert_time = {
                    block: block.number,
                    medianTime: block.medianTime
                  };
                  idty.certs.push(cert);
                  next();
                }
              ], function () {
                callback();
              });
            }, next);
          },
          function (next) {
            next(null, idty);
          }
        ], next);
      }
    ], function (err, idty) {
      if(err){
        if (err == 'No member matching this pubkey or uid') {
          res.send(404, err);
          return;
        }
        res.send(400, err);
        return;
      }
      var json = {
        pubkey: idty.pubkey,
        uid: idty.uid,
        isMember: idty.member,
        certifications: []
      };
      idty.certs.forEach(function(cert){
        json.certifications.push({
          pubkey: cert.pubkey,
          uid: cert.uid,
          cert_time: cert.cert_time,
          isMember: cert.isMember,
          wasMember: cert.wasMember,
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
      .pipe(server.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };

  this.revoke = function (req, res) {
    res.type('application/json');
    var onError = http400(res);
    http2raw.revocation(req, onError)
      .pipe(dos2unix())
      .pipe(parsers.parseRevocation(onError))
      .pipe(server.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };
}
