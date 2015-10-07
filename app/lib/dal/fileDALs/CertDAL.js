/**
 * Created by cgeek on 22/08/15.
 */

var AbstractCFS = require('./AbstractCFS');
var Q = require('q');
var _ = require('underscore');
var co = require('co');
var sha1 = require('sha1');

module.exports = CertDAL;

function CertDAL(rootPath, qioFS, parentCore, localDAL) {

  "use strict";

  var that = this;

  AbstractCFS.call(this, rootPath, qioFS, parentCore, localDAL);

  this.init = () => {
    return Q.all([
      that.coreFS.makeTree('certs/'),
      that.coreFS.makeTree('certs/linked/'),
      that.coreFS.makeTree('certs/linked/from/'),
      that.coreFS.makeTree('certs/linked/target/'),
      that.coreFS.makeTree('certs/pending/from/'),
      that.coreFS.makeTree('certs/pending/target/')
    ]);
  };

  this.getToTarget = function(hash) {
    return co(function *() {
      var linked = yield that.getLinkedToTarget(hash);
      var notLinked = yield that.getNotLinkedToTarget(hash);
      // Merge all results. Override unlinked certifications by their linked version
      var mapOfCert = {};
      linked.concat(notLinked).forEach(function(cert){
        var cid = getCertID(cert);
        if (!mapOfCert[cid] || !mapOfCert[cid].linked) {
          mapOfCert[cid] = cert;
        }
      });
      return _.values(mapOfCert);
    });
  };

  this.getFromPubkey = function(pubkey) {
    return co(function *() {
      var linked = yield that.getLinkedFrom(pubkey);
      var notLinked = yield that.getNotLinkedFrom(pubkey);
      // Merge all results. Override unlinked certifications by their linked version
      var mapOfCert = {};
      linked.concat(notLinked).forEach(function(cert){
        var cid = getCertID(cert);
        if (!mapOfCert[cid] || !mapOfCert[cid].linked) {
          mapOfCert[cid] = cert;
        }
      });
      return _.values(mapOfCert);
    });
  };

  this.getNotLinked = function() {
    return co(function *() {
      var certs = [], filesFound = [];
      var files = yield that.coreFS.list('certs/pending/target');
      yield files.map((file) => {
        return co(function *() {
          var files2 = yield that.coreFS.list('certs/pending/target/' + file + '/');
          filesFound = _.uniq(filesFound.concat(files2.map(function(f2) {
            return 'certs/pending/target/' + file + '/' + f2;
          })));
        });
      });
      files = _.uniq(filesFound);
      yield files.map((file) => {
        return that.coreFS.readJSON(file)
          .then(function(data){
            certs.push(data);
          });
      });
      return certs;
    })
      .catch(function(err){
        throw err;
      });
  };

  this.getNotLinkedFrom = (pubkey) => that.coreFS.listJSON('certs/pending/from/' + pubkey + '/');

  this.getLinkedFrom = function(pubkey) {
    return co(function *() {
      var certs = [];
      var files = yield that.coreFS.list('certs/linked/from/' + pubkey + '/');
      yield files.map((file) => {
        return that.coreFS.listJSON('certs/linked/from/' + pubkey + '/' + file + '/').then(found => certs = certs.concat(found));
      });
      return certs;
    });
  };

  this.getNotLinkedToTarget = (hash) =>
    that.coreFS.listJSON('certs/pending/target/' + hash + '/')
      .catch(function(err){
        throw err;
      });

  this.listLocalPending = function() {
    return co(function *() {
      var certs = [];
      var files = yield that.coreFS.listLocal('certs/pending/target/');
      yield files.map((target) => {
        return that.coreFS.listJSON('certs/pending/target/' + target + '/').then(found => certs = certs.concat(found));
      });
      return certs;
    })
      .catch(function(err){
        throw err;
      });
  };

  this.getLinkedToTarget = (hash) => that.coreFS.listJSON('certs/linked/target/' + hash + '/');

  this.saveOfficial = function(cert) {
    return co(function *() {
      yield [
        that.coreFS.makeTree('certs/linked/from/' + cert.from + '/' + cert.to + '/'),
        that.coreFS.makeTree('certs/linked/target/' + cert.target + '/'),
        that.coreFS.makeTree('certs/linked/from_uid/' + cert.from_uid + '/' + cert.to_uid + '/', cert)
      ];
      yield that.coreFS.writeJSON('certs/linked/from/' + cert.from + '/' + cert.to + '/' + cert.block_number + '.json', cert);
      yield that.coreFS.writeJSON('certs/linked/target/' + cert.target + '/' + getCertID(cert) + '.json', cert);
      yield that.coreFS.writeJSON('certs/linked/from_uid/' + cert.from_uid + '/' + cert.to_uid + '/' + getCertID(cert) + '.json', cert);
      return cert;
    });
  };

  this.saveNewCertification = function(cert) {
    return co(function *() {
      yield [
        that.coreFS.makeTree('certs/pending/target/' + cert.target + '/'),
        that.coreFS.makeTree('certs/pending/from/' + cert.from + '/')
      ];
      yield that.coreFS.writeJSON('certs/pending/target/' + cert.target + '/' + getCertID(cert) + '.json', cert);
      yield that.coreFS.writeJSON('certs/pending/from/' + cert.from + '/' + getCertID(cert) + '.json', cert);
      return cert;
    })
      .catch(function(err){
        throw err;
      });
  };

  this.removeNotLinked = function(cert) {
    return co(function *() {
      var pendingTarget = 'certs/pending/target/' + cert.target + '/' + getCertID(cert) + '.json';
      var pendingFromG = 'certs/pending/from/' + cert.from + '/' + getCertID(cert) + '.json';
      var existsFrom = yield that.coreFS.exists(pendingFromG);
      var existsTarget = yield that.coreFS.exists(pendingTarget);
      if (existsTarget) {
        yield that.coreFS.remove(pendingTarget);
      }
      if (existsFrom) {
        yield that.coreFS.remove(pendingFromG);
      }
    });
  };

  this.existsGivenCert = function(cert) {
    return co(function *() {
      var found = yield that.coreFS.read('certs/pending/target/' + cert.target + '/' + getCertID(cert) + '.json');
      if (!found) {
        found = yield that.coreFS.read('certs/linked/target/' + cert.target + '/' + getCertID(cert) + '.json');
      }
      if (found) {
        found = JSON.parse(found);
      }
      return found;
    })
      .catch(function(err){
        throw err;
      });
  };

  function getCertID(cert) {
    var sigHash = (sha1(cert.sig) + "").toUpperCase();
    return [cert.from, cert.target, cert.block, sigHash].join('-');
  }
}