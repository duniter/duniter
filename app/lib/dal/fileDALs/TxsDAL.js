/**
 * Created by cgeek on 22/08/15.
 */

var AbstractDAL = require('./AbstractDAL');
var Q = require('q');
var _ = require('underscore');
var sha1 = require('sha1');

module.exports = TxsDAL;

function TxsDAL(dal) {

  "use strict";

  AbstractDAL.call(this, dal);
  var logger = require('../../../lib/logger')(dal.profile);
  var that = this;
  var treeMade;

  this.initTree = function() {
    if (!treeMade) {
      treeMade = Q.all([
        that.makeTree('txs/'),
        that.makeTree('txs/linked/'),
        that.makeTree('txs/linked/hash/'),
        that.makeTree('txs/linked/issuer/'),
        that.makeTree('txs/linked/recipient/'),
        that.makeTree('txs/pending/'),
        that.makeTree('txs/pending/hash/'),
        that.makeTree('txs/pending/issuer/'),
        that.makeTree('txs/pending/recipient/')
      ]);
    }
    return treeMade;
  };

  function initable(f) {
    return function() {
      var args = Array.prototype.slice.call(arguments);
      return that.initTree().then(function() {
        return f.apply(that, args);
      });
    };
  }

  this.getAllPending = initable(function() {
    return getList('txs/pending/hash/');
  });

  this.getTX = initable(function(hash) {
    return that.read('txs/linked/hash/' + hash + '.json')
      .fail(function(){
        return that.read('txs/pending/hash/' + hash + '.json');
      })
      .fail(function(){
        return null;
      });
  });

  this.removeTX = initable(function(hash) {
    return that.remove('txs/pending/hash/' + hash + '.json')
      .fail(function() {
      });
  });

  this.addLinked = initable(function(tx) {
    var hash = tx.getHash(true);
    return extractTX(tx)
      .spread(function(issuers, recipients){
        return Q.all([
          that.write('txs/linked/hash/' + hash + '.json', tx)
        ]
          .concat(issuers.map(function(issuer) {
            return writeForPubkey('txs/linked/issuer/' + issuer + '/', hash, tx);
          }))

          .concat(recipients.map(function(recipient) {
            return writeForPubkey('txs/linked/issuer/' + recipient + '/', hash, tx);
          }))
        );
      }, Q.reject)
      .fail(function(err){
        throw err;
      });
  });

  this.addPending = initable(function(tx) {
    var hash = tx.getHash(true);
    return extractTX(tx)
      .spread(function(issuers, recipients){
        return Q.all([
          that.write('txs/pending/hash/' + hash + '.json', tx)
        ].concat(issuers.map(function(issuer) {
            return writeForPubkey('txs/pending/issuer/' + issuer + '/', hash, tx);
          })).concat(recipients.map(function(recipient) {
            return writeForPubkey('txs/pending/recipient/' + recipient + '/', hash, tx);
          })));
      }, Q.reject);
  });

  function writeForPubkey(path, fileName, tx) {
    return that.makeTree(path)
      .then(function(){
        return that.write(path + fileName + '.json', tx);
      });
  }

  this.getLinkedWithIssuer = initable(function(pubkey) {
    return getList('txs/linked/issuer/' + pubkey + '/');
  });

  this.getLinkedWithRecipient = initable(function(pubkey) {
    return getList('txs/linked/recipient/' + pubkey + '/');
  });

  this.getPendingWithIssuer = initable(function(pubkey) {
    return getList('txs/pending/issuer/' + pubkey + '/');
  });

  this.getPendingWithRecipient = initable(function(pubkey) {
    return getList('txs/pending/recipient/' + pubkey + '/');
  });

  function getList(path) {
    var txs = [];
    return that.list(path)
      .then(function(files){
        return _.pluck(files, 'file');
      })
      .then(that.reduceTo(path, txs))
      .thenResolve(txs);
  }

  function extractTX(tx) {
    return Q.all([
      Q(tx.issuers),
      Q(tx.outputs.map(function(out) {
        return out.match('(.*):')[1];
      }))
    ]);
  }
}