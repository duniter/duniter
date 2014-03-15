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
var logger    = require('../app/lib/logger')('test');

var currency = "testo";
var tester    = is = on = new test.tester(currency);

logger.debug("Reading files & initializing...");

server.database.init();

var now   = new Date().timestamp();
var cat   = signatory(fs.readFileSync(__dirname + "/data/lolcat.priv", 'utf8'), "lolcat");
var tobi  = signatory(fs.readFileSync(__dirname + "/data/uchiha.priv", 'utf8'), "tobi");
var snow  = signatory(fs.readFileSync(__dirname + "/data/snow.priv", 'utf8'), "snow");
var white = signatory(fs.readFileSync(__dirname + "/data/white.priv", 'utf8'), "white");

var pubkeySnow     = fs.readFileSync(__dirname + '/data/snow.pub', 'utf8');
var pubkeySnowSig  = fs.readFileSync(__dirname + '/data/snow.pub.asc', 'utf8');
var pubkeyCat      = fs.readFileSync(__dirname + '/data/lolcat.pub', 'utf8');
var pubkeyCat2     = fs.readFileSync(__dirname + '/data/lolcat.pub2', 'utf8');
var pubkeyCatSig   = fs.readFileSync(__dirname + '/data/lolcat.pub.asc', 'utf8');
var pubkeyTobi     = fs.readFileSync(__dirname + '/data/uchiha.pub', 'utf8');
var pubkeyTobiSig  = fs.readFileSync(__dirname + '/data/uchiha.pub.asc', 'utf8');
var pubkeyTobiSig2 = fs.readFileSync(__dirname + '/data/uchiha.pub.asc2', 'utf8');
var pubkeyWhite    = fs.readFileSync(__dirname + '/data/white.pub', 'utf8');
var pubkeyWhiteSig = fs.readFileSync(__dirname + '/data/white.pub.asc', 'utf8');

