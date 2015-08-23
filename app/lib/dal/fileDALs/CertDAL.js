/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

module.exports = CertDAL;

function CertDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  // TODO: use initTree
  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('certs/'),
        that.makeTree('certs/linked/'),
        that.makeTree('certs/linked/from/'),
        that.makeTree('certs/linked/target/'),
        that.makeTree('certs/pending/from/'),
        that.makeTree('certs/pending/target/')
      ]);
    }
    return treeMade;
  };

  this.getToTarget = function(hash) {
    var certs = [];
    return that.initTree()
      .then(function(){
        return that.getLinkedToTarget(hash);
      })
      .then(function(linked){
        certs = certs.concat(linked);
        return that.getNotLinkedToTarget(hash);
      })
      .then(function(notLinked){
        certs = certs.concat(notLinked);
        // Merge all results. Override unlinked certifications by their linked version
        var mapOfCert = {};
        certs.forEach(function(cert){
          var cid = getCertID(cert);
          if (!mapOfCert[cid] || !mapOfCert[cid].linked) {
            mapOfCert[cid] = cert;
          }
        });
        return _.values(mapOfCert);
      });
  };

  this.getFromPubkey = function(pubkey) {
    var certs = [];
    return that.initTree()
      .then(function(){
        return that.getLinkedFrom(pubkey);
      })
      .then(function(linked){
        certs = certs.concat(linked);
        return that.getNotLinkedFrom(pubkey);
      })
      .then(function(notLinked){
        certs = certs.concat(notLinked);
        // Merge all results. Override unlinked certifications by their linked version
        var mapOfCert = {};
        certs.forEach(function(cert){
          var cid = getCertID(cert);
          if (!mapOfCert[cid] || !mapOfCert[cid].linked) {
            mapOfCert[cid] = cert;
          }
        });
        return _.values(mapOfCert);
      });
  };

  this.getNotLinked = function() {
    var certs = [], filesFound = [];
    return that.initTree()
      .then(function(){
        return that.list('certs/pending/target');
      })
      .then(function(files) {
        return files.reduce(function (p, file) {
          return p.then(function () {
            return that.list('certs/pending/target/' + file.file + '/')
              .then(function(files2) {
                filesFound = _.uniq(filesFound.concat(files2.map(function(f2) {
                  return 'certs/pending/target/' + file.file + '/' + f2.file;
                })));
              });
          });
        }, Q());
      })
      .then(function(){
        return _.uniq(filesFound);
      })
      .then(function(files) {
        return files.reduce(function(p, file) {
          return p.then(function(){
            return that.read(file)
              .then(function(data){
                certs.push(data);
              })
              .fail(function(err){
                throw err;
              });
          });
        }, Q());
      })
      .then(function(){
        return filesFound;
      })
      .thenResolve(certs);
  };

  this.getNotLinkedFrom = function(pubkey) {
    var certs = [];
    return that.initTree()
      .then(function(){
        return that.list('certs/pending/from/' + pubkey + '/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(reduceTo('certs/pending/from/' + pubkey + '/', certs))
      .thenResolve(certs);
  };

  this.getLinkedFrom = function(pubkey) {
    var certs = [];
    return that.initTree()
      .then(function(){
        return that.list('certs/linked/from/' + pubkey + '/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(function(files){
        return files.reduce(function (p, file) {
          return p.then(function () {
            return that.list('certs/linked/from/' + pubkey + '/' + file + '/')
              .then(function(files){
                return _.pluck(files, 'file');
              })
              .then(reduceTo('certs/linked/from/' + pubkey + '/' + file + '/', certs));
          });
        }, Q());
      })
      .thenResolve(certs);
  };

  this.getNotLinkedToTarget = function(hash) {
    var certs = [];
    return that.initTree()
      .then(function(){
        return that.list('certs/pending/target/' + hash + '/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(reduceTo('certs/pending/target/' + hash + '/', certs))
      .thenResolve(certs);
  };

  this.getLinkedToTarget = function(hash) {
    var certs = [];
    return that.initTree()
      .then(function(){
        return that.list('certs/linked/target/' + hash + '/');
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(reduceTo('certs/linked/target/' + hash + '/', certs))
      .thenResolve(certs);
  };

  this.saveOfficial = function(cert) {
    return that.initTree()
      .then(function(){
        return Q.all([
          that.makeTree('certs/linked/from/' + cert.from + '/' + cert.to + '/'),
          that.makeTree('certs/linked/target/' + cert.target + '/'),
          that.makeTree('certs/linked/from_uid/' + cert.from_uid + '/' + cert.to_uid + '/', cert)
        ]);
      })
      .then(function(){
        return that.write('certs/linked/from/' + cert.from + '/' + cert.to + '/' + cert.block_number + '.json', cert);
      })
      .then(function(){
        return that.write('certs/linked/target/' + cert.target + '/' + getCertID(cert) + '.json', cert);
      })
      .then(function(){
        return that.write('certs/linked/from_uid/' + cert.from_uid + '/' + cert.to_uid + '/' + getCertID(cert) + '.json', cert);
      });
  };

  this.saveNewCertification = function(cert) {
    return that.initTree()
      .then(function(){
        return Q.all([
          that.makeTree('certs/pending/target/' + cert.target + '/'),
          that.makeTree('certs/pending/from/' + cert.from + '/')
        ]);
      })
      .then(function(){
        return that.write('certs/pending/target/' + cert.target + '/' + getCertID(cert) + '.json', cert);
      })
      .then(function(){
        return that.write('certs/pending/from/' + cert.from + '/' + getCertID(cert) + '.json', cert);
      });
  };

  this.removeNotLinked = function(cert) {
    return that.initTree()
      .then(function(){
        return that.exists('certs/pending/target/' + cert.target + '/' + getCertID(cert) + '.json')
          .then(function(exists){
            if (exists) return that.remove('certs/pending/target/' + cert.target + '/' + getCertID(cert) + '.json');
          });
      })
      .then(function(){
        return that.exists('certs/pending/from/' + cert.from + '/' + getCertID(cert) + '.json')
          .then(function(exists){
            if (exists) return that.remove('certs/pending/from/' + cert.from + '/' + getCertID(cert) + '.json');
          });
      });
  };

  this.existsGivenCert = function(cert) {
    return that.initTree()
      .then(function(){
        return that.read('certs/pending/target/' + cert.target + '/' + getCertID(cert) + '.json')
          .fail(function(){
            return that.read('certs/linked/target/' + cert.target + '/' + getCertID(cert) + '.json')
              .fail(function() {
                return false;
              });
          });
      });
  };

  function getCertID(cert) {
    var sigHash = (sha1(cert.sig) + "").toUpperCase();
    return [cert.from, cert.target, cert.block, sigHash].join('-');
  }

  function reduceTo(subpath, certs) {
    return function(files){
      return files.reduce(function(p, file) {
        return p.then(function(){
          return that.read(subpath + file)
            .then(function(data){
              certs.push(data);
            })
            .fail(function(err){
              throw err;
            });
        });
      }, Q());
    };
  }
}