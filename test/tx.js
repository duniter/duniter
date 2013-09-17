var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var server   = require('../app/lib/server');

server.database.init();
var Transaction = mongoose.model('Transaction');

describe('Transaction', function(){

  describe('1 (issuance)', function(){

    var tx1;

    // Loads tx1 with its data
    before(function(done) {
      tx1 = new Transaction();
      loadFromFile(tx1, __dirname + "/data/tx/issuance1.tx", done);
    });

    it('should be version 1', function(){
      assert.equal(tx1.version, 1);
    });

    it('should be number 1', function(){
      assert.equal(tx1.number, 1);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(tx1.currency, 'beta_brousouf');
    });

    it('should be ISSUANCE', function(){
      assert.equal(tx1.type, 'ISSUANCE');
    });

    it('should have sender 31A6302161AC8F5938969E85399EB3415C237F93', function(){
      assert.equal(tx1.sender, "31A6302161AC8F5938969E85399EB3415C237F93");
    });

    it('should have recipient 31A6302161AC8F5938969E85399EB3415C237F93', function(){
      assert.equal(tx1.recipient, "31A6302161AC8F5938969E85399EB3415C237F93");
    });

    it('should have 8 coins', function(){
      assert.equal(tx1.getCoins().length, 8);
    });

    it('should have 8 coins without transaction link', function(){
      var coins = tx1.getCoins();
      for (var i = 0; i < coins.length; i++) {
        should.not.exist(coins[i].transaction);
        coins[i].number.should.equal(i + 1);
      };
      coins[0].base.should.equal(5);
      coins[1].base.should.equal(2);
      coins[2].base.should.equal(1);
      coins[3].base.should.equal(1);
      coins[4].base.should.equal(5);
      coins[5].base.should.equal(3);
      coins[6].base.should.equal(1);
      coins[7].base.should.equal(1);
      coins[0].power.should.equal(2);
      coins[1].power.should.equal(2);
      coins[2].power.should.equal(2);
      coins[3].power.should.equal(2);
      coins[4].power.should.equal(1);
      coins[5].power.should.equal(1);
      coins[6].power.should.equal(1);
      coins[7].power.should.equal(1);
    });

    it('should have a comment', function(){
      should.exist(tx1.comment);
    });

    it('its computed hash should be 09C1A32F402A896BC4909F24CD73E9EF86226473', function(){
      assert.equal(tx1.hash, '09C1A32F402A896BC4909F24CD73E9EF86226473');
    });

    it('its manual hash should be 09C1A32F402A896BC4909F24CD73E9EF86226473', function(){
      assert.equal(sha1(tx1.getRaw()).toUpperCase(), '09C1A32F402A896BC4909F24CD73E9EF86226473');
    });
  });

  describe('1 (transfert)', function(){

    var tx1;

    // Loads tx1 with its data
    before(function(done) {
      tx1 = new Transaction();
      loadFromFile(tx1, __dirname + "/data/tx/transfert1.tx", done);
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

    it('should be TRANSFERT', function(){
      assert.equal(tx1.type, 'TRANSFERT');
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
        should.exist(coins[i].transaction);
      };
      coins[0].base.should.equal(5);
      coins[1].base.should.equal(2);
      coins[0].power.should.equal(2);
      coins[1].power.should.equal(2);
    });

    it('should have a comment', function(){
      should.exist(tx1.comment);
    });

    it('its computed hash should be 85E6A838A80893BAAC0F1702F6407BC0E20E3D98', function(){
      assert.equal(tx1.hash, '85E6A838A80893BAAC0F1702F6407BC0E20E3D98');
    });

    it('its manual hash should be 85E6A838A80893BAAC0F1702F6407BC0E20E3D98', function(){
      assert.equal(sha1(tx1.getRaw()).toUpperCase(), '85E6A838A80893BAAC0F1702F6407BC0E20E3D98');
    });
  });

  describe('1 (fusion)', function(){

    var tx1;

    // Loads tx1 with its data
    before(function(done) {
      tx1 = new Transaction();
      loadFromFile(tx1, __dirname + "/data/tx/fusion1.tx", done);
    });

    it('should be version 1', function(){
      assert.equal(tx1.version, 1);
    });

    it('should be number 92', function(){
      assert.equal(tx1.number, 92);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(tx1.currency, 'beta_brousouf');
    });

    it('should be FUSION', function(){
      assert.equal(tx1.type, 'FUSION');
    });

    it('should have sender 31A6302161AC8F5938969E85399EB3415C237F93', function(){
      assert.equal(tx1.sender, "31A6302161AC8F5938969E85399EB3415C237F93");
    });

    it('should have recipient 31A6302161AC8F5938969E85399EB3415C237F93', function(){
      assert.equal(tx1.recipient, "31A6302161AC8F5938969E85399EB3415C237F93");
    });

    it('should have 4 coins', function(){
      assert.equal(tx1.getCoins().length, 4);
    });

    it('should have first coin with transaction link,n ot the others', function(){
      var coins = tx1.getCoins();
      should.not.exist(coins[0].transaction);
      for (var i = 1; i < coins.length; i++) {
        should.exist(coins[i].transaction);
      };
      coins[0].base.should.equal(5);
      coins[1].base.should.equal(3);
      coins[2].base.should.equal(1);
      coins[3].base.should.equal(1);
      coins[0].power.should.equal(1);
      coins[1].power.should.equal(1);
      coins[2].power.should.equal(1);
      coins[3].power.should.equal(1);
    });

    it('should have a comment', function(){
      should.exist(tx1.comment);
    });

    it('its computed hash should be CBB0C2E9A9D5C9150C6DA52E1FD03FA556909A43', function(){
      assert.equal(tx1.hash, 'CBB0C2E9A9D5C9150C6DA52E1FD03FA556909A43');
    });

    it('its manual hash should be CBB0C2E9A9D5C9150C6DA52E1FD03FA556909A43', function(){
      assert.equal(sha1(tx1.getRaw()).toUpperCase(), 'CBB0C2E9A9D5C9150C6DA52E1FD03FA556909A43');
    });
  });

  describe('Tobi ISSUANCE', function(){

    var tx1;

    // Loads tx1 with its data
    before(function(done) {
      tx1 = new Transaction();
      loadFromFile(tx1, __dirname + "/data/tx/tobi.issuance", done);
    });

    it('should be version 1', function(){
      assert.equal(tx1.version, 1);
    });

    it('should be number 0', function(){
      assert.equal(tx1.number, 0);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(tx1.currency, 'beta_brousouf');
    });

    it('should be ISSUANCE', function(){
      assert.equal(tx1.type, 'ISSUANCE');
    });

    it('should have sender 2E69197FAB029D8669EF85E82457A1587CA0ED9C', function(){
      assert.equal(tx1.sender, "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
    });

    it('should have recipient 2E69197FAB029D8669EF85E82457A1587CA0ED9C', function(){
      assert.equal(tx1.recipient, "2E69197FAB029D8669EF85E82457A1587CA0ED9C");
    });

    it('should have 7 coins', function(){
      assert.equal(tx1.getCoins().length, 7);
    });

    it('should have first coin with transaction link,n ot the others', function(){
      var coins = tx1.getCoins();
      for (var i = 0; i < coins.length; i++) {
        should.not.exist(coins[i].transaction);
        coins[i].number.should.equal(i);
      };
      coins[0].base.should.equal(1);
      coins[1].base.should.equal(1);
      coins[2].base.should.equal(1);
      coins[3].base.should.equal(1);
      coins[4].base.should.equal(1);
      coins[5].base.should.equal(1);
      coins[6].base.should.equal(2);
      coins[0].power.should.equal(1);
      coins[1].power.should.equal(1);
      coins[2].power.should.equal(1);
      coins[3].power.should.equal(1);
      coins[4].power.should.equal(1);
      coins[5].power.should.equal(1);
      coins[6].power.should.equal(1);
    });

    it('should have a comment', function(){
      should.exist(tx1.comment);
    });

    it('its computed hash should be 5D2AB118FA861D73B66400DA06015EA2D2158E34', function(){
      assert.equal(tx1.hash, '5D2AB118FA861D73B66400DA06015EA2D2158E34');
    });

    it('its manual hash should be 5D2AB118FA861D73B66400DA06015EA2D2158E34', function(){
      assert.equal(sha1(tx1.getRawSigned()).toUpperCase(), '5D2AB118FA861D73B66400DA06015EA2D2158E34');
    });
  });
});

function loadFromFile(tx, file, done) {
  fs.readFile(file, {encoding: "utf8"}, function (err, data) {
    async.waterfall([
      function (next){
        tx.parse(data, next);
      },
      function (tx, next){
        tx.verify('beta_brousouf', next);
      }
    ], done);
  });
}
