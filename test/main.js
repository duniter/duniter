var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var request  = require('supertest');
var fs       = require('fs');
var sha1     = require('sha1');
var jpgp     = require('../app/lib/jpgp');
var server   = require('../app/lib/server');
var mongoose = require('mongoose');

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

var joinSnow      = fs.readFileSync(__dirname + '/data/membership/snow.join', 'utf8');
var joinCat       = fs.readFileSync(__dirname + '/data/membership/lolcat.join', 'utf8');
var joinTobi      = fs.readFileSync(__dirname + '/data/membership/tobi.join', 'utf8');

var voteCatAM0    = fs.readFileSync(__dirname + '/data/votes/BB-AM0/OK-lolcat.vote', 'utf8');
var voteTobiAM0   = fs.readFileSync(__dirname + '/data/votes/BB-AM0/OK-tobi.vote', 'utf8');
var voteSnowAM0   = fs.readFileSync(__dirname + '/data/votes/BB-AM0/OK-snow.vote', 'utf8');
var voteSnowAM0_2 = fs.readFileSync(__dirname + '/data/votes/BB-AM0/OK-snow.dissident.vote', 'utf8');
var voteSnowAM1   = fs.readFileSync(__dirname + '/data/votes/BB-AM1/OK-snow.vote', 'utf8');

var app;
var apiRes = {
  '/pks/add': [],
  '/pks/lookup?op=index&search=': [],
  '/hdc/community/join': [],
  '/hdc/community/memberships': [],
  '/hdc/community/memberships?extract=true': [],
  '/hdc/amendments/votes': []
};

function post (url, data, done) {
  request(app)
    .post(url)
    .send(data)
    .end(onHttpResult(url, done));
}

function get (url, done) {
  request(app)
    .get(url)
    .end(onHttpResult(url, done));
}

function onHttpResult (url, done) {
  if(!apiRes[url])
    apiRes[url] = [];
  return function (err, res) {
    apiRes[url].push({
      res: res
    });
    done();
  }
}

function pksAdd (keytext, keysign, done) {
  post('/pks/add', {
    "keytext": keytext,
    "keysign": keysign
  }, done);
}

function communityJoin (join, done) {
  post('/hdc/community/join', {
    "request": join.substr(0, join.indexOf('-----BEGIN')),
    "signature": join.substr(join.indexOf('-----BEGIN'))
  }, done);
}

function vote (voteFile, done) {
  post('/hdc/amendments/votes', {
    "amendment": voteFile.substr(0, voteFile.indexOf('-----BEGIN')),
    "signature": voteFile.substr(voteFile.indexOf('-----BEGIN'))
  }, done);
}

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
    function (next) { pksAdd(pubkeySnow, pubkeySnowSig, next); },
    function (next) { get('/pks/lookup?op=index&search=', next); },
    function (next) { pksAdd(pubkeyCat, pubkeyCatSig, next); },
    function (next) { get('/pks/lookup?op=index&search=', next); },
    function (next) { pksAdd(pubkeyTobi, pubkeyTobiSig, next); },
    function (next) { get('/pks/lookup?op=index&search=', next); },
    function (next) { pksAdd(pubkeyTobi, pubkeySnowSig, next); },
    function (next) { get('/pks/lookup?op=index&search=', next); },
    function (next) { get('/hdc/community/memberships', next); },
    function (next) { get('/hdc/community/memberships?extract=true', next); },
    function (next) { communityJoin(joinSnow, next); },
    function (next) { get('/hdc/community/memberships', next); },
    function (next) { get('/hdc/community/memberships?extract=true', next); },
    function (next) { communityJoin(joinTobi, next); },
    function (next) { get('/hdc/community/memberships', next); },
    function (next) { get('/hdc/community/memberships?extract=true', next); },
    function (next) { communityJoin(joinCat, next); },
    function (next) { get('/hdc/community/memberships', next); },
    function (next) { get('/hdc/community/memberships?extract=true', next); },
    function (next) { vote(voteCatAM0, next); },
    function (next) { vote(voteTobiAM0, next); },
    function (next) { vote(voteSnowAM0, next); },
    function (next) { get('/hdc/amendments/votes', next); },
    function (next) { vote(voteSnowAM0_2, next); },
    function (next) { vote(voteSnowAM1, next); },
    function (next) { get('/hdc/amendments/votes', next); },
    function (next) { get('/hdc/amendments/current', next); },
  ], function (err) {
    console.log("API fed.");
    done(err);
  });
});

