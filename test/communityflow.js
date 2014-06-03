var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var sha1     = require('sha1');
var fs       = require('fs');
var mongoose = require('mongoose');
var server   = require('../app/lib/server');

server.database.init();
var CommunityFlow = mongoose.model('CommunityFlow');

describe('Community flow', function(){

  describe('signed by cat', function(){

    var entry;

    // Loads entry with its data
    before(function(done) {
      entry = new CommunityFlow();
      loadFromFile(entry, __dirname + "/data/communityflows/cat.flow", done);
    });

    it('should be version 1', function(){
      assert.equal(entry.version, 1);
    });

    it('should have beta_brousoufs currency name', function(){
      assert.equal(entry.currency, 'beta_brousouf');
    });

    it('should have key', function(){
      assert.equal(entry.issuer, 'C73882B64B7E72237A2F460CE9CAB76D19A8651E');
    });

    it('should have date', function(){
      should.exist(entry.date);
    });

    it('its computed hash should be E698B2D774C53DE05C58288D97B580BBB67F0D76', function(){
      assert.equal(entry.hash, 'E698B2D774C53DE05C58288D97B580BBB67F0D76');
    });

    it('its manual hash should be E698B2D774C53DE05C58288D97B580BBB67F0D76', function(){
      assert.equal(sha1(entry.getRaw()).toUpperCase(), 'E698B2D774C53DE05C58288D97B580BBB67F0D76');
    });

    it('its manual signed hash should be 3F920BF9F432DEDED58565E2AF180642968A02B0', function(){
      assert.equal(sha1(entry.getRawSigned()).toUpperCase(), '3F920BF9F432DEDED58565E2AF180642968A02B0');
    });
  });
});

function loadFromFile(entry, file, done) {
  fs.readFile(file, {encoding: "utf8"}, function (err, data) {
    if(fs.existsSync(file + ".asc")){
      data += fs.readFileSync(file + '.asc', 'utf8');
    }
    // data = data.unix2dos();
    async.waterfall([
      function (next){
        entry.parse(data, next);
      },
      function (entry, next){
        entry.verify('beta_brousouf', next);
      }
    ], done);
  });
}
