var async   = require('async');
var should  = require('should');
var parsers = require('../../../app/lib/streams/parsers/doc');

var raw = "Version: 1\n" + 
  "Type: Block\n" + 
  "Currency: beta_brousouf\n" + 
  "Nonce: 2\n" + 
  "Number: 0\n" + 
  "Date: 1411321505\n" + 
  "ConfirmedDate: 1411321505\n" + 
  "Issuer: HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd\n" + 
  "MembersCount: 3\n" + 
  "Identities:\n" + 
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:YvMQqaOAgLtnJzg5ZGhI17sZvXjGgzpSMxNz8ikttMspU5/45MQAqnOfuJnfbrzkkspGlUUjDnUPsOmHPcVyBQ==:1411321474:CAT\n" + 
  "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:ctxRwlsPzy9b8JFS/flXanaI9l2YGyXjdYq4Io49Q6dc7AkRhvhOUHToF5ShTQdhV1ZbBp24iY4wZc6yNe+lCA==:1411321475:TAC\n" + 
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:Cl/Edu4BXeo2ooTU0JFj0QWxC4jHNQ+RhapwTz1XOX6tGViB/sOe9kY3ufHjnL/HSyvK8eJhnUAb7sVQw2g5Dw==:1411321480:SNOW\n" + 
  "Joiners:\n" + 
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:xkF7adwLuMHIduucl/8XWFCXAaOCfhm12+KoS/xikDt2uOkFJpMpSpGFpNgdLH9sX58lJ2Th0oFc8Z7UosKsDQ==:0:DA39A3EE5E6B4B0D3255BFEF95601890AFD80709:1411321474:CAT\n" + 
  "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:2PDyMnWw1aZ1fFz8LprQ+vf+8CMtP7QE53wodxOdLvwbkghGbDJH155KNJVXFZDskjNH7t4YIdJsVUL65ILHDg==:0:DA39A3EE5E6B4B0D3255BFEF95601890AFD80709:1411321475:TAC\n" + 
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:YrvetcOPv38M9vfMOR55vehRUTs29XUI9uXm/BF+X+V8Ielz/1xHV6K3v8fog6vA3XirDXGWOOJeNFJsirIvBQ==:0:DA39A3EE5E6B4B0D3255BFEF95601890AFD80709:1411321480:SNOW\n" + 
  "Actives:\n" + 
  "Leavers:\n" + 
  "Excluded:\n" + 
  "Certifications:\n" + 
  "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:1411328677:Ys2BHqV/zCR0vWtznDjGyZil/OigryeaSmSNqONjoy0jOoJ/LI4ezWwDatXjUQjGTpYAOCI0v1aOH2cjkTqkAA==\n" + 
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:1411328681:OV9xrjimDufAxCDOgOeJXlil8Yy+1g73XBPAoMQF3eC71zzzhXNXnPUEIjpyufmTIy1SCC8+lfF7v0NKAS6CAQ==\n" + 
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:1411328676:dEAPF1BHZ/9TUJE0KQ9D73dPB1uQJMPo0m70gzStUbfjXkAEbrS5wndRW3NwlhyS4tGCDYqbjdyJr6vfqXZJCQ==\n" + 
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:1411328683:ltl8jrXFfOH890amFa39Utneq/sUyqNXGZeKAYohU5UdWLyfiHSFYfC+e8FrKf0EQFzUdVIooFg3nrBPlvwaDw==\n" + 
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:1411328682:Wp/XBzxZtcQmSlEMn5RRLZSedLbPq/1xU8i7UafrtZWuBXyrhElSI45tPomMtFPZ21WqZwMpol9/pEEhFFm/AA==\n" + 
  "Transactions:\n" +
  "mqzcL5FW0ZMz7/aPpV8vLb6KzMYXl3WYI4bdm6Usq34tSgvROoAOp1uSuyqFBHNd7hggfR/8tACCPhkJMVNLCw==\n";

describe("Block format", function(){

  var parser = parsers.parseBlock();

  it('a valid block should be well formatted', function(done){
    parser.asyncWrite(raw, function (err, obj) {
      should.not.exist(err);
      done();
    });
  });

  describe("should be rejected", function(){

    it('a block without signature', function(done){
      parser.asyncWrite(raw.replace("mqzcL5FW0ZMz7/aPpV8vLb6KzMYXl3WYI4bdm6Usq34tSgvROoAOp1uSuyqFBHNd7hggfR/8tACCPhkJMVNLCw==\n", ""), function (err, obj) {
        should.exist(err);
        done();
      });
    });

    it('a block with wrong pubkey format', function(done){
      var wrongPubkeyFormat = raw.replace("HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:", "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvY:");
      parser.asyncWrite(wrongPubkeyFormat, function (err, obj) {
        should.exist(err);
        done();
      });
    });
  });
  
});
