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

var nb = 60;
var currency = "transfertest";
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
  port: 9108,
  pgpkey: config.server.pgp.key,
  pgppasswd: config.server.pgp.password,
  remoteipv4: '127.0.0.1',
  remoteport: 9108,
  kmanagement: 'ALL',
  sync: {
    AMStart: now,
    AMFreq: 1, // Every second
    UDFreq: 1, // Dividend every seconds
    UD0: 100,
    UDPercent: 0.5, // So it can be tested under 4 UD - this ultra high value of UD growth
    Consensus: 1/3,
    MSExpires: 8 // seconds, so AM9 will see ]AM0;AM1] members be kicked out at AM9
  },
  createNext: true
};

var amendments = {
  AM0: {
  currency: currency,
    generated: conf.sync.AMStart,
    number: 0,
    previousHash: null,
    dividend: null,
    coinBase: null,
    coinList: []
  },

  AM1: {
    generated: conf.sync.AMStart + 1,
    number: 1,
    dividend: 100,
    coinBase: 0,
    coinList: [26,7,5,3,1]
  },

  AM2: {
    generated: conf.sync.AMStart + 2,
    number: 2,
    dividend: 100,
    coinBase: 0,
    coinList: [26,7,5,3,1]
  },

  AM3: {
    generated: conf.sync.AMStart + 3,
    number: 3,
    dividend: 100,
    coinBase: 0,
    coinList: [26,7,5,3,1]
  },

  AM4: {
    generated: conf.sync.AMStart + 4,
    number: 4,
    dividend: 150,
    coinBase: 0,
    coinList: [28,7,5,3,2,1]
  },

  AM5: {
    generated: conf.sync.AMStart + 5,
    number: 5,
    dividend: 225,
    coinBase: 0,
    coinList: [37,12,9,6,3,1]
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

[cat, tobi].forEach(function(guy){
  txBySignatory[guy.fingerprint()] = {
    number: -1
  };
});

function transfer (signatory, recipient, coins, expectation) {
  var label = "Transfer from " + signatory.fingerprint().substring(32) + " to " + recipient.fingerprint().substring(32);
  coins.forEach(function(c){
    label += "\n> " + c;
  });
  return tester.verify(
    label,
    function (done) {
      var sigDate = new Date();
      var tx = new Transaction({
        version: 1,
        currency: currency,
        sender: signatory.fingerprint(),
        number: ++txBySignatory[signatory.fingerprint()].number,
        previousHash: txBySignatory[signatory.fingerprint()].hash,
        recipient: recipient.fingerprint(),
        coins: coins,
        comment: "Transaction #" + txBySignatory[signatory.fingerprint()].number + " of " + signatory.fingerprint(),
        signature: "#" + txBySignatory[signatory.fingerprint()].number + " of " + signatory.fingerprint() + " on " + sigDate.timestamp(),
        propagated: false,
        sigDate: sigDate,
      });
      tx.hash = sha1(tx.getRawSigned()).toUpperCase();
      sendTransaction(tx, done);
    },
    expectation ? expectation : is.expectedSignedTransaction()
  );
}

function sendTransaction (tx, done) {
  // logger.debug("---------------------");
  // logger.debug(tx.getRaw());
  var TransactionsService = require('../app/service').Transactions;
  TransactionsService.processTx(tx, function (err) {
    if (!err) {
      txBySignatory[tx.sender].hash = tx.hash;
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

  someTests.sendOptIN(tobi, now),
  someTests.sendOptIN(cat, now),
  someTests.sendVoting(cat, now),

  // Vote amendments
  someTests.voteProposed(cat, amendments.AM0),
  someTests.voteProposed(cat, amendments.AM1),
  someTests.voteProposed(cat, amendments.AM2),
  someTests.voteProposed(cat, amendments.AM3),
  someTests.voteProposed(cat, amendments.AM4),
  someTests.voteProposed(cat, amendments.AM5),

  transfer(tobi, cat, ["2E69197FAB029D8669EF85E82457A1587CA0ED9C-1-1"]),
  transfer(cat, tobi, ["C73882B64B7E72237A2F460CE9CAB76D19A8651E-1-1"]),
  transfer(cat, tobi, ["C73882B64B7E72237A2F460CE9CAB76D19A8651E-1-1"], is.expectedHTTPCode(400)), // Already spent
];

// testCases.splice(nb, testCases.length - nb);

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
