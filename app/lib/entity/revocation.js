"use strict";
const _ = require('underscore');
const rawer = require('duniter-common').rawer;
const Identity = require('./identity');

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

Revocation.statics.fromInline = (inline) => Identity.statics.revocationFromInline(inline);

module.exports = Revocation;
