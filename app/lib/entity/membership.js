"use strict";
const _ = require('underscore');
const moment = require('moment');
const rawer = require('duniter-common').rawer;
const constants = require('../constants');

const Membership = function(json) {

  _(json).keys().forEach((key) => {
    this[key] = json[key];
  });

  this.blockNumber = isNaN(this.number) ? this.number : parseInt(this.number);
  this.blockHash = this.fpr;
  this.version = constants.DOCUMENTS_VERSION;

  this.keyID = () => this.issuer && this.issuer.length > 24 ? "0x" + this.issuer.substring(24) : "0x?";

  this.copyValues = (to) => {
    const obj = this;
    ["version", "currency", "issuer", "membership", "amNumber", "hash", "signature", "sigDate"].forEach(function (key) {
      to[key] = obj[key];
    });
  };

  this.inline = () => [this.issuer,
      this.signature,
      [this.number, this.fpr].join('-'),
      this.certts,
      this.userid
    ].join(':');


  this.json = () => {
    const json = {};
    ["version", "currency", "issuer", "membership"].forEach((key) => {
      json[key] = this[key];
    });
    json.date = this.date && moment(this.date).unix();
    json.sigDate = this.sigDate && moment(this.sigDate).unix();
    json.raw = this.getRaw();
    return { signature: this.signature, membership: json };
  };

  this.getRaw = () => rawer.getMembershipWithoutSignature(this);

  this.getRawSigned = () => rawer.getMembership(this);
};

Membership.statics = {};

Membership.statics.fromInline = function (inlineMS, type, currency) {
  const sp = inlineMS.split(':');
  return new Membership({
    version:    constants.DOCUMENTS_VERSION,
    currency:   currency,
    issuer:     sp[0],
    membership: type,
    type:       type,
    number:     parseInt(sp[2]),
    fpr:        sp[2].split('-')[1],
    block:      sp[2],
    certts:     sp[3],
    userid:     sp[4],
    signature:  sp[1]
  });
};

Membership.statics.toInline = function (entity) {
  return [entity.issuer, entity.signature, entity.number, entity.fpr, entity.certts, entity.userid].join(':');
};

Membership.statics.fromJSON = (json) => new Membership(json);

module.exports = Membership;
