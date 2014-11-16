var mongoose = require('mongoose');
var _        = require('underscore');
var Schema   = mongoose.Schema;
var logger   = require('../lib/logger')();

var ConfigurationSchema = new Schema({
  currency:    {"type": String, "default": null},
  c:           {"type": Number, "default": 0.7376575},
  dt:          {"type": Number, "default": 30.4375*24*3600},
  ud0:         {"type": Number, "default": 100},
  port:        {"type": Number, "default": 8033},
  ipv4:        {"type": String, "default": "127.0.0.1"},
  ipv6:        {"type": String, "default": null},
  remotehost:  {"type": String, "default": null},
  remoteipv4:  {"type": String, "default": null},
  remoteipv6:  {"type": String, "default": null},
  remoteport:  {"type": Number, "default": 8033},
  salt:        {"type": String, "default": ""},
  passwd:      {"type": String, "default": ""},
  upInterval:  {"type": Number, "default": 3600*1000},
  stepMax:     {"type": Number, "default": 3}, // Max distance between WoT members and newcomers
  sigDelay:    {"type": Number, "default": 3600*24*365*5}, // 5 years by default
  sigValidity: {"type": Number, "default": 3600*24*365}, // 1 year by default
  msValidity:  {"type": Number, "default": 3600*24*365}, // 1 year by default
  sigQty:      {"type": Number, "default": 5},
  sigWoT:      {"type": Number, "default": 5},
  powZeroMin:  {"type": Number, "default": 1},
  powPeriod:   {"type": Number, "default": 1},
  powDelay:    {"type": Number, "default": 0}, // Delay before starting computation of a new block
  participate: {"type": Boolean, "default": true}, // Participate to writing the blockchain
  tsInterval:  {"type": Number, "default": 30},
  incDateMin:  {"type": Number, "default": 10}, // Increment date on incDateMin'th block with same new Date
  dtDateMin:   {"type": Number, "default": 3600*24}, // Increment date value (default 1 day)
  udid2:       {"type": Boolean, "default": false},
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

ConfigurationSchema.pre('save', function (next) {

  if (this.powPeriod >= 1)
    this.powPeriod = parseInt(this.powPeriod);
  this.updated = Date.now();
  next();
});

module.exports = ConfigurationSchema;
