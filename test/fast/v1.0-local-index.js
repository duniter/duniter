"use strict";

const _       = require('underscore');
const should  = require('should');
const parsers = require('../../app/lib/streams/parsers');
const indexer = require('../../app/lib/dup/indexer');
const constants = require('../../app/lib/constants');

const raw = "Version: 10\n" +
  "Type: Block\n" +
  "Currency: beta_brousouf\n" +
  "Number: 10\n" +
  "PoWMin: 1\n" +
  "Time: 1411785481\n" +
  "MedianTime: 1411776000\n" +
  "UnitBase: 2\n" +
  "Issuer: HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd\n" +
  "IssuersFrame: 100\n" +
  "IssuersFrameVar: 0\n" +
  "DifferentIssuersCount: 3\n" +
  "PreviousHash: 2A27BD040B16B7AF59DDD88890E616987F4DD28AA47B9ABDBBEE46257B88E945\n" +
  "PreviousIssuer: HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd\n" +
  "MembersCount: 3\n" +
  "Identities:\n" +
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:CTmlh3tO4B8f8IbL8iDy5ZEr3jZDcxkPmDmRPQY74C39MRLXi0CKUP+oFzTZPYmyUC7fZrUXrb3LwRKWw1jEBQ==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:cat\n" +
  "Joiners:\n" +
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:iSQvl1VVc6+b1AUaBJ/VTTurGGHgaIcjASBhIlzI7M/7KVQV2Wi3oGUZUzLWqCAtGUsPcsj1HCV2/sRyxHmqAw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:cat\n" +
  "65dKz7JEvZzy6Znr9hATtvm7Kd9fCwxhWKgyrbyL2jhX:25xK7+ph7IYeN9Hu8PvuIBjYdVURYtvKayPHZg7zrrYTs6ii2fMtk5J65a3bT/NKr2Qsd7I5TCL29QyiAXa7BA==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:tac\n" +
  "Actives:\n" +
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:ze+ftHWFLYmjfvXyrx4a15N2VQjf6oen8kkMiYNYrVllbpb5IUcb28CenlOQbVd9cZCNGSkTP7xP5bt8KAqUAw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:toc\n" +
  "Leavers:\n" +
  "HEgBcwtkrnWBgwDqELYht6aBZrmjm8jQY4DtFRjcB437:25xK7+ph7IYeN9Hu8PvuIBjYdVURYtvKayPHZg7zrrYTs6ii2fMtk5J65a3bT/NKr2Qsd7I5TCL29QyiAXa7BA==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:tac\n" +
  "Revoked:\n" +
  "EKWJvwPaYuLTv1VoCEtZLmtUTxTC5gWVfdWeRgKgZChN:iSQvl1VVc6+b1AUaBJ/VTTurGGHgaIcjASBhIlzI7M/7KVQV2Wi3oGUZUzLWqCAtGUsPcsj1HCV2/sRyxHmqAw==\n" +
  "Excluded:\n" +
  "EKWJvwPaYuLTv1VoCEtZLmtUTxTC5gWVfdWeRgKgZChN\n" +
  "BNmj8fnZuDtpvismiWnFneJkPHpB98bZdc5ozNYzBW78\n" +
  "Certifications:\n" +
  "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:0:CK6UDDJM3d0weE1RVtzFJnw/+J507lPAtspleHc59T4+N1tzQj1RRGWrzPiTknCjnCO6SxBSJX0B+MIUWrpNAw==\n" +
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:0:a7SFapoVaXq27NU+wZj4afmxp0SbwLGqLJih8pfX6TRKPvNp/V93fbKixbqg10cwa1CadNenztxq3ZgOivqADw==\n" +
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:0:bJyoM2Tz4hltVXkLvYHOOmLP4qqh2fx7aMLkS5q0cMoEg5AFER3iETj13uoFyhz8yiAKESyAZSDjjQwp8A1QDw==\n" +
  "F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:0:h8D/dx/z5K2dx06ktp7fnmLRdxkdV5wRkJgnmEvKy2k55mM2RyREpHfD7t/1CC5Ew+UD0V9N27PfaoLxZc1KCQ==\n" +
  "HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd:F5PtTpt8QFYMGtpZaETygB2C2yxCSxH1UW1VopBNZ6qg:0:eefk9Gg0Ijz0GvrNnRc55CCCBd4yk8j0fNzWzVZFKR3kZ7lsKav6dWyAsaVhlNG5S6XwEwvPoMwKJq1Vn7OjBg==\n" +
  "Transactions:\n" +
  "TX:10:1:6:6:8:1:0\n" +
  "33753-0000054FC8AC7B450BA7D8BA7ED873FEDD5BF1E98D5D3B0DEE38DED55CB80CB3\n" +
  "G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU\n" +
  "150605:3:T:01B1AB40E7C1021712FF40D5605037C0ACEECA547BF519ABDCB6473A9F6BDF45:1\n" +
  "297705:3:D:G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:33530\n" +
  "2244725:3:T:507CBE120DB654645B55431A9967789ACB7CD260EA962B839F1708834D1E5491:0\n" +
  "972091:2:D:G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU:30324\n" +
  "3808457:2:T:657229C5433FB9FFE64BF2E795E79DA796E0B1AF536DC740ECC26CCBBE104C33:1\n" +
  "4:2:T:507CBE120DB654645B55431A9967789ACB7CD260EA962B839F1708834D1E5491:1\n" +
  "0:SIG(0)\n" +
  "1:SIG(0)\n" +
  "2:SIG(0)\n" +
  "3:SIG(0)\n" +
  "4:SIG(0)\n" +
  "5:SIG(0)\n" +
  "3171064:3:SIG(5ocqzyDMMWf1V8bsoNhWb1iNwax1e9M7VTUN6navs8of)\n" +
  "3:2:SIG(5ocqzyDMMWf1V8bsoNhWb1iNwax1e9M7VTUN6navs8of)\n" +
  "4:1:SIG(5ocqzyDMMWf1V8bsoNhWb1iNwax1e9M7VTUN6navs8of)\n" +
  "8:0:SIG(5ocqzyDMMWf1V8bsoNhWb1iNwax1e9M7VTUN6navs8of)\n" +
  "25:3:SIG(G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU)\n" +
  "8:2:SIG(G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU)\n" +
  "5:1:SIG(G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU)\n" +
  "2:0:SIG(G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU)\n" +
  "all 10.6517\n" +
  "42yQm4hGTJYWkPg39hQAUgP6S6EQ4vTfXdJuxKEHL1ih6YHiDL2hcwrFgBHjXLRgxRhj2VNVqqc6b4JayKqTE14r\n" +
  "TX:10:1:1:1:1:0:0\n" +
  "5-2C31D8915801E759F6D4FF3DA8DA983D7D56DCF4F8D94619FCFAD4B128362326\n" +
  "HsLShAtzXTVxeUtQd7yi5Z5Zh4zNvbu8sTEZ53nfKcqY\n" +
  "10:3:T:2C31D8915801E759F6D4FF3DA8DA983D7D56DCF4F8D94619FCFAD4B128362326:88\n" +
  "0:SIG(0)\n" +
  "1:4:SIG(BYfWYFrsyjpvpFysgu19rGK3VHBkz4MqmQbNyEuVU64g)\n" +
  "I6gJkJIQJ9vwDRXZ6kdBsOArQ3zzMYPmFxDbJqseBVq5NWlmJ7l7oY9iWtqhPF38rp7/iitbgyftsRR8djOGDg==\n" +
  "InnerHash: DE837CA3F49C423A6A6C124819ABA31A41C1C4A4E2728B5721DF891B98FA8D0D\n" +
  "Nonce: 1\n" +
  "kNsKdC8eH0d4zdHh1djyMzRXjFrwk3Bc3M8wo4DV/7clE9J66K/U0FljyS79SI78ZZUPaVmrImKJ9SNiubCiBg==\n";

