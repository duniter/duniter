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

var nb = 62;
var currency = "testa";
var tester    = is = on = new test.tester(currency);

logger.debug("Reading files & initializing...");

server.database.init();

var PublicKey   = mongoose.model('PublicKey');
var Membership  = mongoose.model('Membership');
var Voting      = mongoose.model('Voting');
var Vote        = mongoose.model('Vote');
var Amendment   = mongoose.model('Amendment');
var Transaction = mongoose.model('Transaction');

var now   = new Date().timestamp();
var cat   = signatory(fs.readFileSync(__dirname + "/data/lolcat.priv", 'utf8'), "lolcat", "Cat");
var tobi  = signatory(fs.readFileSync(__dirname + "/data/uchiha.priv", 'utf8'), "tobi", "Tobi");
var snow  = signatory(fs.readFileSync(__dirname + "/data/snow.priv", 'utf8'), "snow", "Snow");
// var white = signatory(fs.readFileSync(__dirname + "/data/white.priv", 'utf8'), "white");

var pubkeySnow     = fs.readFileSync(__dirname + '/data/snow.pub', 'utf8');
var pubkeySnowSig  = fs.readFileSync(__dirname + '/data/snow.pub.asc', 'utf8');
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
    port: 8007,
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
  port: 9107,
  pgpkey: config.server.pgp.key,
  pgppasswd: config.server.pgp.password,
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

  AM2: {
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
    var SyncService = require('../app/service').Sync;
    var ms = new Membership({
      version: 1,
      currency: currency,
      issuer: signatory.fingerprint(),
      membership: action,
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
    var SyncService = require('../app/service').Sync;
    var voting = new Voting({
      version: 1,
      currency: currency,
      type: 'VOTING',
      issuer: signatory.fingerprint(),
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
      logger.warn(err);
      done(err, { 
        statusCode: 400
      });
    }
  });
}

var txBySignatory = {};
var coins = {};
[cat, tobi, snow].forEach(function(signatory){
  // Transactions state
  txBySignatory[signatory.fingerprint()] = {
    number: -1,
    hash: null,
    coinNumber: -1
  };
  // Coins state
  coins[signatory.fingerprint()] = {};
});

function transfer (signatory, recipient, coinNumbers, time) {
  return function (done) {
    var txCoins = [];
    coinNumbers.forEach(function(cNumber){
      var coin = coins[signatory.fingerprint()][cNumber];
      txCoins.push(coin.coinId + ', ' + signatory.fingerprint() + '-' + coin.txNumber);
    });
    var sigDate = new Date();
    sigDate.setTime(time*1000);
    var tx = new Transaction({
      version: 1,
      currency: currency,
      sender: signatory.fingerprint(),
      number: ++txBySignatory[signatory.fingerprint()].number,
      previousHash: txBySignatory[signatory.fingerprint()].hash,
      recipient: recipient.fingerprint(),
      type: "TRANSFER",
      coins: txCoins,
      comment: "Transaction #" + txBySignatory[signatory.fingerprint()].number + " of " + signatory.fingerprint(),
      signature: "#" + txBySignatory[signatory.fingerprint()].number + " of " + signatory.fingerprint() + " on " + sigDate.timestamp(),
      propagated: false,
      sigDate: sigDate,
    });
    tx.hash = sha1(tx.getRawSigned()).toUpperCase();
    sendTransaction(tx, done);
  };
}

function issue (signatory, amount, amNumber, time) {
  return function (done) {
    var strAmount = "" + amount;
    var pow = strAmount.length - 1;
    var coins = [];
    for(var i = 0; i < strAmount.length; i++) {
      var c = strAmount[i];
      var base = parseInt(c, 10);
      if (base > 0 || strAmount.length == 1) { //strAmount to allow value == 0
        var coin = {
          issuer: signatory.fingerprint(),
          number: ++txBySignatory[signatory.fingerprint()].coinNumber,
          base: parseInt(c, 10),
          power: pow--
        };
        coins.push([coin.issuer, coin.number, coin.base, coin.power, 'A', amNumber].join("-"));
      }
    };
    var sigDate = new Date();
    sigDate.setTime(time*1000);
    var tx = new Transaction({
      version: 1,
      currency: currency,
      sender: signatory.fingerprint(),
      number: ++txBySignatory[signatory.fingerprint()].number,
      previousHash: txBySignatory[signatory.fingerprint()].hash,
      recipient: signatory.fingerprint(),
      type: "ISSUANCE",
      coins: coins,
      comment: "Transaction #" + txBySignatory[signatory.fingerprint()].number + " of " + signatory.fingerprint(),
      signature: "#" + txBySignatory[signatory.fingerprint()].number + " of " + signatory.fingerprint() + " on " + sigDate.timestamp(),
      propagated: false,
      sigDate: sigDate,
    });
    tx.hash = sha1(tx.getRawSigned()).toUpperCase();
    sendTransaction(tx, done);
  };
}

function sendTransaction (tx, done) {
  // logger.debug("---------------------");
  // logger.debug(tx.getRaw());
  var TransactionsService = require('../app/service').Transactions;
  TransactionsService.processTx(tx, function (err) {
    if (!err) {
      txBySignatory[tx.sender].hash = tx.hash;
      if (tx.type == "ISSUANCE") {
        tx.coins.forEach(function(c){
          var matches = c.match(/([A-Z\d]{40})-(\d+)-(\d)-(\d+)/);
          coins[tx.recipient][matches[2]] = {
            txNumber: tx.number,
            coinId: c,
            value: parseInt(matches[3]) * Math.pow(10, parseInt(matches[4]))
          };
        });
      }
      if (tx.type == "TRANSFER") {
        tx.coins.forEach(function(c){
          var matches = c.match(/([A-Z\d]{40})-(\d+)-(\d)-(\d+)/);
          // coins[tx.sender][matches[2]] = undefined;
          coins[tx.recipient][matches[2]] = {
            txNumber: tx.number,
            coinId: c,
            value: parseInt(matches[3]) * Math.pow(10, parseInt(matches[4]))
          };
        });
      }
      // logger.debug(coins);
      done(err, { 
        statusCode: 200,
        text: JSON.stringify({
          signature: tx.signature,
          transaction: tx.json(),
          raw: tx.getRaw()
        })
      });
    } else {
      --txBySignatory[tx.sender].number;
      tx.coins.forEach(function(c){
        if (!c.match(/, /)) {
          --txBySignatory[tx.sender].coinNumber;
        }
      });
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

  sendVoting: function (signatory, time) {
    return tester.verify(
      signatory.name() + " voting",
      voter(signatory, time),
      is.expectedVoting(signatory.fingerprint())
    );
  },

  sendOptIN: function (signatory, time, errCode) {
    return tester.verify(
      signatory.name() + " OPT-IN",
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

  someTests.sendOptIN(tobi),

  testProposedAmendment('proposed amendment with tobi joining', {
    currency: 'testa',
    number: 0,
    membersCount: 1,
    membersRoot: '2E69197FAB029D8669EF85E82457A1587CA0ED9C',
    votersCount: 0,
    previousHash: null
  }),

  someTests.sendOptIN(cat),

  someTests.sendVoting(tobi, now + 1),
  someTests.sendVoting(cat, now + 1),

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
    pksAdd(pubkeySnow, pubkeySnowSig),
    is.expectedPubkey('33BBFC0C67078D72AF128B5BA296CC530126F372')
  ),

  testMerkle("/pks/all", 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'),

  someTests.sendOptIN(snow, now + 2),
  someTests.sendVoting(snow, now + 2),

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

  testProposedAmendment('AM4 should see tobi no more voter', amendments.AM4),

  tester.verify(
    "Tobi voting while having not voted current should not be accepted: already a voter!",
    voter(tobi, now + 4),
    is.expectedHTTPCode(400)
  ),

  // Voting AM4 (ratify tobi's leaving as a voter)
  someTests.voteProposed(cat),
  someTests.voteProposed(snow),
  testPromotedAmendment(amendments.AM4, 4),
  testPromotedAmendment(amendments.AM4),
  testProposedAmendment('AM5: no changes', { membersChanges: [], votersChanges: [] }),

  // Tobi voting again
  someTests.sendVoting(tobi, now + 5),
  testProposedAmendment('AM6: tobi\'s coming back', {
    membersChanges: [],
    votersChanges: ['+2E69197FAB029D8669EF85E82457A1587CA0ED9C'],
    votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90' }),
  someTests.voteProposed(cat),
  someTests.voteProposed(snow),
  testProposedAmendment('AM6: no changes, but tobi as voter', {
    membersChanges: [],
    votersChanges: [],
    votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90' }),

  someTests.voteProposed(cat),
  someTests.voteProposed(snow),
  // Tobi has not voted yet! He is leaving for proposed next
  testProposedAmendment('AM7: tobi is leaving as voter', { votersChanges: ['-2E69197FAB029D8669EF85E82457A1587CA0ED9C'], votersRoot: '5DB500A285BD380A68890D09232475A8CA003DC8' }),
  someTests.voteCurrent(tobi),
  testProposedAmendment('AM7: tobi is finally saved', { votersChanges: [], votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90' }),


  someTests.voteProposed(cat),
  someTests.voteProposed(snow),
  someTests.sendOptOUT(cat, now + 8),
  testProposedAmendment('AM8: no change for cat with its memberships cancelled', { membersChanges: ['-C73882B64B7E72237A2F460CE9CAB76D19A8651E'], membersRoot: 'DC7A9229DFDABFB9769789B7BFAE08048BCB856F' }),
  someTests.sendOptIN(cat, now + 8, 400),
  testProposedAmendment('AM8: no change for cat with its memberships cancelled', { membersChanges: [], membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90' }),

  /****** TRANSACTIONS
  *
  */

  // Coin 0 : 100
  // Coin 1 : 40
  // Coin 2 : 5
  tester.verify(
    "Issuing all coins of UD[0] (<=> AM[2])",
    issue(tobi, 145, 2, now + 13),
    is.expectedSignedTransaction()
  ),

  tester.verify(
    "Trying to issue more coins of UD[0]",
    issue(tobi, 1, 2, now + 13),
    is.expectedHTTPCode(400)
  ),

  // Coin 3 : 100
  tester.verify(
    "Issuing some coins of UD[1] (<=> AM[4])",
    issue(tobi, 100, 4, now + 13),
    is.expectedSignedTransaction()
  ),

  // Coin 4 : 30
  tester.verify(
    "Trying to issue more coins of UD[1] (<=> AM[4])",
    issue(tobi, 30, 4, now + 13),
    is.expectedSignedTransaction()
  ),

  // Coin 5 : 10
  tester.verify(
    "Trying to issue more coins of UD[1] (<=> AM[4])",
    issue(tobi, 10, 4, now + 13),
    is.expectedSignedTransaction()
  ),

  // Coin 6 : 4
  tester.verify(
    "Trying to issue more coins of UD[1] (<=> AM[4])",
    issue(tobi, 4, 4, now + 13),
    is.expectedSignedTransaction()
  ),

  // Coin 7 : 1
  tester.verify(
    "Trying to issue more coins of UD[1] (<=> AM[4])",
    issue(tobi, 1, 4, now + 13),
    is.expectedSignedTransaction()
  ),

  tester.verify(
    "Trying to issue too much coins of UD[1] (<=> AM[4])",
    issue(tobi, 1, 4, now + 13),
    is.expectedHTTPCode(400)
  ),

  tester.verify(
    "Trying to issue value of 0",
    issue(tobi, 0, 6, now + 13),
    is.expectedHTTPCode(400)
  ),

  tester.verify(
    "Tobi transfering 15 to Cat",
    transfer(tobi, cat, [5,6,7], now + 14),
    is.expectedSignedTransaction()
  ),

  tester.verify(
    "Tobi transfering 15 to Cat",
    transfer(tobi, cat, [5,6,7], now + 14),
    is.expectedHTTPCode(400)
  ),
];

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
    number >= 0 ? "proposed amendment #" + number : "current amendment",
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
        console.log('----------------------------------');
        console.log('Test: %s', testCase.label);
        console.log('----------------------------------');
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
