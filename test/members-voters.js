var should    = require('should');
var assert    = require('assert');
var async     = require('async');
var request   = require('supertest');
var fs        = require('fs');
var sha1      = require('sha1');
var _         = require('underscore');
var jpgp      = require('../app/lib/jpgp');
var server    = require('../app/lib/server');
var mongoose  = require('mongoose');
var signatory = require('./tool/signatory');
var test      = require('./tool/test');
var ucoin     = require('./..');
var parsers   = require('../app/lib/streams/parsers/doc');
var logger    = require('../app/lib/logger')('test');

var server;
var currency = "testa";
var now   = new Date().timestamp();
var conf = {
  currency: currency,
  pgpkey: fs.readFileSync(__dirname + "/data/lolcat.priv"),
  pgppasswd: 'lolcat',
  ipv4: '127.0.0.1',
  port: 9107,
  remoteipv4: '127.0.0.1',
  remoteport: 9107,
  kmanagement: 'ALL',
  sync: {
    AMStart: now,
    AMFreq: 1, // Every second
    UDFreq: 2, // Dividend every 2 seconds
    UD0: 145,
    UDPercent: 0.5, // So it can be tested under 4 UD - this ultra high value of UD growth
    Consensus: 2/3,
    MSExpires: 8, // seconds, so AM9 will see ]AM0;AM1] members be kicked out at AM9
    VTExpires: 3 // seconds, so AM4 will see not-actualized voters kicked out
  },
  createNext: true,
  isValidPubkey: function (pubkey, am) {
    // Here we say that a key is no more valid if it is Tobi's & AM9
    return !(pubkey.fingerprint == '2E69197FAB029D8669EF85E82457A1587CA0ED9C' && am.number == 9);
  }
};
var nb = 100;
var tester    = is = on = new test.tester(currency);

var PublicKey   = null;
var Membership  = null;
var Voting      = null;
var Vote        = null;
var Amendment   = null;
var Transaction = null;

var cat   = signatory(fs.readFileSync(__dirname + "/data/lolcat.priv", 'utf8'), "lolcat", "Cat");
var tobi  = signatory(fs.readFileSync(__dirname + "/data/uchiha.priv", 'utf8'), "tobi", "Tobi");
var snow  = signatory(fs.readFileSync(__dirname + "/data/snow.priv", 'utf8'), "snow", "Snow");
// var white = signatory(fs.readFileSync(__dirname + "/data/white.priv", 'utf8'), "white");

var pubkeySnow     = fs.readFileSync(__dirname + '/data/snow.pub', 'utf8');
var pubkeyCat      = fs.readFileSync(__dirname + '/data/lolcat.pub', 'utf8');
// var pubkeyCat2     = fs.readFileSync(__dirname + '/data/lolcat.pub2', 'utf8');
var pubkeyTobi     = fs.readFileSync(__dirname + '/data/uchiha.pub', 'utf8');
// var pubkeyWhite    = fs.readFileSync(__dirname + '/data/white.pub', 'utf8');

