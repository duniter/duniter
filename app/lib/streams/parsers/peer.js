"use strict";
const GenericParser = require('./GenericParser');
const rawer         = require('../../ucp/rawer');
const util          = require('util');
const constants     = require('../../constants');

module.exports = PeerParser;

function PeerParser (onError) {

  const captures = [
    {prop: "version",           regexp: /Version: (.*)/},
    {prop: "currency",          regexp: /Currency: (.*)/},
    {prop: "pubkey",            regexp: /PublicKey: (.*)/},
    {prop: "block",             regexp: constants.PEER.BLOCK},
    {
      prop: "endpoints", regexp: /Endpoints:\n([\s\S]*)/, parser: (str) => str.split("\n")
    }
  ];
  const multilineFields = [];
  GenericParser.call(this, captures, multilineFields, rawer.getPeer, onError);

  this._clean = (obj) => {
    obj.documentType = 'peer';
    obj.endpoints = obj.endpoints || [];
    // Removes trailing space
    if (obj.endpoints.length > 0)
      obj.endpoints.splice(obj.endpoints.length - 1, 1);
    obj.getBMA = function() {
      let bma = null;
      obj.endpoints.forEach((ep) => {
        let matches = !bma && ep.match(constants.BMA_REGEXP);
        if (matches) {
          bma = {
            "dns": matches[2] || '',
            "ipv4": matches[4] || '',
            "ipv6": matches[6] || '',
            "port": matches[8] || 9101
          };
        }
      });
      return bma || {};
    };
  };

  this._verify = (obj) => {
    let err = null;
    const codes = {
      'BAD_VERSION': 150,
      'BAD_CURRENCY': 151,
      'BAD_DNS': 152,
      'BAD_IPV4': 153,
      'BAD_IPV6': 154,
      'BAD_PORT': 155,
      'BAD_FINGERPRINT': 156,
      'BAD_BLOCK': 157,
      'NO_IP_GIVEN': 158
    };
    if(!err){
      // Version
      if(!obj.version || !obj.version.match(constants.DOCUMENTS_VERSION_REGEXP))
        err = {code: codes.BAD_VERSION, message: "Version unknown"};
    }
    if(!err){
      // PublicKey
      if(!obj.pubkey || !obj.pubkey.match(constants.BASE58))
        err = {code: codes.BAD_FINGERPRINT, message: "Incorrect PublicKey field"};
    }
    if(!err){
      // Block
      if(!obj.block)
        err = {code: codes.BAD_BLOCK, message: "Incorrect Block field"};
    }
    // Basic Merkled API requirements
    let bma = obj.getBMA();
    if(!err){
      // DNS
      if(bma.dns && !bma.dns.match(/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/))
        err = {code: codes.BAD_DNS, message: "Incorrect Dns field"};
    }
    if(!err){
      // IPv4
      if(bma.ipv4 && !bma.ipv4.match(/^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/))
        err = {code: codes.BAD_IPV4, message: "Incorrect IPv4 field"};
    }
    if(!err){
      // IPv6
      if(bma.ipv6 && !bma.ipv6.match(/^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(([0-9A-Fa-f]{1,4}:){0,5}:((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|(::([0-9A-Fa-f]{1,4}:){0,5}((b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b).){3}(b((25[0-5])|(1d{2})|(2[0-4]d)|(d{1,2}))b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/))
        err = {code: codes.BAD_IPV6, message: "Incorrect IPv6 field"};
    }
    if(!err){
      // IP
      if(!bma.dns && !bma.ipv4 && !bma.ipv6)
        err = {code: codes.NO_IP_GIVEN, message: "It must be given at least DNS or one IP, either v4 or v6"};
    }
    if(!err){
      // Port
      if(bma.port && !(bma.port + "").match(/^\d+$/))
        err = {code: codes.BAD_PORT, message: "Port must be provided and match an integer format"};
    }
    return err && err.message;
  };
}

util.inherits(PeerParser, GenericParser);
