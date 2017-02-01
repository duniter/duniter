"use strict";
const co            = require('co');
const should        = require('should');
const indexer       = require('../../../app/lib/dup/indexer');

describe("Protocol BR_G106 - Garbaging", function(){

  it('An account with balance < 1,00 should be cleaned up', () => co(function*(){
    const sindex = [];
    const dal = {
      sindexDAL: {
        findLowerThan: () => co(function*() {
          return [
            { amount: 10, base: 0, tx: 'A' },
            { amount: 22, base: 0, tx: 'B' },
            { amount: 15, base: 0, tx: null } // UD
          ];
        }),
        getAvailableForConditions: (conditions) => co(function*() {
          return [
            { amount: 10, base: 0, tx: 'A' },
            { amount: 22, base: 0, tx: 'B' },
            { amount: 15, base: 0, tx: null } // UD
          ];
        })
      }
    };
    const HEAD   = { unitBase: 0 };
    const cleaning = yield indexer.ruleIndexGarbageSmallAccounts(HEAD, sindex, dal);
    cleaning.should.have.length(3);
    cleaning[0].should.have.property('amount').equal(10);
    cleaning[0].should.have.property('base').equal(0);
    cleaning[0].should.have.property('tx').equal('A');
    cleaning[0].should.have.property('consumed').equal(true);
    cleaning[0].should.have.property('op').equal('UPDATE');

    cleaning[1].should.have.property('amount').equal(22);
    cleaning[1].should.have.property('base').equal(0);
    cleaning[1].should.have.property('tx').equal('B');
    cleaning[1].should.have.property('consumed').equal(true);
    cleaning[1].should.have.property('op').equal('UPDATE');

    cleaning[2].should.have.property('amount').equal(15);
    cleaning[2].should.have.property('base').equal(0);
    cleaning[2].should.have.property('tx').equal(null);
    cleaning[2].should.have.property('consumed').equal(true);
    cleaning[2].should.have.property('op').equal('UPDATE');
  }));
});
