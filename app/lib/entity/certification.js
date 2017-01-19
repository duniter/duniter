"use strict";
const _ = require('underscore');
const rawer = require('duniter-common').rawer;
const ucp = require('duniter-common').buid;

const Certification = function(json) {

  this.linked = false;

  _(json).keys().forEach((key) => {
    this[key] = json[key];
  });

  this.from  = this.pubkey = this.from || this.pubkey || this.issuer;
  this.block = this.block_number = parseInt(this.block || this.block_number);

  this.getRaw = () => rawer.getOfficialCertification(this);

  this.getTargetHash = () => ucp.format.hashf(this.idty_uid + this.idty_buid + this.idty_issuer);

  this.inline = () => [this.pubkey, this.to, this.block_number, this.sig].join(':');

  this.json = () => {
    return {
      "issuer": this.issuer,
      "timestamp": this.buid,
      "sig": this.sig,
      "target": {
        "issuer": this.idty_issuer,
        "uid": this.idty_uid,
        "timestamp": this.idty_buid,
        "sig": this.idty_sig
      }
    };
  };
};

Certification.statics = {};

Certification.statics.fromInline = function (inline) {
  const sp = inline.split(':');
  return new Certification({
    pubkey: sp[0],
    to: sp[1],
    block_number: parseInt(sp[2]),
    sig: sp[3]
  });
};

Certification.statics.toInline = function (entity, certificationModel) {
  if (certificationModel) {
    let model = new certificationModel();
    _(model.aliases).keys().forEach((aliasKey) => {
      let alias = model.aliases[aliasKey];
      entity[aliasKey] = entity[alias];
    });
  }
  return [entity.pubkey, entity.to, entity.block_number, entity.sig].join(':');
};

Certification.statics.fromJSON = (json) => new Certification(json);

module.exports = Certification;
