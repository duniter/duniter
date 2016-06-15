"use strict";
const _ = require('underscore');
const rawer = require('../ucp/rawer');
const ucp = require('../ucp/buid');

const Revocation = function(json) {

  _(json).keys().forEach((key) => {
   this[key] = json[key];
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
