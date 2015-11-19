/**
 * Created by cgeek on 22/08/15.
 */
var co = require('co');
var Q = require('q');
var _ = require('underscore');
var AbstractLoki = require('./AbstractLoki');

module.exports = TxsDAL;

function TxsDAL(loki) {

  "use strict";

  let that = this;
  let collection = loki.getCollection('txs') || loki.addCollection('txs', { indices: ['hash', 'block_number', 'written', 'signature', 'recipients'] });

  AbstractLoki.call(this, collection);

  this.idKeys = ['hash', 'block_number'];
  this.propsToSave = [
    'inputs',
    'outputs',
    'issuers',
    'signatories',
    'signatures',
    'comment',
    'hash',
    'version',
    'currency',
    'block_number',
    'time',
    'recipients',
    'written',
    'removed'
  ];

  this.init = () => null;

  this.getAllPending = () =>
    this.lokiFindInAll({
      $and: [{
        written: false
      },{
        removed: false
      }]
  });

  this.getTX = (hash) => this.lokiFindOne({
    hash: hash
  }, null, this.IMMUTABLE_FIELDS);

  this.removeTX = (hash) => co(function *() {
    let tx = yield that.lokiFindOne({
      hash: hash
    });
    if (tx) {
      tx.removed = true;
      return that.lokiSave(tx);
    }
    return Q(tx);
  });

  this.addLinked = (tx) => {
    tx.written = true;
    tx.removed = false;
    tx.hash = tx.getHash(true);
    tx.recipients = tx.outputs.map(function(out) {
      return out.match('(.*):')[1];
    });
    return that.lokiSave(tx);
  };

  this.addPending = (tx) => {
    tx.written = false;
    tx.removed = false;
    tx.hash = tx.getHash(true);
    tx.recipients = tx.outputs.map(function(out) {
      return out.match('(.*):')[1];
    });
    return this.lokiSave(tx);
  };

  this.getLinkedWithIssuer = (pubkey) => this.lokiFind({
    issuers: { $contains: pubkey }
  },{
    written: true
  });

  this.getLinkedWithRecipient = (pubkey) => this.lokiFind({
    recipients: { $contains: pubkey }
  },{
    written: true
  });

  this.getPendingWithIssuer = (pubkey) => this.lokiFind({
    issuers: { $contains: pubkey }
  },{
    written: false
  });

  this.getPendingWithRecipient = (pubkey) => this.lokiFind({
    recipients: { $contains: pubkey }
  },{
    written: false
  });
}