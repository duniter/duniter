var should  = require('should');
var assert  = require('assert');
var async   = require('async');
var fs      = require('fs');
var parsers = require('../../app/lib/streams/parsers/doc');

var isMember = function (keyID, done) {
  done(null, true);
}

var getPubkey = function (keyID, done) {
  if (keyID == 'E9CAB76D19A8651E') {
    done(null, {
      "comment" : "udid2;c;CAT;LOL;2000-04-19;e+43.70-079.42;0;",
      "name" : "LoL Cat",
      "email" : "cem.moreau@gmail.com",
      "raw" : "-----BEGIN PGP PUBLIC KEY BLOCK-----\r\nVersion: OpenPGP.js VERSION\r\nComment: http://openpgpjs.org\r\n\r\n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\nSxwkCr+V2HghBDxZqmr0TYy1\r\n=U+Hq\r\n-----END PGP PUBLIC KEY BLOCK-----\r\n\r\n",
      "fingerprint" : "C73882B64B7E72237A2F460CE9CAB76D19A8651E",
    })
  } else if (keyID == '2457A1587CA0ED9C') {
    done(null, {
      "comment" : "udid2;c;UCHIWA;OBITO;2000-09-30;e+35.69+139.69;0",
      "name" : "Tobi Uchiwa",
      "email" : "cem.moreau@gmail.com",
      "raw" : "-----BEGIN PGP PUBLIC KEY BLOCK-----\r\nVersion: OpenPGP.js VERSION\r\nComment: http://openpgpjs.org\r\n\r\nxsBNBFHG4x4BCADi8J4sSpIv5q2gREBwMj1TCUFDvQDx8/WivLKJ+LgmC2zw\nuuMDYo9YwZBmMe/orZJRSDwslKUARtFzmSui2CR3b4EEr1Hhz9coyqHsF9lY\ndht2YU7i08FOdppRJdk7XuHCABZ+mXeG8WnNMP+9QjRAh3sFDkWpji9iL5Zm\nzlDx6UMXq3lMSvN3VC32X+K2HoQgesm3fTjCBmQik2Ayvp89Ikc2wAWM5/B7\nRCwdHTTysVOE0KkxIIkeus76p+5pvLzrZOvM18ToLxV7KThxVvHn+dj2iOMu\nteY3BylN+XL1J/nBYkOCfsCigMClbWj7IptqDZWmqRbzYgcrOYa8SezxABEB\nAAHNVVRvYmkgVWNoaXdhICh1ZGlkMjtjO1VDSElXQTtPQklUTzsyMDAwLTA5\nLTMwO2UrMzUuNjkrMTM5LjY5OzApIDxjZW0ubW9yZWF1QGdtYWlsLmNvbT7C\nwH0EEwEIACcFAlHG4x4CGwMFCQs75EIFCwkIBwMFFQoJCAsFFgIDAQACHgEC\nF4AACgkQJFehWHyg7ZxljwgAkkV+cXO8kXXCqXdo9hwSprQwbHHfwsovhIvZ\nI9E4Tpce0TXaebflCecDwsPgGyeP8xPUX8pZAvYYw5klREvKn7Vu6NiGrE07\nk7EUCIs+kkPTXeRAv/NpMfJoUOdh+da0ybs+nTO1lJV+cEGqz0OX8yIwrlwh\nrkvnlFWRE/oe3NoJ9f0N7sMXejhs8aTGClXU87GiUAoQ0XC1U8BPLjprkne5\nRMsSVHj3HbVzVQXmreNVDNsvtJVTskGxUE7IzIK80fBZP7OmC+biZuwTqXek\nF6SCqOJjlIsDY4uIL/cCQRkhM1kmeeHcGOQT+6auPtpHXniRxUNOoi7VCWg/\nHS2r9s7ATQRRxuMeAQgA+jCWHHx/kPQxghMBuio36RoR63qQSFxpp2Lx5HIk\nUYhpHE0oGOEEiBG0HrKIv7Qz+4Cs1VHSDCplD+vtRS9PkjOopSxE+ROHjIfT\n0fcjkYT14m2Ftmcqs5/Vw9qBHLhJQPyqIR4TMVuDP5/1LIfnv/EUoisAFcpT\n86CFK1jOGtdTALxDKIk6mlsiPCXD7jlSWw3btJlwydeudTVYBq5OhC/DLREn\n2vgtvqcWjvi4X/ttEWB35EzP11s6gRTv3ldVlXQ13Db+gHrjExRn848bRu0R\n1RzgcpsXOVeyzlzMKFJDXueyCOdiVAyEVPmLHKojwaP+UHlEnwI/v5OMva1V\nsQARAQABwsBlBBgBCAAPBQJRxuMeAhsMBQkLO+RCAAoJECRXoVh8oO2cgiQI\nAKCqxY4LVbHYDywkwI4dAFp4bFlqKDURKzEq8nfDliBLmFrDAv9lFEBbNii7\nY6b3FxaijUTPlJbU9RX8xtPO6bbAujJPyHsi/hBZjqWCqbajbwoNMYzu9nbt\nB2DfxZKYnVijjmb15WuXVC+GN4M+ZCtw+SNrpFTBPUUl4LjBRvUJ9DhjbD2+\nFlqXfDiRLKma0658s2PQZhqajiEswDyo1fAhOykaWCE5pW0DHl2Fizc77/QD\ne7iQa8ZRWp8Q/w0FJE2bXb3Paxtd40XURVOGRmtNvLPTKXIgxFi2dTCBQz6o\nTeajOjun6x6BUJVUbnJ40YmlqYbXqHyI9AcVMMEsLdw=\r\n=j8Ju\r\n-----END PGP PUBLIC KEY BLOCK-----\r\n\r\n",
      "fingerprint" : "2E69197FAB029D8669EF85E82457A1587CA0ED9C",
    });
  } else {
    done('Key was not found');
  }
}

