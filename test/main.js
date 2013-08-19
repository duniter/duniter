var should  = require('should');
var assert  = require('assert');
var async   = require('async');
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

var gets = [
  {expect: 501, url: '/pks/all'},
  {expect: 501, url: '/ucg/tht'},
  {expect: 501, url: '/ucg/tht/2E69197FAB029D8669EF85E82457A1587CA0ED9C'},
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

console.log("Reading files...");
var pubkeySnow    = fs.readFileSync(__dirname + '/data/snow.pub', 'utf8');
var pubkeySnowSig = fs.readFileSync(__dirname + '/data/snow.pub.asc', 'utf8');
var pubkeyCat     = fs.readFileSync(__dirname + '/data/lolcat.pub', 'utf8');
var pubkeyCatSig  = fs.readFileSync(__dirname + '/data/lolcat.pub.asc', 'utf8');
var pubkeyTobi    = fs.readFileSync(__dirname + '/data/uchiha.pub', 'utf8');
var pubkeyTobiSig = fs.readFileSync(__dirname + '/data/uchiha.pub.asc', 'utf8');

var joinSnow = fs.readFileSync(__dirname + '/data/membership/snow.join', 'utf8');
var joinCat  = fs.readFileSync(__dirname + '/data/membership/lolcat.join', 'utf8');
var joinTobi = fs.readFileSync(__dirname + '/data/membership/tobi.join', 'utf8');

var app;
var apiRes = {
  '/pks/add': [],
  '/pks/lookup?op=index&search=': [],
  '/hdc/community/join': [],
  '/hdc/community/memberships': []
};
before(function (done) {
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
      request(app)
        .post('/pks/add')
        .send({
          "keytext": pubkeySnow,
          "keysign": pubkeySnowSig
        })
        .end(function (err, res) {
          apiRes['/pks/add'].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/pks/lookup?op=index&search=';
      request(app)
        .get(url)
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      request(app)
        .post('/pks/add')
        .send({
          "keytext": pubkeyCat,
          "keysign": pubkeyCatSig
        })
        .end(function (err, res) {
          apiRes['/pks/add'].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/pks/lookup?op=index&search=';
      request(app)
        .get(url)
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      request(app)
        .post('/pks/add')
        .send({
          "keytext": pubkeyTobi,
          "keysign": pubkeyTobiSig
        })
        .end(function (err, res) {
          apiRes['/pks/add'].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/pks/lookup?op=index&search=';
      request(app)
        .get(url)
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      request(app)
        .post('/pks/add')
        .send({
          "keytext": pubkeyTobi,
          "keysign": pubkeySnowSig
        })
        .end(function (err, res) {
          apiRes['/pks/add'].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/pks/lookup?op=index&search=';
      request(app)
        .get(url)
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/hdc/community/memberships';
      request(app)
        .get(url)
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/hdc/community/join';
      request(app)
        .post(url)
        .send({
          "request": joinSnow.substr(0, joinSnow.indexOf('-----BEGIN')),
          "signature": joinSnow.substr(joinSnow.indexOf('-----BEGIN'))
        })
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/hdc/community/memberships';
      request(app)
        .get(url)
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/hdc/community/join';
      request(app)
        .post(url)
        .send({
          "request": joinTobi.substr(0, joinTobi.indexOf('-----BEGIN')),
          "signature": joinTobi.substr(joinTobi.indexOf('-----BEGIN'))
        })
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/hdc/community/memberships';
      request(app)
        .get(url)
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/hdc/community/join';
      request(app)
        .post(url)
        .send({
          "request": joinCat.substr(0, joinCat.indexOf('-----BEGIN')),
          "signature": joinCat.substr(joinCat.indexOf('-----BEGIN'))
        })
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
    function (next) {
      var url = '/hdc/community/memberships';
      request(app)
        .get(url)
        .end(function (err, res) {
          apiRes[url].push({
            res: res
          });
          next();
        });
    },
  ], function (err) {
    console.log("API fed.");
    done(err);
  });
});

//----------- PKS -----------
describe('Sending public key', function(){
  var index = -1;
  var url = '/pks/add';
  it('of John Snow should respond 200', function(){
    apiRes[url][++index].res.should.have.status(200);
    isPubKey(JSON.parse(apiRes[url][index].res.text));
  });
  it('of LoL Cat should respond 200', function(){
    apiRes[url][++index].res.should.have.status(200);
    isPubKey(JSON.parse(apiRes[url][index].res.text));
  });
  it('of Tobi Uchiha should respond 200', function(){
    apiRes[url][++index].res.should.have.status(200);
    isPubKey(JSON.parse(apiRes[url][index].res.text));
  });
  it('of Tobi Uchiha with signature of John Snow should respond 400', function(){
    apiRes[url][++index].res.should.have.status(400);
  });
});

describe('Sending membership', function(){
  var index = -1;
  var url = '/hdc/community/join';
  it('of John Snow should respond 200', function(){
    var json = JSON.parse(apiRes[url][++index].res.text);
    json.should.have.property('request');
    json.should.have.property('signature');
  });
  it('of LoL Cat should respond 200', function(){
    var json = JSON.parse(apiRes[url][++index].res.text);
    json.should.have.property('request');
    json.should.have.property('signature');
  });
  it('of Tobi Uchiha should respond 200', function(){
    var json = JSON.parse(apiRes[url][++index].res.text);
    json.should.have.property('request');
    json.should.have.property('signature');
  });
  var index2 = -1;
  var url2 = '/hdc/community/memberships';
  it('- Merkle root should be ""', function(){
    var json = JSON.parse(apiRes[url2][++index2].res.text);
    isMerkleNodesResult(json);
    json.merkle.levels[0].nodes.length.should.equal(0);
  });
  it('- Merkle root should be 0FBA64435A87B7B7CBA2A914A79EB015DD246ECB', function(){
    var json = JSON.parse(apiRes[url2][++index2].res.text);
    isMerkleNodesResult(json);
    json.merkle.levels[0].nodes[0].should.equal('0FBA64435A87B7B7CBA2A914A79EB015DD246ECB');
  });
  it('- Merkle root should be C00DCEB6F1B00D4C0CADCC9E35011C50DE2549AB', function(){
    var json = JSON.parse(apiRes[url2][++index2].res.text);
    isMerkleNodesResult(json);
    json.merkle.levels[0].nodes[0].should.equal('C00DCEB6F1B00D4C0CADCC9E35011C50DE2549AB');
  });
  it('- Merkle root should be 2A42C5CCC315AF3B9D009CC8E635F8492111F91D', function(){
    var json = JSON.parse(apiRes[url2][++index2].res.text);
    isMerkleNodesResult(json);
    json.merkle.levels[0].nodes[0].should.equal('2A42C5CCC315AF3B9D009CC8E635F8492111F91D');
  });
});

function isMerkleNodesResult (json) {
  isMerkleResult(json);
  json.merkle.should.have.property('levels');
}

function isMerkleLeavesResult (json) {
  isMerkleResult(json);
  json.merkle.should.have.property('leaves');
}

function isMerkleResult (json) {
  json.should.have.property('merkle');
  json.merkle.should.have.property('depth');
  json.merkle.should.have.property('nodesCount');
  json.merkle.should.have.property('levelsCount');
}

function isPubKey (json) {
  json.should.have.property('email');
  json.should.have.property('name');
  json.should.have.property('fingerprint');
  json.should.have.property('raw');
  json.should.not.have.property('_id');
  json.raw.should.not.match(/-----/g);
}

// for (var i = 0; i < gets.length; i++) {
//   testGET(gets[i].url, gets[i].expect);
// }

// for (var i = 0; i < posts.length; i++) {
//   testPOST(posts[i].url, posts[i].expect);
// }

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
        json.currency.should.equal("beta_brousouf");
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

describe('Request on /hdc/community/memberships', function(){
  it('GET should respond 200', function(done){
    request(app)
      .get('/hdc/community/memberships')
      .expect(200, done);
  });
  it('POST should respond 404', function(done){
    request(app)
      .post('/hdc/community/memberships')
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
  it('GET should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/votes')
      .expect(200, done);
  });
  it('POST should respond 400', function(done){
    request(app)
      .post('/hdc/amendments/votes')
      .expect(400, done);
  });
});

describe('Request on /hdc/amendments/current', function(){
  it('GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/current')
      .expect(404, done);
  });
});

describe('Request on /hdc/amendments/view/SOME_ID', function(){
  it('/self GET should respond 400', function(done){
    request(app)
      .get('/hdc/amendments/view/SOME_ID/self')
      .expect(400, done);
  });
  it('/members GET should respond 400', function(done){
    request(app)
      .get('/hdc/amendments/view/SOME_ID/members')
      .expect(400, done);
  });
  it('/voters GET should respond 400', function(done){
    request(app)
      .get('/hdc/amendments/view/SOME_ID/voters')
      .expect(400, done);
  });
  it('/signatures GET should respond 400', function(done){
    request(app)
      .get('/hdc/amendments/view/SOME_ID/signatures')
      .expect(400, done);
  });
  it('/status GET should respond 400', function(done){
    request(app)
      .get('/hdc/amendments/view/SOME_ID/status')
      .expect(400, done);
  });
  // Good param
  it('/self GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/signatures/self')
      .expect(404, done);
  });
  it('/members GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/signatures/members')
      .expect(404, done);
  });
  it('/voters GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/signatures/voters')
      .expect(404, done);
  });
  it('/signatures GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/signatures/signatures')
      .expect(404, done);
  });
  it('/status GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/signatures/status')
      .expect(404, done);
  });
});

describe('Request on /hdc/amendments/votes/:amendment_id/signatures', function(){
  it('GET with good URL param should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/votes/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/signatures')
      .expect(200, done);
  });
  it('POST should respond 404', function(done){
    request(app)
      .post('/hdc/amendments/votes/SOME_AM_ID/signatures')
      .expect(404, done);
  });
  it('GET with wrong URL param should respond 400', function(done){
    request(app)
      .get('/hdc/amendments/votes/SOME_AM_ID/signatures')
      .expect(400, done);
  });
});
