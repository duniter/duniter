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
// const should = require('should');
// const co = require('co');
// const limiter = require('../../app/lib/system/limiter');
// const toolbox = require('../integration/tools/toolbox');
// const TestUser = require('../integration/tools/TestUser').TestUser
// const bma     = require('../lib/bma');
//
// limiter.noLimit();
//
// const s1 = toolbox.server({
//   pair: {
//     pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
//     sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
//   }
// });
//
// describe('DDOS', () => {
//
//   before(() => co(function*() {
//     limiter.noLimit();
//     yield s1.initWithDAL().then(bma).then((bmapi) => {
//       s1.bma = bmapi;
//       bmapi.openConnections();
//     });
//   }));
//
//   it('should not be able to send more than 4 reqs/s', () => co(function*() {
//     try {
//       s1.bma.getDDOS().params.limit = 3;
//       s1.bma.getDDOS().params.burst = 3;
//       s1.bma.getDDOS().params.whitelist = [];
//       yield Array.from({ length: 4 }).map(() => s1.get('/blockchain/current'));
//       throw 'Wrong error thrown';
//     } catch (e) {
//       e.should.have.property('statusCode').equal(429);
//     }
//   }));
// });