var AnyKey = require('../../app/lib/algos/community/AnyKey');
var OneSig = require('../../app/lib/algos/community/1Sig')(isMember, getPubkey);

var pubkeyCatRaw = fs.readFileSync(__dirname + '/../data/lolcat.pub', 'utf8');
var pubkeySnowRaw = fs.readFileSync(__dirname + '/../data/snow.pub', 'utf8');

var amGenerated = 1403301600;
var aYear = 24*3600*365.25;
var theDay = new Date(amGenerated * 1000);
var theDayAYearBefore = new Date((amGenerated - aYear) * 1000);
var POSITIVE = 1;
var NEGATIVE = -1;
var NO_CHANGES = 0;

var doingNothing = {
  currentMembership: null,
  nextMembership:    null,
  currentVoting:     null,
  nextVoting:        null,
};

var justJoining = {
  currentMembership: null,
  nextMembership:    { membership: 'IN', date: theDay },
  currentVoting:     null,
  nextVoting:        null,
};

var justLeaving = {
  currentMembership: { membership: 'IN' },
  nextMembership:    { membership: 'OUT', date: theDay },
  currentVoting:     null,
  nextVoting:        null,
};

var askingToVote = {
  currentMembership: { membership: 'IN' },
  nextMembership:    null,
  currentVoting:     null,
  nextVoting:        { date: theDay },
};

var askingToVoteFutureMember = {
  currentMembership: null,
  nextMembership:    { membership: 'IN', date: theDay },
  currentVoting:     null,
  nextVoting:        { date: theDay },
};

var askingToLeave = {
  currentMembership: { membership: 'IN' },
  nextMembership:    { membership: 'OUT', date: theDay },
  currentVoting:     { date: theDay },
  nextVoting:        null,
};

var aStaticOldVoter = {
  currentMembership: { membership: 'IN' },
  nextMembership:    null,
  currentVoting:     { date: theDayAYearBefore },
  nextVoting:        null,
};

var aStaticOldMember = {
  currentMembership: { membership: 'IN', date: theDayAYearBefore },
  nextMembership:    null,
  currentVoting:     null,
  nextVoting:        null,
};

describe('AnyKey:', function(){

  var pubkey = { raw: pubkeyCatRaw };

  it('a non-member doing nothing', function (done) {
    AnyKey(pubkey, doingNothing, { generated: amGenerated },              expect(NO_CHANGES, NO_CHANGES, done));
  });

  it('a non-member wants to join', function (done) {
    AnyKey(pubkey, justJoining, { generated: amGenerated },              expect(POSITIVE, NO_CHANGES, done));
  });

  it('a member wants to leave', function (done) {
    AnyKey(pubkey, justLeaving, { generated: amGenerated },              expect(NEGATIVE, NEGATIVE, done));
  });

  it('a member wants to vote', function (done) {
    AnyKey(pubkey, askingToVote, { generated: amGenerated },             expect(NO_CHANGES, POSITIVE, done));
  });

  it('a future member wants to vote', function (done) {
    AnyKey(pubkey, askingToVoteFutureMember, { generated: amGenerated }, expect(POSITIVE, POSITIVE, done));
  });

  it('a voter wants to leave as a member', function (done) {
    AnyKey(pubkey, askingToLeave, { generated: amGenerated },            expect(NEGATIVE, NEGATIVE, done));
  });

  it('a too old voter should be kicked from voters', function (done) {
    AnyKey(pubkey, aStaticOldVoter, { generated: amGenerated },          expect(NO_CHANGES, NEGATIVE, done));
  });

  it('no too old member exist in AnyKey algorithm', function (done) {
    AnyKey(pubkey, aStaticOldMember, { generated: amGenerated },          expect(NO_CHANGES, NO_CHANGES, done));
  });
});

