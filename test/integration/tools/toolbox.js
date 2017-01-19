"use strict";

const Q           = require('q');
const _           = require('underscore');
const co          = require('co');
const rp          = require('request-promise');
const httpTest    = require('../tools/http');
const sync        = require('../tools/sync');
const commit      = require('../tools/commit');
const user        = require('../tools/user');
const until       = require('../tools/until');
const Peer        = require('../../../app/lib/entity/peer');
const Identity    = require('../../../app/lib/entity/identity');
const Block       = require('../../../app/lib/entity/block');
const bma         = require('duniter-bma').duniter.methods.bma;
const multicaster = require('../../../app/lib/streams/multicaster');
const network     = require('../../../app/lib/system/network');
const dtos        = require('duniter-bma').duniter.methods.dtos;
const duniter     = require('../../../index');
const logger      = require('../../../app/lib/logger')('toolbox');

require('duniter-bma').duniter.methods.noLimit(); // Disables the HTTP limiter

const MEMORY_MODE = true;
const CURRENCY_NAME = 'duniter_unit_test_currency';
const HOST = '127.0.0.1';
let PORT = 10000;

module.exports = {

  simpleNetworkOf2NodesAnd2Users: (options) => co(function*() {
    const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'};
    const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'};

    const s1 = module.exports.server(_.extend({ pair: catKeyring }, options || {}));
    const s2 = module.exports.server(_.extend({ pair: tacKeyring }, options || {}));

    const cat = user('cat', catKeyring, { server: s1 });
    const tac = user('tac', tacKeyring, { server: s1 });

    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
    yield s2.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());

    yield s2.sharePeeringWith(s1);
    // yield s2.post('/network/peering/peers', yield s1.get('/network/peering'));
    // yield s1.submitPeerP(yield s2.get('/network/peering'));

    yield cat.createIdentity();
    yield tac.createIdentity();
    yield cat.cert(tac);
    yield tac.cert(cat);
    yield cat.join();
    yield tac.join();

    // Each server forwards to each other
    require('../../../app/modules/router').duniter.methods.routeToNetwork(s1);
    require('../../../app/modules/router').duniter.methods.routeToNetwork(s2);

    return { s1, s2, cat, tac };
  }),

  simpleNodeWith2Users: (options) => co(function*() {

    const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'};
    const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'};

    const s1 = module.exports.server(_.extend({ pair: catKeyring }, options || {}));

    const cat = user('cat', catKeyring, { server: s1 });
    const tac = user('tac', tacKeyring, { server: s1 });

    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());

    yield cat.createIdentity();
    yield tac.createIdentity();
    yield cat.cert(tac);
    yield tac.cert(cat);
    yield cat.join();
    yield tac.join();

    return { s1, cat, tac };
  }),

  simpleNodeWith2otherUsers: (options) => co(function*() {

    const ticKeyring = { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'};
    const tocKeyring = { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'};

    const s1 = module.exports.server(_.extend({ pair: ticKeyring }, options || {}));

    const tic = user('cat', ticKeyring, { server: s1 });
    const toc = user('tac', tocKeyring, { server: s1 });

    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());

    yield tic.createIdentity();
    yield toc.createIdentity();
    yield tic.cert(toc);
    yield toc.cert(tic);
    yield tic.join();
    yield toc.join();

    return { s1, tic, toc };
  }),

  createUser: (uid, pub, sec, defaultServer) => co(function*() {
    const keyring = { pub: pub, sec: sec };
    return user(uid, keyring, { server: defaultServer });
  }),

  fakeSyncServer: (readBlocksMethod, readParticularBlockMethod, onPeersRequested) => {

    const host = HOST;
    const port = PORT++;

    return co(function*() {

      // Meaningful variables
      const NO_HTTP_LOGS = false;
      const NO_STATIC_PATH = null;

      // A fake HTTP limiter with no limit at all
      const noLimit = {
        canAnswerNow: () => true,
        processRequest: () => { /* Does nothing */ }
      };

      const fakeServer = yield network.createServersAndListen("Fake Duniter Server", [{
        ip: host,
        port: port
      }], NO_HTTP_LOGS, logger, NO_STATIC_PATH, (app, httpMethods) => {

        // Mock BMA method for sync mocking
        httpMethods.httpGET('/network/peering', () => {
          return co(function*() {
            return {
              endpoints: [['BASIC_MERKLED_API', host, port].join(' ')]
            }
          });
        }, dtos.Peer, noLimit);

        // Mock BMA method for sync mocking
        httpMethods.httpGET('/network/peering/peers', onPeersRequested, dtos.MerkleOfPeers, noLimit);

        // Another mock BMA method for sync mocking
        httpMethods.httpGET('/blockchain/blocks/:count/:from', (req) => {

          // What do we do on /blockchain/blocks request
          let count = parseInt(req.params.count);
          let from = parseInt(req.params.from);

          return readBlocksMethod(count, from);

        }, dtos.Blocks, noLimit);

        // Another mock BMA method for sync mocking
        httpMethods.httpGET('/blockchain/block/:number', (req) => {

          // What do we do on /blockchain/blocks request
          let number = parseInt(req.params.number);

          return readParticularBlockMethod(number);

        }, dtos.Block, noLimit);
      });

      yield fakeServer.openConnections();
      return {
        host: host,
        port: port
      };
    });
  },

  /**
   * Creates a new memory duniter server for Unit Test purposes.
   * @param conf
   */
  server: (conf) => {
    const port = PORT++;
    const commonConf = {
      port: port,
      ipv4: HOST,
      remoteipv4: HOST,
      currency: conf.currency || CURRENCY_NAME,
      httpLogs: true,
      forksize: 3,
      sigQty: 1
    };
    const server = duniter(
      '~/.config/duniter/' + (conf.homename || 'dev_unit_tests'),
      conf.memory !== undefined ? conf.memory : MEMORY_MODE,
      _.extend(conf, commonConf));

    server.port = port;
    server.host = HOST;

    server.url = (uri) => 'http://' + [HOST, port].join(':') + uri;
    server.get = (uri) => rp(server.url(uri), { json: true });
    server.post = (uri, obj) => rp(server.url(uri), { method: 'POST', json: true, body: obj });

    server.expect = (uri, expectations) => typeof expectations == 'function' ? httpTest.expectAnswer(rp(server.url(uri), { json: true }), expectations) : httpTest.expectJSON(rp(server.url(uri), { json: true }), expectations);
    server.expectThat = (uri, expectations) => httpTest.expectAnswer(rp(server.url(uri), { json: true }), expectations);
    server.expectJSON = (uri, expectations) => httpTest.expectJSON(rp(server.url(uri), { json: true }), expectations);
    server.expectError = (uri, code, message) => httpTest.expectError(code, message, rp(server.url(uri), { json: true }));

    server.syncFrom = (otherServer, fromIncuded, toIncluded) => sync(fromIncuded, toIncluded, otherServer, server);

    server.until = (type, count) => until(server, type, count);

    server.commit = (options) => co(function*() {
      const raw = yield commit(server)(options);
      return JSON.parse(raw);
    });

    server.commitExpectError = (options) => co(function*() {
      try {
        const raw = yield commit(server)(options);
        JSON.parse(raw);
        throw { message: 'Commit operation should have thrown an error' };
      } catch (e) {
        if (e.statusCode) {
          throw JSON.parse(e.error);
        }
      }
    });

    server.lookup2identity = (search) => co(function*() {
      const lookup = yield server.get('/wot/lookup/' + search);
      return Identity.statics.fromJSON({
        issuer: lookup.results[0].pubkey,
        currency: conf.currency,
        uid: lookup.results[0].uids[0].uid,
        buid: lookup.results[0].uids[0].meta.timestamp,
        sig: lookup.results[0].uids[0].self
      });
    });

    server.readBlock = (number) => co(function*() {
      const block = yield server.get('/blockchain/block/' + number);
      return Block.statics.fromJSON(block);
    });

    server.makeNext = (overrideProps) => co(function*() {
      const block = yield require('duniter-prover').duniter.methods.generateAndProveTheNext(server, null, null, overrideProps || {});
      return Block.statics.fromJSON(block);
    });

    server.sharePeeringWith = (otherServer) => co(function*() {
      let p = yield server.get('/network/peering');
      yield otherServer.post('/network/peering/peers', {
        peer: Peer.statics.peerize(p).getRawSigned()
      });
    });

    server.postIdentity = (idty) => server.post('/wot/add', {
      identity: idty.createIdentity()
    });

    server.postCert = (cert) => server.post('/wot/certify', {
      cert: cert.getRaw()
    });

    server.postMembership = (ms) => server.post('/blockchain/membership', {
      membership: ms.getRawSigned()
    });

    server.postRevocation = (rev) => server.post('/wot/revoke', {
      revocation: rev.getRaw()
    });

    server.postBlock = (block) => server.post('/blockchain/block', {
      block: block.getRawSigned()
    });

    server.postRawTX = (rawTX) => server.post('/tx/process', {
      transaction: rawTX
    });

    server.postPeer = (peer) => server.post('/network/peering/peers', {
      peer: peer.getRawSigned()
    });

    server.prepareForNetwork = () => co(function*() {
      yield server.initWithDAL();
      const bmaAPI = yield bma(server);
      yield bmaAPI.openConnections();
      server.bma = bmaAPI;
      require('../../../app/modules/router').duniter.methods.routeToNetwork(server);
    });

    let prover;
    server.startBlockComputation = () => {
      if (!prover) {
        prover = require('duniter-prover').duniter.methods.prover(server);
        server.permaProver = prover.permaProver;
        server.pipe(prover);
      }
      prover.startService();
    };
    // server.startBlockComputation = () => prover.startService();
    server.stopBlockComputation = () => prover.stopService();

    return server;
  }
};
