var ucoin   = require('./../..');
var should  = require('should');
var fs      = require('fs');
var async   = require('async');
var parsers = require('../../app/lib/streams/parsers/doc');
var logger  = require('../../app/lib/logger')('[routing]');

var pubkeyCatRaw = fs.readFileSync(__dirname + '/../data/lolcat.pub', 'utf8');
var pubkeySnowRaw = fs.readFileSync(__dirname + '/../data/snow.pub', 'utf8');
var pubkeyWhiteRaw = fs.readFileSync(__dirname + '/../data/white.pub', 'utf8');
var pubkeyUbot1Raw = fs.readFileSync(__dirname + '/../data/ubot1.pub', 'utf8');

// Only show new data events
require('log4js').configure({});
// require('log4js').configure({
//   "appenders": [
//     { category: "hdcA", type: "console" },
//     { category: "hdcB", type: "console" },
//   ]
// });

describe('In a unidirectional 2 servers network,', function () {

  this.timeout(5000);

  var serverA, serverB;

  beforeEach(function (done) {
    serverA = ucoin.createHDCServer({ name: 'hdcA', resetData: true });
    serverB = ucoin.createHDCServer({ name: 'hdcB', resetData: true });
    serverA.pipe(serverB);
    resetServers(serverA, serverB)(done);
  });
  
  it('writing a pubkey from A should reach B', function (done) {
    async.parallel([
      until(serverA, 'pubkey', 2),
      until(serverB, 'pubkey', 2),
    ], done);
    serverA.writeRawPubkey(pubkeyUbot1Raw);
    serverA.writeRawPubkey(pubkeyCatRaw);
  });
  
  it('writing a pubkey from B should NOT reach A', function (done) {
    async.parallel([
      until(serverA, 'pubkey', 1),
      until(serverB, 'pubkey', 3),
    ], done);
    serverA.writeRawPubkey(pubkeyCatRaw); // A + B
    serverB.writeRawPubkey(pubkeyUbot1Raw); // B
    serverB.writeRawPubkey(pubkeySnowRaw); // B
  });
});

describe('In a bidirectionnal 2 servers network,', function () {

  this.timeout(3000);

  var serverA, serverB;

  beforeEach(function (done) {
    serverA = ucoin.createHDCServer({ name: 'hdcC', resetData: true });
    serverB = ucoin.createHDCServer({ name: 'hdcD', resetData: true });
    serverA.pipe(serverB);
    serverB.pipe(serverA);
    resetServers(serverA, serverB)(done);
  });
  
  it('writing a pubkey from A should reach B', function (done) {
    async.parallel([
      until(serverA, 'pubkey', 3),
      until(serverB, 'pubkey', 3),
    ], done);
    serverA.writeRawPubkey(pubkeyUbot1Raw);
    serverA.writeRawPubkey(pubkeyCatRaw);
    serverA.writeRawPubkey(pubkeySnowRaw);
  });
  
  it('writing a pubkey from B should reach A', function (done) {
    async.parallel([
      until(serverA, 'pubkey', 3),
      until(serverB, 'pubkey', 3),
    ], done);
    serverB.writeRawPubkey(pubkeyUbot1Raw);
    serverB.writeRawPubkey(pubkeyCatRaw);
    serverB.writeRawPubkey(pubkeySnowRaw);
  });
});

describe('In an oriented 5 servers network,', function () {

  var serverA, serverB, serverC, serverD, serverE;

  this.timeout(3000);

  before(function (done) {

    serverA = ucoin.createHDCServer({ name: 'test_A', resetData: true });
    serverB = ucoin.createHDCServer({ name: 'test_B', resetData: true });
    serverC = ucoin.createHDCServer({ name: 'test_C', resetData: true });
    serverD = ucoin.createHDCServer({ name: 'test_D', resetData: true });
    serverE = ucoin.createHDCServer({ name: 'test_E', resetData: true });

    serverA.pipe(serverB).pipe(serverA); // A ◀--▶ B
    serverB.pipe(serverC).pipe(serverB); // B ◀--▶ C
    serverB.pipe(serverD).pipe(serverB); // B ◀--▶ D
    serverD.pipe(serverE); // D --▶ E

    // A ◀--▶ B ◀--▶ C
    //        ▲
    //        |
    //        ▼
    //        D --▶ E

    async.parallel([
      function(cb){ serverA.on('services', cb) },
      function(cb){ serverB.on('services', cb) },
      function(cb){ serverC.on('services', cb) },
      function(cb){ serverD.on('services', cb) },
      function(cb){ serverE.on('services', cb) },
    ], done);
  })
  
  it('writing a 4 pubkeys with 1 to receveing server should give 3 to every node, but 4 for receveing', function (done) {
    async.parallel([
      until(serverA, 'pubkey', 3),
      until(serverB, 'pubkey', 3),
      until(serverC, 'pubkey', 3),
      until(serverD, 'pubkey', 3),
      until(serverE, 'pubkey', 4),
    ], done);
    serverA.writeRawPubkey(pubkeyCatRaw);
    serverB.writeRawPubkey(pubkeySnowRaw);
    serverD.writeRawPubkey(pubkeyWhiteRaw);
    serverE.writeRawPubkey(pubkeyUbot1Raw);
  });
});

function resetServers () {
  process.stdout.write(''); // Why this? Because otherwise, test is stuck
  var nbArgs = arguments.length;
  var resets = [];
  for (var i = 0; i < (nbArgs || 0); i++) {
    var server = arguments[i];
    resets.push(function (done) {
      async.series([
        function (cb) {
          server.on('services', cb);
        },
        server.reset
      ], done);
    });
  }
  return function (done) {
    async.parallel(resets, done);
  };
}

function until (server, eventName, count) {
  var counted = 0;
  var max = count == undefined ? 1 : count;
  return function (callback) {
    server.on(eventName, function (obj) {
      logger.trace('event = %s', eventName);
      should.exist(obj);
      counted++;
      if (counted == max)
        callback();
    });
  }
}
