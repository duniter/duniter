var jpgp       = require('../lib/jpgp');
var async      = require('async');
var mongoose   = require('mongoose');
var _          = require('underscore');
var Membership = mongoose.model('Membership');
var Amendment  = mongoose.model('Amendment');
var PublicKey  = mongoose.model('PublicKey');
var Merkle     = mongoose.model('Merkle');

module.exports = function (pgp, currency, conf) {

  this.community = require('./community')(pgp, currency, conf);
  this.amendments = require('./amendments')(pgp, currency, conf);
  
  return this;
}
