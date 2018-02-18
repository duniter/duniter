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

"use strict";
const should = require('should');
const co  = require('co');
const scrypt = require('../../../../app/modules/keypair/lib/scrypt').Scrypt

describe('Scrypt salt // key', () => {

  it('abc // abc', () => co(function*() {
    const pair = yield scrypt('abc', 'abc');
    pair.should.have.property('pub').equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    pair.should.have.property('sec').equal('51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP');
  }));

  it('abc // def', () => co(function*() {
    const pair = yield scrypt('abc', 'def');
    pair.should.have.property('pub').equal('G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU');
    pair.should.have.property('sec').equal('58LDg8QLmF5pv6Dn9h7X4yFKfMTdP8fdAiWVcyDoTRJu454fwRihCLULH4MW37zncsg4ruoTGJPZneWk22QmG1w4');
  }));

  it('azerty // def', () => co(function*() {
    const pair = yield scrypt('azerty', 'def');
    pair.should.have.property('pub').equal('3dbw4NYVEm5mwTH6bFrqBhan1k39qNHubkQWdrw2C5AD');
    pair.should.have.property('sec').equal('4kemdi17CPkkBPnjXiPFf6oBhdGiiqhCL3R4Tuafe9THK8mzBs1evHw5r9u3f8xts2zn6VCBJYVrRMzdaEaWn5Ch');
  }));
});
