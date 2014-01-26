var jpgp      = require('../lib/jpgp');
var async     = require('async');
var vucoin    = require('vucoin');
var mongoose  = require('mongoose');
var Peer      = mongoose.model('Peer');
var Forward   = mongoose.model('Forward');
var Amendment = mongoose.model('Amendment');
var PublicKey = mongoose.model('PublicKey');
var Merkle    = mongoose.model('Merkle');
var THTEntry  = mongoose.model('THTEntry');
var Key       = mongoose.model('Key');
var log4js    = require('log4js');
var _         = require('underscore');
var logger    = log4js.getLogger();
var plogger      = log4js.getLogger('peering');
var flogger      = log4js.getLogger('forward');
var slogger      = log4js.getLogger('status');
var tlogger      = log4js.getLogger('tht');
var http      = require('../service/HTTPService')();

module.exports = function (pgp, currency, conf) {

  var MerkleService = require('../service/MerkleService');
  var ParametersService = require('../service/ParametersService');
  var THTService = require('../service/THTService').get(currency);
  var PeeringService = require('../service/PeeringService').get(pgp, currency, conf);
}
