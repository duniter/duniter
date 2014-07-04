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
  sync:        {"type": Object, "default": {
    AMDaemon:  "OFF", // No deamon by default
    AMFreq:    3600*24, // every day
    UDFreq:    3600*24*30.4375, // every month
    UD0:       100,
    UDPercent: 0.007376575, // 0.73%
    Consensus: 2/3,
    Algorithm: ['AnyKey', '1Sig'],
  }}
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

  // Force sync saving
  var sync = _({}).extend(this.sync);
  this.sync = {};
  this.sync = sync;

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
