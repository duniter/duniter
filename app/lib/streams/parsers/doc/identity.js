"use strict";
var GenericParser = require('./GenericParser');
var util          = require('util');
var ucp           = require('../../../ucp');
var rawer         = require('../../../rawer');
var sha1          = require('sha1');
var constants     = require('../../../constants');

module.exports = IdentityParser;

function IdentityParser (onError) {
  
  var captures = [];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getIdentity, onError);

  this._parse = function (str, obj) {
    obj.certs = [];
    var lines = str.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      switch (i) {
        case 0:
          if (line.match(constants.PUBLIC_KEY)) {
            obj.pubkey = line;
          }
          break;
        case 1:
          if (line.match(constants.CERT.SELF.UID)) {
            obj.uid = line.split(':')[1];
          }
          break;
        case 2:
          if (line.match(constants.CERT.SELF.META)) {
            obj.buid = ucp.format.buid.fromTS(line);
          }
          break;
        case 3:
          if (line.match(constants.SIG)) {
            obj.sig = line;
          }
          break;
        default:
          if (line.match(constants.CERT.OTHER.INLINE)) {
            var sp = line.split(':');
            var cert = { from: sp[0], to: sp[1], block_number: sp[2], sig: sp[3] };
            obj.certs.push(cert);
          }
          break;
      }
    }
  };

  this._clean = function (obj) {
    obj.documentType = 'identity';
    if (obj.uid && obj.buid && obj.pubkey) {
      obj.hash = sha1(obj.uid + obj.buid + obj.pubkey).toUpperCase();
    }
  };

  this._verify = function (obj) {
    if (!obj.pubkey) {
      return "No pubkey found";
    }
    if (!obj.uid) {
      return "Wrong user id format";
    }
    if (!obj.buid) {
      return "Could not extract signature block uid";
    }
    if (!obj.sig) {
      return "No signature found for self-certification";
    }
  };
}

util.inherits(IdentityParser, GenericParser);
