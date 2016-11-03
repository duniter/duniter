"use strict";
var co = require('co');
var _ = require('underscore');
var should = require('should');
var assert = require('assert');
var dal = require('../../app/lib/dal/fileDAL');
var dir = require('../../app/lib/system/directory');
var constants = require('../../app/lib/constants');
var Peer   = require('../../app/lib/entity/peer');

var mocks = {
  peer1: {
    pubkey: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
      block: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
      currency: 'bb',
      version: constants.DOCUMENTS_VERSION,
      endpoints: [
      'BASIC_MERKLED_API localhost 7777'
    ]
  },
  block0: {
    "hash" : "00063EB6E83F8717CEF1D25B3E2EE308374A14B1",
    "signature" : "+78w7251vvRdhoIJ6IWHEiEOLxNrmfQf45Y5sYvPdnAdXkVpO1unMV5YA/G5Vhphyz1dICrbeKCPM5qbFsoWAQ==",
    "version" : constants.DOCUMENTS_VERSION,
    "currency" : "meta_brouzouf",
    "issuer" : "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk",
    "parameters" : "0.1:86400:100:604800:2629800:3:3:2629800:3:11:600:20:144:0.67",
    "previousHash" : "",
    "previousIssuer" : "",
    "transactions" : [
      {
        "version" : constants.DOCUMENTS_VERSION,
        "hash": "E65B13D52D5F5F82881C831D5A43FFF624130066",
        "signatories" : [
          "Ecp2suUYtgZzih816mi1bH1JjiaUFNoX2oe2nNvTocc3"
        ],
        "inputs" : [
          "0:D:714:00000982118DF0D23E3B6A8A60A894386948E00A:100"
        ],
        "outputs" : [
          "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:16",
          "Ecp2suUYtgZzih816mi1bH1JjiaUFNoX2oe2nNvTocc3:84"
        ],
        "signatures" : [
          "vxtu0SxtFrb3/vTMVR0ayD2jFKpe/kIA9X3ikjBW+4C8nCcSAtdAGgN+Jk1Epo0V726SpdMr8EvFqXR6KMXgAQ=="
        ],
        "comment" : "for memory leak elimination :)"
      },
      {
        "version" : constants.DOCUMENTS_VERSION,
        "hash": "CB856DBE7A1D39CB37F5EA9962059CD44F903AD5",
        "signatories" : [
          "Ecp2suUYtgZzih816mi1bH1JjiaUFNoX2oe2nNvTocc3"
        ],
        "inputs" : [
          "0:T:728:CBE88F0F473877333730D40E3940A648D8B2EFC7:23"
        ],
        "outputs" : [
          "ATkjQPa4sn4LBF69jqEPzFtRdHYJs6MJQjvP8JdN7MtN:3",
          "Ecp2suUYtgZzih816mi1bH1JjiaUFNoX2oe2nNvTocc3:20"
        ],
        "signatures" : [
          "DWJeH+LhebheqnhEIo4Qiczuj3319MYEhW8XG4QUvAzuIfxSHGX+ZoiL7cWyzT1ky10xSMjP12FSGpsb7vf1Cg=="
        ],
        "comment" : ""
      },
      {
        "version" : constants.DOCUMENTS_VERSION,
        "hash": "18D1CDBCB9B77F6A7409F2BA5F53301FF3307850",
        "signatories" : [
          "Ecp2suUYtgZzih816mi1bH1JjiaUFNoX2oe2nNvTocc3"
        ],
        "inputs" : [
          "0:T:728:491C512C8FD478EC521E18BEDD38AADF0575C980:6",
          "0:T:728:985E26930D2D656023ADD7107020849D66DFAC86:11"
        ],
        "outputs" : [
          "5ocqzyDMMWf1V8bsoNhWb1iNwax1e9M7VTUN6navs8of:16",
          "Ecp2suUYtgZzih816mi1bH1JjiaUFNoX2oe2nNvTocc3:1"
        ],
        "signatures" : [
          "HQAy10777DfX7xa1RLMB6izWHSzX8zk1oeBrVjyTOcPHRyPtI7vMs5Kuzhhoe/JEramoEdXBectIXbxjHSuJCg=="
        ],
        "comment" : ""
      },
      {
        "version" : constants.DOCUMENTS_VERSION,
        "hash": "3CC9AA2B8EB657E7A2A31DBC3379B29064551B1C",
        "signatories" : [
          "ERzNcJmHpdqeLAehYwktwhrGeGKd8DVy4ZhhgdhYtE5M"
        ],
        "inputs" : [
          "0:T:703:49DDBF319FD8B67A28890CF6821122356DF10F07:19",
          "0:T:728:491C512C8FD478EC521E18BEDD38AADF0575C980:20"
        ],
        "outputs" : [
          "Enqzh5p6SUm86rUH7tBFbAnWkeEZjRjTxYXUsN5ayCqz:23",
          "ERzNcJmHpdqeLAehYwktwhrGeGKd8DVy4ZhhgdhYtE5M:16"
        ],
        "signatures" : [
          "TC6a+pps/hV1NKtkiSs4MEGr507ZOq1legH34NzkDcUQTEclDJmpmXeR0E7skS/GeOGVO+apk1Ub1hrX6RlACw=="
        ],
        "comment" : ""
      }
    ],
    "certifications" : [
      "37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:0:3wmCVW8AbVxRFm2PuLXD9UTCIg93MhUblZJvlYrDldSV4xuA7mZCd8TV4vb/6Bkc0FMQgBdHtpXrQ7dpo20uBA==",
      "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:0:7UMQsUjLvuiZKIzOH5rrZDdDi5rXUo69EuQulY1Zm42xpRx/Gt5CkoTcJ/Mu83oElQbcZZTz/lVJ6IS0jzMiCQ==",
      "BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:0:twWSY9etI82FLEHzhdqIoHsC9ehWCA7DCPiGxDLCWGPO4TG77hwtn3RcC68qoKHCib577JCp+fcKyp2vyI6FDA==",
      "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:0:7K5MHkO8ibf5SchmPkRrmsg9owEZZ23uEMJJSQYG7L3PUmAKmmV/0VSjivxXH8gJGQBGsXQoK79x1jsYnj2nAg==",
      "BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:0:Jua4FcEJFptSE5OoG1/Mgzx4e9jgGnYu7t8g1sqqPujI9hRhLFNXbQXedPS1q1OD5vWivA045gKOq/gnj8opDg==",
      "37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:0:R/DV4/wYjvBG09QSOGtnxd3bfPFhVjEE5Uy3BsBMVUvjLsgxjf8NgLhYVozcHTRWS43ArxlXKfS5m3+KIPhhAQ==",
      "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:0:4hP+ahJK021akL4UxB6c5QLaGJXa9eapd3nfdFQe+Xy87f/XLhj8BCa22XbbOlyGdaZRT3AYzbCL2UD5tI8mCw==",
      "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:0:sZTQJr0d/xQnxrIIdSePUJpSTOa8v6IYGXMF2fVDZxQU8vwfzPm2dUKTaF0nU6E9wOYszzkBHaXL85nir+WtCQ==",
      "37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:0:hDuBkoFhWhR/FgOU1+9SbQGBMIr47xqUzw1ZMERaPQo4aWm0WFbZurG4lvuJZzTyG6RF/gSw4VPvYZFPxWmADg==",
      "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:0:79ZVrBehElVZh82fJdR18IJx06GkEVZTbwdHH4zb0S6VaGwdtLh1rvomm4ukBvUc8r/suTweG/SScsJairXNAg==",
      "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:0:e/ai9E4G5CFB9Qi329e0ffYpZMgxj8mM4rviqIr2+UESA0UG86OuAAyHO11hYeyolZRiU8I7WdtNE98B1uZuBg==",
      "BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:0:q4PCneYkcPH8AHEqEvqTtYQWslhlYO2B87aReuOl1uPczn5Q3VkZFAsU48ZTYryeyWp2nxdQojdFYhlAUNchAw=="
    ],
    "revoked" : [
      "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU",
      "C7qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw"
    ],
    "excluded" : [
      "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU",
      "37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw"
    ],
    "leavers" : [
      "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:3cJm3F44eLMhQtnQY/7+14SWCDqVTL3Miw65hBVpV+YiUSUknIGhBNN0C0Cf+Pf0/pa1tjucW8Us3z5IklFSDg==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421787800:inso",
      "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:3lFIiaR0QX0jibr5zQpXVGzBvMGqcsTRlmHiwGz5HOAZT8PTdVUb5q6YGZ6qAUZjdMjPmhLaiMIpYc47wUnzBA==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421786393:cgeek",
      "BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:3tyAhpTRrAAOhFJukWI8RBr//nqYYdQibVzjOfaCdcWLb3TNFKrNBBothNsq/YrYHr7gKrpoftucf/oxLF8zAg==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421790376:moul",
      "37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:3oiGaC5b7kWqtqdPxwatPk9QajZHCNT9rf8/8ud9Rli24z/igcOf0Zr4A6RTAIKWUq9foW39VqJe+Y9R3rhACw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421787461:galuel"
    ],
    "actives" : [
      "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:2cJm3F44eLMhQtnQY/7+14SWCDqVTL3Miw65hBVpV+YiUSUknIGhBNN0C0Cf+Pf0/pa1tjucW8Us3z5IklFSDg==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421787800:inso",
      "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:2lFIiaR0QX0jibr5zQpXVGzBvMGqcsTRlmHiwGz5HOAZT8PTdVUb5q6YGZ6qAUZjdMjPmhLaiMIpYc47wUnzBA==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421786393:cgeek",
      "BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:2tyAhpTRrAAOhFJukWI8RBr//nqYYdQibVzjOfaCdcWLb3TNFKrNBBothNsq/YrYHr7gKrpoftucf/oxLF8zAg==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421790376:moul",
      "37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:2oiGaC5b7kWqtqdPxwatPk9QajZHCNT9rf8/8ud9Rli24z/igcOf0Zr4A6RTAIKWUq9foW39VqJe+Y9R3rhACw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421787461:galuel"
    ],
    "joiners" : [
      "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:1cJm3F44eLMhQtnQY/7+14SWCDqVTL3Miw65hBVpV+YiUSUknIGhBNN0C0Cf+Pf0/pa1tjucW8Us3z5IklFSDg==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421787800:inso",
      "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:1lFIiaR0QX0jibr5zQpXVGzBvMGqcsTRlmHiwGz5HOAZT8PTdVUb5q6YGZ6qAUZjdMjPmhLaiMIpYc47wUnzBA==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421786393:cgeek",
      "BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:1tyAhpTRrAAOhFJukWI8RBr//nqYYdQibVzjOfaCdcWLb3TNFKrNBBothNsq/YrYHr7gKrpoftucf/oxLF8zAg==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421790376:moul",
      "37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:1oiGaC5b7kWqtqdPxwatPk9QajZHCNT9rf8/8ud9Rli24z/igcOf0Zr4A6RTAIKWUq9foW39VqJe+Y9R3rhACw==:0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855:1421787461:galuel"
    ],
    "identities" : [
      "8Fi1VSTbjkXguwThF4v2ZxC5whK7pwG2vcGTkPUPjPGU:Ot3zIp/nsHT3zgJy+2YcXPL6vaM5WFsD+F8w3qnJoBRuBG6lv761zoaExp2iyUnm8fDAyKPpMxRK2kf437QSCw==:1421787800:inso",
      "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:GZKLgaxJKL+GqxVLePMt8OVLJ6qTLrib5Mr/j2gjiNRY2k485YLB2OlzhBzZVnD3xLs0xi69JUfmLnM54j3aCA==:1421786393:cgeek",
      "BMAVuMDcGhYAV4wA27DL1VXX2ZARZGJYaMwpf7DJFMYH:th576H89dfymkG7/sH+DAIzjlmIqNEW6zY3ONrGeAml+k3f1ver399kYnEgG5YCaKXnnVM7P0oJHah80BV3mDw==:1421790376:moul",
      "37qBxM4hLV2jfyYo2bNzAjkeLngLr2r7G2HpdpKieVxw:XRmbTYFkPeGVEU2mJzzN4h1oVNDsZ4yyNZlDAfBm9CWhBsZ82QqX9GPHye2hBxxiu4Nz1BHgQiME6B4JcAC8BA==:1421787461:galuel"
    ],
    "membersCount" : 4,
    "monetaryMass" : 0,
    "UDTime" : 1421838980,
    "medianTime" : 1421838980,
    "dividend" : 100,
    "unitbase" : 0,
    "time" : 1421838980,
    "powMin" : 3,
    "number" : 0,
    "nonce" : 10144,
    "inner_hash": "r51009E813AEAB91F6541170D589E42BD2BBBC19BAB18F32EC1D3E83159BB1CD6"
  }
};

