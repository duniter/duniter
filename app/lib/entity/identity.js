"use strict";
var _ = require('underscore');
var hashf = require('../hashf');
var rawer = require('../rawer');

var Identity = function(json) {

  var that = this;

  this.revoked = false;
  this.currentMSN = -1;
  this.member = false;
  this.buid = '';
  this.kick = false;
  this.leaving = false;
  this.wasMember = false;
  this.signed = [];
  this.certs = [];
  this.memberships = [];

  _(json).keys().forEach(function(key) {
    that[key] = json[key];
  });

  this.kick = !!this.kick;
  this.wasMember = !!this.wasMember;
  this.written = this.written || this.wasMember;
  this.hash = hashf(this.uid + this.buid + this.pubkey).toUpperCase();
  this.memberships = this.memberships || [];

  this.json = function () {
    var others = [];
    this.certs.forEach(function(cert){
      others.push({
        "pubkey": cert.from,
        "meta": {
          "block_number": cert.block_number
        },
        "uids": cert.uids,
        "isMember": cert.isMember,
        "wasMember": cert.wasMember,
        "signature": cert.sig
      });
    });
    var uids = [{
      "uid": this.uid,
      "meta": {
        "timestamp": this.buid
      },
      "revoked": this.revoked,
      "revocation_sig": this.revocation_sig,
      "self": this.sig,
      "others": others
    }];
    var signed = [];
    this.signed.forEach(function(cert) {
      signed.push({
        "uid": cert.idty.uid,
        "pubkey": cert.idty.pubkey,
        "meta": {
          "timestamp": cert.idty.buid
        },
        "isMember": cert.idty.member,
        "wasMember": cert.idty.wasMember,
        "signature": cert.sig
      });
    });
    return {
      "pubkey": this.pubkey,
      "uids": uids,
      "signed": signed
    };
  };

  this.inline = function () {
    return [this.pubkey, this.sig, this.buid, this.uid].join(':');
  };

  this.selfCert = function () {
    return rawer.getOfficialIdentity(this);
  };

  this.rawWithoutSig = () => {
    let sig = this.sig;
    this.sig = '';
    let raw = rawer.getOfficialIdentity(this);
    this.sig = sig;
    return raw;
  };

  this.getTargetHash = function () {
    return hashf(this.uid + this.buid + this.pubkey).toUpperCase();
  };
};

Identity.statics = {};

Identity.statics.fromInline = function (inline) {
  var sp = inline.split(':');
  return new Identity({
    pubkey: sp[0],
    sig: sp[1],
    buid: sp[2],
    uid: sp[3]
  });
};

Identity.statics.revocationFromInline = function (inline) {
  var sp = inline.split(':');
  return {
    pubkey: sp[0],
    sig: sp[1]
  };
};

Identity.statics.toInline = function (entity) {
  return [entity.pubkey, entity.sig, entity.buid, entity.uid].join(':');
};

Identity.statics.fromJSON = (json) => new Identity(json);

module.exports = Identity;
