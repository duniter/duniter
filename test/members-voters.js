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

var currency = "testa";
var tester    = is = on = new test.tester(currency);

console.log("Reading files & initializing...");

server.database.init();

var PublicKey  = mongoose.model('PublicKey');
var Membership = mongoose.model('Membership');
var Voting     = mongoose.model('Voting');
var Vote       = mongoose.model('Vote');
var Amendment  = mongoose.model('Amendment');

var now   = new Date().timestamp();
var cat   = signatory(fs.readFileSync(__dirname + "/data/lolcat.priv", 'utf8'), "lolcat");
var tobi  = signatory(fs.readFileSync(__dirname + "/data/uchiha.priv", 'utf8'), "tobi");
// var snow  = signatory(fs.readFileSync(__dirname + "/data/snow.priv", 'utf8'), "snow");
// var white = signatory(fs.readFileSync(__dirname + "/data/white.priv", 'utf8'), "white");

// var pubkeySnow     = fs.readFileSync(__dirname + '/data/snow.pub', 'utf8');
// var pubkeySnowSig  = fs.readFileSync(__dirname + '/data/snow.pub.asc', 'utf8');
var pubkeyCat      = fs.readFileSync(__dirname + '/data/lolcat.pub', 'utf8');
// var pubkeyCat2     = fs.readFileSync(__dirname + '/data/lolcat.pub2', 'utf8');
var pubkeyCatSig   = fs.readFileSync(__dirname + '/data/lolcat.pub.asc', 'utf8');
var pubkeyTobi     = fs.readFileSync(__dirname + '/data/uchiha.pub', 'utf8');
var pubkeyTobiSig  = fs.readFileSync(__dirname + '/data/uchiha.pub.asc', 'utf8');
// var pubkeyTobiSig2 = fs.readFileSync(__dirname + '/data/uchiha.pub.asc2', 'utf8');
// var pubkeyWhite    = fs.readFileSync(__dirname + '/data/white.pub', 'utf8');
// var pubkeyWhiteSig = fs.readFileSync(__dirname + '/data/white.pub.asc', 'utf8');

var config = {
  server: {
    port: 8002,
    pgp: {
      key: __dirname + "/data/lolcat.priv",
      password: "lolcat"
    },
  },
  db: {
    database : currency,
    host: "localhost"
  }
};

