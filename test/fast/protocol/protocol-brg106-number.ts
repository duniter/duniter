// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {Map} from "../../../app/lib/common-libs/crypto/map"
import {Indexer} from "../../../app/lib/indexer"

const should        = require('should');

describe("Protocol BR_G106 - Garbaging", function(){

  it('An account with balance < 1,00 should be cleaned up', async () => {
    const balances:Map<{ balance: number }> = {
      pubkeyA: { balance: 103 },
      pubkeyB: { balance: 11 + 22 + 68 }, // 101
      pubkeyC: { balance: 100 },
      pubkeyD: { balance: 0 },
      pubkeyE: { balance: 0 }
    }
    const sources:any = {
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
      getWallet: (conditions:string) => Promise.resolve(balances[conditions]),
      sindexDAL: {
        getAvailableForConditions: (conditions:string) => Promise.resolve(sources[conditions])
      }
    };
    const HEAD   = { unitBase: 0 } as any
    const cleaning = await Indexer.ruleIndexGarbageSmallAccounts(HEAD, [
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
      { op: 'CREATE', conditions: 'pubkeyE', amount: 100, base: 0, identifier: 'I9', pos: 0 }
      ] as any, [], dal as any);
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
  })
})
