var ucoin   = require('./..');
var should  = require('should');
var fs      = require('fs');
var async   = require('async');
var parsers = require('../app/lib/streams/parsers/doc');

var pubkeyCatRaw = fs.readFileSync(__dirname + '/data/lolcat.pub', 'utf8');
var pubkeyUbot1Raw = fs.readFileSync(__dirname + '/data/ubot1.pub', 'utf8');

describe('In a unidirectional 2 servers network,', function () {

  this.timeout(3000);

  var serverA = ucoin.createHDCServer({ name: 'hdcA', resetData: true });
  var serverB = ucoin.createHDCServer({ name: 'hdcB', resetData: true });

  serverA.pipe(serverB);
  
  it('writing a pubkey from A should reach B', function (done) {
    async.parallel([
      until(serverB, 'pubkey', 2)
    ], done);
    serverA.writeRawPubkey(pubkeyUbot1Raw);
    // serverB.writeRawPubkey(pubkeyCatRaw);
    // serverA.writeRawPubkey(pubkeyUbot1Raw);
    serverA.writeRawPubkey(pubkeyCatRaw);
  });
});

function until (server, eventName, count) {
  var counted = 0;
  var max = count == undefined ? 1 : count;
  return function (callback) {
    server.on(eventName, function (obj) {
      console.log('event = %s', eventName);
      should.exist(obj);
      counted++;
      if (counted == max)
        callback();
    });
  }
}
