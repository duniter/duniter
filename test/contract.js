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

function HTTPTestCase (label, params) {
  
  var that = this;

  // Test label
  this.label = label;

  // Task to be launched
  this.task = function (next) {
    params.task(function (err, res) {

      // Test function
      that.test = _.partial(params.test, res.statusCode, res.text);
      next();
    });
  };
  return this;
}

var testCases = [
  new HTTPTestCase("pks/all", {
    task: function (next) {
      // Do
      getJSON('/pks/all', next);
    },
    test: function (code, json) {
      // Test
      should.exist(code);
      code.should.equal(200);
    }
  }),
  new HTTPTestCase("pks/all", {
    task: function (next) {
      // Do
      getJSON('/pks/all', next);
    },
    test: function (code, json) {
      // Test
      should.exist(code);
      code.should.equal(200);
    }
  }),
];

var app;

function getJSON (url, done) {
  request(app)
    .get(url)
    .end(done);
}

function pksAdd (keytext, keysign, done) {
  post('/pks/add', {
    "keytext": keytext,
    "keysign": keysign
  }, done);
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

describe('PKS: ', function(){

  testCases.forEach(function(testCase){
    it(testCase.label, function () {
      testCase.test();
    });
  });
});
