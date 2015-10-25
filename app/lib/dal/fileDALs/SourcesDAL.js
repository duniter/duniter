/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var AbstractLoki = require('./AbstractLoki');

module.exports = SourcesDAL;

function SourcesDAL(fileDAL, loki) {

  "use strict";

  let collection = loki.getCollection('sources') || loki.addCollection('sources', { indices: ['pubkey', 'type', 'number', 'fingerprint', 'amount', 'block_hash'] });
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
      $and: [{
        number: b.forkPointNumber
      }, {
        block_hash: b.forkPointHash
      }]
    };
  });
  conditions.unshift({
    block_number: { $lte: current ? current.number : -1 }
  });
  branchView = collection.addDynamicView(['branch', fileDAL.name].join('_'));
  branchView.applyFind({ '$or': conditions });
  branchView.conditions = conditions;

  AbstractLoki.call(this, collection, fileDAL, branchView);

  this.idKeys = ['pubkey', 'type', 'number', 'fingerprint', 'amount'];
  this.metaProps = ['consumed'];

  this.init = () => null;

  this.getAvailableForPubkey = (pubkey) => this.lokiFind({
    pubkey: pubkey
  },{
    consumed: false
  });

  this.getSource = (pubkey, type, number) => this.lokiFindOne({
    $and: [
      { pubkey: pubkey },
      { type: type },
      { number: number }
    ]
  }, null, this.IMMUTABLE_FIELDS);

  this.isAvailableSource = (pubkey, type, number, fingerprint, amount) => {
    let src = this.lokiExisting({
      pubkey: pubkey,
      type: type,
      number: number,
      fingerprint: fingerprint,
      amount: amount
    });
    return Q(src ? !src.consumed : false);
  };

  this.consumeSource = (pubkey, type, number, fingerprint, amount) => {
    let src = this.lokiExisting({
      pubkey: pubkey,
      type: type,
      number: number,
      fingerprint: fingerprint,
      amount: amount
    });
    src.consumed = true;
    return this.lokiSave(src);
  };

  this.addSource = (state, pubkey, type, number, fingerprint, amount, block_hash) => this.lokiSave({
    pubkey: pubkey,
    type: type,
    number: number,
    fingerprint: fingerprint,
    amount: amount,
    block_hash: block_hash,
    consumed: false
  });
}