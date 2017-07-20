"use strict";
// const should = require('should');
// const co = require('co');
// const limiter = require('../lib/limiter');
// const toolbox = require('../integration/tools/toolbox');
// const user    = require('../integration/tools/user');
// const bma     = require('duniter-bma').duniter.methods.bma;
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
// const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
//
// let theLimiter;
//
// describe('Limiter', () => {
//
//   before(() => {
//     limiter.withLimit();
//     theLimiter = limiter.limitAsTest();
//   });
//
//   it('should not be able to send more than 10 reqs/s', () => {
//     theLimiter.canAnswerNow().should.equal(true);
//     for (let i = 1; i <= 4; i++) {
//         theLimiter.processRequest();
//     }
//     theLimiter.canAnswerNow().should.equal(true);
//     theLimiter.processRequest(); // 5 in 1sec
//     theLimiter.canAnswerNow().should.equal(false);
//   });
//
//   it('should be able to send 1 more request (by minute constraint)', () => co(function*(){
//     yield new Promise((resolve) => setTimeout(resolve, 1000));
//     theLimiter.canAnswerNow().should.equal(true);
//     theLimiter.processRequest(); // 1 in 1sec, 6 in 1min
//     theLimiter.canAnswerNow().should.equal(false);
//   }));
//
//   it('should work with BMA API', () => co(function*(){
//     yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
//     yield cat.createIdentity();
//     try {
//       for (let i = 0; i < 11; i++) {
//         yield s1.get('/wot/lookup/cat');
//       }
//       throw 'Should have thrown a limiter error';
//     } catch (e) {
//       e.should.have.property('error').property('ucode').equal(1006);
//     }
//   }));
//
//   after(() => limiter.noLimit());
// });
