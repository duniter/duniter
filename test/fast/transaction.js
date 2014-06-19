var should   = require('should');
var assert   = require('assert');
var mongoose = require('mongoose');
var sha1     = require('sha1');
var parsers  = require('../../app/lib/streams/parsers/doc');
var fs       = require('fs');

var tx1;
var tx1Raw = "" +
  "Version: 1\r\n" +
  "Currency: beta_brousouf\r\n" +
  "Sender: 31A6302161AC8F5938969E85399EB3415C237F93\r\n" +
  "Number: 95\r\n" +
  "PreviousHash: 45D873050A5F63F4A801B626C0E95D1CACA6B8AF\r\n" +
  "Recipient: 86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8\r\n" +
  "Coins:\r\n" +
  "31A6302161AC8F5938969E85399EB3415C237F93-1-5\r\n" +
  "2E69197FAB029D8669EF85E82457A1587CA0ED9C-2-2:2E69197FAB029D8669EF85E82457A1587CA0ED9C-6\r\n" +
  "Comment:\r\n" +
  "Here I am sending 2 coins to someone else (either an individual or organization).\r\n";


var Transaction = mongoose.model('Transaction', require('../../app/models/transaction'));

describe('Transaction', function(){

  before(function(done) {
    var parser = parsers.parseTransaction().asyncWrite(tx1Raw, function (err, obj) {
      tx1 = new Transaction(obj);
      done(err);
    });
  });

  it('should be version 1', function(){
    assert.equal(tx1.version, 1);
  });

  it('should be number 95', function(){
    assert.equal(tx1.number, 95);
  });

  it('should have beta_brousoufs currency name', function(){
    assert.equal(tx1.currency, 'beta_brousouf');
  });

  it('should have sender 31A6302161AC8F5938969E85399EB3415C237F93', function(){
    assert.equal(tx1.sender, "31A6302161AC8F5938969E85399EB3415C237F93");
  });

  it('should have recipient 86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8', function(){
    assert.equal(tx1.recipient, "86F7E437FAA5A7FCE15D1DDCB9EAEAEA377667B8");
  });

  it('should have 2 coins', function(){
    assert.equal(tx1.getCoins().length, 2);
  });

  it('should have 2 coins with transaction link', function(){
    var coins = tx1.getCoins();
    for (var i = 0; i < coins.length; i++) {
    };
    should.not.exist(coins[0].transaction);
    should.exist(coins[1].transaction);
    coins[0].issuer.should.equal('31A6302161AC8F5938969E85399EB3415C237F93');
    coins[0].amNumber.should.equal(1);
    coins[0].coinNumber.should.equal(5);
    coins[1].issuer.should.equal('2E69197FAB029D8669EF85E82457A1587CA0ED9C');
    coins[1].amNumber.should.equal(2);
    coins[1].coinNumber.should.equal(2);
    should.exist(coins[1].transaction);
    coins[1].transaction.sender.should.equal('2E69197FAB029D8669EF85E82457A1587CA0ED9C');
    coins[1].transaction.number.should.equal('6');
  });

  it('should have a comment', function(){
    should.exist(tx1.comment);
  });

  it('its computed hash should be 7D7498E695DBB87482EF58C47122EA155FB577B7', function(){
    assert.equal(tx1.hash, '7D7498E695DBB87482EF58C47122EA155FB577B7');
  });

  it('its manual hash should be 7D7498E695DBB87482EF58C47122EA155FB577B7', function(){
    assert.equal(sha1(tx1.getRaw()).toUpperCase(), '7D7498E695DBB87482EF58C47122EA155FB577B7');
  });
});
