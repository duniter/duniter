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

var currency = "testo";
var tester    = is = on = test.tester(currency);

console.log("Reading files & initializing...");

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
    votingStart: now,
    votingFrequence: 1, // Every second
    UDFrequence: 3600, // No dividend within 1 hour
    UD0: 10,
    UDPercent: null,
    VotesPercent: 2/3,
    ActualizeFrequence: 3600*24*30 // 30 days
  }
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
  tester.verify(
    "Joining Tobi",
    on.join(tobi),
    is.expectedMembership("2E69197FAB029D8669EF85E82457A1587CA0ED9C")
  ),
];

function testMerkle (url, root) {
  return tester.verify(
    "Merkle " + url,
    on.doGet(url),
    is.expectedMerkle(root)
  );
}

before(function (done) {
  console.log("Launching server...");
  this.timeout(1000*1000); // 100 seconds
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
  ], function (err) {
    console.log("API fed.");
    done(err);
  });
});

describe('PKS: ', function(){

  testCases.forEach(function(testCase){
    it(testCase.label, function () {
      testCase.test();
    });
  });
});
