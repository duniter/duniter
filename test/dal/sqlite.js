var should   = require('should');
var assert   = require('assert');
var Q = require('q');
var sqlite    = require('../../app/lib/dal/sqliteDAL');

var sqliteDAL = sqlite.memory();

//require('log4js').configure({
//  "appenders": [
//    //{ category: "db1", type: "console" }
//  ]
//});

var mocks = {
  peer1: {
    pubkey: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      block: '0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709',
      currency: 'bb',
      version: 1,
      endpoints: [
      'BASIC_MERKLED_API localhost 7777'
    ]
  }
};

describe("DAL", function(){

  before(function() {
    return Q().
      then(sqliteDAL.dropDabase)
      .then(sqliteDAL.initDabase);
  });

  it('should have no peer in a first time', function(){
    return sqliteDAL.listAllPeers().then(function(peers){
      peers.should.have.length(0);
    })
  });

  it('should have 1 peer if 1 is created', function(){
    return sqliteDAL.savePeer(mocks.peer1)
      .then(sqliteDAL.listAllPeers)
      .then(function(peers){
        peers.should.have.length(1);
        peers[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        peers[0].should.have.property('block').equal('0-DA39A3EE5E6B4B0D3255BFEF95601890AFD80709');
        peers[0].should.have.property('currency').equal('bb');
        peers[0].should.have.property('endpoints').length(1);
        peers[0].endpoints[0].should.equal('BASIC_MERKLED_API localhost 7777');
    })
  });
});
