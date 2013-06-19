
var should = require('should');
var request = require('supertest');
var nodecoin = require('../lib/nodecoin');

var app = nodecoin.express.app({
  server: { port: 8001 },
  db: {
    database : "nodecoin_test.db",
    protocol : "sqlite",
    dropAll: true
  }
});

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
describe('Request on /udc/amendments/view/:amendment_id/members', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/amendments/view/1/members')
      .expect(501, done);
  });
});

describe('Request on /udc/amendments/view/:amendment_id/voters', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/amendments/view/1/voters')
      .expect(501, done);
  });
});

describe('Request on /udc/amendments/view/:amendment_id/self', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/amendments/view/1/self')
      .expect(501, done);
  });
});

describe('Request on /udc/amendments/submit', function(){
  it('POST should respond 501', function(done){
    request(app)
      .post('/udc/amendments/submit')
      .expect(501, done);
  });
});

//----------- COINS -----------
describe('Request on /udc/coins/submit', function(){
  it('POST should respond 501', function(done){
    request(app)
      .post('/udc/coins/submit')
      .expect(501, done);
  });
});

describe('Request on /udc/coins/view/:coin_id', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/coins/view/2')
      .expect(501, done);
  });
});

//----------- PEER -----------
describe('Request on /udc/peer/register', function(){
  it('POST should respond 501', function(done){
    request(app)
      .post('/udc/peer/register')
      .expect(501, done);
  });
});

describe('Request on /udc/peer/list', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/peer/list')
      .expect(501, done);
  });
});

describe('Request on /udc/peer/self', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/peer/self')
      .expect(501, done);
  });
});

//----------- TRANSACTIONS -----------
describe('Request on /udc/transactions/submit', function(){
  it('POST should respond 501', function(done){
    request(app)
      .post('/udc/transactions/submit')
      .expect(501, done);
  });
});

describe('Request on /udc/transactions/search', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/transactions/search')
      .expect(501, done);
  });
});

describe('Request on /udc/transactions/coin/:coin_id', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/transactions/coin/2')
      .expect(501, done);
  });
});

describe('Request on /udc/transactions/recipient/:fingerprint', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/transactions/recipient/RECIPIENT_FPR')
      .expect(501, done);
  });
});

describe('Request on /udc/transactions/sender/:fingerprint', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/transactions/sender/SENDER_FPR')
      .expect(501, done);
  });
});

describe('Request on /udc/transactions/view/:transaction_id', function(){
  it('GET should respond 501', function(done){
    request(app)
      .get('/udc/transactions/view/TX_ID')
      .expect(501, done);
  });
});