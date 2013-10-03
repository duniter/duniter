var should   = require('should');
var assert   = require('assert');
var mongoose = require('mongoose');
var sha1     = require('sha1');
var server   = require('../app/lib/server');


server.database.init();
var Amendment = mongoose.model('Amendment');

var amTest;

describe('Amendment', function(){

  describe('2 (WRONG-UD ONE) of beta_brousouf currency', function(){

    var errCode = 0;
    // Loads amTest with its data
    before(function(done) {
      amTest = new Amendment();
      amTest.loadFromFile(__dirname + "/data/amendments/BB-AM2-WRONG-UD", function(err) {
        amTest.verify("beta_brousouf", function(err, code) {
          errCode = code;
          done();
        });
      });
    });

    it('should be version 1', function(){
      assert.equal(amTest.version, 1);
    });

    it('should have beta_brousouf currency name', function(){
      assert.equal(amTest.currency, 'beta_brousouf');
    });

    it('should be number 2', function(){
      assert.equal(amTest.number, 2);
    });

    it('should have a niversal Dividend of value 122', function(){
      assert.equal(amTest.dividend, 122);
    });

    it('should have a Minimal Coin Power of 3', function(){
      assert.equal(amTest.coinMinPower, 3);
    });

    it('should have verification error code 172', function(){
      assert.equal(errCode, 172);
    });
  });
});