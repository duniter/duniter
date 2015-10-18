/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var _ = require('underscore');
var co = require('co');

module.exports = SourcesDAL;

function SourcesDAL(rootPath, db, parentCore, localDAL, AbstractStorage) {

  "use strict";

  var that = this;

  AbstractStorage.call(this, rootPath, db, parentCore, localDAL);

  this.init = () => Q.all([
    that.coreFS.makeTree('sources/'),
    that.coreFS.makeTree('sources/consumed/'),
    that.coreFS.makeTree('sources/available/')
  ]);

  this.getAvailableForPubkey = (pubkey) =>
    that.coreFS.listJSON('sources/available/' + pubkey + '/')
  .catch(function(err){
    throw err;
  });

  this.getAvailableSource = function(pubkey, type, number, fingerprint, amount) {
    return that.coreFS.read('sources/available/' + pubkey + '/' + getSourceID(type, number, fingerprint, amount) + '.json')
      .then(() => true)
      .catch(function() {
        return false;
      });
  };

  this.getConsumedSource = function(pubkey, type, number, fingerprint, amount) {
    return that.coreFS.read('sources/consumed/' + pubkey + '/' + getSourceID(type, number, fingerprint, amount) + '.json')
      .then((tx) =>
        !!tx)
      .catch(function() {
        return false;
      });
  };

  this.getSource = (pubkey, type, number) => that.getAvailableForPubkey(pubkey)
    .then(function(sources){
      return _.findWhere(sources, { type: type, number: number });
    });

  this.isAvailableSource = function(pubkey, type, number, fingerprint, amount) {
    return co(function *() {
      var available = yield that.getAvailableSource(pubkey, type, number, fingerprint, amount);
      var consumed = yield that.getConsumedSource(pubkey, type, number, fingerprint, amount);
      return available && !consumed;
    });
  };

  this.consumeSource = function(pubkey, type, number, fingerprint, amount) {
    return co(function *() {
      yield that.coreFS.remove('sources/available/' + pubkey + '/' + getSourceID(type, number, fingerprint, amount) + '.json')
        .catch(function(){
          // Silent error
        });
      // TODO: with CFS, this line should not be required. To be tested.
      return that.addSource('consumed', pubkey, type, number, fingerprint, amount);
    })
      .catch(function(err){
        throw err;
      });
  };

  this.addSource = (state, pubkey, type, number, fingerprint, amount) => {
    return co(function *() {
      yield that.coreFS.makeTree('sources/' + state + '/' + pubkey + '/');
      return that.coreFS.writeJSON('sources/' + state + '/' + pubkey + '/' + getSourceID(type, number, fingerprint, amount) + '.json', {
        pubkey: pubkey,
        type: type,
        number: number,
        fingerprint: fingerprint,
        amount: amount
      });
    })
      .catch(function(err){
        throw err;
      });
  };

  function getSourceID(type, number, fingerprint, amount) {
    return [type, number, fingerprint, amount].join('-');
  }
}