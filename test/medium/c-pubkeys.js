var should    = require('should');
var assert    = require('assert');
var async     = require('async');
var request   = require('supertest');
var fs        = require('fs');
var sha1      = require('sha1');
var _         = require('underscore');
var jpgp      = require('../../app/lib/jpgp');
var server    = require('../../app/lib/server');
var signatory = require('./../tool/signatory');
var test      = require('./../tool/test');
var ucoin     = require('./../..');
var logger    = require('../../app/lib/logger')('test');

require('log4js').configure({});

var currency = "testo";
var tester    = is = on = new test.tester(currency);

var now   = new Date().timestamp();
var cat   = signatory(fs.readFileSync(__dirname + "/../data/lolcat.priv", 'utf8'), "lolcat");
var tobi  = signatory(fs.readFileSync(__dirname + "/../data/uchiha.priv", 'utf8'), "tobi");
var snow  = signatory(fs.readFileSync(__dirname + "/../data/snow.priv", 'utf8'), "snow");
var white = signatory(fs.readFileSync(__dirname + "/../data/white.priv", 'utf8'), "white");

var pubkeySnow     = fs.readFileSync(__dirname + '/../data/snow.pub', 'utf8');
var pubkeyCat      = fs.readFileSync(__dirname + '/../data/lolcat.pub', 'utf8');
var pubkeyTobi     = fs.readFileSync(__dirname + '/../data/uchiha.pub', 'utf8');
var pubkeyWhite    = fs.readFileSync(__dirname + '/../data/white.pub', 'utf8');

var testCases = [

  /**************************
  * Public keys tests
  **/

  // Cat is used by server
  testMerkle("/pks/all", ''),

  tester.verify(
    "Snow giving his key for first time must pass",
    on.pksAdd(pubkeySnow),
    is.expectedPubkey('33BBFC0C67078D72AF128B5BA296CC530126F372')
  ),
  testMerkle("/pks/all", '33BBFC0C67078D72AF128B5BA296CC530126F372'),

  tester.verify(
    "Cat's pubkey'",
    on.pksAdd(pubkeyCat),
    is.expectedPubkey('C73882B64B7E72237A2F460CE9CAB76D19A8651E')
  ),
  testMerkle("/pks/all", '5DB500A285BD380A68890D09232475A8CA003DC8'),

  tester.verify(
    "Tobi giving his key for first time must pass",
    on.pksAdd(pubkeyTobi),
    is.expectedPubkey('2E69197FAB029D8669EF85E82457A1587CA0ED9C')
  ),
  testMerkle("/pks/all", 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'),

  tester.verify(
    "Tobi giving again same key",
    on.pksAdd(pubkeyTobi),
    is.expectedHTTPCode(400)
  ),
  testMerkle("/pks/all", 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'),

  tester.verify(
    "White giving his key must pass",
    on.pksAdd(pubkeyWhite),
    is.expectedPubkey('B6AE93DDE390B1E11FA97EEF78B494F99025C77E')
  ),
  testMerkle("/pks/all", '7B66992FD748579B0774EDFAD7AB84143357F7BC'),

];

function testMerkle (url, root) {
  return tester.verify(
    "merkle " + url,
    on.doGet(url),
    is.expectedMerkle(root)
  );
}

before(function (done) {
  logger.debug("Launching server...");
  this.timeout(1000*3); // In seconds
  var server = ucoin.createPKSServer({ name: currency, listenBMA: true, resetData: true }, {
    currency: currency,
    pgpkey: fs.readFileSync(__dirname + "/../data/lolcat.priv"),
    pgppasswd: 'lolcat',
    ipv4: '127.0.0.1',
    port: 9106,
    remoteipv4: '127.0.0.1',
    remoteport: 9106,
    sync: {
      AMStart: now,
      AMFreq: 1, // Every second
      UDFreq: 2, // Dividend every 5 seconds
      UD0: 10,
      UDPercent: 0.5, // So it can be tested under 4 UD - this ultra high value of UD growth
      Consensus: 2/3
    }
  });
  server.on('BMALoaded', function (err, appReady) {
    async.waterfall([
      function (next){
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
