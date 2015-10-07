/**
 * Created by cgeek on 22/08/15.
 */

var AbstractCFS = require('./AbstractCFS');
var co = require('co');

module.exports = TxsDAL;

function TxsDAL(rootPath, qioFS, parentCore, localDAL) {

  "use strict";

  var that = this;

  AbstractCFS.call(this, rootPath, qioFS, parentCore, localDAL);

  this.init = () => {
    return co(function *() {
      yield [
        that.coreFS.makeTree('txs/'),
        that.coreFS.makeTree('txs/linked/'),
        that.coreFS.makeTree('txs/linked/hash/'),
        that.coreFS.makeTree('txs/linked/issuer/'),
        that.coreFS.makeTree('txs/linked/recipient/'),
        that.coreFS.makeTree('txs/pending/'),
        that.coreFS.makeTree('txs/pending/hash/'),
        that.coreFS.makeTree('txs/pending/issuer/'),
        that.coreFS.makeTree('txs/pending/recipient/')
      ];
    });
  };

  this.getAllPending = () => that.coreFS.listJSON('txs/pending/hash/');

  this.getTX = (hash) => {
    return that.coreFS.readJSON('txs/linked/hash/' + hash + '.json')
      .catch(function(){
        return that.coreFS.readJSON('txs/pending/hash/' + hash + '.json');
      })
      .catch(function(){
        return null;
      });
  };

  this.removeTX = (hash) => that.coreFS.remove('txs/pending/hash/' + hash + '.json').catch(() => null);

  this.addLinked = (tx) => {
    return co(function *() {
      var hash = tx.getHash(true);
      var issuers = tx.issuers;
      var recipients = tx.outputs.map(function(out) {
        return out.match('(.*):')[1];
      });
      yield [
        that.coreFS.writeJSON('txs/linked/hash/' + hash + '.json', tx)
      ]
        .concat(issuers.map(function(issuer) {
          return writeForPubkey('txs/linked/issuer/' + issuer + '/', hash, tx);
        }))

        .concat(recipients.map(function(recipient) {
          return writeForPubkey('txs/linked/recipient/' + recipient + '/', hash, tx);
        }));
    });
  };

  this.addPending = (tx) => {
    return co(function *() {
      var hash = tx.getHash(true);
      var issuers = tx.issuers;
      var recipients = tx.outputs.map(function(out) {
        return out.match('(.*):')[1];
      });
      yield [
        that.coreFS.writeJSON('txs/pending/hash/' + hash + '.json', tx)
      ].concat(issuers.map(function(issuer) {
          return writeForPubkey('txs/pending/issuer/' + issuer + '/', hash, tx);
        })).concat(recipients.map(function(recipient) {
          return writeForPubkey('txs/pending/recipient/' + recipient + '/', hash, tx);
        }));
    });
  };

  function writeForPubkey(path, fileName, tx) {
    return co(function *() {
      yield that.coreFS.makeTree(path);
      return that.coreFS.writeJSON(path + fileName + '.json', tx);
    });
  }

  this.getLinkedWithIssuer = (pubkey) => this.coreFS.listJSON('txs/linked/issuer/' + pubkey + '/');

  this.getLinkedWithRecipient = (pubkey) => this.coreFS.listJSON('txs/linked/recipient/' + pubkey + '/');

  this.getPendingWithIssuer = (pubkey) => this.coreFS.listJSON('txs/pending/issuer/' + pubkey + '/');

  this.getPendingWithRecipient = (pubkey) => this.coreFS.listJSON('txs/pending/recipient/' + pubkey + '/');
}