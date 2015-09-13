/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

module.exports = MembershipDAL;

function MembershipDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('ms/'),
        that.makeTree('ms/written/'),
        that.makeTree('ms/pending/'),
        that.makeTree('ms/pending/in/'),
        that.makeTree('ms/pending/out/')
      ]);
    }
    return treeMade;
  };

  this.getMembershipOfIssuer = function(ms) {
    return that.initTree()
      .then(function(){
        return that.read('ms/written/' + ms.issuer + '/' + ms.membership.toLowerCase() + '/' + getMSID(ms) + '.json')
          .fail(function(){
            return that.read('ms/pending/' + ms.membership.toLowerCase() + '/' + getMSID(ms) + '.json');
          });
      });
  };

  this.getMembershipsOfIssuer = function(issuer) {
    var mss = [];
    return that.initTree()
      .then(function(){
        return Q.all([
          mergeMSSOfIssuerInto(issuer, 'in', mss),
          mergeMSSOfIssuerInto(issuer, 'out', mss)
        ]);
      })
      .thenResolve(mss);
  };

  function mergeMSSOfIssuerInto(issuer, type, mss) {
    return that.list('ms/written/' + issuer + '/' + type + '/')
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('ms/written/' + issuer + '/' + type + '/', mss));
  }

  this.getPending = function(type, local_level) {
    var mss = [];
    return that.initTree()
      .then(function(){
        return that.list('ms/pending/' + type, local_level);
      })
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo('ms/pending/' + type + '/', mss))
      .thenResolve(mss);
  };

  this.getPendingLocal = function() {
    return Q.all([
      that.getPending('in', that.LOCAL_LEVEL),
      that.getPending('out', that.LOCAL_LEVEL)
    ])
      .then(function(res){
        return res[0].concat(res[1]);
      });
  };

  this.getPendingIN = function() {
    return that.getPending('in');
  };

  this.getPendingOUT = function() {
    return that.getPending('out');
  };

  this.saveOfficialMS = function(type, ms) {
    return that.initTree()
      .then(function(){
        return Q.all([
          that.makeTree('ms/written/' + ms.issuer + '/' + type)
        ]);
      })
      .then(function(){
        return Q.all([
          that.write('ms/written/' + ms.issuer + '/' + type + '/' + getMSID(ms) + '.json', ms)
        ]);
      })
      .then(function(){
        return that.remove('ms/pending/' + type + '/' + getMSID(ms) + '.json')
          .fail(function() {
          });
      });
  };

  this.savePendingMembership = function(ms) {
    return that.initTree()
      .then(function(){
        return that.write('ms/pending/' + ms.membership.toLowerCase() + '/' + getMSID(ms) + '.json', ms);
      });
  };

  function getMSID(ms) {
    return [ms.membership, ms.issuer, ms.number, ms.hash].join('-');
  }
}