/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

module.exports = IndicatorsDAL;

function IndicatorsDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('indicators/'),
        that.makeTree('indicators/issuers')
      ]);
    }
    return treeMade;
  };

  this.writeCurrentExcluding = function(excluding) {
    return that.initTree()
      .then(function(){
        return that.write('indicators/excludingMS.json', excluding);
      });
  };

  this.writeCurrentExcludingForCert = function(excluding) {
    return that.initTree()
      .then(function(){
        return that.write('indicators/excludingCRT.json', excluding);
      });
  };

  this.getCurrentMembershipExcludingBlock = function() {
    return that.initTree()
      .then(function(){
        return that.read('indicators/excludingMS.json');
      });
  };

  this.getCurrentCertificationExcludingBlock = function() {
    return that.initTree()
      .then(function(){
        return that.read('indicators/excludingCRT.json');
      });
  };

  this.setLastUDBlock = function(ud_block) {
    return that.initTree()
      .then(function(){
        return that.write('indicators/ud_block.json', ud_block);
      });
  };

  this.getLastUDBlock = function() {
    return that.initTree()
      .then(function(){
        return that.read('indicators/ud_block.json')
          .catch(function() {
            return null;
          });
      });
  };

  this.setLastBlockForIssuer = function(block) {
    return that.initTree()
      .then(function(){
        return that.write('indicators/issuers/' + block.issuer + '.json', block);
      });
  };

  this.getLastBlockOfIssuer = function(pubkey) {
    return that.initTree()
      .then(function(){
        return that.read('indicators/issuers/' + pubkey + '.json');
      })
      .catch(function() { return null; });
  };
}