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

import {KeypairDependency} from "../../../../app/modules/keypair/index"

const should = require('should');
const duniter = require('../../../../index')

describe('Module usage', () => {

  it('wrong options should throw', async () => {
    let errMessage;
    try {
      const stack = duniter.statics.minimalStack();
      stack.registerDependency(KeypairDependency, 'duniter-keypair');
      await stack.executeStack(['node', 'index.js', 'config', '--memory', '--keyN', '2048']);
    } catch (e) {
      errMessage = e.message;
    }
    should.exist(errMessage);
    should.equal(errMessage, 'Missing --salt and --passwd options along with --keyN|keyr|keyp option');
  })

  it('no options on brand new node should generate random key', async () => {
    const stack = duniter.statics.minimalStack();
    stack.registerDependency(KeypairDependency, 'duniter-keypair');
    const res = await stack.executeStack(['node', 'index.js', 'config', '--memory']);
    // This is extremely very unlikely to happen
    res.pair.should.have.property('pub').not.equal('HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd');
    res.pair.should.have.property('sec').not.equal('51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP');
  })
})
