
var should = require('should');
var request = require('supertest');
var nodecoin = require('../lib/nodecoin');

var config = {
  server: { port: 8001 },
  db: {
    database : "nodecoin_test",
    host: "localhost"
  },
  initKeys: []
};

// Bootstraps models
nodecoin.database.init();
nodecoin.database.connect(config, function (err) {
  if(!err)
    console.log("Connected to MongoDB.");
  else
    console.log("Error connecting to DB: " + err);
});

var app = nodecoin.express.app(config);

var gets = [
  {should: 501, url: '/udc/amendments/view/[000001]/members'},
  {should: 501, url: '/udc/amendments/view/[000001]/self'},
  {should: 501, url: '/udc/amendments/view/[000001]/voters'},
  {should: 501, url: '/udc/coins/[SOME_PGP_FPR]/list'},
  {should: 501, url: '/udc/coins/[SOME_PGP_FPR]/view/:coin_number'},
  {should: 501, url: '/udc/transactions/sender/[SOME_PGP_FPR]'},
  {should: 501, url: '/udc/transactions/view/[SOME_TX_ID]'}
];

var posts = [
  {should: 501, url: '/udc/amendments/submit'},
  {should: 501, url: '/udc/amendments/vote'},
  {should: 501, url: '/udc/community/declare'},
  {should: 501, url: '/udc/community/join'},
  {should: 501, url: '/udc/transactions/process/issuance'},
  {should: 501, url: '/udc/transactions/process/transfert'}
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
describe('Request on /udc/amendments/init', function(){
  it('GET should respond 200', function(done){
    request(app)
      .get('/udc/amendments/init')
      .expect(200, done);
  });
});