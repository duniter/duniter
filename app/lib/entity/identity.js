"use strict";
const _ = require('underscore');
const hashf = require('../ucp/hashf');
const rawer = require('../ucp/rawer');

const Identity = function(json) {

  this.revoked = false;
  this.revoked_on = null;
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
    const others = [];
    this.certs.forEach((cert) => {
      others.push({
        "pubkey": cert.from,
        "meta": {
          "block_number": cert.block_number,
          "block_hash": cert.block_hash
        },
        "uids": cert.uids,
        "isMember": cert.isMember,
        "wasMember": cert.wasMember,
        "signature": cert.sig
      });
    });
    const uids = [{
      "uid": this.uid,
      "meta": {
        "timestamp": this.buid
      },
      "revoked": this.revoked,
      "revoked_on": this.revoked_on,
      "revocation_sig": this.revocation_sig,
      "self": this.sig,
      "others": others
    }];
    const signed = [];
    this.signed.forEach((cert) => {
      signed.push({
        "uid": cert.idty.uid,
        "pubkey": cert.idty.pubkey,
        "meta": {
          "timestamp": cert.idty.buid
        },
        "cert_time": {
          "block": cert.block_number,
          "block_hash": cert.block_hash
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

  this.createIdentity = () => {
    return rawer.getOfficialIdentity(this);
  };

  this.rawWithoutSig = () => {
    const sig = this.sig;
    this.sig = '';
    const raw = rawer.getOfficialIdentity(this);
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
  const sp = inline.split(':');
  return new Identity({
    pubkey: sp[0],
    sig: sp[1],
    buid: sp[2],
    uid: sp[3]
  });
};

Identity.statics.revocationFromInline = function (inline) {
  const sp = inline.split(':');
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
