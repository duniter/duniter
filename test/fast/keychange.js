var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var fs       = require('fs');
var openpgp  = require('openpgp');
var base64   = require('../../app/lib/base64');
var jpgp     = require('../../app/lib/jpgp');
var mongoose = require('mongoose');
var rawer    = require('../../app/lib/rawer');
var parsers  = require('../../app/lib/streams/parsers/doc');

var keychangeRaw = "" +
  "#####----F:C73882B64B7E72237A2F460CE9CAB76D19A8651E----#####\r\n" +
  "KeyPackets:\r\n" +
  "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\r\n" +
  "SxwkCr+V2HghBDxZqmr0TYy1\r\n" +
  "Membership:\r\n" +
  "1:C73882B64B7E72237A2F460CE9CAB76D19A8651E:IN:1408115509:LoL Cat (udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;) <cem.moreau@gmail.com>\r\n" +
  "iQEcBAABAgAGBQJT7iVTAAoJEOnKt20ZqGUeUm0IAM8KNv4+/iMEmQux/n0NIcfD\r\n" +
  "1eo/eo44dn0vxhkN3jbWHrCSJLiN7UvlfOyle5hiK+Ods/eipLZBiSROhTRyt1Y2\r\n" +
  "Z+pxn+zGPFq/cmo8CHV+y/hTxYGwHJBE6+TJ+1xpRvMrTm4qLm6n/dZ/qVPPivRE\r\n" +
  "xWYBMK1f7NzmqsrbiK27L8gxIZy/6CCBCkmcAnOPcOGQ4fiQcvjkCRqKZg6+MXCi\r\n" +
  "W3e3YNwcGYmNDs5/wpgZ0rpP391SNKuADG3dQHcTA91A9Suxlz0gmnsNCV90SjsN\r\n" +
  "KagV6MtZ05SDuf3ZvJxQI/6ReL6KeOIsrpolTBeJGMsU1/+9l8zh5fEgDcJqSkw=\r\n" +
  "=3Iri\r\n";


describe('Founder packet (Cat)', function(){

  var keychange;

  before(function(done) {
    var parser = parsers.parseKeychange().asyncWrite(keychangeRaw, function (err, obj) {
      keychange = obj;
      done(err);
    });
  });

  it('should be FOUNDER packt type', function(){
    assert.equal(keychange.type, 'F');
  });

  it('should be LoL Cat\' fingerprint', function(){
    assert.equal(keychange.fingerprint, 'C73882B64B7E72237A2F460CE9CAB76D19A8651E');
  });

  it('should have 4 key packets', function(){
    var pubkeyPackets = keychange.keypackets;
    var packetList = new openpgp.packet.List();
    packetList.read(base64.decode(pubkeyPackets));
    var pubkey = new openpgp.key.Key(packetList);
    assert.equal(packetList.length, 7);
    assert.equal(pubkey.primaryKey.getFingerprint().toUpperCase(), 'C73882B64B7E72237A2F460CE9CAB76D19A8651E');
  });

  it('should have empty certification packets', function(){
    assert.equal(keychange.certpackets, '');
  });

  it('should match original raw', function(){
    assert.equal(keychangeRaw, rawer.getKeychange(keychange));
  });
});