describe("v1.0 Local Index", function(){

  let block, index;

  before(() => {
    block = parsers.parseBlock.syncWrite(raw);
    index = indexer.localIndex(block, { sigValidity: 100, msValidity: 40 });
  });

  it('should have 30 index entries', () => {
    index.should.have.length(30);
  });

  /*********
   * IINDEX
   ********/

  it('should have 4 iindex entries', () => {
    _(index).where({ index: constants.I_INDEX}).should.have.length(4);
  });

  it('should have 1 iindex CREATE entries', () => {
    _(index).where({ index: constants.I_INDEX, op: constants.IDX_CREATE }).should.have.length(1);
  });

  it('should have 3 iindex UPDATE entries', () => {
    _(index).where({ index: constants.I_INDEX, op: constants.IDX_UPDATE }).should.have.length(3);
  });

  /*********
   * MINDEX
   ********/

  it('should have 5 mindex entries', () => {
    _(index).where({ index: constants.M_INDEX}).should.have.length(5);
  });

  it('should have 1 mindex CREATE entries', () => {
    _(index).where({ index: constants.M_INDEX, op: constants.IDX_CREATE }).should.have.length(1);
  });

  it('should have 4 mindex UPDATE entries', () => {
    _(index).where({ index: constants.M_INDEX, op: constants.IDX_UPDATE }).should.have.length(4);
  });

  /*********
   * CINDEX
   ********/

  it('should have 5 cindex entries', () => {
    _(index).where({ index: constants.C_INDEX}).should.have.length(5);
  });

  it('should have 5 cindex CREATE entries', () => {
    _(index).where({ index: constants.C_INDEX, op: constants.IDX_CREATE }).should.have.length(5);
  });

  it('should have 0 cindex UPDATE entries', () => {
    _(index).where({ index: constants.C_INDEX, op: constants.IDX_UPDATE }).should.have.length(0);
  });

  /*********
   * SINDEX
   ********/

  it('should have 16 cindex entries', () => {
    _(index).where({ index: constants.S_INDEX}).should.have.length(16);
  });

  it('should have 9 cindex CREATE entries', () => {
    _(index).where({ index: constants.S_INDEX, op: constants.IDX_CREATE }).should.have.length(9);
  });

  it('should have 7 cindex UPDATE entries', () => {
    _(index).where({ index: constants.S_INDEX, op: constants.IDX_UPDATE }).should.have.length(7);
  });

});
