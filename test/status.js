var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var parsers  = require('../app/lib/streams/parsers/doc');
var ucoin    = require('./..');

var Status = require('../app/models/statusMessage');
var rawStatus = "" +
  "Version: 1\r\n" +
  "Currency: beta_brousouf\r\n" +
  "Status: UP\r\n";

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

    it('its computed hash should be 9512566C8EE0994C2D11D09459984362243AF260', function(){
      assert.equal(st.hash, '9512566C8EE0994C2D11D09459984362243AF260');
    });

    it('its manual hash should be 9512566C8EE0994C2D11D09459984362243AF260', function(){
      assert.equal(sha1(st.getRaw()).toUpperCase(), '9512566C8EE0994C2D11D09459984362243AF260');
    });
  });
});
