"use strict";
var _ = require('underscore');
var rawer = require('../rawer');
var ucp = require('../ucp');

var Revocation = function(json) {

  var that = this;

  _(json).keys().forEach(function(key) {
   that[key] = json[key];
  });

  this.getRaw = () => rawer.getOfficialRevocation(this);

  this.rawWithoutSig = () => {
    let revocation = this.revocation;
    this.revocation = '';
    let raw = rawer.getOfficialRevocation(this);
    this.revocation = revocation;
    return raw;
  };
};

Revocation.statics = {};

Revocation.statics.fromJSON = (json) => new Revocation(json);

module.exports = Revocation;
