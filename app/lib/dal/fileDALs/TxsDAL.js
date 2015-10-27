/**
 * Created by cgeek on 22/08/15.
 */
var co = require('co');
var Q = require('q');
var _ = require('underscore');
var AbstractLoki = require('./AbstractLoki');

module.exports = TxsDAL;

function TxsDAL(fileDAL, loki) {

  "use strict";

  let that = this;
  let collection = loki.getCollection('txs') || loki.addCollection('txs', { indices: ['hash', 'block_number', 'written', 'signature', 'recipients'] });
  let blockCollection = loki.getCollection('blocks');
  let current = blockCollection.chain().find({ fork: false }).simplesort('number', true).limit(1).data()[0];
  let blocks = [], p = fileDAL;
  let branchView;
  while (p) {
    if (p.core) {
      blocks.push(p.core);
    }
    p = p.parentDAL;
  }
  let conditions = blocks.map((b) => {
    return {
      block_number: b.forkPointNumber
    };
  });
  conditions.unshift({
    block_number: { $lte: current ? current.number : -1 }
  });
  branchView = collection.addDynamicView(['branch', fileDAL.name].join('_'));
  branchView.applyFind({ '$or': conditions });
  branchView.conditions = conditions;

  AbstractLoki.call(this, collection, fileDAL, branchView);

  this.idKeys = ['hash', 'block_number'];
  this.metaProps = ['written', 'removed'];

  this.init = () => null;

  this.getAllPending = () =>
    this.lokiFindInAll({
    written: false,
    removed: false
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