// Update conf
if(config.server.pgp.key) config.server.pgp.key = fs.readFileSync(config.server.pgp.key, 'utf8');
var conf = {
  ipv4: '127.0.0.1',
  port: 9106,
  pgpkey: config.server.pgp.key,
  pgppasswd: config.server.pgp.password,
  remoteipv4: '127.0.0.1',
  remoteport: 9106,
  sync: {
    AMStart: now,
    AMFreq: 1, // Every second
    UDFrequence: 2, // Dividend every 5 seconds
    UD0: 10,
    UDPercent: 0.5, // So it can be tested under 4 UD - this ultra high value of UD growth
    Consensus: 1,
    MSExpires: 3600*24*30 // 30 days
  }
};

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

  AM2_voters_members: {
    nextVotes: 1,
    membersCount: 2,
    membersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    membersChanges: [
    ],
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E',
    votersChanges: [
      "-2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    ]
  },

  AM3_voters_members: {
    nextVotes: 1,
    membersCount: 2,
    membersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    membersChanges: [
    ],
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E',
    votersChanges: [
    ]
  },

  AM4_voters_members: {
    nextVotes: 2,
    membersCount: 2,
    membersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    membersChanges: [
    ],
    votersCount: 2,
    votersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    votersChanges: [
      "+2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    ]
  },

  // TODO !

  // // Cat's deciding not to vote anymore
  // AM5_voters_members: {
  //   nextVotes: 1,
  //   membersCount: 2,
  //   membersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
  //   membersChanges: [
  //   ],
  //   votersCount: 1,
  //   votersRoot: '2E69197FAB029D8669EF85E82457A1587CA0ED9C',
  //   votersChanges: [
  //     "-C73882B64B7E72237A2F460CE9CAB76D19A8651E"
  //   ]
  // },

  // // Cat's finally deciding he prefers to vote
  // AM6_voters_members: {
  //   nextVotes: 2,
  //   membersCount: 2,
  //   membersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
  //   membersChanges: [
  //   ],
  //   votersCount: 2,
  //   votersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
  //   votersChanges: [
  //     "+C73882B64B7E72237A2F460CE9CAB76D19A8651E"
  //   ]
  // },

  // Awesome: exchanging voting keys does not produce any voters changes!
  AM5_voters_members: {
    nextVotes: 2,
    membersCount: 2,
    membersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    membersChanges: [
    ],
    votersCount: 2,
    votersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    votersChanges: [
    ]
  },

  // Exchanging (again), then cancelling: cat & tobi are using Cat's key fingerprint
  AM6_voters_members: {
    nextVotes: 1,
    membersCount: 2,
    membersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    membersChanges: [
    ],
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E',
    votersChanges: [
      "-2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    ]
  }
};

function pksAdd (raw, sig) {
  return function (done) {
    var PubKeyService = require('../app/service').PublicKey;
    var pubkey = new PublicKey({ raw: raw, signature: sig });
    async.series([
      pubkey.construct.bind(pubkey),
      async.apply(PubKeyService.submitPubkey, pubkey)
    ], function (err, res) {
      done(err, { 
        statusCode: 200,
        text: JSON.stringify(res[1].json())
      });
    });
  };
}

function join (signatory) {
  return memberDo("JOIN", signatory);
}

function memberDo (action, signatory) {
  return function (done) {
    var SyncService = require('../app/service').Sync;
    var ms = new Membership({
      version: 1,
      currency: currency,
      issuer: signatory.fingerprint(),
      membership: action,
      sigDate: new Date(),
      signature: ""
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
        console.warn(err);
        done(err, { 
          statusCode: 400
        });
      }
    });
  };
}

function voter (signatory, timestamp, fingerprint) {
  var votingKey = fingerprint || signatory.fingerprint();
  return voterDo(signatory, timestamp, votingKey);
}

function voterDo (signatory, timestamp, votingKey) {
  var d = new Date();
  d.setTime(timestamp*1000);
  return function (done) {
    var SyncService = require('../app/service').Sync;
    var voting = new Voting({
      version: 1,
      currency: currency,
      issuer: signatory.fingerprint(),
      votingKey: votingKey,
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
        console.warn(err);
        done(err, { 
          statusCode: 400
        });
      }
    });
  };
}

function voteCurrent (signatory) {
  return function (done) {
    var ContractService = require('../app/service').Contract;
    var am = ContractService.current();
    voteAm(signatory, am, done);
  };
}

function voteProposed (signatory, delay) {
  return function (done) {
    var ContractService = require('../app/service').Contract;
    var am = ContractService.proposed();
    voteAm(signatory, am, done, delay);
  };
}

function voteAm (signatory, am, done, delay) {
  var generatedPlusOne = am.generated + 1 + (delay || 0);
  var sigDate = new Date();
  sigDate.setTime(generatedPlusOne*1000);
  var vote = new Vote({
    issuer: signatory.fingerprint(),
    basis: am.number,
    signature: signatory.fingerprint() + am.number + now,
    amendmentHash: sha1(am.getRaw()).toUpperCase(),
    propagated: false,
    selfGenerated: false,
    sigDate: sigDate,
  });
  vote.amendment = am;
  vote.hash = sha1(vote.getRawSigned()).toUpperCase();
  var VoteService = require('../app/service').Vote;
  VoteService.submit(vote, function (err) {
    if (!err) {
      done(err, { 
        statusCode: 200,
        text: JSON.stringify(vote.json())
      });
    } else {
      console.warn(err);
      done(err, { 
        statusCode: 400
      });
    }
  });
}

