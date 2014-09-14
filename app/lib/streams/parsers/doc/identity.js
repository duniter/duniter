var GenericParser = require('./GenericParser');
var util          = require('util');
var split         = require('../../../split');
var rawer         = require('../../../rawer');
var sha1          = require('sha1');
var unix2dos      = require('../../../unix2dos');
var jpgp          = require('../../../jpgp');
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
            var timestamp = parseInt(line.match(/TS:(\d+)/)[1]);
            obj.time = new Date(timestamp*1000);
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
            var cert = { from: sp[0], to: sp[1], time: new Date(parseInt(sp[2])*1000), sig: sp[3] };
            obj.certs.push(cert);
          }
          break;
      }
    }
  };

  this._clean = function (obj) {
    if (obj.uid && obj.time && obj.pubkey) {
      obj.hash = sha1(obj.uid + obj.time.timestamp() + obj.pubkey).toUpperCase();
    }
  };

  this._verify = function (obj) {
    if (!obj.pubkey) {
      return "No pubkey found";
    }
    if (!obj.uid) {
      return "Cannot extract udid2";
    }
    if (!obj.time) {
      return "Cannot extract signature time";
    }
    if (!obj.sig) {
      return "No signature found for self-certification";
    }
  };
}

util.inherits(IdentityParser, GenericParser);
