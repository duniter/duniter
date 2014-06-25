var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var parsers  = require('../../app/lib/streams/parsers/doc');
var ucoin    = require('../..');

var Status = require('../../app/models/statusMessage');
var rawStatus = "" +
  "Version: 1\r\n" +
  "Currency: beta_brousouf\r\n" +
  "Status: UP\r\n" +
  "From: 630FF0BE40FAC3C0801620D9734C4575ED412D68\r\n" +
  "To: 5E2BB6D1377695BEAF1EA9BFF34399A4FAB40813\r\n";

describe('Status', function(){

  describe('UP', function(){

    var st;

    before(function(done) {
      var parser = parsers.parseStatus().asyncWrite(rawStatus, function (err, obj) {
        st = new Status(obj);
        done(err);
      });
    });

    it('should be version 1', function(){
      assert.equal(st.version, 1);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(st.currency, 'beta_brousouf');
    });

    it('should have status UP', function(){
      assert.equal(st.status, 'UP');
    });

    it('its computed hash should be 06A5E9B84D2E7865549CDB5C8C958E35F166B513', function(){
      assert.equal(st.hash, '06A5E9B84D2E7865549CDB5C8C958E35F166B513');
    });

    it('its manual hash should be 06A5E9B84D2E7865549CDB5C8C958E35F166B513', function(){
      assert.equal(sha1(st.getRaw()).toUpperCase(), '06A5E9B84D2E7865549CDB5C8C958E35F166B513');
    });
  });
});
