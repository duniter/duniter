var mongoose = require('mongoose');
var _        = require('underscore');
var Schema   = mongoose.Schema;
var logger   = require('../lib/logger')();

var ConfigurationSchema = new Schema({
  currency:    {"type": String, "default": null},
  openpgpjs:   {"type": Boolean, "default": false},
  port:        {"type": Number, "default": 8033},
  ipv4:        {"type": String, "default": "127.0.0.1"},
  ipv6:        {"type": String, "default": null},
  remotehost:  {"type": String, "default": null},
  remoteipv4:  {"type": String, "default": null},
  remoteipv6:  {"type": String, "default": null},
  remoteport:  {"type": Number, "default": null},
  pgpkey:      {"type": String, "default": null},
  pgppasswd:   {"type": String, "default": null},
  kmanagement: {"type": String, "default": "ALL"},
  kaccept:     {"type": String, "default": "ALL"},
  upInterval:  {"type": Number, "default": 3600*1000},
  sigDelay:    {"type": Number, "default": 3600*24*365*5}, // 5 years by default
  sigValidity: {"type": Number, "default": 3600*24*365}, // 1 year by default
  sigQty:      {"type": Number, "default": 5},
  powZeroMin:  {"type": Number, "default": 4},
  powPeriod:   {"type": Number, "default": 1},
  participate: {"type": Boolean, "default": true}, // Participate to writing the keychain
  tsInterval:  {"type": Number, "default": 30},
});

ConfigurationSchema.virtual('createNext').get(function () {
  return this._createNext;
});

ConfigurationSchema.virtual('createNext').set(function (create) {
  this._createNext = create;
});

// Automatic Monetary Contract default parameters:
//  - Voting start: None (must be given)
//  - Voting frequency: 1 day
//  - UD frequency: 1 month (30.4375 days/month)
//  - UD(0): 100 unities
//  - UD % (aka 'c'): 9.22% a year <=> 0.7376575% a month
//  - UD Minimal Coin: none

ConfigurationSchema.pre('save', function (next) {

  if (this.powPeriod >= 1)
    this.powPeriod = parseInt(this.powPeriod);

  if(!this.kmanagement || !this.kmanagement.match(/^(ALL|KEYS)$/)){
    logger.error('Incorrect --kmanagement value, reset to default `KEYS` value');
    this.kmanagement = 'KEYS';
  }
  if(!this.kaccept || !this.kaccept.match(/^(ALL|KEYS)$/)){
    logger.error('Incorrect --kaccept value, reset to default `KEYS` value');
    this.kaccept = 'KEYS';
  }
  this.updated = Date.now();
  next();
});

module.exports = ConfigurationSchema;
