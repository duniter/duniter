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

console.log("Reading files & initializing...");

var currency = "testo";
var now   = new Date().timestamp();
var cat   = signatory(fs.readFileSync(__dirname + "/data/lolcat.priv", 'utf8'), "lolcat");
var tobi  = signatory(fs.readFileSync(__dirname + "/data/uchiha.priv", 'utf8'), "tobi");
var snow  = signatory(fs.readFileSync(__dirname + "/data/snow.priv", 'utf8'), "snow");
var white = signatory(fs.readFileSync(__dirname + "/data/white.priv", 'utf8'), "white");

var pubkeySnow    = fs.readFileSync(__dirname + '/data/snow.pub', 'utf8');
var pubkeySnowSig = fs.readFileSync(__dirname + '/data/snow.pub.asc', 'utf8');
var pubkeyCat     = fs.readFileSync(__dirname + '/data/lolcat.pub', 'utf8');
var pubkeyCatSig  = fs.readFileSync(__dirname + '/data/lolcat.pub.asc', 'utf8');
var pubkeyTobi    = fs.readFileSync(__dirname + '/data/uchiha.pub', 'utf8');
var pubkeyTobiSig = fs.readFileSync(__dirname + '/data/uchiha.pub.asc', 'utf8');
var pubkeyWhite    = fs.readFileSync(__dirname + '/data/white.pub', 'utf8');
var pubkeyWhiteSig = fs.readFileSync(__dirname + '/data/white.pub.asc', 'utf8');

var config = {
  server: {
    port: 8001,
    pgp: {
      key: __dirname + "/data/lolcat.priv",
      password: "lolcat"
    }
  },
  db: {
    database : currency,
    host: "localhost"
  },
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

// Update conf
if(config.server.pgp.key) config.server.pgp.key = fs.readFileSync(config.server.pgp.key, 'utf8');
var conf = {
  ipv4: config.server.ipv4address,
  port: config.server.port,
  pgpkey: config.server.pgp.key,
  pgppasswd: config.server.pgp.password
};

var testCases = [
  {
    label: "some label",
    task: function (next) {
      getJSON('/pks/all', this, function (code, json) {
        should.exist(code);
        code.should.equal(200);
      }, next);
    }
  }
];

var app;

function getJSON (url, obj, test, done) {
  request(app)
    .get(url)
    .end(function (err, res) {
      obj.test = _.partial(test, res.statusCode, res.text);
      done();
    });
}

before(function (done) {
  console.log("Launching server...");
  this.timeout(10000);
  async.waterfall([
    function (next){
      server.database.connect(config.db.database, config.db.host, config.db.port, next);
    },
    function (dbconf, next){
      server.express.app(config.db.database, conf, next);
    },
    function (appReady, next){
      app = appReady;
      server.database.reset(next);
    },
    function (next) {
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

//----------- PKS -----------

describe('Sending public key', function(){

  testCases.forEach(function(testCase){
    it(testCase.label, function () {
      testCase.test();
    });
  });
});
