"use strict";
var _ = require('underscore');
var moment = require('moment');
var rawer = require('../ucp/rawer');
var constants = require('../constants');

var Membership = function(json) {

  var that = this;

  _(json).keys().forEach(function(key) {
    that[key] = json[key];
  });

  this.blockNumber = isNaN(this.number) ? this.number : parseInt(this.number);
  this.blockHash = this.fpr;
  this.version = constants.DOCUMENTS_VERSION;

  this.keyID = function () {
    return this.issuer && this.issuer.length > 24 ? "0x" + this.issuer.substring(24) : "0x?";
  };

  this.copyValues = function(to) {
    var obj = this;
    ["version", "currency", "issuer", "membership", "amNumber", "hash", "signature", "sigDate"].forEach(function (key) {
      to[key] = obj[key];
    });
  };

  this.inline = function() {
    return [this.issuer, this.signature, [this.number, this.fpr].join('-'), this.certts, this.userid].join(':');
  };

  this.json = function() {
    var obj = this;
    var json = {};
    ["version", "currency", "issuer", "membership"].forEach(function (key) {
      json[key] = obj[key];
    });
    json.date = this.date && moment(this.date).unix();
    json.sigDate = this.sigDate && moment(this.sigDate).unix();
    json.raw = this.getRaw();
    return { signature: this.signature, membership: json };
  };

  this.getRaw = function() {
    return rawer.getMembershipWithoutSignature(this);
  };

  this.getRawSigned = function() {
    return rawer.getMembership(this);
  };
};

Membership.statics = {};

Membership.statics.fromInline = function (inlineMS, type, currency) {
  var sp = inlineMS.split(':');
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
