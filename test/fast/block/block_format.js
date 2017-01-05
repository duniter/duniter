"use strict";
var should  = require('should');
var parsers = require('../../../app/lib/streams/parsers');

const raw = "Version: 10\n" +
  "Type: Block\n" +
  "Currency: test_net\n" +
  "Number: 32029\n" +
  "PoWMin: 72\n" +
  "Time: 1471640455\n" +
  "MedianTime: 1471640455\n" +
  "UnitBase: 3\n" +
  "Issuer: HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk\n" +
  "IssuersFrame: 50\n" +
  "IssuersFrameVar: -5\n" +
  "DifferentIssuersCount: 8\n" +
  "PreviousHash: 00001A8B07B4F5BD5473B83ECC02217E0DDE64A31D695B734C5D88F470B45606\n" +
  "PreviousIssuer: E2uioubZeK5SDMoxkTkizRnhE8qDL24v5oUNNa1sQKMH\n" +
  "MembersCount: 124\n" +
  "Identities:\n" +
  "Joiners:\n" +
  "Actives:\n" +
  "Leavers:\n" +
  "Revoked:\n" +
  "Excluded:\n" +
  "Certifications:\n" +
  "Transactions:\n" +
  "TX:10:1:6:6:2:1:0\n" +
  "32028-00001A8B07B4F5BD5473B83ECC02217E0DDE64A31D695B734C5D88F470B45606\n" +
  "F1pirjHYJYimekfvjVp2SGrVQSsJXb4H8JYKJddLzwVL\n" +
  "106930:3:D:F1pirjHYJYimekfvjVp2SGrVQSsJXb4H8JYKJddLzwVL:30580\n" +
  "117623:3:D:F1pirjHYJYimekfvjVp2SGrVQSsJXb4H8JYKJddLzwVL:30882\n" +
  "129386:3:D:F1pirjHYJYimekfvjVp2SGrVQSsJXb4H8JYKJddLzwVL:31142\n" +
  "140010:3:D:F1pirjHYJYimekfvjVp2SGrVQSsJXb4H8JYKJddLzwVL:31404\n" +
  "152769:3:D:F1pirjHYJYimekfvjVp2SGrVQSsJXb4H8JYKJddLzwVL:31684\n" +
  "168046:3:D:F1pirjHYJYimekfvjVp2SGrVQSsJXb4H8JYKJddLzwVL:31966\n" +
  "0:SIG(0)\n" +
  "1:SIG(0)\n" +
  "2:SIG(0)\n" +
  "3:SIG(0)\n" +
  "4:SIG(0)\n" +
  "5:SIG(0)\n" +
  "168046:3:SIG(5ocqzyDMMWf1V8bsoNhWb1iNwax1e9M7VTUN6navs8of)\n" +
  "646718:3:SIG(F1pirjHYJYimekfvjVp2SGrVQSsJXb4H8JYKJddLzwVL)\n" +
  "developpement JavaScript explorateur\n" +
  "9WR/NRQaIbEuNmatwRytS6QdFjUYME2/ghH/N0KrRF0a6WqG4RvlUEnbzSFpQT4wJ9tTb4cvf0MOW9ZmLli8Cg==\n" +
  "InnerHash: 6AEFB6C53390077861F834E5EE7B6222CC6A474040DF22E4FA669B66D5FA13AA\n" +
  "Nonce: 0\n" +
  "mqzcL5FW0ZMz7/aPpV8vLb6KzMYXl3WYI4bdm6Usq34tSgvROoAOp1uSuyqFBHNd7hggfR/8tACCPhkJMVNLCw==\n";

describe("Block format", function(){

  var parser = parsers.parseBlock;

  it('a valid block should be well formatted', () => parser.syncWrite(raw));

  describe("should be rejected", function(){

    it('a block without signature', () => {
      try {
        parser.syncWrite(raw.replace("mqzcL5FW0ZMz7/aPpV8vLb6KzMYXl3WYI4bdm6Usq34tSgvROoAOp1uSuyqFBHNd7hggfR/8tACCPhkJMVNLCw==\n", ""));
        should.not.exist('Should have thrown a format error.');
      } catch (err) {
        should.exist(err);
      }
    });

    it('a block with wrong pubkey format', () => {
      try {
        parser.syncWrite(raw.replace("HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:", "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvY:"));
        should.not.exist('Should have thrown a format error.');
      } catch (err) {
        should.exist(err);
      }
    });
  });
  
});