//----------- PKS -----------

function checkPKSres (index, keyCount, status) {
  return function () {
    var add = apiRes['/pks/add'][index].res;
    var lookup = apiRes['/pks/lookup?op=index&search='][index].res;
    add.should.have.status(status);
    isPubKey(JSON.parse(add.text));
    lookup.should.have.status(200);
    var json = JSON.parse(lookup.text);
    json.should.have.property('keys');
    json.keys.length.should.equal(keyCount);
  }
}

describe('Sending public key', function(){
  var index = -1;
  var url = '/pks/add';
  var url2 = '/pks/lookup?op=index&search=';
  it('of John Snow should respond 200', checkPKSres(++index, 1, 200));
  it('of LoL Cat should respond 200', checkPKSres(++index, 2, 200));
  it('of Tobi Uchiha should respond 200', checkPKSres(++index, 3, 200));
  it('of Tobi Uchiha with signature of John Snow should respond 400', function(){
    // Issue refactoring because of status
    apiRes[url][++index].res.should.have.status(400);
    apiRes[url2][index].res.should.have.status(200);
    var json = JSON.parse(apiRes[url2][index].res.text);
    json.should.have.property('keys');
    json.keys.length.should.equal(3);
  });
});

//----------- Memberships -----------

function checkJoin (index) {
  return function(){
    var json = JSON.parse(apiRes['/hdc/community/join'][index].res.text);
    json.should.have.property('request');
    json.should.have.property('signature');
  }
}

function checkMemberships (index, leavesCount, root) {
  return function(){
    var json = JSON.parse(apiRes['/hdc/community/memberships'][index].res.text);
    var jsonEx = JSON.parse(apiRes['/hdc/community/memberships?extract=true'][index].res.text);
    isMerkleNodesResult(json);
    if(root)
      json.merkle.levels[0].nodes[0].should.equal(root);
    else
      json.merkle.levels[0].nodes.length.should.equal(0);
    isMerkleLeavesResult(jsonEx);
    jsonEx.merkle.leaves.length.should.equal(leavesCount);
    checkMerkleOfMemberships(jsonEx);
  }
}

function checkMerkleOfMemberships (json) {
  json.merkle.leaves.forEach(function (leaf) {
    var Membership = mongoose.model('Membership');
    var ms = new Membership({
      version: leaf.value.request.version,
      currency: leaf.value.request.currency,
      status: leaf.value.request.status,
      basis: leaf.value.request.basis,
      signature: leaf.value.signature
    });
    leaf.hash.should.equal(sha1(ms.getRaw()).toUpperCase());
  });
}

describe('Sending membership', function(){
  var index = -1;
  it('of John Snow should respond 200', checkJoin(++index));
  it('of LoL Cat should respond 200', checkJoin(++index));
  it('of Tobi Uchiha should respond 200', checkJoin(++index));
  var index2 = -1;
  it('- Merkle root should be ""', checkMemberships(++index2, 0));
  it('- test memberships Merkle with Snowy', checkMemberships(++index2, 1, '0FBA64435A87B7B7CBA2A914A79EB015DD246ECB'));
  it('- test memberships Merkle with Snowy, Cat', checkMemberships(++index2, 2, 'C00DCEB6F1B00D4C0CADCC9E35011C50DE2549AB'));
  it('- test memberships Merkle with Snowy, Cat, Tobi', checkMemberships(++index2, 3, '2A42C5CCC315AF3B9D009CC8E635F8492111F91D'));
});

//----------- Votes -----------

function checkVote (index) {
  return function(){
    var json = JSON.parse(apiRes['/hdc/amendments/votes'][index].res.text);
    apiRes['/hdc/amendments/votes'][index].res.should.have.status(200);
    json.should.have.property('amendment');
    json.should.have.property('signature');
  }
}

