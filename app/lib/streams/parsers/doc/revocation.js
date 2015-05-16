"use strict";
var GenericParser = require('./GenericParser');
var util          = require('util');
var split         = require('../../../split');
var rawer         = require('../../../rawer');
var sha1          = require('sha1');
var moment        = require('moment');
var unix2dos      = require('../../../unix2dos');
var constants     = require('../../../constants');

module.exports = RevocationParser;

function RevocationParser (onError) {
  
  var captures = [];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getRevocation, onError);

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
            var timestamp = parseInt(line.match(/TS:(\d+)/)[1]);
            obj.time = new Date(timestamp*1000);
          }
          break;
        case 3:
        case 5:
          if (line.match(constants.SIG)) {
            if (!obj.sig) {
              // Self-certification signature
              obj.sig = line;
            } else {
              // Revocation signature
              obj.revocation = line;
            }
          }
          break;
      }
    }
  };

  this._clean = function (obj) {
    if (obj.uid && obj.time && obj.pubkey) {
      obj.hash = sha1(obj.uid + moment(obj.time).unix() + obj.pubkey).toUpperCase();
    }
  };

  this._verify = function (obj) {
    if (!obj.pubkey) {
      return "No pubkey found";
    }
    if (!obj.uid) {
      return "Wrong user id format";
    }
    if (!obj.time) {
      return "Could not extract signature time";
    }
    if (!obj.sig) {
      return "No signature found for self-certification";
    }

    if (!obj.revocation) {
      return "No revocation signature found";
    }
  };
}

util.inherits(RevocationParser, GenericParser);