var fileDAL = null;

describe("DAL", function(){

  before(() => co(function *() {
    let params = yield dir.getHomeParams(true, 'db0');
    fileDAL = dal(params);
    yield fileDAL.init();
    return fileDAL.saveConf({ currency: "meta_brouzouf" });
  }));

  it('should have DB version 15', () => co(function *() {
    let version = yield fileDAL.getDBVersion();
    should.exist(version);
    version.should.equal(16);
  }));

  it('should have no peer in a first time', function(){
    return fileDAL.listAllPeers().then(function(peers){
      peers.should.have.length(0);
    });
  });

  it('should have 1 peer if 1 is created', function(){
    return fileDAL.savePeer(new Peer(mocks.peer1))
      .then(fileDAL.listAllPeers)
      .then(function(peers){
        peers.should.have.length(1);
        peers[0].should.have.property('pubkey').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
        peers[0].should.have.property('block').equal('0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855');
        peers[0].should.have.property('currency').equal('bb');
        peers[0].should.have.property('endpoints').length(1);
        peers[0].endpoints[0].should.equal('BASIC_MERKLED_API localhost 7777');
      });
  });

  it('should have no current block', function(){
    return fileDAL.getCurrentBlockOrNull().then(function(current){
      should.not.exist(current);
    });
  });

  it('should have no blocks in first time', function(){
    return fileDAL.getCurrentBlockOrNull().then(function(block){
      should.not.exist(block);
    });
  });

  it('should be able to save a Block', function(){
    return co(function *() {
      yield fileDAL.saveBlock(_.extend({ fork: false }, mocks.block0));
      let block = yield fileDAL.getBlock(0);
      block.should.have.property('hash').equal(mocks.block0.hash);
      block.should.have.property('signature').equal(mocks.block0.signature);
      block.should.have.property('version').equal(mocks.block0.version);
      block.should.have.property('currency').equal(mocks.block0.currency);
      block.should.have.property('issuer').equal(mocks.block0.issuer);
      block.should.have.property('parameters').equal(mocks.block0.parameters);
      block.should.have.property('previousHash').equal(mocks.block0.previousHash);
      block.should.have.property('previousIssuer').equal(mocks.block0.previousIssuer);
      block.should.have.property('membersCount').equal(mocks.block0.membersCount);
      block.should.have.property('monetaryMass').equal(mocks.block0.monetaryMass);
      block.should.have.property('UDTime').equal(mocks.block0.UDTime);
      block.should.have.property('medianTime').equal(mocks.block0.medianTime);
      block.should.have.property('dividend').equal(mocks.block0.dividend);
      block.should.have.property('unitbase').equal(mocks.block0.unitbase);
      block.should.have.property('time').equal(mocks.block0.time);
      block.should.have.property('powMin').equal(mocks.block0.powMin);
      block.should.have.property('number').equal(mocks.block0.number);
      block.should.have.property('nonce').equal(mocks.block0.nonce);

      //assert.deepEqual(block, mocks.block0);
      assert.deepEqual(block.identities, mocks.block0.identities);
      assert.deepEqual(block.certifications, mocks.block0.certifications);
      assert.deepEqual(block.actives, mocks.block0.actives);
      assert.deepEqual(block.revoked, mocks.block0.revoked);
      assert.deepEqual(block.excluded, mocks.block0.excluded);
      assert.deepEqual(block.leavers, mocks.block0.leavers);
      assert.deepEqual(block.actives, mocks.block0.actives);
      assert.deepEqual(block.joiners, mocks.block0.joiners);
      assert.deepEqual(block.transactions, mocks.block0.transactions);
    });
  });
});
