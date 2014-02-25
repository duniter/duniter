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

var PublicKey   = mongoose.model('PublicKey');
var Membership  = mongoose.model('Membership');
var Voting      = mongoose.model('Voting');
var Vote        = mongoose.model('Vote');
var Amendment   = mongoose.model('Amendment');
var Transaction = mongoose.model('Transaction');

var now   = new Date().timestamp();
var cat   = signatory(fs.readFileSync(__dirname + "/data/lolcat.priv", 'utf8'), "lolcat");
var tobi  = signatory(fs.readFileSync(__dirname + "/data/uchiha.priv", 'utf8'), "tobi");
var snow  = signatory(fs.readFileSync(__dirname + "/data/snow.priv", 'utf8'), "snow");
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

  AM4: {
    number: 4,
    dividend: 145,
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
  },

  // Tobi coming back as a voter, and Snow is joining & voting
  AM7_voters_members: {
    nextVotes: 2,
    membersCount: 3,
    membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    membersChanges: [
      "+33BBFC0C67078D72AF128B5BA296CC530126F372"
    ],
    votersCount: 3,
    votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    votersChanges: [
      "+2E69197FAB029D8669EF85E82457A1587CA0ED9C",
      "+33BBFC0C67078D72AF128B5BA296CC530126F372"
    ]
  },

  // Cat's deciding not to vote anymore
  AM8_voters_members: {
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

  // Cat hasn't voted: he was ejected from voters
  AM9_voters_members: {
    nextVotes: 2,
    membersCount: 3,
    membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    membersChanges: [
    ],
    votersCount: 2,
    votersRoot: 'DC7A9229DFDABFB9769789B7BFAE08048BCB856F',
    votersChanges: [
      "-C73882B64B7E72237A2F460CE9CAB76D19A8651E"
    ]
  },

  // Cat decide to come back voting
  AM10_voters_members: {
    nextVotes: 2,
    membersCount: 3,
    membersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    membersChanges: [
    ],
    votersCount: 3,
    votersRoot: 'F5ACFD67FC908D28C0CFDAD886249AC260515C90',
    votersChanges: [
      "+C73882B64B7E72237A2F460CE9CAB76D19A8651E"
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
  return memberDo("JOIN", signatory, timestamp);
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
  // console.log("---------------------");
  // console.log(tx.getRaw());
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
      // console.log(coins);
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

  testProposedAmendment('proposed amendment with Tobi voting with same key as Cat', amendments.AM2),

  //-------- VOTING : AM2 ------
  tester.verify(
    "Voting AM2 should promote AM2 (cat & tobi have same voting key)",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM2)
  ),

  tester.verify(
    "Voting AM2 should require 2 votes",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM2)
  ),
  
  //----------------------------

  //-------- VOTING : AM3 ------
  tester.verify(
    "Voting AM3 directly should be possible, as one signature is required",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM3_voters_members)
  ),
  
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
  
  //----------------------------

  /****** AM7
  *
  * 1. Tobi coming back as a voter
  * 2. Snow publish its pubkey, ask for joining & voting
  */

  tester.verify(
    "Snow's PUBKEY",
    pksAdd(pubkeySnow, pubkeySnowSig),
    is.expectedPubkey('33BBFC0C67078D72AF128B5BA296CC530126F372')
  ),

  testMerkle("/pks/all", 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'),

  tester.verify(
    "Snow joining",
    join(snow, now + 11),
    is.expectedMembership("33BBFC0C67078D72AF128B5BA296CC530126F372")
  ),

  tester.verify(
    "Snow coming as a voter",
    voter(snow, now + 11),
    is.expectedVoting("33BBFC0C67078D72AF128B5BA296CC530126F372")
  ),

  tester.verify(
    "Tobi coming back as a voter",
    voter(tobi, now + 11),
    is.expectedVoting("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),

  tester.verify(
    "Voting AM7 by cat",
    voteProposed(cat),
    is.expectedSignedAmendment(amendments.AM7_voters_members)
  ),

  testPromotedAmendment(amendments.AM7_voters_members, 7),
  testPromotedAmendment(amendments.AM7_voters_members),

  tester.verify(
    "Confirming AM7 as new voter (tobi)",
    voteCurrent(tobi),
    is.expectedSignedAmendment(amendments.AM7_voters_members)
  ),

  tester.verify(
    "Confirming AM7 as new voter (snow)",
    voteCurrent(snow),
    is.expectedSignedAmendment(amendments.AM7_voters_members)
  ),

  /****** AM8
  *
  * 1. Tobi & Snow will vote without Cat
  */

  testProposedAmendment('AM8 should be calm', amendments.AM8_voters_members),

  tester.verify(
    "Voting AM8 without Cat (tobi)",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM8_voters_members)
  ),

  testPromotedAmendment(amendments.AM7_voters_members, 7),
  testPromotedAmendment(amendments.AM7_voters_members),

  tester.verify(
    "Voting AM8 without Cat (snow)",
    voteProposed(snow),
    is.expectedSignedAmendment(amendments.AM8_voters_members)
  ),

  testPromotedAmendment(amendments.AM8_voters_members, 8),
  testPromotedAmendment(amendments.AM8_voters_members),

  /****** AM9
  *
  * 1. Tobi & Snow has voted AM8 without Cat
  * 2. Cat still do not vote
  * 3. Tobi & Snow will vote AM9 causing Cat's leaving as voter
  */

  testProposedAmendment('AM9 should see Cat leaving', amendments.AM9_voters_members),

  tester.verify(
    "Voting AM9 without Cat (tobi)",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM9_voters_members)
  ),

  testPromotedAmendment(amendments.AM8_voters_members, 8),
  testPromotedAmendment(amendments.AM8_voters_members),

  tester.verify(
    "Voting AM9 without Cat (snow)",
    voteProposed(snow),
    is.expectedSignedAmendment(amendments.AM9_voters_members)
  ),

  testPromotedAmendment(amendments.AM9_voters_members),
  testPromotedAmendment(amendments.AM9_voters_members, 9),

  /****** AM10
  *
  * 1. Tobi & Snow has voted AM9 without Cat, which has left as voter
  * 2. Cat will ask to be a voter
  * 3. Tobi & Snow will vote AM10 so Cat will be voter again
  */

  tester.verify(
    "Cat coming back as a voter",
    voter(cat, now + 12),
    is.expectedVoting("C73882B64B7E72237A2F460CE9CAB76D19A8651E")
  ),

  testProposedAmendment('AM10 should see Cat coming back as voter', amendments.AM10_voters_members),

  tester.verify(
    "Voting AM10 (tobi)",
    voteProposed(tobi),
    is.expectedSignedAmendment(amendments.AM10_voters_members)
  ),

  testPromotedAmendment(amendments.AM9_voters_members, 9),
  testPromotedAmendment(amendments.AM9_voters_members),

  tester.verify(
    "Voting AM10 (snow)",
    voteProposed(snow),
    is.expectedSignedAmendment(amendments.AM10_voters_members)
  ),

  testPromotedAmendment(amendments.AM10_voters_members),
  testPromotedAmendment(amendments.AM10_voters_members, 10),

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

var nb = 15;
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
    "proposed amendment #" + number,
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
