"use strict";
var _ = require('underscore');
var rawer = require('../rawer');
var ucp = require('../ucp');

var Certification = function(json) {

  var that = this;

  this.linked = false;

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });

  this.from  = this.pubkey = this.from || this.pubkey || this.issuer;
  this.block = this.block_number = parseInt(this.block || this.block_number);

  this.getRaw = () => rawer.getOfficialCertification(this);

  this.getTargetHash = () => ucp.format.hashf(this.idty_uid + this.idty_buid + this.idty_issuer);

  this.inline = function () {
    return [this.pubkey, this.to, this.block_number, this.sig].join(':');
  };

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
  var sp = inline.split(':');
  return new Certification({
    pubkey: sp[0],
    to: sp[1],
    block_number: parseInt(sp[2]),
    sig: sp[3]
  });
};

Certification.statics.toInline = function (entity, certificationModel) {
  if (certificationModel) {
    var model = new certificationModel();
    _(model.aliases).keys().forEach(function(aliasKey){
      var alias = model.aliases[aliasKey];
      entity[aliasKey] = entity[alias];
    });
  }
  return [entity.pubkey, entity.to, entity.block_number, entity.sig].join(':');
};

Certification.statics.fromJSON = (json) => new Certification(json);

module.exports = Certification;
