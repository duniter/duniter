var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var parsers  = require('../../app/lib/streams/parsers/doc');
var ucoin    = require('../../index');

var Status = require('../../app/lib/entity/status');
var rawStatus = "" +
  "Version: 1\n" +
  "Type: Status\n" +
  "Currency: beta_brousouf\n" +
  "Status: UP\n" +
  "Block: 0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709\n" +
  "From: 3Z7w5g4gC9oxwEbATnmK2UFgGWhLZPmZQb5dRxvNrXDu\n" +
  "To: 6GCnm36t4DnvoJshCYS13i64PxsqyJnGxuNXkzt9Rkh7\n" +
  "bvuKzc6+cGWMGC8FIkZHN8kdQhaRL/MK60KYyw5vJqkKEgxXbygQHAzfoojeSY4gPKIu4FggBkR1HndSEm2FAQ==\n";

describe('Status', function(){

  describe('UP', function(){

    var st;

    before(function(done) {
      parsers.parseStatus().asyncWrite(rawStatus, function (err, obj) {
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
  });
});