var testCases = [

  /**************************
  * Public keys tests
  **/

  tester.verify(
    "Tobi's PUBKEY",
    pksAdd(pubkeyTobi, pubkeyTobiSig),
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

  tester.verify(
    "Tobi joining",
    join(tobi),
    is.expectedMembership("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),

  testProposedAmendment('proposed amendment with tobi joining', {
    currency: 'testa',
    number: 0,
    membersCount: 1,
    membersRoot: '2E69197FAB029D8669EF85E82457A1587CA0ED9C',
    votersCount: 0,
    previousHash: null
  }),

  tester.verify(
    "Cat joining",
    join(cat),
    is.expectedMembership("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

  tester.verify(
    "Tobi voting",
    voter(tobi, now + 1),
    is.expectedVoting("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),

  tester.verify(
    "Cat voting",
    voter(cat, now + 1),
    is.expectedVoting("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

  testProposedAmendment('proposed amendment with tobi+cat as members & voters', amendments.AM0),

  // VOTE 0

  tester.verify(
    "Voting AM0 should promote AM0 as genesis amendment",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM0)
  ),

  tester.verify(
    "Tobi voting AM0 so he stays as a voter",
    voteCurrent(tobi),
    is.expectedSignedAmendment(amendments.AM0)
  ),

  testCurrentAmendment(amendments.AM0),
  testPromotedAmendment(amendments.AM0),
  testPromotedAmendment(amendments.AM0, 0),

  // Delay, otherwise tobi might send same signature

  tester.verify(
    "Tobi changing his voting key to same as Cat",
    voter(tobi, now + 2, "C73882B64B7E72237A2F460CE9CAB76D19A8651E"),
    is.expectedVoting("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

  testProposedAmendment('proposed amendment with Tobi voting with same key as Cat', amendments.AM2_voters_members),

  // Delay, otherwise tobi might send same signature

  tester.verify(
    "Tobi cancelling his voting key to same as Cat",
    voter(tobi, now + 3, "C73882B64B7E72237A2F460CE9CAB76D19A8651E"),
    is.expectedHTTPCode(400)
  ),

  testProposedAmendment('looks like AM0 amendment', amendments.AM0_voters_members),

  //-------- VOTING : AM1 ------
  tester.verify(
    "Voting AM1 should require 2 votes",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM0_voters_members)
  ),

  tester.verify(
    "Voting AM1 should promote AM1 indentical to genesis AM",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM0_voters_members)
  ),

  tester.verify(
    "Voting AM1 should require 2 votes",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM0_voters_members)
  ),

  testCurrentAmendment("Testing that current = AM0", amendments.AM0_voters_members),
  //----------------------------

  // Changing VOTERS

  tester.verify(
    "Tobi changing his voting key to same as Cat",
    voter(tobi, now + 4, "C73882B64B7E72237A2F460CE9CAB76D19A8651E"),
    is.expectedVoting("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

    // Now we are with proposed AM2:
    // votersCount: 1,
    // votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E',
    // votersChanges: [
    //   "-2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    // ]

  testProposedAmendment('proposed amendment with Tobi voting with same key as Cat', amendments.AM2_voters_members),

  //-------- VOTING : AM2 ------
  tester.verify(
    "Voting AM2 should promote AM2 (cat & tobi have same voting key)",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM2_voters_members)
  ),

  tester.verify(
    "Voting AM2 should require 2 votes",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM2_voters_members)
  ),
  
  testCurrentAmendment("Testing that current = AM2", amendments.AM2_voters_members),
  //----------------------------

  //-------- VOTING : AM3 ------
  tester.verify(
    "Voting AM3 directly should be possible, as one signature is required",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM3_voters_members)
  ),
  
  testCurrentAmendment("Testing that current = AM3", amendments.AM3_voters_members),
  //----------------------------

  // Changing VOTERS AGAIN

  tester.verify(
    "Tobi changing his voting back with his own key",
    voter(tobi, now + 5, "2E69197FAB029D8669EF85E82457A1587CA0ED9C"),
    is.expectedVoting("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),

    // Now we are with proposed AM4:
    // votersCount: 2,
    // votersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    // votersChanges: [
    //   "+2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    // ]

  testProposedAmendment('proposed AM4 should have same voters & members as AM0', amendments.AM4_voters_members),

  //-------- VOTING : AM4 ------
  tester.verify(
    "Voting AM4 directly should be possible, as one signature is required",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM4_voters_members)
  ),
  
  testCurrentAmendment("Testing that current = AM4", amendments.AM4_voters_members),
  //----------------------------

    // Right now we have, tobi hasn't voted current yet:
    // votersCount: 1,
    // votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E',
    // votersChanges: [
    //   "-2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    // ]

  tester.verify(
    "Tobi voting using Cat's key",
    voter(tobi, now + 6, "C73882B64B7E72237A2F460CE9CAB76D19A8651E"),
    is.expectedVoting("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

  tester.verify(
    "Cat voting using Tobi's key",
    voter(cat, now + 7, "2E69197FAB029D8669EF85E82457A1587CA0ED9C"),
    is.expectedVoting("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),

    // Now we are with proposed AM5:
    // votersCount: 2,
    // votersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    // votersChanges: [
    // ]

  // However, Cat's uses its key to vote
  tester.verify(
    "Cat's voting: AM5 should require 2 votes",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM5_voters_members)
  ),
  tester.verify(
    "Tobi's voting: AM5 should require 2 votes",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM5_voters_members)
  ),

  //-------- VOTING : AM5 ------
  tester.verify(
    "Voting AM5 directly should be possible, using 2 votes",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM5_voters_members)
  ),
  
  testCurrentAmendment("Testing that current = AM5", amendments.AM5_voters_members),
  //----------------------------

  tester.verify(
    "Tobi voting using his own key (exchange again)",
    voter(tobi, now + 8),
    is.expectedVoting("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),

  tester.verify(
    "Cat voting using his own key (exchange again)",
    voter(cat, now + 9),
    is.expectedVoting("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

  // However, Cat's uses its key to vote
  tester.verify(
    "Cat's voting: AM6 should require 2 votes and be same as AM5",
    voteProposed(cat, 1),
    is.expectedSignedAmendment(amendments.AM5_voters_members)
  ),

  tester.verify(
    "Tobi voting using his own key - cancelling (exchange again cancelled)",
    voter(tobi, now + 10),
    is.expectedHTTPCode(400)
  ),
  
  //-------- VOTING : AM6 ------
  tester.verify(
    "Voting AM6 directly should be possible, using 2 votes",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM6_voters_members)
  ),

  // Tobi's vote is required
  tester.verify(
    "Tobi's voting: AM6 should require 2 votes",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM6_voters_members)
  ),
  
  testCurrentAmendment("Testing that current = AM6", amendments.AM6_voters_members),
  //----------------------------
];

var nb = 15;
// testCases.splice(nb, testCases.length - nb);

function testMerkle (url, root) {
  return tester.verify(
    "merkle " + url,
    on.doGet(url),
    is.expectedMerkle(root)
  );
}

function testCurrentAmendment (label, properties) {
  if (arguments.length == 1) {
    properties = label;
    label = "proposed current amendment";
  }
  return tester.verify(
    label,
    on.doGet("/hdc/amendments/current"),
    is.expectedAmendment(properties)
  );
}

function testPromotedAmendment (properties, number) {
  return tester.verify(
    "proposed current amendment",
    on.doGet("/hdc/amendments/promoted" + (isNaN(number) ? "" : "/" + number)),
    is.expectedAmendment(properties)
  );
}

function testProposedAmendment (label, properties) {
  return tester.verify(
    label,
    on.doGet("/ucs/amendment"),
    is.expectedAmendment(properties)
  );
}

before(function (done) {
  console.log("Launching server...");
  this.timeout(1000*1000); // 1000 seconds
  async.waterfall([
    function (next){
      var reset = true;
      server.database.connect(config.db.database, config.db.host, config.db.port, reset, next);
    },
    function (dbconf, next){
      server.express.app(config.db.database, conf, next);
    },
    function (appReady, next){
      tester.app(appReady);
      // Execute all tasks
      async.forEachSeries(testCases, function(testCase, callback){
        testCase.task(callback);
      }, next);
    },
    function (next){
      server.database.disconnect();
      next();
    },
  ], function (err) {
    console.log("API fed.");
    done(err);
  });
});

describe('Testing: ', function(){
  testCases.forEach(function(testCase){
    it(testCase.label, function () {
      testCase.test();
    });
  });
});
