"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("../../../server");
const BlockDTO_1 = require("../../../app/lib/dto/BlockDTO");
const IdentityDTO_1 = require("../../../app/lib/dto/IdentityDTO");
const PeerDTO_1 = require("../../../app/lib/dto/PeerDTO");
const _ = require('underscore');
const rp = require('request-promise');
const httpTest = require('../tools/http');
const sync = require('../tools/sync');
const commit = require('../tools/commit');
const user = require('../tools/user');
const until = require('../tools/until');
const bma = require('../../../app/modules/bma').BmaDependency.duniter.methods.bma;
const multicaster = require('../../../app/lib/streams/multicaster');
const dtos = require('../../../app/modules/bma').BmaDependency.duniter.methods.dtos;
const logger = require('../../../app/lib/logger').NewLogger('toolbox');
require('../../../app/modules/bma').BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter
const MEMORY_MODE = true;
const CURRENCY_NAME = 'duniter_unit_test_currency';
const HOST = '127.0.0.1';
let PORT = 10000;
exports.shouldFail = (promise, message = null) => __awaiter(this, void 0, void 0, function* () {
    try {
        yield promise;
        throw '{ "message": "Should have thrown an error" }';
    }
    catch (e) {
        let err = e;
        if (typeof e === "string") {
            err = JSON.parse(e);
        }
        err.should.have.property('message').equal(message);
    }
});
exports.simpleNetworkOf2NodesAnd2Users = (options) => __awaiter(this, void 0, void 0, function* () {
    const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP' };
    const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE' };
    const s1 = exports.NewTestingServer(_.extend({ pair: catKeyring }, options || {}));
    const s2 = exports.NewTestingServer(_.extend({ pair: tacKeyring }, options || {}));
    const cat = user('cat', catKeyring, { server: s1 });
    const tac = user('tac', tacKeyring, { server: s1 });
    yield s1.initDalBmaConnections();
    yield s2.initDalBmaConnections();
    yield s2.sharePeeringWith(s1);
    // await s2.post('/network/peering/peers', await s1.get('/network/peering'));
    // await s1.submitPeerP(await s2.get('/network/peering'));
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
});
exports.simpleNodeWith2Users = (options) => __awaiter(this, void 0, void 0, function* () {
    const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP' };
    const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE' };
    const s1 = exports.NewTestingServer(_.extend({ pair: catKeyring }, options || {}));
    const cat = user('cat', catKeyring, { server: s1 });
    const tac = user('tac', tacKeyring, { server: s1 });
    yield s1.initDalBmaConnections();
    yield cat.createIdentity();
    yield tac.createIdentity();
    yield cat.cert(tac);
    yield tac.cert(cat);
    yield cat.join();
    yield tac.join();
    return { s1, cat, tac };
});
exports.simpleNodeWith2otherUsers = (options) => __awaiter(this, void 0, void 0, function* () {
    const ticKeyring = { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7' };
    const tocKeyring = { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F' };
    const s1 = exports.NewTestingServer(_.extend({ pair: ticKeyring }, options || {}));
    const tic = user('cat', ticKeyring, { server: s1 });
    const toc = user('tac', tocKeyring, { server: s1 });
    yield s1.initDalBmaConnections();
    yield tic.createIdentity();
    yield toc.createIdentity();
    yield tic.cert(toc);
    yield toc.cert(tic);
    yield tic.join();
    yield toc.join();
    return { s1, tic, toc };
});
exports.createUser = (uid, pub, sec, defaultServer) => __awaiter(this, void 0, void 0, function* () {
    const keyring = { pub: pub, sec: sec };
    return user(uid, keyring, { server: defaultServer });
});
exports.fakeSyncServer = (readBlocksMethod, readParticularBlockMethod, onPeersRequested) => __awaiter(this, void 0, void 0, function* () {
    const host = HOST;
    const port = PORT++;
    // Meaningful variables
    const NO_HTTP_LOGS = false;
    const NO_STATIC_PATH = null;
    // A fake HTTP limiter with no limit at all
    const noLimit = {
        canAnswerNow: () => true,
        processRequest: () => { }
    };
    const fakeServer = yield require('../../../app/modules/bma').BmaDependency.duniter.methods.createServersAndListen("Fake Duniter Server", { conf: {} }, [{
            ip: host,
            port: port
        }], NO_HTTP_LOGS, logger, NO_STATIC_PATH, (app, httpMethods) => {
        // Mock BMA method for sync mocking
        httpMethods.httpGET('/network/peering', () => __awaiter(this, void 0, void 0, function* () {
            return {
                endpoints: [['BASIC_MERKLED_API', host, port].join(' ')]
            };
        }), dtos.Peer, noLimit);
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
/**
 * Creates a new memory duniter server for Unit Test purposes.
 * @param conf
 */
exports.server = (conf) => exports.NewTestingServer(conf);
exports.NewTestingServer = (conf) => {
    const port = PORT++;
    const commonConf = {
        port: port,
        ipv4: HOST,
        remoteipv4: HOST,
        currency: conf.currency || CURRENCY_NAME,
        httpLogs: true,
        forksize: 3
    };
    if (conf.sigQty === undefined) {
        conf.sigQty = 1;
    }
    const server = new server_1.Server('~/.config/duniter/' + (conf.homename || 'dev_unit_tests'), conf.memory !== undefined ? conf.memory : MEMORY_MODE, _.extend(conf, commonConf));
    return new TestingServer(port, server);
};
class TestingServer {
    constructor(port, server) {
        this.port = port;
        this.server = server;
        server.getMainEndpoint = require('../../../app/modules/bma').BmaDependency.duniter.methods.getMainEndpoint;
    }
    get BlockchainService() {
        return this.server.BlockchainService;
    }
    get PeeringService() {
        return this.server.PeeringService;
    }
    get conf() {
        return this.server.conf;
    }
    get dal() {
        return this.server.dal;
    }
    get logger() {
        return this.server.logger;
    }
    get home() {
        return this.server.home;
    }
    revert() {
        return this.server.revert();
    }
    resetHome() {
        return this.server.resetHome();
    }
    on(event, f) {
        return this.server.on(event, f);
    }
    recomputeSelfPeer() {
        return this.server.recomputeSelfPeer();
    }
    singleWritePromise(obj) {
        return this.server.singleWritePromise(obj);
    }
    exportAllDataAsZIP() {
        return this.server.exportAllDataAsZIP();
    }
    unplugFileSystem() {
        return this.server.unplugFileSystem();
    }
    importAllDataFromZIP(zipFile) {
        return this.server.importAllDataFromZIP(zipFile);
    }
    push(chunk, encoding) {
        return this.server.push(chunk, encoding);
    }
    pipe(writable) {
        return this.server.pipe(writable);
    }
    initDalBmaConnections() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.server.initWithDAL();
            const bmapi = yield bma(this.server);
            this.bma = bmapi;
            const res = yield bmapi.openConnections();
            return res;
        });
    }
    url(uri) {
        return 'http://' + [HOST, this.port].join(':') + uri;
    }
    get(uri) {
        return rp(this.url(uri), { json: true });
    }
    post(uri, obj) {
        return rp(this.url(uri), { method: 'POST', json: true, body: obj });
    }
    expect(uri, expectations) {
        return typeof expectations == 'function' ? httpTest.expectAnswer(rp(this.url(uri), { json: true }), expectations) : httpTest.expectJSON(rp(this.url(uri), { json: true }), expectations);
    }
    expectThat(uri, expectations) {
        return httpTest.expectAnswer(rp(this.url(uri), { json: true }), expectations);
    }
    expectJSON(uri, expectations) {
        return httpTest.expectJSON(rp(this.url(uri), { json: true }), expectations);
    }
    expectError(uri, code, message) {
        return httpTest.expectError(code, message, rp(this.url(uri), { json: true }));
    }
    syncFrom(otherServer, fromIncuded, toIncluded) {
        return sync(fromIncuded, toIncluded, otherServer, this.server);
    }
    until(type, count) {
        return until(this.server, type, count);
    }
    commit(options = null) {
        return __awaiter(this, void 0, void 0, function* () {
            const raw = yield commit(this.server)(options);
            return JSON.parse(raw);
        });
    }
    commitExpectError(options) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const raw = yield commit(this.server)(options);
                JSON.parse(raw);
                throw { message: 'Commit operation should have thrown an error' };
            }
            catch (e) {
                if (e.statusCode) {
                    throw JSON.parse(e.error);
                }
            }
        });
    }
    lookup2identity(search) {
        return __awaiter(this, void 0, void 0, function* () {
            const lookup = yield this.get('/wot/lookup/' + search);
            return IdentityDTO_1.IdentityDTO.fromJSONObject({
                issuer: lookup.results[0].pubkey,
                currency: this.server.conf.currency,
                uid: lookup.results[0].uids[0].uid,
                buid: lookup.results[0].uids[0].meta.timestamp,
                sig: lookup.results[0].uids[0].self
            });
        });
    }
    readBlock(number) {
        return __awaiter(this, void 0, void 0, function* () {
            const block = yield this.get('/blockchain/block/' + number);
            return BlockDTO_1.BlockDTO.fromJSONObject(block);
        });
    }
    makeNext(overrideProps) {
        return __awaiter(this, void 0, void 0, function* () {
            const block = yield require('../../../app/modules/prover').ProverDependency.duniter.methods.generateAndProveTheNext(this.server, null, null, overrideProps || {});
            return BlockDTO_1.BlockDTO.fromJSONObject(block);
        });
    }
    sharePeeringWith(otherServer) {
        return __awaiter(this, void 0, void 0, function* () {
            let p = yield this.get('/network/peering');
            yield otherServer.post('/network/peering/peers', {
                peer: PeerDTO_1.PeerDTO.fromJSONObject(p).getRawSigned()
            });
        });
    }
    postIdentity(idty) {
        return this.post('/wot/add', {
            identity: idty.getRawSigned()
        });
    }
    postCert(cert) {
        return this.post('/wot/certify', {
            cert: cert.getRaw()
        });
    }
    postMembership(ms) {
        return this.post('/blockchain/membership', {
            membership: ms.getRawSigned()
        });
    }
    postRevocation(rev) {
        return this.post('/wot/revoke', {
            revocation: rev.getRaw()
        });
    }
    postBlock(block) {
        return this.post('/blockchain/block', {
            block: block.getRawSigned()
        });
    }
    postRawTX(rawTX) {
        return this.post('/tx/process', {
            transaction: rawTX
        });
    }
    postPeer(peer) {
        return this.post('/network/peering/peers', {
            peer: peer.getRawSigned()
        });
    }
    prepareForNetwork() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.server.initWithDAL();
            const bmaAPI = yield bma(this.server);
            yield bmaAPI.openConnections();
            this.bma = bmaAPI;
            require('../../../app/modules/router').duniter.methods.routeToNetwork(this.server);
            // Extra: for /wot/requirements URL
            require('../../../app/modules/prover').ProverDependency.duniter.methods.hookServer(this.server);
        });
    }
    startBlockComputation() {
        if (!this.prover) {
            this.prover = require('../../../app/modules/prover').ProverDependency.duniter.methods.prover(this.server);
            this.permaProver = this.prover.permaProver;
            this.server.pipe(this.prover);
        }
        this.prover.startService();
    }
    // server.startBlockComputation = () => this.prover.startService();
    stopBlockComputation() {
        return this.prover.stopService();
    }
}
exports.TestingServer = TestingServer;
//# sourceMappingURL=toolbox.js.map