"use strict";
var _ = require('underscore');

var Certification = function(json) {

  var that = this;

  this.linked = false;

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });

  this.from = this.fromKey       = this.pubkey = this.from || this.fromKey || this.pubkey;
  this.to = this.toKey           = this.to || this.toKey;
  this.block = this.block_number = this.block || this.block_number;

  this.inline = function () {
    return [this.pubkey, this.to, this.block_number, this.sig].join(':');
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

module.exports = Certification;
