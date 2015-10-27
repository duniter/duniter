/**
 * Created by cgeek on 22/08/15.
 */

var Q = require('q');
var _ = require('underscore');
var AbstractLoki = require('./AbstractLoki');

module.exports = MembershipDAL;

function MembershipDAL(fileDAL, loki) {

  "use strict";

  let collection = loki.getCollection('memberships') || loki.addCollection('memberships', { indices: ['membership', 'issuer', 'number', 'blockNumber', 'blockHash', 'userid', 'certts', 'block', 'fpr', 'written', 'signature'] });
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
        blockNumber: b.forkPointNumber
      }, {
        blockHash: b.forkPointHash
      }]
    };
  });
  conditions.unshift({
    blockNumber: { $lte: current ? current.number : -1 }
  });
  conditions.unshift({
    $and: [{
      blockNumber: '0'
    }, {
      blockHash: 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709'
    }]
  });
  branchView = collection.addDynamicView(['branch', fileDAL.name].join('_'));
  branchView.applyFind({ '$or': conditions });
  branchView.conditions = conditions;

  AbstractLoki.call(this, collection, fileDAL, branchView);

  this.idKeys = ['issuer', 'signature'];
  this.metaProps = ['written'];

  this.init = () => null;

  this.getMembershipOfIssuer = (ms) => Q(this.lokiExisting(ms));

  this.getMembershipsOfIssuer = (issuer) => this.lokiFind({
    issuer: issuer
  });

  this.getPendingLocal = () => Q([]);

  this.getPendingIN = () => this.lokiFind({
    membership: 'IN'
  },{
    written: false
  });

  this.getPendingOUT = () => this.lokiFind({
    membership: 'OUT'
  },{
    written: false
  });

  this.saveOfficialMS = (type, ms) => {
    let obj = _.extend({}, ms);
    obj.membership = type.toUpperCase();
    obj.written = true;
    return this.lokiSave(_.pick(obj, 'membership', 'issuer', 'number', 'blockNumber', 'blockHash', 'userid', 'certts', 'block', 'fpr', 'written', 'signature'));
  };

  this.savePendingMembership = (ms) => {
    ms.membership = ms.membership.toUpperCase();
    ms.written = false;
    return this.lokiSave(_.pick(ms, 'membership', 'issuer', 'number', 'blockNumber', 'blockHash', 'userid', 'certts', 'block', 'fpr', 'written', 'signature'));
  };
}
