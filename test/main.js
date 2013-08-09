var should  = require('should');
var request = require('supertest');
var server  = require('../app/lib/server');

var config = {
  server: { port: 8001 },
  db: {
    database : "ucoin_test",
    host: "localhost"
  }
};

var gets = [
  {should: 501, url: '/pks/all'},
  {should: 501, url: '/ucg/peering'},
  {should: 501, url: '/ucg/tht'},
  {should: 501, url: '/ucg/tht/2E69197FAB029D8669EF85E82457A1587CA0ED9C'},
  {should: 501, url: '/hdc/amendments/current'},
  {should: 501, url: '/hdc/amendments/view/000001/members'},
  {should: 501, url: '/hdc/amendments/view/000001/self'},
  {should: 501, url: '/hdc/amendments/view/000001/voters'},
  {should: 501, url: '/hdc/amendments/votes'},
  {should: 501, url: '/hdc/amendments/votes/SOME_AM_ID/signatures'},
  {should: 501, url: '/hdc/coins/SOME_PGP_FPR/list'},
  {should: 501, url: '/hdc/coins/SOME_PGP_FPR/view/COIN_ID'},
  {should: 501, url: '/hdc/community/members'},
  {should: 501, url: '/hdc/community/votes'},
  {should: 501, url: '/hdc/transactions/all'},
  {should: 501, url: '/hdc/transactions/sender/2E69197FAB029D8669EF85E82457A1587CA0ED9C'},
  {should: 501, url: '/hdc/transactions/recipient/2E69197FAB029D8669EF85E82457A1587CA0ED9C'},
  {should: 501, url: '/hdc/transactions/view/SOME_TX_ID'}
];

var posts = [
  {should: 501, url: '/ucg/tht'},
  {should: 501, url: '/hdc/amendments/votes'},
  {should: 501, url: '/hdc/community/join'},
  {should: 501, url: '/hdc/transactions/process/issuance'},
  {should: 501, url: '/hdc/transactions/process/transfert'},
  {should: 501, url: '/hdc/transactions/process/fusion'}
];

function testGET(url, should) {
  describe('GET on ' + url, function(){
    it(' should answer ' + should, function(done){
      request(app)
        .get(url)
        .expect(should, done);
    });
  });
}

function testPOST(url, should) {
  describe('GET on ' + url, function(){
    it(' should answer ' + should, function(done){
      request(app)
        .post(url)
        .expect(should, done);
    });
  });
}

var app;
before(function (done) {
  server.database.connect(config.db.database, config.db.host, config.db.port, function (err, conf) {
    server.express.app(config, function (err, appReady) {
      app = appReady;
      done();
    });
  });
});

for (var i = 0; i < gets.length; i++) {
  testGET(gets[i].url, gets[i].should);
}

for (var i = 0; i < posts.length; i++) {
  testPOST(posts[i].url, posts[i].should);
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