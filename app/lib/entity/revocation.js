"use strict";
let _ = require('underscore');
let rawer = require('../ucp/rawer');
let ucp = require('../ucp/buid');

let Revocation = function(json) {

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
