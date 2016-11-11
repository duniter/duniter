"use strict";
var should  = require('should');
var parsers = require('../../../app/lib/streams/parsers');

var raw = "Version: 2\n" +
  "Type: Block\n" + 
  "Currency: beta_brousouf\n" +
  "Number: 0\n" + 
  "PoWMin: 4\n" + 
  "Time: 1411321505\n" + 
  "MedianTime: 1411321505\n" + 
  "Issuer: HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd\n" + 
  "MembersCount: 3\n" + 
  "Identities:\n" + 
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:YvMQqaOAgLtnJzg5ZGhI17sZvXjGgzpSMxNz8ikttMspU5/45MQAqnOfuJnfbrzkkspGlUUjDnUPsOmHPcVyBQ==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:CAT\n" +
  "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:ctxRwlsPzy9b8JFS/flXanaI9l2YGyXjdYq4Io49Q6dc7AkRhvhOUHToF5ShTQdhV1ZbBp24iY4wZc6yNe+lCA==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:TAC\n" +
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:Cl/Edu4BXeo2ooTU0JFj0QWxC4jHNQ+RhapwTz1XOX6tGViB/sOe9kY3ufHjnL/HSyvK8eJhnUAb7sVQw2g5Dw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:SNOW\n" +
  "Joiners:\n" + 
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:xkF7adwLuMHIduucl/8XWFCXAaOCfhm12+KoS/xikDt2uOkFJpMpSpGFpNgdLH9sX58lJ2Th0oFc8Z7UosKsDQ==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:CAT\n" +
  "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:2PDyMnWw1aZ1fFz8LprQ+vf+8CMtP7QE53wodxOdLvwbkghGbDJH155KNJVXFZDskjNH7t4YIdJsVUL65ILHDg==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:TAC\n" +
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:YrvetcOPv38M9vfMOR55vehRUTs29XUI9uXm/BF+X+V8Ielz/1xHV6K3v8fog6vA3XirDXGWOOJeNFJsirIvBQ==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:SNOW\n" +
  "Actives:\n" + 
  "Leavers:\n" + 
  "Revoked:\n" +
  "Excluded:\n" +
  "Certifications:\n" +
  "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:1411328677:Ys2BHqV/zCR0vWtznDjGyZil/OigryeaSmSNqONjoy0jOoJ/LI4ezWwDatXjUQjGTpYAOCI0v1aOH2cjkTqkAA==\n" + 
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:1411328681:OV9xrjimDufAxCDOgOeJXlil8Yy+1g73XBPAoMQF3eC71zzzhXNXnPUEIjpyufmTIy1SCC8+lfF7v0NKAS6CAQ==\n" + 
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:1411328676:dEAPF1BHZ/9TUJE0KQ9D73dPB1uQJMPo0m70gzStUbfjXkAEbrS5wndRW3NwlhyS4tGCDYqbjdyJr6vfqXZJCQ==\n" + 
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:1411328683:ltl8jrXFfOH890amFa39Utneq/sUyqNXGZeKAYohU5UdWLyfiHSFYfC+e8FrKf0EQFzUdVIooFg3nrBPlvwaDw==\n" + 
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:1411328682:Wp/XBzxZtcQmSlEMn5RRLZSedLbPq/1xU8i7UafrtZWuBXyrhElSI45tPomMtFPZ21WqZwMpol9/pEEhFFm/AA==\n" + 
  "Transactions:\n" +
  "InnerHash: 4A60BF7D4BC1E485744CF7E8D0860524752FCA1CE42331BE7C439FD23043F151\n" +
  "Nonce: 2\n" +
  "mqzcL5FW0ZMz7/aPpV8vLb6KzMYXl3WYI4bdm6Usq34tSgvROoAOp1uSuyqFBHNd7hggfR/8tACCPhkJMVNLCw==\n";

const raw_v3 = "Version: 3\n" +
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
  "TX:3:1:6:6:2:1:0\n" +
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

  it('a valid V3 block should be well formatted', () => parser.syncWrite(raw_v3));

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