var amendments = {
  AM0: {
  currency: 'testa',
    generated: conf.sync.AMStart,
    number: 0,
    dividend: null,
    nextVotes: 2,
    membersCount: 2,
    membersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    votersCount: 2,
    votersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    previousHash: null
  },

  AM0_voters_members: {
  currency: 'testa',
    nextVotes: 2,
    membersCount: 2,
    membersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    votersCount: 2,
    votersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
  },

  AM2: {
    generated: conf.sync.AMStart + 2,
    number: 2,
    dividend: 145,
    nextVotes: 2,
    membersCount: 3,
    membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    membersChanges: [
      "+33BBFC0C67078D72AF128B5BA296CC530126F372"
    ],
    votersCount: 3,
    votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    votersChanges: [
      "+33BBFC0C67078D72AF128B5BA296CC530126F372"
    ]
  },

  AM3: {
    generated: conf.sync.AMStart + 3,
    number: 3,
    nextVotes: 2,
    membersCount: 3,
    membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    membersChanges: [
    ],
    votersCount: 3,
    votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    votersChanges: [
    ]
  },

  AM4: {
    generated: conf.sync.AMStart + 4,
    number: 4,
    dividend: 145,
    nextVotes: 2,
    membersCount: 3,
    membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    membersChanges: [
    ],
    votersCount: 2,
    votersRoot: '5DB500A285BD380A68890D09232475A8CA003DC8',
    votersChanges: [
      "-2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    ]
  }
};

function pksAdd (raw, sig) {
  return function (done) {
    var PubKeyService = server.PublicKeyService;
    async.waterfall([
      async.apply(parsers.parsePubkey().asyncWrite, raw),
      async.apply(PubKeyService.submitPubkey)
    ], function (err, pubkey) {
      done(err, { 
        statusCode: 200,
        text: JSON.stringify(pubkey.json())
      });
    });
  };
}

function join (signatory, timestamp) {
  return memberDo("IN", signatory, timestamp);
}

function leave (signatory, timestamp) {
  return memberDo("OUT", signatory, timestamp);
}

function memberDo (action, signatory, timestamp) {
  var d = new Date();
  d.setTime((timestamp || now)*1000);
  return function (done) {
    var SyncService = server.SyncService;
    var ms = new Membership({
      version: 1,
      currency: currency,
      issuer: signatory.fingerprint(),
      membership: action,
      date: d,
      sigDate: d,
      signature: d.toLocaleString()
    });
    ms.hash = sha1(ms.getRawSigned()).toUpperCase();
    async.series([
      async.apply(SyncService.submit, ms)
    ], function (err, res) {
      if (!err) {
        done(err, { 
          statusCode: 200,
          text: JSON.stringify(res[0].json())
        });
      } else {
        logger.warn(err);
        done(err, { 
          statusCode: 400
        });
      }
    });
  };
}

function voter (signatory, timestamp) {
  return voterDo(signatory, timestamp);
}

function voterDo (signatory, timestamp) {
  var d = new Date();
  d.setTime(timestamp*1000);
  return function (done) {
    var SyncService = server.SyncService;
    var voting = new Voting({
      version: 1,
      currency: currency,
      type: 'VOTING',
      issuer: signatory.fingerprint(),
      date: d,
      sigDate: d,
      signature: "" + d.toLocaleString()
    });
    voting.hash = sha1(voting.getRawSigned()).toUpperCase();
    async.series([
      async.apply(SyncService.submitVoting, voting)
    ], function (err, res) {
      if (!err) {
        done(err, { 
          statusCode: 200,
          text: JSON.stringify(res[0].json())
        });
      } else {
        logger.warn(err);
        done(err, { 
          statusCode: 400
        });
      }
    });
  };
}

function voteCurrent (signatory) {
  return function (done) {
    var ContractService = server.ContractService;
    var am = ContractService.current();
    voteAm(signatory, am, done);
  };
}

function voteProposed (signatory, delay) {
  return function (done) {
    var ContractService = server.ContractService;
    var am = ContractService.proposed();
    voteAm(signatory, am, done, delay);
  };
}

function voteAm (signatory, am, done, delay) {
  var generatedPlusOne = am.generated + 1 + (delay || 0);
  var sigDate = new Date();
  sigDate.setTime(generatedPlusOne*1000);
  var vote = {
    basis: am.number,
    signature: signatory.fingerprint() + am.number + now,
    amendmentHash: sha1(am.getRaw()).toUpperCase(),
    propagated: false,
    selfGenerated: false,
    sigDate: sigDate,
    pubkey: { fingerprint: signatory.fingerprint() }
  };
  vote.amendment = am;
  vote.hash = sha1(new Vote(vote).getRawSigned()).toUpperCase();
  var VoteService = server.VoteService;
  VoteService.submit(vote, function (err) {
    if (!err) {
      done(err, { 
        statusCode: 200,
        text: JSON.stringify(new Vote(vote).json())
      });
    } else {
      logger.warn(err);
      done(err, { 
        statusCode: 400
      });
    }
  });
}

var someTests = {

  voteProposed: function (signatory, expectedAM) {
    var expected = expectedAM || {};
    return tester.verify(
      signatory.name() + " vote for proposed",
      voteProposed(signatory),
      is.expectedSignedAmendment(expected)
    );
  },

  voteCurrent: function (signatory, expectedAM) {
    var expected = expectedAM || {};
    return tester.verify(
      signatory.name() + " vote for current",
      voteCurrent(signatory),
      is.expectedSignedAmendment(expected)
    );
  },

  sendVoting: function (signatory, time, errCode) {
    return tester.verify(
      signatory.name() + " voting",
      voter(signatory, time),
      errCode ?
        is.expectedHTTPCode(errCode) :
        is.expectedVoting(signatory.fingerprint())
    );
  },

  sendOptIN: function (signatory, time, errCode) {
    var label = signatory.name() + " OPT-IN";
    if (time) {
      var delta = (time - now);
      label += ' on ' + (delta >= 0 ? '+' + delta : delta);
    }
     if (errCode) {
      label += ' to be HTTP ' + errCode;
    } else {
      label += ' to be HTTP 200';
    }
    return tester.verify(
      label,
      join(signatory, time),
      errCode ?
        is.expectedHTTPCode(errCode) :
        is.expectedMembership(signatory.fingerprint())
    );
  },

  sendOptOUT: function (signatory, time, errCode) {
    return tester.verify(
      signatory.name() + " OPT-OUT",
      leave(signatory, time),
      errCode ?
        is.expectedHTTPCode(errCode) :
        is.expectedMembership(signatory.fingerprint())
    );
  }
};

var testCases = [

  /**************************
  * Public keys tests
  **/

  tester.verify(
    "Tobi's PUBKEY",
    pksAdd(pubkeyTobi),
    is.expectedPubkey('2E69197FAB029D8669EF85E82457A1587CA0ED9C')
  ),

  testMerkle("/pks/all", '48578F03A46B358C10468E2312A41C6BCAB19417'),

  /**************************
  * Membership tests
  **/

  testProposedAmendment('First proposed amendment, autogenerated on ucoin start', {
    currency: 'testa',
    number: 0,
    membersCount: 0,
    votersCount: 0,
    previousHash: null
  }),

  someTests.sendOptIN(tobi),

  testProposedAmendment('proposed amendment with tobi joining', {
    currency: 'testa',
    number: 0,
    membersCount: 1,
    membersRoot: '2E69197FAB029D8669EF85E82457A1587CA0ED9C',
    votersCount: 0,
    previousHash: null
  }),

  // OPT-IN must be exactly during AM0's interval
  someTests.sendOptIN(cat, now - 1, 400),
  someTests.sendOptIN(cat, now - 3, 400),
  someTests.sendOptIN(cat, now - 184984, 400),
  someTests.sendOptIN(cat, now + 1, 400),
  someTests.sendOptIN(cat, now + 2, 400),
  someTests.sendOptIN(cat, now + 54, 400),
  someTests.sendOptIN(cat, now),

  someTests.sendVoting(tobi, now - 1, 400),
  someTests.sendVoting(tobi, now - 2, 400),
  someTests.sendVoting(tobi, now - 484, 400),
  someTests.sendVoting(tobi, now + 1, 400),
  someTests.sendVoting(tobi, now + 9, 400),
  someTests.sendVoting(tobi, now + 9879, 400),
  someTests.sendVoting(cat, now + 1, 400),

  someTests.sendVoting(tobi, now + 0),
  someTests.sendVoting(cat, now + 0),

  testProposedAmendment('proposed amendment with tobi+cat as members & voters', amendments.AM0),

  // VOTE AM0
  someTests.voteProposed(cat, amendments.AM0), // Promoted
  someTests.voteCurrent(tobi, amendments.AM0),
  testPromotedAmendment(amendments.AM0),
  testPromotedAmendment(amendments.AM0, 0),

  //-------- VOTING : AM1 ------
  tester.verify(
    "Voting AM1 should require 2 votes",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM0_voters_members)
  ),

  tester.verify(
    "Voting AM1 should promote AM1 identical to genesis AM",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM0_voters_members)
  ),
  
  //----------------------------

  /****** AM2
  *
  * Snow publish its pubkey, ask for joining & voting
  */

  tester.verify(
    "Snow's PUBKEY",
    pksAdd(pubkeySnow),
    is.expectedPubkey('33BBFC0C67078D72AF128B5BA296CC530126F372')
  ),

  testMerkle("/pks/all", 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'),

  someTests.sendOptIN(snow, now - 1, 400),
  someTests.sendOptIN(snow, now + 0, 400),
  someTests.sendOptIN(snow, now + 2, 400), // Indeed, AM2 is not current, but NEXT!
  someTests.sendOptIN(snow, now + 1),
  someTests.sendVoting(snow, now - 1, 400),
  someTests.sendVoting(snow, now + 0, 400),
  someTests.sendVoting(snow, now + 2, 400),
  someTests.sendVoting(snow, now + 1),

  // 1/2
  someTests.voteProposed(cat, amendments.AM2),
  testPromotedAmendment(amendments.AM0_voters_members, 1),
  testPromotedAmendment(amendments.AM0_voters_members),

  tester.verify(
    "Snow shouldn't be able to vote N-1 (current)",
    voteCurrent(snow),
    is.expectedHTTPCode(400)
  ),

  testPromotedAmendment(amendments.AM0_voters_members, 1),
  testPromotedAmendment(amendments.AM0_voters_members),

  // 2/2
  someTests.voteProposed(tobi, amendments.AM2),

  testPromotedAmendment(amendments.AM2, 2),
  testPromotedAmendment(amendments.AM2),

  tester.verify(
    "Snow shouldn't be able to vote N (new current)",
    voteCurrent(snow),
    is.expectedHTTPCode(400)
  ),

  /******* We have AM2:

    nextVotes: 2,
    membersCount: 3,
    membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    membersChanges: [
      "+33BBFC0C67078D72AF128B5BA296CC530126F372"
    ],
    votersCount: 3,
    votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    votersChanges: [
      "+33BBFC0C67078D72AF128B5BA296CC530126F372"
    ]

    Let's not make tobi vote, but snow + cat instead.
  */

  tester.verify(
    "Voting AM3 by cat 1v/2v",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM3)
  ),

  testPromotedAmendment(amendments.AM2, 2),
  testPromotedAmendment(amendments.AM2),

  tester.verify(
    "Voting AM3 by snow 2v/2v",
    voteProposed(snow),
    is.expectedSignedAmendment(amendments.AM3)
  ),

  testPromotedAmendment(amendments.AM3, 3),
  testPromotedAmendment(amendments.AM3),

  // So Cat is not kicked from voters!
  someTests.sendVoting(cat, now + 3),

  testProposedAmendment('AM4 should see tobi no more voter', amendments.AM4),

  tester.verify(
    "Tobi voting while having not voted current should not be accepted: already a voter!",
    voter(tobi, now + 4),
    is.expectedHTTPCode(400)
  ),

  // Voting AM4 (ratify tobi's leaving as a voter)
  // Snow wants to stay as voter
  someTests.sendVoting(snow, now + 3),
  someTests.voteProposed(cat),
  someTests.voteProposed(snow),
  testPromotedAmendment(amendments.AM4, 4),
  testPromotedAmendment(amendments.AM4),
  testProposedAmendment('AM5: no changes', { membersChanges: [], votersChanges: [] }),

  // Tobi voting again
  someTests.sendVoting(tobi, now + 4),
  testProposedAmendment('AM5: tobi\'s coming back', {
    membersChanges: [],
    votersChanges: ['+2E69197FAB029D8669EF85E82457A1587CA0ED9C'],
    votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90' }),
  someTests.voteProposed(cat),
  someTests.voteProposed(snow),
  // Now on AM5
  testProposedAmendment('AM6: no changes, but tobi as voter', {
    membersChanges: [],
    votersChanges: [],
    votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90' }),

  someTests.voteProposed(cat),
  someTests.voteProposed(snow),
  // Now on AM6
  // Cat & Snow actualized as voter at AM3 (for AM4), so, with VTExpires = 3, they are kicked at AM 7
  // Tobi       actualized as voter at AM4 (for AM5), so, with VTExpires = 3, he will be kicked at AM 8
  testProposedAmendment('AM7: Cat & Snow are leaving as voters', {
    number: 7,
    votersChanges: ['-33BBFC0C67078D72AF128B5BA296CC530126F372', '-C73882B64B7E72237A2F460CE9CAB76D19A8651E'],
    votersRoot: '2E69197FAB029D8669EF85E82457A1587CA0ED9C' }),
  someTests.sendVoting(cat, now + 5, 400),
  someTests.sendVoting(snow, now + 5, 400),
  someTests.sendVoting(cat, now + 6),
  someTests.sendVoting(snow, now + 6),
  someTests.voteCurrent(tobi),
  testProposedAmendment('AM7: everyone is still here', { votersChanges: [], votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90' }),


  someTests.voteProposed(cat),
  someTests.voteProposed(snow),
  someTests.voteCurrent(tobi),
  someTests.sendOptOUT(cat, now + 7),
  testProposedAmendment('AM8: Cat is leaving?', { membersChanges: ['-C73882B64B7E72237A2F460CE9CAB76D19A8651E'], membersRoot: 'DC7A9229DFDABFB9769789B7BFAE08048BCB856F' }),
  someTests.sendOptOUT(cat, now + 7, 400),
  someTests.sendOptOUT(cat, now + 7, 400),
  someTests.sendVoting(tobi, now + 7),
  someTests.sendVoting(tobi, now + 7, 400),
  someTests.sendVoting(tobi, now + 7, 400),

  someTests.voteProposed(cat),
  someTests.voteProposed(snow),
  // We are now at AM9: memberships received during AM0 MUST be thrown out
  testProposedAmendment('AM9: Tobi is kicked out as its key is no more valid', {
    membersChanges: [
      '-2E69197FAB029D8669EF85E82457A1587CA0ED9C'],
    membersRoot: '33BBFC0C67078D72AF128B5BA296CC530126F372',
    votersChanges: [
      '-2E69197FAB029D8669EF85E82457A1587CA0ED9C'],
    votersRoot: '33BBFC0C67078D72AF128B5BA296CC530126F372'})
];

testCases.splice(nb, testCases.length - nb);

function testMerkle (url, root) {
  return tester.verify(
    "merkle " + url,
    on.doGet(url),
    is.expectedMerkle(root)
  );
}

function testPromotedAmendment (properties, number) {
  return tester.verify(
    number >= 0 ? "proposed amendment #" + number : "current amendment",
    on.doGet("/hdc/amendments/promoted" + (isNaN(number) ? "" : "/" + number)),
    is.expectedAmendment(properties)
  );
}

function testProposedAmendment (label, properties) {
  return tester.verify(
    label,
    on.doGet("/registry/amendment"),
    is.expectedAmendment(properties)
  );
}

before(function (done) {
  logger.debug("Launching server...");
  this.timeout(1000*60); // In seconds
  server = ucoin.createRegistryServer({ name: currency, listenBMA: true, resetData: true }, conf);
  server.on('BMALoaded', function (err, appReady) {
    async.waterfall([
      function (next){
        PublicKey   = server.conn.model('PublicKey');
        Membership  = server.conn.model('Membership');
        Voting      = server.conn.model('Voting');
        Vote        = server.conn.model('Vote');
        Amendment   = server.conn.model('Amendment');
        Transaction = server.conn.model('Transaction');
        tester.app(appReady);
        // Execute all tasks
        async.forEachSeries(testCases, function(testCase, callback){
          logger.trace('----------------------------------');
          logger.trace('Test: %s', testCase.label);
          logger.trace('----------------------------------');
          testCase.task(callback);
        }, next);
      },
      function (next){
        server.disconnect();
        next();
      },
    ], function (err) {
      logger.debug("API fed.");
      done(err);
    });
  });
});

describe('Testing: ', function(){
  testCases.forEach(function(testCase){
    it(testCase.label, function () {
      testCase.test();
    });
  });
});
