var should   = require('should');
var fs       = require('fs');
var async    = require('async');
var ucoin    = require('./../..');
var unix2dos = require('../../app/lib/unix2dos');
var parsers  = require('../../app/lib/streams/parsers/doc');
var logger   = require('../../app/lib/logger')('[hdcserver]');

var pubkeyCatRaw = unix2dos(fs.readFileSync(__dirname + '/../data/lolcat.pub', 'utf8'));
var pubkeySnowRaw = unix2dos(fs.readFileSync(__dirname + '/../data/snow.pub', 'utf8'));
var pubkeyUbot1Raw = unix2dos(fs.readFileSync(__dirname + '/../data/ubot1.pub', 'utf8'));

var pubkeyCat, pubkeySnow, pubkeyUbot1;

before(function (done) {
  async.parallel({
    cat: function(callback){
      parsers.parsePubkey().asyncWrite(pubkeyCatRaw, function (err, obj) {
        pubkeyCat = obj;
        callback(err);
      });
    },
    snow: function(callback){
      parsers.parsePubkey().asyncWrite(pubkeySnowRaw, function (err, obj) {
        pubkeySnow = obj;
        callback(err);
      });
    },
    ubot1: function(callback){
      parsers.parsePubkey().asyncWrite(pubkeyUbot1Raw, function (err, obj) {
        pubkeyUbot1 = obj;
        callback(err);
      });
    },
  }, done);
})

describe('A PKS server', function () {

  this.timeout(1000*5);

  var pksServer;
  beforeEach(function (done) {
    pksServer = ucoin.createHDCServer({ name: 'hdc1', resetData: true });
    pksServer.on('services', done);
  })

  afterEach(function (done) {
    pksServer.disconnect(done);
  })
  
  it('should emit error on wrong data type', function (done) {
    pksServer.on('error', function (err) {
      should.exist(err);
      done();
    });
    pksServer.write({ some: 'data' });
  });
  
  it('should accept pubkeys', function (done) {
    pksServer.on('pubkey', function (pubkey) {
      should.exist(pubkey);
      done();
    });
    pksServer.write(pubkeySnow);
  });
  
  it('should allow both simple & multiple writings', function (done) {
    async.parallel([
      until(pksServer, 'pubkey', 2)
    ], done);
    pksServer.singleWriteStream().write(pubkeyUbot1);
    pksServer.singleWriteStream().end();
    pksServer.write(pubkeySnow);
  });
})

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