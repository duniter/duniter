var should  = require('should');
var assert  = require('assert');
var request = require('supertest');
var fs      = require('fs');
var jpgp    = require('../app/lib/jpgp');
var server  = require('../app/lib/server');

var config = {
  server: {
    port: 8001,
    pgp: {
      key: __dirname + "/data/lolcat.priv",
      password: "lolcat"
    }
  },
  db: {
    database : "ucoin_test",
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

var gets = [
  {expect: 501, url: '/pks/all'},
  {expect: 501, url: '/ucg/tht'},
  {expect: 501, url: '/ucg/tht/2E69197FAB029D8669EF85E82457A1587CA0ED9C'},
  {expect: 501, url: '/hdc/amendments/current'},
  {expect: 501, url: '/hdc/amendments/view/000001/members'},
  {expect: 501, url: '/hdc/amendments/view/000001/self'},
  {expect: 501, url: '/hdc/amendments/view/000001/voters'},
  {expect: 501, url: '/hdc/amendments/votes'},
  {expect: 501, url: '/hdc/amendments/votes/SOME_AM_ID/signatures'},
  {expect: 501, url: '/hdc/coins/SOME_PGP_FPR/list'},
  {expect: 501, url: '/hdc/coins/SOME_PGP_FPR/view/COIN_ID'},
  {expect: 501, url: '/hdc/community/votes'},
  {expect: 501, url: '/hdc/transactions/all'},
  {expect: 501, url: '/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C'},
  {expect: 501, url: '/hdc/transactions/recipient/2E69197FAB029D8669EF85E82457A1587CA0ED9C'},
  {expect: 501, url: '/hdc/transactions/view/SOME_TX_ID'}
];

var posts = [
  {expect: 501, url: '/ucg/tht'},
  {expect: 501, url: '/hdc/transactions/process/issuance'},
  {expect: 501, url: '/hdc/transactions/process/transfert'},
  {expect: 501, url: '/hdc/transactions/process/fusion'}
];

function testGET(url, expect) {
  describe('GET on ' + url, function(){
    it(' expect answer ' + expect, function(done){
      request(app)
        .get(url)
        .expect(expect, done);
    });
  });
}

function testPOST(url, expect) {
  describe('GET on ' + url, function(){
    it(' expect answer ' + expect, function(done){
      request(app)
        .post(url)
        .expect(expect, done);
    });
  });
}

var app;
before(function (done) {
  server.database.connect(config.db.database, config.db.host, config.db.port, function (err, dbconf) {
    server.express.app(config.db.database, conf, function (err, appReady) {
      app = appReady;
      done();
    });
  });
});

for (var i = 0; i < gets.length; i++) {
  testGET(gets[i].url, gets[i].expect);
}

for (var i = 0; i < posts.length; i++) {
  testPOST(posts[i].url, posts[i].expect);
}

//----------- PKS -----------
describe('Request on /pks/lookup', function(){
  it('GET should respond 200 with search=a&op=get', function(done){
    request(app)
      .get('/pks/lookup?search=a&op=get')
      .expect(200, done);
  });
  it('GET should respond 500 without search parameter', function(done){
    request(app)
      .get('/pks/lookup')
      .expect(500, done);
  });
  it('GET should respond 500 with search=a without op', function(done){
    request(app)
      .get('/pks/lookup')
      .expect(500, done);
  });
  it('POST should respond 404', function(done){
    request(app)
      .post('/pks/lookup')
      .expect(404, done);
  });
});


describe('Request on /pks/add', function(){
  it('POST should respond 400 BAD REQUEST', function(done){
    request(app)
      .post('/pks/add')
      .expect(400, done);
  });
});



//----------- UCG -----------
describe('GET', function(){
  it('/ucg/pubkey should respond 200 and serve valid pubkey of LoL Cat', function(done){
    request(app)
      .get('/ucg/pubkey')
      .expect(200)
      .end(function (err, res) {
       jpgp().certificate(res.text).fingerprint.should.equal("C73882B64B7E72237A2F460CE9CAB76D19A8651E");
        done();
      });
  });
  it('/ucg/peering should respond 200 and serve valid peering info', function(done){
    request(app)
      .get('/ucg/peering')
      .expect(200)
      .end(function (err, res) {
        var json = JSON.parse(res.text);
        json.currency.should.equal("ucoin_test");
        json.key.should.equal("C73882B64B7E72237A2F460CE9CAB76D19A8651E");
        should.not.exist(json.ipv4);
        should.not.exist(json.ipv6);
        should.not.exist(json.remote.port);
        should.not.exist(json.remote.host);
        json.peers.length.should.equal(0);
        done();
      });
  });
});


//----------- Community -----------
describe('Request on /hdc/community/join', function(){
  it('GET should respond 404', function(done){
    request(app)
      .get('/hdc/community/join')
      .expect(404, done);
  });
  it('POST should respond 400', function(done){
    request(app)
      .post('/hdc/community/join')
      .expect(400, done);
  });
});

describe('Request on /hdc/community/members', function(){
  it('GET should respond 200', function(done){
    request(app)
      .get('/hdc/community/members')
      .expect(200, done);
  });
  it('POST should respond 404', function(done){
    request(app)
      .post('/hdc/community/members')
      .expect(404, done);
  });
});

//----------- AMENDMENTS -----------
describe('Request on /hdc/amendments/init', function(){
  it('GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/init')
      .expect(404, done);
  });
});

describe('Request on /hdc/amendments/submit', function(){
  it('GET should respond 404', function(done){
    request(app)
      .post('/hdc/amendments/submit')
      .expect(404, done);
  });
});

describe('Request on /hdc/amendments/votes', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/hdc/amendments/votes')
      .expect(501, done);
  });
  it('POST should respond 400', function(done){
    request(app)
      .post('/hdc/amendments/votes')
      .expect(400, done);
  });
});