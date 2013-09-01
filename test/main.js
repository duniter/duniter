var should   = require('should');
var assert   = require('assert');
var async    = require('async');
var request  = require('supertest');
var fs       = require('fs');
var sha1     = require('sha1');
var _        = require('underscore');
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
  {expect: 501, url: '/ucg/tht'},
  {expect: 501, url: '/ucg/tht/2E69197FAB029D8669EF85E82457A1587CA0ED9C'},
  {expect: 501, url: '/hdc/transactions/recipient/2E69197FAB029D8669EF85E82457A1587CA0ED9C'},
  {expect: 501, url: '/hdc/transactions/view/SOME_TX_ID'}
];

var posts = [
  {expect: 501, url: '/ucg/tht'},
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
  describe('POST on ' + url, function(){
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
var pubkeyWhite    = fs.readFileSync(__dirname + '/data/white.pub', 'utf8');
var pubkeyWhiteSig = fs.readFileSync(__dirname + '/data/white.pub.asc', 'utf8');

var joinSnow      = fs.readFileSync(__dirname + '/data/membership/snow.join', 'utf8');
var joinCat       = fs.readFileSync(__dirname + '/data/membership/lolcat.join', 'utf8');
var joinTobi      = fs.readFileSync(__dirname + '/data/membership/tobi.join', 'utf8');
var joinWhite     = fs.readFileSync(__dirname + '/data/membership/white.join', 'utf8');

var voteCatAM0    = fs.readFileSync(__dirname + '/data/votes/BB-AM0/OK-lolcat.vote', 'utf8');
var voteTobiAM0   = fs.readFileSync(__dirname + '/data/votes/BB-AM0/OK-tobi.vote', 'utf8');
var voteSnowAM0   = fs.readFileSync(__dirname + '/data/votes/BB-AM0/OK-snow.vote', 'utf8');
var voteSnowAM0_2 = fs.readFileSync(__dirname + '/data/votes/BB-AM0/OK-snow.dissident.vote', 'utf8');
var voteSnowAM1   = fs.readFileSync(__dirname + '/data/votes/BB-AM1/snow.vote', 'utf8');
var voteTobiAM1   = fs.readFileSync(__dirname + '/data/votes/BB-AM1/tobi.vote', 'utf8');
var voteCatAM1    = fs.readFileSync(__dirname + '/data/votes/BB-AM1/cat.vote', 'utf8');
var voteWhiteAM1  = fs.readFileSync(__dirname + '/data/votes/BB-AM1/white.vote', 'utf8');
var voteSnowAM2   = fs.readFileSync(__dirname + '/data/votes/BB-AM2/snow.vote', 'utf8');
var voteTobiAM2   = fs.readFileSync(__dirname + '/data/votes/BB-AM2/tobi.vote', 'utf8');
var voteCatAM2    = fs.readFileSync(__dirname + '/data/votes/BB-AM2/cat.vote', 'utf8');

var txTobi = fs.readFileSync(__dirname + '/data/tx/tobi.issuance', 'utf8');
var txTobiToSnow = fs.readFileSync(__dirname + '/data/tx/tobi.transfert.snow', 'utf8');
var txTobiFusion = fs.readFileSync(__dirname + '/data/tx/tobi.fusion.7', 'utf8');

var app;

function ResultAPI () {
  
  this.apiRes = {};
  this.apiStack = [];

  this.pksAllIndex = 0;
  this.pksAddIndex = 0;
  this.pksLookupIndex = 0;
  this.joinIndex = 0;
  this.membershipsIndex = 0;

  this.push = function (url, res) {
    if(!this.apiRes[url]) this.apiRes[url] = [];
    this.apiRes[url].push({ res: res });
    this.apiStack.push(url);
  };

  this.last = function () {
    return this.apiRes[this.apiStack[this.apiStack.length - 1]][_(this.apiRes).size() - 1].res;
  };

  this.pksAll = function(status, expectCount, expectHash) {
    var index = this.pksAllIndex++;
    var obj = this;
    it('expect to see ' + expectCount + ' keys with root hash ' + expectHash, function () {
      var res = obj.apiRes['/pks/all'][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(status);
      isMerkleNodesResult(json);
      json.merkle.leavesCount.should.equal(expectCount);
      if(expectCount == 0){
        json.merkle.levels.should.have.property("0");
        json.merkle.levels["0"].should.have.length(0);
        json.merkle.levels["0"].should.have.length(0);
      }
      else{
        json.merkle.levels.should.have.property("0");
        json.merkle.levels["0"].should.have.length(1);
        json.merkle.levels["0"][0].should.equal(expectHash);
      }
    })
  };

  this.pksAdd = function(status) {
    var index = this.pksAddIndex++;
    var obj = this;
    it('expect to have status ' + status + ' for pks/add', function () {
      var res = obj.apiRes['/pks/add'][index].res;
      res.should.have.status(status);
      if(status == 200){
        var json = JSON.parse(res.text);
        isPubKey(json);
      }
    })
  };

  this.pksLookup = function(status, keyCount) {
    var index = this.pksLookupIndex++;
    var obj = this;
    it('expect to have status ' + status + ' and ' + keyCount + ' keys for pks/lookup', function () {
      var res = obj.apiRes['/pks/lookup?op=index&search='][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(status);
      json.should.have.property('keys');
      json.keys.length.should.equal(keyCount);
    })
  };

  this.join = function(comment) {
    var index = this.joinIndex++;
    var obj = this;
    it('expect membership accepted for ' + comment, function () {
      var res = obj.apiRes['/hdc/community/join'][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(200);
      json.should.have.property('request');
      json.should.have.property('signature');
    })
  };

  this.memberships = function(comment, leavesCount, root) {
    var index = this.membershipsIndex++;
    var obj = this;
    it('expect ' + comment, function () {
      var res = obj.apiRes['/hdc/community/memberships'][index].res;
      var resEx = obj.apiRes['/hdc/community/memberships?extract=true'][index].res;
      var json = JSON.parse(res.text);
      var jsonEx = JSON.parse(resEx.text);
      res.should.have.status(200);
      resEx.should.have.status(200);
      isMerkleNodesResult(json);
      if(root)
        json.merkle.levels[0][0].should.equal(root);
      else
        _(json.merkle.levels[0]).size().should.equal(0);
      isMerkleLeavesResult(jsonEx);
      _(jsonEx.merkle.leaves).size().should.equal(leavesCount);
      checkMerkleOfMemberships(jsonEx);
    });
  };

  this.coinsList = function(type, owner, coinsCount) {
    if(!this['indexOf' + owner])
      this['indexOf' + owner] = 0;
    var index = this['indexOf' + owner]++;
    var obj = this;
    it(type + ' of owner ' + owner + ' should respond 200 with ' + coinsCount + ' coins', function () {
      var url = '/hdc/coins/'+owner+'/list';
      var res = obj.apiRes[url][index].res;
      var json = JSON.parse(res.text);
      res.should.have.status(200);
      json.owner.should.equal(owner);
      if(coinsCount > 0){
        json.coins.should.have.length(1);
        json.coins[0].ids.should.have.length(coinsCount);
      }
      else{
        json.coins.should.have.length(0);
      }
    });
  };

  this.txAllMerkle = function(type, root, txCount) {
    if(!this['indexTxAll'])
      this['indexTxAll'] = 0;
    var index = this['indexTxAll']++;
    var obj = this;
    it('after ' + type + ' tx/all should respond 200 with ' + txCount + ' transactions', function () {
      var url = '/hdc/transactions/all';
      checkTxMerkle(obj, url, index, txCount, root);
    });
  };

  this.txSenderMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '', 'sender', type, owner, root, txCount);
  };

  this.txIssuerMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/issuance', 'issuance', type, owner, root, txCount);
  };

  this.txIssuerDividendMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/issuance/dividend', 'dividend', type, owner, root, txCount);
  };

  this.txIssuerDividen2dMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/issuance/dividend/2', 'dividend2', type, owner, root, txCount);
  };

  this.txIssuerTransfertMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/transfert', 'transfert', type, owner, root, txCount);
  };

  this.txIssuerFusionMerkle = function(type, owner, root, txCount) {
    checkTxMerklePath(this, '/issuance/fusion', 'fusion', type, owner, root, txCount);
  };

  function checkTxMerklePath(obj, path, name, type, owner, root, txCount) {
    if(!obj['specialIndex'+name+owner])
      obj['specialIndex'+name+owner] = 0;
    var index = obj['specialIndex'+name+owner]++;
    it('after ' + type + ' tx of owner '+owner+' should respond 200 with ' + txCount + ' transactions', function () {
      var url = '/hdc/transactions/sender/'+owner+path;
      checkTxMerkle(obj, url, index, txCount, root);
    });
  }

  function checkTxMerkle(obj, url, index, txCount, root){
    var res = obj.apiRes[url][index].res;
    var json = JSON.parse(res.text);
    res.should.have.status(200);
    isMerkleNodesResult(json);
    json.merkle.leavesCount.should.equal(txCount);
    if(txCount > 0)
      json.merkle.levels[0][0].should.equal(root);
    else
      should.not.exist(json.merkle.levels[0][0]);
  }
}

