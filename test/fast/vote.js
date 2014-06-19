var should   = require('should');
var assert   = require('assert');
var mongoose = require('mongoose');
var sha1     = require('sha1');
var common   = require('../../app/lib/common');
var parsers  = require('../../app/lib/streams/parsers/doc');
var fs       = require('fs');

var AM0 = "" +
  "Version: 1\r\n" +
  "Currency: beta_brousouf\r\n" +
  "Number: 0\r\n" +
  "GeneratedOn: 1398895200\r\n" +
  "NextRequiredVotes: 1\r\n" +
  "MembersRoot: 2A22E19061A41EB95F628F7EFB8FB2DAF6BAB4FE\r\n" +
  "MembersCount: 3\r\n" +
  "MembersChanges:\r\n" +
  "+2E69197FAB029D8669EF85E82457A1587CA0ED9C\r\n" +
  "+C73882B64B7E72237A2F460CE9CAB76D19A8651E\r\n" +
  "+D049002A6724D35F867F64CC087BA351C0AEB6DF\r\n" +
  "VotersRoot: D049002A6724D35F867F64CC087BA351C0AEB6DF\r\n" +
  "VotersCount: 1\r\n" +
  "VotersChanges:\r\n" +
  "+D049002A6724D35F867F64CC087BA351C0AEB6DF\r\n" +
  "-----BEGIN PGP SIGNATURE-----\r\n" +
  "Version: GnuPG v1\r\n" +
  "\r\n" +
  "iQEcBAABCAAGBQJThMLnAAoJEAh7o1HArrbf/ooH+wYzibvx66254R9FJfNz/miQ\r\n" +
  "9GWzSbB5l+3Megxgrg3kl/OrJxcDr+o8/xxdtxROFRkwBfPkg4TNBmcFd6u0aLZp\r\n" +
  "WSGBVgBlTaD18QGNVZQnrMsY9E4Ih+v+bg6tMGNnS2evqH2/OVcNO/gq4HfTxje/\r\n" +
  "Ce6UdMpvFyZBXJlfclPhZtfB3sxQ8qpd+7X6ih2p2BLLPmmgHbL7995X0kjNZUqN\r\n" +
  "UlNKbm0sFeOq3Ta01BIUx/u80oUNXoC/JemlpbiHsMrAtL1ZDT+CM5WrEKVdVidy\r\n" +
  "jV6QcnZqUcO7Yfvf8z2yPN92W9OQJrTA8wjIjjJm5Dq5LbTi4C/jlQl4+uKvOg8=\r\n" +
  "=GqZy\r\n" +
  "-----END PGP SIGNATURE-----\r\n";
 
var Vote = mongoose.model('Vote', require('../../app/models/vote'));
var Amendment = mongoose.model('Amendment', require('../../app/models/amendment'));
var v;

describe('Vote', function(){

  describe('0 of beta_brousouf currency', function(){

    // Loads v with its data
    before(function(done) {
      // var parser = parsers.parseAmendment();
      var parser = parsers.parseVote(function (err) {
        done(err);
      });

      parser.end(AM0);
      parser.on('readable', function () {
        var parsed = parser.read();
        v = new Vote(parsed);
        v.amendment = new Amendment(parsed.amendment);
        done();
      });
    });

    it('should be version 1', function(){
      assert.equal(v.amendment.version, 1);
    });

    it('should have beta_brousouf currency name', function(){
      assert.equal(v.amendment.currency, 'beta_brousouf');
    });

    it('should be number 0', function(){
      assert.equal(v.amendment.number, 0);
    });

    it('should have no Universal Dividend', function(){
      should.not.exist(v.amendment.dividend);
    });

    it('should have no Minimal Coin Power', function(){
      should.not.exist(v.amendment.coinMinPower);
    });

    it('should have no previous hash', function(){
      should.not.exist(v.amendment.previousHash);
    });

    it('should have no members status root', function(){
      should.not.exist(v.amendment.membersStatusRoot);
    });

    it('should have 2A22E19061A41EB95F628F7EFB8FB2DAF6BAB4FE members hash', function(){
      assert.equal('2A22E19061A41EB95F628F7EFB8FB2DAF6BAB4FE', v.amendment.membersRoot);
    });

    it('should have the following 3 new members', function(){
      var newMembers = v.amendment.getNewMembers();
      assert.equal(newMembers.length, 3);
      assert.equal(v.amendment.membersCount, 3);
      assert.equal(newMembers[0], "2E69197FAB029D8669EF85E82457A1587CA0ED9C"); // Obito Uchiwa
      assert.equal(newMembers[1], "C73882B64B7E72237A2F460CE9CAB76D19A8651E"); // John Snow
      assert.equal(newMembers[2], "D049002A6724D35F867F64CC087BA351C0AEB6DF"); // LoL Cat
    });

    it('should have D049002A6724D35F867F64CC087BA351C0AEB6DF voters hash', function(){
      assert.equal('D049002A6724D35F867F64CC087BA351C0AEB6DF', v.amendment.votersRoot);
    });

    it('should have the following 1 new voter', function(){
      var newVoters = v.amendment.getNewVoters();
      assert.equal(newVoters.length, 1);
      assert.equal(v.amendment.votersCount, 1);
      assert.equal(newVoters[0], "D049002A6724D35F867F64CC087BA351C0AEB6DF");
    });

    it('should have no voters signatures root', function(){
      should.not.exist(v.amendment.votersSigRoot);
    });

    it('its computed hash should be 65A55999086155BF6D3E4EB5D475E46E4E2307D2', function(){
      assert.equal(v.amendment.hash, '65A55999086155BF6D3E4EB5D475E46E4E2307D2');
    });

    it('its manual hash should be 65A55999086155BF6D3E4EB5D475E46E4E2307D2', function(){
      assert.equal(sha1(v.amendment.getRaw()).toUpperCase(), '65A55999086155BF6D3E4EB5D475E46E4E2307D2');
    });

    it('its computed SIGNED hash should be 2D5E939799C37BEFAE43629E9962D47B1E6742A8', function(){
      assert.equal(v.hash, '2D5E939799C37BEFAE43629E9962D47B1E6742A8');
    });

    it('its manual SIGNED hash should be 2D5E939799C37BEFAE43629E9962D47B1E6742A8', function(){
      assert.equal(sha1(v.getRawSigned()).toUpperCase(), '2D5E939799C37BEFAE43629E9962D47B1E6742A8');
    });
  });
});