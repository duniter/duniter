"use strict";
const co            = require('co');
const should        = require('should');
const indexer       = require('../../../app/lib/dup/indexer');

describe("Protocol BR_G106 - Garbaging", function(){

  it('An account with balance < 1,00 should be cleaned up', () => co(function*(){
    const balances = {
      pubkeyA: { balance: 103 },
      pubkeyB: { balance: 11 + 22 + 68 }, // 101
      pubkeyC: { balance: 100 },
      pubkeyD: { balance: 0 },
      pubkeyE: { balance: 0 }
    }
    const sources = {
      pubkeyA: [ // 103
        { amount: 103, base: 0, tx: 'A1', identifier: 'I1', pos: 0 }
      ],
      pubkeyB: [ // 104
        { amount: 14, base: 0, tx: 'B1', identifier: 'I4', pos: 0 },
        { amount: 22, base: 0, tx: 'B2', identifier: 'I10', pos: 0 },
        { amount: 68, base: 0, tx: null, identifier: 'I11', pos: 0 } // UD
      ],
      pubkeyC: [ // 100
        { amount: 100, base: 0, tx: 'C1', identifier: 'I8', pos: 0 }
      ],
      pubkeyD: [],
      pubkeyE: []
    }
    const dal = {
      getWallet: (conditions) => Promise.resolve(balances[conditions]),
      sindexDAL: {
        getAvailableForConditions: (conditions) => Promise.resolve(sources[conditions]),
      }
    };
    const HEAD   = { unitBase: 0 };
    const cleaning = yield indexer.ruleIndexGarbageSmallAccounts(HEAD, [
      // A sends 3 to D --> A keeps 100
      { op: 'UPDATE', conditions: 'pubkeyA', amount: 103, base: 0, identifier: 'I1', pos: 0 },
      { op: 'CREATE', conditions: 'pubkeyA', amount: 100, base: 0, identifier: 'I2', pos: 0 },
      { op: 'CREATE', conditions: 'pubkeyD', amount: 3,   base: 0, identifier: 'I3', pos: 0 },
      // B sends 5 to D --> B keeps 99
      { op: 'UPDATE', conditions: 'pubkeyB', amount: 14,  base: 0, identifier: 'I4', pos: 0 },
      { op: 'CREATE', conditions: 'pubkeyB', amount: 9,   base: 0, identifier: 'I5', pos: 0 },
      { op: 'CREATE', conditions: 'pubkeyD', amount: 5,   base: 0, identifier: 'I6', pos: 0 },
      { op: 'UPDATE', conditions: 'pubkeyD', amount: 5,   base: 0, identifier: 'I6', pos: 0 }, // |-- Chaining transaction
      { op: 'CREATE', conditions: 'pubkeyD', amount: 5,   base: 0, identifier: 'I7', pos: 0 }, // |-- Chaining transaction
      // C sends 100 to E --> C keeps 0
      { op: 'UPDATE', conditions: 'pubkeyC', amount: 100, base: 0, identifier: 'I8', pos: 0 },
      { op: 'CREATE', conditions: 'pubkeyE', amount: 100, base: 0, identifier: 'I9', pos: 0 },
      ], dal);
    cleaning.should.have.length(5);
    cleaning[0].should.have.property('identifier').equal('I3');
    cleaning[0].should.have.property('amount').equal(3);
    cleaning[0].should.have.property('base').equal(0);
    cleaning[0].should.have.property('tx').equal(undefined);
    cleaning[0].should.have.property('consumed').equal(true);
    cleaning[0].should.have.property('op').equal('UPDATE');

    cleaning[1].should.have.property('identifier').equal('I7');
    cleaning[1].should.have.property('amount').equal(5);
    cleaning[1].should.have.property('base').equal(0);
    cleaning[1].should.have.property('tx').equal(undefined);
    cleaning[1].should.have.property('consumed').equal(true);
    cleaning[1].should.have.property('op').equal('UPDATE');

    cleaning[2].should.have.property('identifier').equal('I5');
    cleaning[2].should.have.property('amount').equal(9);
    cleaning[2].should.have.property('base').equal(0);
    cleaning[2].should.have.property('tx').equal(undefined);
    cleaning[2].should.have.property('consumed').equal(true);
    cleaning[2].should.have.property('op').equal('UPDATE');

    cleaning[3].should.have.property('identifier').equal('I10');
    cleaning[3].should.have.property('amount').equal(22);
    cleaning[3].should.have.property('base').equal(0);
    cleaning[3].should.have.property('tx').equal('B2');
    cleaning[3].should.have.property('consumed').equal(true);
    cleaning[3].should.have.property('op').equal('UPDATE');

    cleaning[4].should.have.property('identifier').equal('I11');
    cleaning[4].should.have.property('amount').equal(68);
    cleaning[4].should.have.property('base').equal(0);
    cleaning[4].should.have.property('tx').equal(null);
    cleaning[4].should.have.property('consumed').equal(true);
    cleaning[4].should.have.property('op').equal('UPDATE');
  }));
});
