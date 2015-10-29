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

  AbstractLoki.call(this, collection, fileDAL, {
    block_number: 'blockNumber',
    block_hash: 'blockHash'
  }, loki);

  this.idKeys = ['issuer', 'signature'];
  this.metaProps = ['written'];
  this.propsToSave = [
    'membership',
    'issuer',
    'number',
    'blockNumber',
    'blockHash',
    'userid',
    'certts',
    'block',
    'fpr',
    'written',
    'signature'
  ];

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
