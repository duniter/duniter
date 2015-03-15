var _ = require('underscore');
var moment = require('moment');
var sha1 = require('sha1');
var rawer = require('../rawer');

var Identity = function(json) {

  var that = this;

  this.revoked = false;
  this.currentMSN = -1;
  this.time = Date.now;
  this.member = false;
  this.kick = false;
  this.leaving = false;
  this.wasMember = false;
  this.signed = [];
  this.certs = [];

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });

  this.written = this.written || this.member;
  this.hash = sha1(this.uid + moment(this.time).unix() + this.pubkey).toUpperCase();

  this.json = function () {
    var others = [];
    this.certs.forEach(function(cert){
      others.push({
        "pubkey": cert.pubkey,
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
        "timestamp": moment(this.time).unix()
      },
      "self": this.sig,
      "others": others
    }];
    var signed = [];
    this.signed.forEach(function(cert) {
      signed.push({
        "uid": cert.idty.uid,
        "pubkey": cert.idty.pubkey,
        "meta": {
          "timestamp": moment(cert.idty.time).unix()
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
    return [this.pubkey, this.sig, moment(this.time).unix(), this.uid].join(':');
  };

  this.selfCert = function () {
    return rawer.getSelfIdentity(this);
  };

  this.selfRevocation = function () {
    return rawer.getSelfRevocation(this);
  };

  this.othersCerts = function () {
    var that = this;
    var certs = [];
    this.certs.forEach(function(cert){
      if (cert.to == that.pubkey) {
        // Signature for this pubkey
        certs.push(cert)
      }
    });
    return certs;
  };

  this.getTargetHash = function () {
    return sha1(this.uid + moment(this.time).unix() + this.pubkey).toUpperCase();
  }
};

Identity.statics = {};

Identity.statics.fromInline = function (inline) {
  var sp = inline.split(':');
  return new Identity({
    pubkey: sp[0],
    sig: sp[1],
    time: new Date(parseInt(sp[2])*1000),
    uid: sp[3]
  });
};

Identity.statics.toInline = function (entity) {
  return [entity.pubkey, entity.sig, moment(entity.time).unix(), entity.uid].join(':');
};

module.exports = Identity;