var api = new ResultAPI();
var apiRes = {};

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
  if(!apiRes[url]) apiRes[url] = [];
  return function (err, res) {
    api.push(url, res);
    apiRes[url].push({ res: res });
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

function issue (txFile, done) {
  post('/hdc/transactions/process/issuance', {
    "transaction": txFile.substr(0, txFile.indexOf('-----BEGIN')),
    "signature": txFile.substr(txFile.indexOf('-----BEGIN'))
  }, done);
}

function transfert (txFile, done) {
  post('/hdc/transactions/process/transfert', {
    "transaction": txFile.substr(0, txFile.indexOf('-----BEGIN')),
    "signature": txFile.substr(txFile.indexOf('-----BEGIN'))
  }, done);
}

function fusion (txFile, done) {
  post('/hdc/transactions/process/fusion', {
    "transaction": txFile.substr(0, txFile.indexOf('-----BEGIN')),
    "signature": txFile.substr(txFile.indexOf('-----BEGIN'))
  }, done);
}

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
    function (next) { get('/pks/all', next); },
    function (next) { pksAdd(pubkeySnow, pubkeySnowSig, next); },
    function (next) { get('/pks/lookup?op=index&search=', next); },
    function (next) { get('/pks/all', next); },
    function (next) { pksAdd(pubkeyCat, pubkeyCatSig, next); },
    function (next) { get('/pks/lookup?op=index&search=', next); },
    function (next) { get('/pks/all', next); },
    function (next) { pksAdd(pubkeyTobi, pubkeyTobiSig, next); },
    function (next) { get('/pks/lookup?op=index&search=', next); },
    function (next) { get('/pks/all', next); },
    function (next) { pksAdd(pubkeyTobi, pubkeySnowSig, next); },
    function (next) { get('/pks/lookup?op=index&search=', next); },
    function (next) { get('/pks/all', next); },
    function (next) { pksAdd(pubkeyWhite, pubkeyWhiteSig, next); },
    function (next) { get('/pks/lookup?op=index&search=', next); },
    function (next) { get('/pks/all', next); },
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
    function (next) { get('/hdc/amendments/promoted', next); },
    function (next) { get('/hdc/community/votes', next); },
    function (next) { console.log("Sending Cat's AM0..."); vote(voteCatAM0, next); },
    function (next) { get('/hdc/community/votes', next); },
    function (next) { get('/hdc/amendments/promoted', next); },
    function (next) { console.log("Sending Tobi's AM0..."); vote(voteTobiAM0, next); },
    function (next) { get('/hdc/community/votes', next); },
    function (next) { get('/hdc/amendments/promoted', next); },
    function (next) { console.log("Sending Snow's AM0..."); vote(voteSnowAM0, next); },
    function (next) { get('/hdc/community/votes', next); },
    function (next) { get('/hdc/amendments/promoted', next); },
    function (next) { get('/hdc/amendments/votes', next); },
    function (next) { console.log("Sending Snow's AM0 dissident..."); vote(voteSnowAM0_2, next); },
    function (next) { get('/hdc/community/votes', next); },
    function (next) { get('/hdc/amendments/promoted', next); },
    function (next) { console.log("Sending Snow's AM1..."); vote(voteSnowAM1, next); },
    function (next) { get('/hdc/community/votes', next); },
    function (next) { get('/hdc/amendments/promoted', next); },
    function (next) { console.log("Sending Tobi's AM1..."); vote(voteTobiAM1, next); },
    function (next) { get('/hdc/community/votes', next); },
    function (next) { get('/hdc/amendments/promoted', next); },
    function (next) { console.log("Sending Cat's AM1..."); vote(voteCatAM1, next); },
    function (next) { console.log("Sending White's AM1..."); vote(voteWhiteAM1, next); },
    function (next) { get('/hdc/community/votes', next); },
    function (next) { get('/hdc/amendments/votes', next); },
    function (next) { get('/hdc/amendments/promoted', next); },
    function (next) { get('/hdc/amendments/votes/0-376C5A6126A4688B18D95043261B2D59867D4047', next); },
    function (next) { get('/hdc/amendments/votes/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C', next); },
    function (next) { get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/self', next); },
    function (next) { get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/memberships', next); },
    function (next) { get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/members', next); },
    function (next) { get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/signatures', next); },
    function (next) { get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/voters', next); },
    function (next) { get('/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/self', next); },
    function (next) { get('/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/memberships', next); },
    function (next) { get('/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/members', next); },
    function (next) { get('/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/signatures', next); },
    function (next) { get('/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/voters', next); },
    function (next) { console.log("Sending Snow's AM2..."); vote(voteSnowAM2, next); },
    function (next) { console.log("Sending Tobi's AM2..."); vote(voteTobiAM2, next); },
    function (next) { console.log("Sending Cat's AM2..."); vote(voteCatAM2, next); },
    function (next) { get('/hdc/coins/33BBFC0C67078D72AF128B5BA296CC530126F372/list', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/list', next); },
    function (next) { get('/hdc/coins/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/list', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/0', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/1', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/8', next); },
    function (next) { issue(txTobi, next); },
    function (next) { get('/hdc/transactions/all', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance/dividend', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance/dividend/2', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance/fusion', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/transfert', next); },
    function (next) { get('/hdc/coins/33BBFC0C67078D72AF128B5BA296CC530126F372/list', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/list', next); },
    function (next) { get('/hdc/coins/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/list', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/0', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/1', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/8', next); },
    function (next) { transfert(txTobiToSnow, next); },
    function (next) { get('/hdc/transactions/all', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance/dividend', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance/dividend/2', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance/fusion', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/transfert', next); },
    function (next) { get('/hdc/coins/33BBFC0C67078D72AF128B5BA296CC530126F372/list', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/list', next); },
    function (next) { get('/hdc/coins/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/list', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/0', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/1', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/8', next); },
    function (next) { fusion(txTobiFusion, next); },
    function (next) { get('/hdc/transactions/all', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance/dividend', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance/dividend/2', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/issuance/fusion', next); },
    function (next) { get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C/transfert', next); },
    function (next) { get('/hdc/coins/33BBFC0C67078D72AF128B5BA296CC530126F372/list', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/list', next); },
    function (next) { get('/hdc/coins/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/list', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/0', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/1', next); },
    function (next) { get('/hdc/coins/2E69197FAB029D8669EF85E82457A1587CA0ED9C/view/8', next); },
  ], function (err) {
    console.log("API fed.");
    done(err);
  });
});

//----------- PKS -----------

describe('Sending public key', function(){

  api.pksAll(200, 0, '');
  api.pksAll(200, 1, '33BBFC0C67078D72AF128B5BA296CC530126F372'); // Added 33BBFC0C67078D72AF128B5BA296CC530126F372
  api.pksAll(200, 2, '5DB500A285BD380A68890D09232475A8CA003DC8'); // Added C73882B64B7E72237A2F460CE9CAB76D19A8651E
  api.pksAll(200, 3, 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'); // Added 2E69197FAB029D8669EF85E82457A1587CA0ED9C
  api.pksAll(200, 3, 'F5ACFD67FC908D28C0CFDAD886249AC260515C90'); // Added nothing (wrong signature)
  api.pksAll(200, 4, '7B66992FD748579B0774EDFAD7AB84143357F7BC'); // Added B6AE93DDE390B1E11FA97EEF78B494F99025C77E
  api.pksAdd(200); // Added 33BBFC0C67078D72AF128B5BA296CC530126F372 Snow
  api.pksAdd(200); // Added C73882B64B7E72237A2F460CE9CAB76D19A8651E Cat 
  api.pksAdd(200); // Added 2E69197FAB029D8669EF85E82457A1587CA0ED9C Tobi
  api.pksAdd(400); // Added 2E69197FAB029D8669EF85E82457A1587CA0ED9C Tobi with Sig of Snow
  api.pksAdd(200); // Added B6AE93DDE390B1E11FA97EEF78B494F99025C77E White
  api.pksLookup(200, 1); // Added Snow
  api.pksLookup(200, 2); // Added Cat
  api.pksLookup(200, 3); // Added Tobi
  api.pksLookup(200, 3); // Added nothing
  api.pksLookup(200, 4); // Added Walter
});

//----------- Memberships -----------

function checkMerkleOfMemberships (json) {
  _(json.merkle.leaves).each(function (leaf) {
    var Membership = mongoose.model('Membership');
    var ms = new Membership({
      version: leaf.value.request.version,
      currency: leaf.value.request.currency,
      status: leaf.value.request.status,
      basis: leaf.value.request.basis,
      signature: leaf.value.signature
    });
    leaf.hash.should.equal(sha1(ms.getRaw() + ms.signature).toUpperCase());
  });
}

describe('Sending membership', function(){
  api.join('John Snow');
  api.join('LoL Cat');
  api.join('Tobi Uchiha');
  api.memberships('Merkle root empty', 0, '');
  api.memberships('memberships Merkle with Snowy', 1, '0FBA64435A87B7B7CBA2A914A79EB015DD246ECB');
  api.memberships('memberships Merkle with Snowy, Cat', 2, 'C00DCEB6F1B00D4C0CADCC9E35011C50DE2549AB');
  api.memberships('memberships Merkle with Snowy, Cat, Tobi', 3, '2A42C5CCC315AF3B9D009CC8E635F8492111F91D');
});

//----------- Votes -----------

function checkVote (index, statusCode) {
  return function(){
    // console.log(apiRes['/hdc/amendments/votes'][index].res.text);
    var status = apiRes['/hdc/amendments/votes'][index].res.status;
    if(!statusCode && status != 200){
      console.log('HTTP ' + status + ': ' + apiRes['/hdc/amendments/votes'][index].res.text);
    }
    apiRes['/hdc/amendments/votes'][index].res.should.have.status(statusCode);
    if(statusCode == 200){
      var json = JSON.parse(apiRes['/hdc/amendments/votes'][index].res.text);
      json.should.have.property('amendment');
      json.should.have.property('signature');
    }
  }
}

function checkIndex1 (index) {
  return function () {
    var json = JSON.parse(apiRes['/hdc/amendments/votes'][index].res.text);
    json.should.have.property('amendments');
    _(json.amendments).size().should.equal(1);
    _(json.amendments[0]).size().should.equal(1);
    json.amendments[0].should.have.property('376C5A6126A4688B18D95043261B2D59867D4047');
    json.amendments[0]['376C5A6126A4688B18D95043261B2D59867D4047'].should.equal(3);
  };
}

function checkIndex2 (index) {
  return function () {
    var json = JSON.parse(apiRes['/hdc/amendments/votes'][index].res.text);
    json.should.have.property('amendments');
    _(json.amendments).size().should.equal(2);
    _(json.amendments[0]).size().should.equal(2);
    json.amendments[0].should.have.property('376C5A6126A4688B18D95043261B2D59867D4047');
    json.amendments[0].should.have.property('0035C75B49BD5FBB3D01D63B4C9BF2CC0E20B763');
    json.amendments[1].should.have.property('0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C');
    json.amendments[0]['376C5A6126A4688B18D95043261B2D59867D4047'].should.equal(3);
    json.amendments[0]['0035C75B49BD5FBB3D01D63B4C9BF2CC0E20B763'].should.equal(1);
    json.amendments[1]['0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C'].should.equal(3);
  };
}

function checkVotes (index, votersCount, hash) {
  return function(){
    apiRes['/hdc/community/votes'][index].res.should.have.status(200);
    var json = JSON.parse(apiRes['/hdc/community/votes'][index].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(votersCount);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(1);
    json.merkle.levels[0][0].should.equal(hash);
  }
}

describe('Sending vote', function(){
  var index = -1;
  it('AM0 of LoL Cat should respond 200', checkVote(++index, 200));
  it('AM0 of Tobi Uchiha should respond 200', checkVote(++index, 200));
  it('AM0 of John Snow should respond 200', checkVote(++index, 200));
  it('- index should have ', checkIndex1(++index));
  it('AM0 (dissident) of John Snow should respond 200', checkVote(++index, 200));
  it('AM1 of John Snow should respond 200', checkVote(++index, 200));
  it('AM1 of Tobi should respond 200', checkVote(++index, 200));
  it('AM1 of Cat should respond 200', checkVote(++index, 200));
  it('AM1 of Walter White should respond 400', checkVote(++index, 400));
  it('- index should have ', checkIndex2(++index));
});

describe('Checking votes', function(){
  var index = 0;
  it('should respond 200 and have some votes', function () {
    apiRes['/hdc/community/votes'][0].res.should.have.status(404);
  });
  it('should respond 200 and have some votes', checkVotes(++index, 1, '110A283836EC264294917D1B4A02D215B2767342'));
  it('should respond 200 and have some votes', checkVotes(++index, 2, '32F73F0A80CF7AB425F83B8AD8E377E0CAF29FB6'));
  it('should respond 200 and have some votes', checkVotes(++index, 3, 'DD3581D5F7DBA96DDA98D4B415CB2E067C5B48BA'));
  // Vote for a dissident AM0
  it('should respond 200 and have some votes', checkVotes(++index, 3, 'DD3581D5F7DBA96DDA98D4B415CB2E067C5B48BA'));
  // Fist vote for AM1 (not enough)
  it('should respond 200 and have some votes', checkVotes(++index, 3, 'DD3581D5F7DBA96DDA98D4B415CB2E067C5B48BA'));
  // Second vote for AM1 (promoted)
  it('should respond 200 and have some votes', checkVotes(++index, 2, '16C619460FA207A2D94AF3C306591A384C8DC4B1'));
  it('should respond 200 and have some votes', checkVotes(++index, 3, '931A15C9CAE0BA73E9B4F1E8B0251452F3A882C7'));
});

//----------- Amendments -----------

function checkAmendment (index, hash) {
  return function(){
    apiRes['/hdc/amendments/promoted'][index].res.should.have.status(200);
    var json = JSON.parse(apiRes['/hdc/amendments/promoted'][index].res.text);
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
    var mHash = sha1(json.raw).toUpperCase();
    if(mHash != hash){
      console.log("Current issue: " + index);
    }
    mHash.should.equal(hash);
  }
}

function checkAmendmentNotFound (index) {
  return function(){
    apiRes['/hdc/amendments/promoted'][index].res.should.have.status(404);
  }
}

describe('Checking current amendment', function(){
  var index = -1;
  it('should respond 200', checkAmendmentNotFound(++index));
  it('should respond 200', checkAmendment(++index, '376C5A6126A4688B18D95043261B2D59867D4047'));
  it('should respond 200', checkAmendment(++index, '376C5A6126A4688B18D95043261B2D59867D4047'));
  it('should respond 200', checkAmendment(++index, '376C5A6126A4688B18D95043261B2D59867D4047'));
  it('should respond 200', checkAmendment(++index, '376C5A6126A4688B18D95043261B2D59867D4047'));
  // 1 vote for AM1 (not enough)
  it('should respond 200', checkAmendment(++index, '376C5A6126A4688B18D95043261B2D59867D4047'));
  // 2 votes for AM1 (enough ! (2/3))
  it('should respond 200', checkAmendment(++index, '0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C'));
  it('should respond 200', checkAmendment(++index, '0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C'));
});

describe('Checking amendments', function(){
  it('0 should respond 200 and have self infos', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/self'][0].res.text);
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
    sha1(json.raw).toUpperCase().should.equal('376C5A6126A4688B18D95043261B2D59867D4047');
  });
  it('0 should respond 200 and be legitimated by 3 signatures', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/votes/0-376C5A6126A4688B18D95043261B2D59867D4047'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(3);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(1);
    json.merkle.levels[0][0].should.equal('DD3581D5F7DBA96DDA98D4B415CB2E067C5B48BA');
  });
  it('0 should respond 200 and have some memberships', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/memberships'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(3);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(1);
    json.merkle.levels[0][0].should.equal('2A42C5CCC315AF3B9D009CC8E635F8492111F91D');
  });
  it('0 should respond 200 and have some members', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/members'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(3);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(1);
    json.merkle.levels[0][0].should.equal('F5ACFD67FC908D28C0CFDAD886249AC260515C90');
  });
  it('0 should respond 200 and have 0 signatures', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/signatures'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(1);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(0);
  });
  it('0 should respond 200 and have 0 voters', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/voters'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(1);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(0);
  });
  it('1 should respond 200 and have self infos', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/self'][0].res.text);
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
    sha1(json.raw).toUpperCase().should.equal('0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C');
  });
  it('1 should respond 200 and be legitimated by 3 signatures', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/votes/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(3);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(1);
    json.merkle.levels[0][0].should.equal('931A15C9CAE0BA73E9B4F1E8B0251452F3A882C7');
  });
  it('1 should respond 200 and have some memberships', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/memberships'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(3);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(1);
    json.merkle.levels[0][0].should.equal('2A42C5CCC315AF3B9D009CC8E635F8492111F91D');
  });
  it('1 should respond 200 and have some members', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/members'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(3);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(1);
    json.merkle.levels[0][0].should.equal('F5ACFD67FC908D28C0CFDAD886249AC260515C90');
  });
  it('1 should respond 200 and have some signatures', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/signatures'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(3);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(1);
    json.merkle.levels[0][0].should.equal('DD3581D5F7DBA96DDA98D4B415CB2E067C5B48BA');
  });
  it('1 should respond 200 and have some voters', function(){
    var json = JSON.parse(apiRes['/hdc/amendments/view/1-0A9575937587C4E68F89AA4F0CCD3E6E41A07D8C/voters'][0].res.text);
    isMerkleNodesResult(json);
    json.merkle.levelsCount.should.equal(3);
    _(json.merkle.levels).size().should.equal(1);
    _(json.merkle.levels[0]).size().should.equal(1);
    json.merkle.levels[0][0].should.equal('F5ACFD67FC908D28C0CFDAD886249AC260515C90');
  });
});

describe('Checking TX', function(){
  api.txAllMerkle('ISSUANCE',   'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txAllMerkle('TRANSFERT',  '6492741E1BE3461537EDC6D5B2820DC851156612', 2);
  api.txAllMerkle('FUSION',     'FCEFF28B10A460EAEE6F3F071EE35EAAFCC11391', 3);
  api.txSenderMerkle('ISSUANCE',  '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txSenderMerkle('TRANSFERT', '2E69197FAB029D8669EF85E82457A1587CA0ED9C', '6492741E1BE3461537EDC6D5B2820DC851156612', 2);
  api.txSenderMerkle('FUSION',    '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'FCEFF28B10A460EAEE6F3F071EE35EAAFCC11391', 3);
  api.txIssuerMerkle('ISSUANCE',  '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txIssuerMerkle('TRANSFERT', '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txIssuerMerkle('FUSION',    '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'ACBE13C611689BDA82DC8CE70EA3926FE5D766D5', 2);
  api.txIssuerDividendMerkle('ISSUANCE',  '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txIssuerDividendMerkle('TRANSFERT', '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txIssuerDividendMerkle('FUSION',    '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txIssuerDividen2dMerkle('ISSUANCE',  '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txIssuerDividen2dMerkle('TRANSFERT', '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txIssuerDividen2dMerkle('FUSION',    '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 'E04D9FE0B450F3718E675A32ECACE7F04D84115F', 1);
  api.txIssuerTransfertMerkle('ISSUANCE',  '2E69197FAB029D8669EF85E82457A1587CA0ED9C', '', 0);
  api.txIssuerTransfertMerkle('TRANSFERT', '2E69197FAB029D8669EF85E82457A1587CA0ED9C', '644AB61348723D6F657B0EA5577F4CE15CA64400', 1);
  api.txIssuerTransfertMerkle('FUSION',    '2E69197FAB029D8669EF85E82457A1587CA0ED9C', '644AB61348723D6F657B0EA5577F4CE15CA64400', 1);
  api.txIssuerFusionMerkle('ISSUANCE',  '2E69197FAB029D8669EF85E82457A1587CA0ED9C', '', 0);
  api.txIssuerFusionMerkle('TRANSFERT',  '2E69197FAB029D8669EF85E82457A1587CA0ED9C', '', 0);
  api.txIssuerFusionMerkle('FUSION',  '2E69197FAB029D8669EF85E82457A1587CA0ED9C', '953BD10646E860B4DF2F9EA4C81C9DE20DD668FB', 1);
});

describe('Checking COINS', function(){
  var index = 0;
  api.coinsList('INITIALLY', '33BBFC0C67078D72AF128B5BA296CC530126F372', 0);
  api.coinsList('INITIALLY', '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 0);
  api.coinsList('INITIALLY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 0);

  api.coinsList('ISSUANCE of Tobi', '33BBFC0C67078D72AF128B5BA296CC530126F372', 0);
  api.coinsList('ISSUANCE of Tobi', '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 7);
  api.coinsList('ISSUANCE of Tobi', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 0);

  api.coinsList('TRANSFERT of Tobi', '33BBFC0C67078D72AF128B5BA296CC530126F372', 1);
  api.coinsList('TRANSFERT of Tobi', '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 6);
  api.coinsList('TRANSFERT of Tobi', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 0);

  api.coinsList('FUSION of Tobi', '33BBFC0C67078D72AF128B5BA296CC530126F372', 1);
  api.coinsList('FUSION of Tobi', '2E69197FAB029D8669EF85E82457A1587CA0ED9C', 5);
  api.coinsList('FUSION of Tobi', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 0);
});

function isMerkleNodesResult (json) {
  isMerkleResult(json);
  json.merkle.should.have.property('levels');
}

function isMerkleLeavesResult (json) {
  isMerkleResult(json);
  json.merkle.should.have.property('leaves');
  _(json.merkle.leaves).each(function (leaf) {
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
        json.currency.should.equal("beta_brousouf");
        json.key.should.equal("C73882B64B7E72237A2F460CE9CAB76D19A8651E");
        json.remote.port.should.equal("");
        json.remote.port.should.equal("");
        should.not.exist(json.ipv4);
        should.not.exist(json.ipv6);
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

describe('Request on /hdc/amendments/promoted', function(){
  it('GET should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/promoted')
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
  it('/memberships GET should respond 400', function(done){
    request(app)
      .get('/hdc/amendments/view/SOME_ID/memberships')
      .expect(400, done);
  });
  // Good param
  it('/self GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/self')
      .expect(404, done);
  });
  it('/members GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/members')
      .expect(404, done);
  });
  it('/voters GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/voters')
      .expect(404, done);
  });
  it('/signatures GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/signatures')
      .expect(404, done);
  });
  it('/memberships GET should respond 404', function(done){
    request(app)
      .get('/hdc/amendments/view/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A/memberships')
      .expect(404, done);
  });

  // Better param
  it('/self GET should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/self')
      .expect(200, done);
  });
  it('/members GET should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/members')
      .expect(200, done);
  });
  it('/voters GET should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/voters')
      .expect(200, done);
  });
  it('/signatures GET should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/signatures')
      .expect(200, done);
  });
  it('/memberships GET should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/view/0-376C5A6126A4688B18D95043261B2D59867D4047/memberships')
      .expect(200, done);
  });
});

describe('Request on /hdc/amendments/votes/:amendment_id', function(){
  it('GET with good URL param should respond 200', function(done){
    request(app)
      .get('/hdc/amendments/votes/0-875F8DCCF2E24B5DEADF4410558E77D5ED2EC40A')
      .expect(200, done);
  });
  it('POST should respond 404', function(done){
    request(app)
      .post('/hdc/amendments/votes/SOME_AM_ID')
      .expect(404, done);
  });
  it('GET with wrong URL param should respond 400', function(done){
    request(app)
      .get('/hdc/amendments/votes/SOME_AM_ID')
      .expect(400, done);
  });
});


describe('Request on /hdc/transactions/all', function(){
  it('GET with good URL param should respond 200', function(done){
    request(app)
      .get('/hdc/transactions/all')
      .expect(200, done);
  });
});

describe('Request on /hdc/transactions/all', function(){
  it('GET with good URL param should respond 200', function(done){
    request(app)
      .get('/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C')
      .expect(200, done);
  });
});

describe('Request on /hdc/coins/SOME_PGP_FPR/list', function(){
  it('GET with bad fingerprint format should respond 400', function(done){
    request(app)
      .get('/hdc/coins/SOME_PGP_FPR/list')
      .expect(400, done);
  });
});

describe('Request on /hdc/coins/SOME_PGP_FPR/view/COIN_ID', function(){
  it('GET with bad fingerprint format should respond 400', function(done){
    request(app)
      .get('/hdc/coins/SOME_PGP_FPR/view/COIN_ID')
      .expect(400, done);
  });
});