describe('1Sig:', function(){

  var pubkey1Sig = { raw: pubkeyCatRaw, nbVerifiedSigs: 1 };
  var pubkeyNSig = { raw: pubkeyCatRaw, nbVerifiedSigs: 23 };

  it('a non-member doing nothing', function (done) {
    async.series([
      function(cb) { OneSig(pubkey1Sig, doingNothing, { generated: amGenerated },              expect(NO_CHANGES, NO_CHANGES, cb)) },
      function(cb) { OneSig(pubkeyNSig, doingNothing, { generated: amGenerated },              expect(NO_CHANGES, NO_CHANGES, cb)) },
    ], done);
  });

  it('a non-member wants to join', function (done) {
    async.series([
      function(cb) { OneSig(pubkey1Sig, justJoining, { generated: amGenerated },               expect(POSITIVE, NO_CHANGES, cb)) },
      function(cb) { OneSig(pubkeyNSig, justJoining, { generated: amGenerated },               expect(POSITIVE, NO_CHANGES, cb)) },
    ], done);
  });

  it('a member wants to leave', function (done) {
    async.series([
      function(cb) { OneSig(pubkey1Sig, justLeaving, { generated: amGenerated },               expect(NEGATIVE, NEGATIVE, cb)) },
      function(cb) { OneSig(pubkeyNSig, justLeaving, { generated: amGenerated },               expect(NEGATIVE, NEGATIVE, cb)) },
    ], done);
  });

  it('a member wants to vote', function (done) {
    async.series([
      function(cb) { OneSig(pubkey1Sig, askingToVote, { generated: amGenerated },              expect(NO_CHANGES, POSITIVE, cb)) },
      function(cb) { OneSig(pubkeyNSig, askingToVote, { generated: amGenerated },              expect(NO_CHANGES, POSITIVE, cb)) },
    ], done);
  });

  it('a future member wants to vote', function (done) {
    async.series([
      function(cb) { OneSig(pubkey1Sig, askingToVoteFutureMember, { generated: amGenerated },  expect(POSITIVE, POSITIVE, cb)) },
      function(cb) { OneSig(pubkeyNSig, askingToVoteFutureMember, { generated: amGenerated },  expect(POSITIVE, POSITIVE, cb)) },
    ], done);
  });

  it('a voter wants to leave as a member', function (done) {
    async.series([
      function(cb) { OneSig(pubkey1Sig, askingToLeave, { generated: amGenerated },             expect(NEGATIVE, NEGATIVE, cb)) },
      function(cb) { OneSig(pubkeyNSig, askingToLeave, { generated: amGenerated },             expect(NEGATIVE, NEGATIVE, cb)) },
    ], done);
  });

  it('a too old voter should be kicked from voters', function (done) {
    async.series([
      function(cb) { OneSig(pubkey1Sig, aStaticOldVoter, { generated: amGenerated },           expect(NO_CHANGES, NEGATIVE, cb)) },
      function(cb) { OneSig(pubkeyNSig, aStaticOldVoter, { generated: amGenerated },           expect(NO_CHANGES, NEGATIVE, cb)) },
    ], done);
  });

  it('no too old member exist in 1Sig algorithm', function (done) {
    async.series([
      function(cb) { OneSig(pubkey1Sig, aStaticOldMember, { generated: amGenerated },          expect(NO_CHANGES, NO_CHANGES, cb)) },
      function(cb) { OneSig(pubkeyNSig, aStaticOldMember, { generated: amGenerated },          expect(NO_CHANGES, NO_CHANGES, cb)) },
    ], done);
  });

});

describe('1Sig (with non-eligible pubkey):', function(){

  // Testing wrong number of signatures

  var wrongPubkey = { raw: pubkeySnowRaw };

  it('a non-member doing nothing', function (done) {
    OneSig(wrongPubkey, doingNothing, { generated: amGenerated },              expect(NEGATIVE, NEGATIVE, done));
  });

  it('a non-member wants to join', function (done) {
    OneSig(wrongPubkey, justJoining, { generated: amGenerated },              expect(NEGATIVE, NEGATIVE, done));
  });

  it('a member wants to leave', function (done) {
    OneSig(wrongPubkey, justLeaving, { generated: amGenerated },              expect(NEGATIVE, NEGATIVE, done));
  });

  it('a member wants to vote', function (done) {
    OneSig(wrongPubkey, askingToVote, { generated: amGenerated },             expect(NEGATIVE, NEGATIVE, done));
  });

  it('a future member wants to vote', function (done) {
    OneSig(wrongPubkey, askingToVoteFutureMember, { generated: amGenerated }, expect(NEGATIVE, NEGATIVE, done));
  });

  it('a voter wants to leave as a member', function (done) {
    OneSig(wrongPubkey, askingToLeave, { generated: amGenerated },            expect(NEGATIVE, NEGATIVE, done));
  });

  it('a too old voter should be kicked from voters', function (done) {
    OneSig(wrongPubkey, aStaticOldVoter, { generated: amGenerated },          expect(NEGATIVE, NEGATIVE, done));
  });

  it('no too old member exist in 1Sig algorithm', function (done) {
    OneSig(wrongPubkey, aStaticOldMember, { generated: amGenerated },          expect(NEGATIVE, NEGATIVE, done));
  });
});

function expect (membershipIndicator, voterIndicator, done) {
  return function (err, indicators) {
    should.not.exist(err);
    should.exist(indicators);
    should.exist(indicators.membership);
    should.exist(indicators.key);
    indicators.membership.should.equal(membershipIndicator);
    indicators.key.should.equal(voterIndicator);
    done();
  };
}