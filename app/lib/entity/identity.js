"use strict";
var _ = require('underscore');
var hashf = require('../ucp/hashf');
var rawer = require('../ucp/rawer');

var Identity = function(json) {

  this.revoked = false;
  this.currentMSN = -1;
  this.currentINN = -1;
  this.member = false;
  this.buid = '';
  this.kick = false;
  this.leaving = false;
  this.wasMember = false;
  this.signed = [];
  this.certs = [];
  this.memberships = [];

  _(json).keys().forEach((key) => {
    this[key] = json[key];
  });

  this.issuer = this.pubkey = (this.issuer || this.pubkey);
  this.kick = !!this.kick;
  this.wasMember = !!this.wasMember;
  this.written = this.written || this.wasMember;
  this.hash = hashf(this.uid + this.buid + this.pubkey).toUpperCase();
  this.memberships = this.memberships || [];

  this.json = () => {
    let others = [];
    this.certs.forEach((cert) => {
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
    let uids = [{
      "uid": this.uid,
      "meta": {
        "timestamp": this.buid
      },
      "revoked": this.revoked,
      "revocation_sig": this.revocation_sig,
      "self": this.sig,
      "others": others
    }];
    let signed = [];
    this.signed.forEach((cert) => {
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

  this.inline = () => {
    return [this.pubkey, this.sig, this.buid, this.uid].join(':');
  };

  this.selfCert = () => {
    return rawer.getOfficialIdentity(this);
  };

  this.rawWithoutSig = () => {
    let sig = this.sig;
    this.sig = '';
    let raw = rawer.getOfficialIdentity(this);
    this.sig = sig;
    return raw;
  };

  this.getTargetHash = () => {
    return hashf(this.uid + this.buid + this.pubkey).toUpperCase();
  };

  if (!this.hash) {
    this.hash = this.getTargetHash();
  }
};

Identity.statics = {};

Identity.statics.fromInline = function (inline) {
  let sp = inline.split(':');
  return new Identity({
    pubkey: sp[0],
    sig: sp[1],
    buid: sp[2],
    uid: sp[3]
  });
};

Identity.statics.revocationFromInline = function (inline) {
  let sp = inline.split(':');
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