var config = {
  server: {
    port: 8001,
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
  port: 9105,
  pgpkey: config.server.pgp.key,
  pgppasswd: config.server.pgp.password,
  remoteipv4: '127.0.0.1',
  remoteport: 9105,
  sync: {
    AMStart: now,
    AMFreq: 1, // Every second
    UDFreq: 2, // Dividend every 5 seconds
    UD0: 10,
    UDPercent: 0.5, // So it can be tested under 4 UD - this ultra high value of UD growth
    Consensus: 2/3,
    MSExpires: 3600*24*30 // 30 days
  }
};

var amendments = {
  AM0: {
  currency: 'testo',
    generated: conf.sync.AMStart,
    number: 0,
    dividend: null,
    membersCount: 2,
    membersRoot: '5DB500A285BD380A68890D09232475A8CA003DC8',
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E',
    previousHash: null
  },

  AM1: {
    currency: 'testo',
    generated: conf.sync.AMStart + conf.sync.AMFreq*1,
    number: 1,
    dividend: null,
    membersCount: 2,
    membersRoot: '5DB500A285BD380A68890D09232475A8CA003DC8',
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E'
  },

  AM2: {
    currency: 'testo',
    generated: conf.sync.AMStart + conf.sync.AMFreq*2,
    number: 2,
    dividend: 10,
    membersCount: 2,
    membersRoot: '5DB500A285BD380A68890D09232475A8CA003DC8',
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E'
  },

  AM3: {
    currency: 'testo',
    generated: conf.sync.AMStart + conf.sync.AMFreq*3,
    number: 3,
    dividend: null,
    membersCount: 2,
    membersRoot: '5DB500A285BD380A68890D09232475A8CA003DC8',
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E'
  },

  AM4: {
    currency: 'testo',
    generated: conf.sync.AMStart + conf.sync.AMFreq*4,
    number: 4,
    dividend: 10,
    membersCount: 2,
    membersRoot: '5DB500A285BD380A68890D09232475A8CA003DC8',
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E'
  },

  AM8:  { number: 8,  dividend: 15 },
  AM10: { number: 10, dividend: 22 },
  AM12: { number: 12, dividend: 33 }
};

var testCases = [

  /**************************
  * Public keys tests
  **/

  // Cat is used by server
  testMerkle("/pks/all", 'C73882B64B7E72237A2F460CE9CAB76D19A8651E'),

  tester.verify(
    "Snow giving his key for first time must pass",
    on.pksAdd(pubkeySnow, pubkeySnowSig),
    is.expectedPubkey('33BBFC0C67078D72AF128B5BA296CC530126F372')
  ),
  testMerkle("/pks/all", '5DB500A285BD380A68890D09232475A8CA003DC8'),

  tester.verify(
    "Cat has already given his key",
    on.pksAdd(pubkeyCat, pubkeyCatSig),
    is.expectedHTTPCode(400)
  ),
  testMerkle("/pks/all", '5DB500A285BD380A68890D09232475A8CA003DC8'),

  tester.verify(
    "Tobi giving his key for first time must pass",
    on.pksAdd(pubkeyTobi, pubkeyTobiSig2),
    is.expectedPubkey('2E69197FAB029D8669EF85E82457A1587CA0ED9C')
  ),
  testMerkle("/pks/all", 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'),

  tester.verify(
    "Tobi giving older signature must not pass",
    on.pksAdd(pubkeyTobi, pubkeyTobiSig),
    is.expectedHTTPCode(400)
  ),
  testMerkle("/pks/all", 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'),

  tester.verify(
    "White signed by Tobi must not pass",
    on.pksAdd(pubkeyWhite, pubkeyTobiSig),
    is.expectedHTTPCode(400)
  ),
  testMerkle("/pks/all", 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'),

  tester.verify(
    "White giving his key must pass",
    on.pksAdd(pubkeyWhite, pubkeyWhiteSig),
    is.expectedPubkey('B6AE93DDE390B1E11FA97EEF78B494F99025C77E')
  ),
  testMerkle("/pks/all", '7B66992FD748579B0774EDFAD7AB84143357F7BC'),

  tester.verify(
    "Signature of Tobi on White's pubkey must not pass, even if White is already recorded",
    on.pksAdd(pubkeyWhite, pubkeyTobiSig),
    is.expectedHTTPCode(400)
  ),
  testMerkle("/pks/all", '7B66992FD748579B0774EDFAD7AB84143357F7BC'),
  
  tester.verify(
    "Must not accept twice the same signature",
    on.pksAdd(pubkeyWhite, pubkeyWhiteSig),
    is.expectedHTTPCode(400)
  ),
  testMerkle("/pks/all", '7B66992FD748579B0774EDFAD7AB84143357F7BC'),

  tester.verify(
    "Must not accept if good key but bad signature",
    on.pksAdd(pubkeyCat2, pubkeyCatSig),
    is.expectedHTTPCode(400)
  ),
  testMerkle("/pks/all", '7B66992FD748579B0774EDFAD7AB84143357F7BC'),

  /**************************
  * Membership tests
  **/

  testProposedAmendment('First proposed amendment, autogenerated on ucoin start', {
    currency: 'testo',
    number: 0,
    membersCount: 0,
    votersCount: 0,
    previousHash: null
  }),

  tester.verify(
    "Tobi joining for first time",
    on.join(tobi),
    is.expectedMembership("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),

  testProposedAmendment('proposed amendment with tobi joining', {
    currency: 'testo',
    number: 0,
    membersCount: 1,
    membersRoot: '2E69197FAB029D8669EF85E82457A1587CA0ED9C',
    votersCount: 0,
    previousHash: null
  }),

  tester.verify(
    "Tobi joining again should cancel its membership request",
    on.join(tobi),
    is.expectedHTTPCode(400)
  ),

  tester.verify(
    "Tobi joining again should as already received membership",
    on.join(tobi),
    is.expectedHTTPCode(400)
  ),

  tester.verify(
    "Cat actualizing should not work as it is not a member yet",
    on.actualize(cat),
    is.expectedHTTPCode(400)
  ),

  tester.verify(
    "Cat leaving again should cancel its membership request",
    on.leave(cat),
    is.expectedHTTPCode(400)
  ),

  testProposedAmendment('proposed amendment with tobi finally not here (cancelled)', {
    currency: 'testo',
    number: 0,
    membersCount: 0,
    votersCount: 0,
    previousHash: null
  }),

  tester.verify(
    "Cat as a voter should not work (not a member yet)",
    on.setVoter(cat),
    is.expectedHTTPCode(400)
  ),

  tester.verify(
    "Cat joining should work",
    on.join(cat),
    is.expectedMembership("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

  testProposedAmendment('proposed amendment with Cat joined', {
    currency: 'testo',
    number: 0,
    membersCount: 1,
    membersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E',
    membersChanges: [
      '+C73882B64B7E72237A2F460CE9CAB76D19A8651E'
    ],
    votersCount: 0,
    previousHash: null
  }),

  tester.verify(
    "Snow joining should work",
    on.join(snow),
    is.expectedMembership("33BBFC0C67078D72AF128B5BA296CC530126F372")
  ),

  testProposedAmendment('proposed amendment with snow too', {
    currency: 'testo',
    number: 0,
    membersCount: 2,
    membersRoot: '5DB500A285BD380A68890D09232475A8CA003DC8',
    membersChanges: [
      '+33BBFC0C67078D72AF128B5BA296CC530126F372',
      '+C73882B64B7E72237A2F460CE9CAB76D19A8651E'
    ],
    votersCount: 0,
    previousHash: null
  }),

  tester.verify(
    "Cat as a voter should work now, as he is to become a member",
    on.setVoter(cat),
    is.expectedVoting("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

  testProposedAmendment('proposed amendment with Cat as first voter', {
    currency: 'testo',
    number: 0,
    membersCount: 2,
    membersRoot: '5DB500A285BD380A68890D09232475A8CA003DC8',
    membersChanges: [
      '+33BBFC0C67078D72AF128B5BA296CC530126F372',
      '+C73882B64B7E72237A2F460CE9CAB76D19A8651E'
    ],
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E',
    votersChanges: [
      '+C73882B64B7E72237A2F460CE9CAB76D19A8651E'
    ],
    previousHash: null
  }),

  tester.verify(
    "Should have no currently promoted amendment (1/2)",
    on.doGet("/hdc/amendments/promoted"),
    is.expectedHTTPCode(404)
  ),

  tester.verify(
    "Should have no currently promoted amendment (2/2",
    on.doGet("/hdc/amendments/promoted/0"),
    is.expectedHTTPCode(404)
  ),

  // VOTE 0

  tester.verify(
    "Voting AM0 should promote AM0 as genesis amendment",
    tester.selfVote(0),
    is.expectedSignedAmendment(amendments.AM0)
  ),

  testPromotedAmendment(amendments.AM0),
  testPromotedAmendment(amendments.AM0, 0),

  // VOTE 1

  tester.job(function setPreviousHash (done) {
    tester.get('/hdc/amendments/promoted', function (err, res) {
      var json = JSON.parse(res.text);
      amendments.AM1.previousHash = json.raw.hash();
      done();
    });
  }),

  tester.verify(
    "Voting AM1 should promote AM1",
    tester.selfVote(1),
    is.expectedSignedAmendment(amendments.AM1)
  ),

  testPromotedAmendment(amendments.AM1),
  testPromotedAmendment(amendments.AM1, 1),

  // VOTE 2

  tester.job(function setPreviousHash (done) {
    tester.get('/hdc/amendments/promoted', function (err, res) {
      var json = JSON.parse(res.text);
      amendments.AM2.previousHash = json.raw.hash();
      done();
    });
  }),

  tester.verify(
    "Voting AM2 should promote AM2",
    tester.selfVote(2),
    is.expectedSignedAmendment(amendments.AM2)
  ),

  testPromotedAmendment(amendments.AM2),
  testPromotedAmendment(amendments.AM2, 2),

  // VOTE 3

  tester.verify(
    "Voting AM3 should promote AM3",
    tester.selfVote(3),
    is.expectedSignedAmendment(amendments.AM3)
  ),

  testPromotedAmendment(amendments.AM3),
  testPromotedAmendment(amendments.AM0, 0),
  testPromotedAmendment(amendments.AM1, 1),
  testPromotedAmendment(amendments.AM2, 2),
  testPromotedAmendment(amendments.AM3, 3),

  // VOTE 4

  tester.verify(
    "Voting AM4 should promote AM4",
    tester.selfVote(4),
    is.expectedSignedAmendment(amendments.AM4)
  ),
];

for (var i = 5; i <= 12; i++) {
  testCases.push(tester.verify(
    "Voting AM"+i+" should promote AM"+i,
    tester.selfVote(i),
    is.expectedSignedAmendment(amendments["AM"+i] ? amendments["AM"+i] : {})
  ));
}

[
  tester.verify(
    "Cat leaving",
    on.leave(cat),
    is.expectedMembership("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

  testProposedAmendment('proposed amendment with Cat as leaver', {
    membersCount: 1,
    membersRoot: '33BBFC0C67078D72AF128B5BA296CC530126F372',
    membersChanges: [
      '-C73882B64B7E72237A2F460CE9CAB76D19A8651E'
    ],
    votersCount: 0,
    votersRoot: '',
    votersChanges: [
      '-C73882B64B7E72237A2F460CE9CAB76D19A8651E'
    ]
  }),

  tester.verify(
    "Cat actualizing to cancel",
    on.actualize(cat),
    is.expectedHTTPCode(400)
  ),

  tester.verify(
    "Tobi joining",
    on.join(tobi),
    is.expectedMembership("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),

  tester.verify(
    "Tobi joining",
    on.setVoter(tobi),
    is.expectedVoting("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),

  testProposedAmendment('proposed amendment with Tobi joining & voting', {
    membersCount: 3,
    membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    membersChanges: [
      "+2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    ],
    votersCount: 2,
    votersRoot: '48578F03A46B358C10468E2312A41C6BCAB19417',
    votersChanges: [
      "+2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    ]
  }),

  tester.verify(
    "Voting AM13 should promote AM13",
    tester.selfVote(13),
    is.expectedSignedAmendment({})
  ),

  tester.verify(
    "Tobi joining",
    on.setVoter(tobi, "C73882B64B7E72237A2F460CE9CAB76D19A8651E"),
    is.expectedVoting("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),
  
  testProposedAmendment('proposed amendment with Tobi joining & voting 2', {
    membersCount: 3,
    membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    membersChanges: [
    ],
    votersCount: 1,
    votersRoot: 'C73882B64B7E72237A2F460CE9CAB76D19A8651E',
    votersChanges: [
      "-2E69197FAB029D8669EF85E82457A1587CA0ED9C"
    ]
  }),

].forEach(function(testCase){
  testCases.push(testCase);
});

var nb = 10;
// testCases.splice(nb, testCases.length - nb);

function testMerkle (url, root) {
  return tester.verify(
    "merkle " + url,
    on.doGet(url),
    is.expectedMerkle(root)
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
  logger.debug("Launching server...");
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
    logger.debug("API fed.");
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
