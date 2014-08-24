var GenericParser = require('./GenericParser');
var util          = require('util');
var split         = require('../../../split');
var rawer         = require('../../../rawer');
var sha1          = require('sha1');
var unix2dos      = require('../../../unix2dos');
var jpgp          = require('../../../jpgp');

module.exports = PubkeyParser;

var UDID2_FORMAT = /\(udid2;c;([A-Z-]*);([A-Z-]*);(\d{4}-\d{2}-\d{2});(e\+\d{2}\.\d{2}-\d{3}\.\d{2});(\d+)(;?)\)/;

function PubkeyParser (onError) {
  
  var captures = [];
  var multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getPubkey, onError);

  this._parse = function (str, obj) {
    var dosStr = unix2dos(str);
    obj.raw = dosStr;
    obj.hash = sha1(dosStr).toUpperCase();
    var k = jpgp().certificate(obj.raw);
    if (!k.key) return;
    // Extract udid2
    obj.udid2s = getSignedUdid2s(k.key);
    if (obj.udid2s.length) {
      obj.udid2 = obj.udid2s[0];
    }
    // Extracting email, name and comment
    if (k.fingerprint) {
      obj.fingerprint = k.fingerprint;
      obj.hash = sha1(obj.raw).toUpperCase();
      var uid = (obj.udid2 && obj.udid2.uid) || k.uids[0];
      var extract = uid.match(/([\s\S]*) \(([\s\S]*)\) <([\s\S]*)>/);
      if(extract && extract.length === 4){
        obj.name = extract[1];
        obj.comment = extract[2];
        obj.email = extract[3];
      }
      else{
        extract = uid.match(/([\s\S]*) <([\s\S]*)>/);
        if(extract && extract.length === 3){
          obj.name = extract[1];
          obj.comment = '';
          obj.email = extract[2];
        } else {
          extract = uid.match(/([\s\S]*) \(([\s\S]*)\)/);
          if(extract && extract.length === 3) {
          obj.name = extract[1];
            obj.comment = extract[2];
            obj.email = "";
          } else {
            obj.name = "";
            obj.comment = "";
            obj.email = "";
          }
        }
      }
    }
    obj.subkeys = k.subkeys;
  };

  this._verify = function (obj) {
    if (!obj.fingerprint) {
      return "Data does not seem to be a key";
    }
    if (!obj.udid2s) {
      return "Cannot extract udid2";
    }
  };
}

function getSignedUdid2s (key) {
  var validsUdid2 = [];
  for (var i = 0; i < key.users.length; i++) {
    if (!key.users[i].userId || !key.users[i].userId.userid.match(UDID2_FORMAT) || !key.users[i].getValidSelfCertificate(key.primaryKey)) {
      continue;
    }
    validsUdid2.push({ uid: key.users[i].userId.userid, user: key.users[i], nbSigs: (key.users[i].otherCertifications || []).length , signatures: key.users[i].otherCertifications});
  }
  // sort by number of signatures
  validsUdid2 = validsUdid2.sort(function(a, b) {
    if (a.nbSigs > b.nbSigs) {
      return -1;
    } else if (a.nbSigs < b.nbSigs) {
      return 1;
    } else {
      return 0;
    }
  });
  return validsUdid2;
}

util.inherits(PubkeyParser, GenericParser);