function checkIndex1 (index) {
  return function () {
    var json = JSON.parse(apiRes['/hdc/amendments/votes'][index].res.text);
    json.should.have.property('amendments');
    json.amendments.length.should.equal(1);
    json.amendments[0].should.have.property('number');
    json.amendments[0].should.have.property('hashes');
    json.amendments[0].hashes.length.should.equal(1);
    json.amendments[0].hashes[0].should.have.property('hash');
    json.amendments[0].hashes[0].should.have.property('votesCount');
    json.amendments[0].hashes[0].hash.should.equal('376C5A6126A4688B18D95043261B2D59867D4047');
    json.amendments[0].hashes[0].votesCount.should.equal(3);
  };
}

function checkIndex2 (index) {
  return function () {
    var json = JSON.parse(apiRes['/hdc/amendments/votes'][index].res.text);
    json.should.have.property('amendments');
    json.amendments.length.should.equal(2);
    json.amendments[0].should.have.property('number');
    json.amendments[0].should.have.property('hashes');
    json.amendments[0].hashes.length.should.equal(2);
    json.amendments[0].hashes[0].should.have.property('hash');
    json.amendments[0].hashes[0].should.have.property('votesCount');
    json.amendments[0].hashes[0].votesCount.should.equal(3);
    json.amendments[0].hashes[0].hash.should.equal('376C5A6126A4688B18D95043261B2D59867D4047');
    json.amendments[0].hashes[1].should.have.property('hash');
    json.amendments[0].hashes[1].should.have.property('votesCount');
    json.amendments[0].hashes[1].votesCount.should.equal(1);
    json.amendments[0].hashes[1].hash.should.equal('0035C75B49BD5FBB3D01D63B4C9BF2CC0E20B763');
    json.amendments[1].hashes[0].should.have.property('hash');
    json.amendments[1].hashes[0].should.have.property('votesCount');
    json.amendments[1].hashes[0].votesCount.should.equal(1);
    json.amendments[1].hashes[0].hash.should.equal('2C5AF9BC4F355A5BB771B8EE250E97D4451EE578');
  };
}

describe('Sending vote', function(){
  var index = -1;
  it('AM0 of LoL Cat should respond 200', checkVote(++index));
  it('AM0 of Tobi Uchiha should respond 200', checkVote(++index));
  it('AM0 of John Snow should respond 200', checkVote(++index));
  it('- index should have ', checkIndex1(++index));
  it('AM1 of John Snow should respond 200', checkVote(++index));
  it('AM0 (dissident) of John Snow should respond 200', checkVote(++index));
  it('- index should have ', checkIndex2(++index));
});

//----------- Amendments -----------

function checkAmendment (index) {
  return function(){
    var json = JSON.parse(apiRes['/hdc/amendments/current'][index].res.text);
    apiRes['/hdc/amendments/current'][index].res.should.have.status(200);
    json.should.have.property('version');
    json.should.have.property('currency');
    json.should.have.property('number');
    json.should.have.property('previousHash');
    json.should.have.property('dividend');
    json.should.have.property('coinMinPower');
    json.should.have.property('votersSigRoot');
    json.should.have.property('votersRoot');
    json.should.have.property('votersCount');
    json.should.have.property('votersChanges');
    json.should.have.property('membersStatusRoot');
    json.should.have.property('membersRoot');
    json.should.have.property('membersCount');
    json.should.have.property('membersChanges');
    json.should.have.property('raw');
  }
}

describe('Checking amendments', function(){
  var index = -1;
  it('current should respond 200', checkAmendment(++index));
});

function isMerkleNodesResult (json) {
  isMerkleResult(json);
  json.merkle.should.have.property('levels');
}

function isMerkleLeavesResult (json) {
  isMerkleResult(json);
  json.merkle.should.have.property('leaves');
  json.merkle.leaves.forEach(function (leaf) {
    leaf.should.have.property('index');
    leaf.should.have.property('hash');
    leaf.should.have.property('value');
  });
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
  it('GET should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/current')
      .expect(200, done);
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
