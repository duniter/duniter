var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var request  = require('supertest');
var fs       = require('fs');
var sha1     = require('sha1');
var _        = require('underscore');
var server   = require('../../app/lib/server');
var mongoose = require('mongoose');

var config = {
  server: {
    port: 8001,
    pgp: {
      key: __dirname + "/../data/lolcat.priv",
      password: "lolcat"
    }
  },
  db: {
    database : "beta_brousouf",
    host: "localhost"
  }
};

// Update conf
if(config.server.pgp.key) config.server.pgp.key = fs.readFileSync(config.server.pgp.key, 'utf8');
var conf = {
  ipv4: config.server.ipv4address,
  ipv4: config.server.ipv4address,
  port: config.server.port,
  pgpkey: config.server.pgp.key,
  pgppasswd: config.server.pgp.password
};

var app;
var apiRes = {};

before(function (done) {
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
  ], function (err) {
    console.log("API fed.");
    done(err);
  });
});

describe('Request on /hdc/amendments/current', function(){
  it('GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/current')
      .expect(404, done);
  });
});
