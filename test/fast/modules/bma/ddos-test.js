"use strict";
// const should = require('should');
// const co = require('co');
// const limiter = require('../../app/lib/system/limiter');
// const toolbox = require('../integration/tools/toolbox');
// const user    = require('../integration/tools/user');
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
