import {Server} from "../../../server"
import {PermanentProver} from "../../../app/modules/prover/lib/permanentProver"
import {Prover} from "../../../app/modules/prover/lib/prover"
import {BlockDTO} from "../../../app/lib/dto/BlockDTO"
import * as stream from "stream"
import {RevocationDTO} from "../../../app/lib/dto/RevocationDTO"
import {IdentityDTO} from "../../../app/lib/dto/IdentityDTO"
import {PeerDTO} from "../../../app/lib/dto/PeerDTO"
import {Network} from "../../../app/modules/bma/lib/network";

const _           = require('underscore');
const rp          = require('request-promise');
const httpTest    = require('../tools/http');
const sync        = require('../tools/sync');
const commit      = require('../tools/commit');
const user        = require('../tools/user');
const until       = require('../tools/until');
const bma         = require('../../../app/modules/bma').BmaDependency.duniter.methods.bma;
const multicaster = require('../../../app/lib/streams/multicaster');
const dtos        = require('../../../app/modules/bma').BmaDependency.duniter.methods.dtos;
const logger      = require('../../../app/lib/logger').NewLogger('toolbox');

require('../../../app/modules/bma').BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter

const MEMORY_MODE = true;
const CURRENCY_NAME = 'duniter_unit_test_currency';
const HOST = '127.0.0.1';
let PORT = 10000;


export const shouldFail = async (promise:Promise<any>, message:string|null = null) => {
  try {
    await promise;
    throw '{ "message": "Should have thrown an error" }'
  } catch(e) {
    let err = e
    if (typeof e === "string") {
      err = JSON.parse(e)
    }
    err.should.have.property('message').equal(message);
  }
}

export const simpleNetworkOf2NodesAnd2Users = async (options:any) => {
  const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'};
  const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'};

  const s1 = NewTestingServer(_.extend({ pair: catKeyring }, options || {}));
  const s2 = NewTestingServer(_.extend({ pair: tacKeyring }, options || {}));

  const cat = user('cat', catKeyring, { server: s1 });
  const tac = user('tac', tacKeyring, { server: s1 });

  await s1.initDalBmaConnections()
  await s2.initDalBmaConnections()

  await s2.sharePeeringWith(s1);
  // await s2.post('/network/peering/peers', await s1.get('/network/peering'));
  // await s1.submitPeerP(await s2.get('/network/peering'));

  await cat.createIdentity();
  await tac.createIdentity();
  await cat.cert(tac);
  await tac.cert(cat);
  await cat.join();
  await tac.join();

  // Each server forwards to each other
  require('../../../app/modules/router').duniter.methods.routeToNetwork(s1);
  require('../../../app/modules/router').duniter.methods.routeToNetwork(s2);

  return { s1, s2, cat, tac };
}

export const simpleNodeWith2Users = async (options:any) => {

  const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'};
  const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'};

  const s1 = NewTestingServer(_.extend({ pair: catKeyring }, options || {}));

  const cat = user('cat', catKeyring, { server: s1 });
  const tac = user('tac', tacKeyring, { server: s1 });

  await s1.initDalBmaConnections()

  await cat.createIdentity();
  await tac.createIdentity();
  await cat.cert(tac);
  await tac.cert(cat);
  await cat.join();
  await tac.join();

  return { s1, cat, tac };
}

export const simpleNodeWith2otherUsers = async (options:any) => {

  const ticKeyring = { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'};
  const tocKeyring = { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'};

  const s1 = NewTestingServer(_.extend({ pair: ticKeyring }, options || {}));

  const tic = user('cat', ticKeyring, { server: s1 });
  const toc = user('tac', tocKeyring, { server: s1 });

  await s1.initDalBmaConnections()

  await tic.createIdentity();
  await toc.createIdentity();
  await tic.cert(toc);
  await toc.cert(tic);
  await tic.join();
  await toc.join();

  return { s1, tic, toc };
}

export const createUser = async (uid:string, pub:string, sec:string, defaultServer:Server) => {
  const keyring = { pub: pub, sec: sec };
  return user(uid, keyring, { server: defaultServer });
}

export const fakeSyncServer = async (readBlocksMethod:any, readParticularBlockMethod:any, onPeersRequested:any) => {

  const host = HOST;
  const port = PORT++;

  // Meaningful variables
  const NO_HTTP_LOGS = false;
  const NO_STATIC_PATH = null;

  // A fake HTTP limiter with no limit at all
  const noLimit = {
    canAnswerNow: () => true,
    processRequest: () => { /* Does nothing */ }
  };

  const fakeServer = await Network.createServersAndListen("Fake Duniter Server", new Server("", true, {}), [{
    ip: host,
    port: port
  }], NO_HTTP_LOGS, logger, NO_STATIC_PATH, (app:any, httpMethods:any) => {

    // Mock BMA method for sync mocking
    httpMethods.httpGET('/network/peering', async () => {
      return {
        endpoints: [['BASIC_MERKLED_API', host, port].join(' ')]
      }
    }, noLimit);

    // Mock BMA method for sync mocking
    httpMethods.httpGET('/network/peering/peers', onPeersRequested, noLimit);

    // Another mock BMA method for sync mocking
    httpMethods.httpGET('/blockchain/blocks/:count/:from', (req:any) => {

      // What do we do on /blockchain/blocks request
      let count = parseInt(req.params.count);
      let from = parseInt(req.params.from);

      return readBlocksMethod(count, from);

    }, noLimit);

    // Another mock BMA method for sync mocking
    httpMethods.httpGET('/blockchain/block/:number', (req:any) => {

      // What do we do on /blockchain/blocks request
      let number = parseInt(req.params.number);

      return readParticularBlockMethod(number);

    }, noLimit);
  }, null)

  await fakeServer.openConnections();
  return {
    host: host,
    port: port
  };
}

/**
 * Creates a new memory duniter server for Unit Test purposes.
 * @param conf
 */
export const server = (conf:any) => NewTestingServer(conf)

export const NewTestingServer = (conf:any) => {
  const port = PORT++;
  const commonConf = {
    port: port,
    ipv4: HOST,
    remoteipv4: HOST,
    currency: conf.currency || CURRENCY_NAME,
    httpLogs: true,
    forksize: conf.forksize || 3
  };
  if (conf.sigQty === undefined) {
    conf.sigQty = 1;
  }
  const server = new Server(
    '~/.config/duniter/' + (conf.homename || 'dev_unit_tests'),
    conf.memory !== undefined ? conf.memory : MEMORY_MODE,
    _.extend(conf, commonConf));

  return new TestingServer(port, server)
}

export class TestingServer {

  private prover:Prover
  private permaProver:PermanentProver
  private bma:any

  constructor(
    private port:number,
    private server:Server) {

    server.getMainEndpoint = require('../../../app/modules/bma').BmaDependency.duniter.methods.getMainEndpoint
  }

  get BlockchainService() {
    return this.server.BlockchainService
  }

  get PeeringService() {
    return this.server.PeeringService
  }

  get conf() {
    return this.server.conf
  }

  get dal() {
    return this.server.dal
  }

  get logger() {
    return this.server.logger
  }

  get home() {
    return this.server.home
  }

  revert() {
    return this.server.revert()
  }

  resetHome() {
    return this.server.resetHome()
  }

  on(event:string, f:any) {
    return this.server.on(event, f)
  }

  recomputeSelfPeer() {
    return this.server.recomputeSelfPeer()
  }

  async writeBlock(obj:any) {
    return this.server.writeBlock(obj)
  }
  
  async writeIdentity(obj:any) {
    return this.server.writeIdentity(obj)
  }
  
  async writeCertification(obj:any) {
    return this.server.writeCertification(obj)
  }
  
  async writeMembership(obj:any) {
    return this.server.writeMembership(obj)
  }
  
  async writeRevocation(obj:any) {
    return this.server.writeRevocation(obj)
  }
  
  async writeTransaction(obj:any) {
    return this.server.writeTransaction(obj)
  }
  
  async writePeer(obj:any) {
    return this.server.writePeer(obj)
  }
  
  exportAllDataAsZIP() {
    return this.server.exportAllDataAsZIP()
  }

  unplugFileSystem() {
    return this.server.unplugFileSystem()
  }

  importAllDataFromZIP(zipFile:string) {
    return this.server.importAllDataFromZIP(zipFile)
  }

  push(chunk: any, encoding?: string) {
    return this.server.push(chunk, encoding)
  }

  pipe(writable:stream.Writable) {
    return this.server.pipe(writable)
  }

  async initDalBmaConnections() {
    await this.server.initWithDAL()
    const bmapi = await bma(this.server)
    this.bma = bmapi
    const res = await bmapi.openConnections()
    return res
  }

  url(uri:string) {
    return 'http://' + [HOST, this.port].join(':') + uri;
  }

  get(uri:string) {
    return rp(this.url(uri), { json: true });
  }

  post(uri:string, obj:any) {
    return rp(this.url(uri), { method: 'POST', json: true, body: obj });
  }


  expect(uri:string, expectations:any) {
    return typeof expectations == 'function' ? httpTest.expectAnswer(rp(this.url(uri), { json: true }), expectations) : httpTest.expectJSON(rp(this.url(uri), { json: true }), expectations);
  }

  expectThat(uri:string, expectations:any) {
    return httpTest.expectAnswer(rp(this.url(uri), { json: true }), expectations);
  }

  expectJSON(uri:string, expectations:any) {
    return httpTest.expectJSON(rp(this.url(uri), { json: true }), expectations);
  }

  expectError(uri:string, code:number, message:string) {
    return httpTest.expectError(code, message, rp(this.url(uri), { json: true }));
  }


  syncFrom(otherServer:Server, fromIncuded:number, toIncluded:number) {
    return sync(fromIncuded, toIncluded, otherServer, this.server);
  }


  until(type:string, count:number) {
    return until(this.server, type, count);
  }


  async commit(options:any = null) {
    const raw = await commit(this.server)(options);
    return JSON.parse(raw);
  }

  async commitExpectError(options:any) {
    try {
      const raw = await commit(this.server)(options);
      JSON.parse(raw);
      throw { message: 'Commit operation should have thrown an error' };
    } catch (e) {
      if (e.statusCode) {
        throw JSON.parse(e.error);
      }
    }
  }

  async lookup2identity(search:string) {
    const lookup = await this.get('/wot/lookup/' + search);
    return IdentityDTO.fromJSONObject({
      issuer: lookup.results[0].pubkey,
      currency: this.server.conf.currency,
      uid: lookup.results[0].uids[0].uid,
      buid: lookup.results[0].uids[0].meta.timestamp,
      sig: lookup.results[0].uids[0].self
    })
  }

  async readBlock(number:number) {
    const block = await this.get('/blockchain/block/' + number);
    return BlockDTO.fromJSONObject(block)
  }

  async makeNext(overrideProps:any) {
    const block = await require('../../../app/modules/prover').ProverDependency.duniter.methods.generateAndProveTheNext(this.server, null, null, overrideProps || {});
    return BlockDTO.fromJSONObject(block)
  }

  async sharePeeringWith(otherServer:TestingServer) {
    let p = await this.get('/network/peering');
    await otherServer.post('/network/peering/peers', {
      peer: PeerDTO.fromJSONObject(p).getRawSigned()
    });
  }

  async getPeer() {
    return this.get('/network/peering')
  }

  postIdentity(idty:any) {
    return this.post('/wot/add', {
      identity: idty.getRawSigned()
    })
  }

  postCert(cert:any) {
    return this.post('/wot/certify', {
      cert: cert.getRawSigned()
    })
  }

  postMembership(ms:any) {
    return this.post('/blockchain/membership', {
      membership: ms.getRawSigned()
    })
  }

  postRevocation(rev:RevocationDTO) {
    return this.post('/wot/revoke', {
      revocation: rev.getRaw()
    })
  }

  postBlock(block:BlockDTO) {
    return this.post('/blockchain/block', {
      block: block.getRawSigned()
    })
  }

  postRawTX(rawTX:any) {
    return this.post('/tx/process', {
      transaction: rawTX
    })
  }

  postPeer(peer:any) {
    return this.post('/network/peering/peers', {
      peer: peer.getRawSigned()
    })
  }

  async prepareForNetwork() {
    await this.server.initWithDAL();
    const bmaAPI = await bma(this.server);
    await bmaAPI.openConnections();
    this.bma = bmaAPI;
    require('../../../app/modules/router').duniter.methods.routeToNetwork(this.server);
    // Extra: for /wot/requirements URL
    require('../../../app/modules/prover').ProverDependency.duniter.methods.hookServer(this.server);
  }

  startBlockComputation() {
    if (!this.prover) {
      this.prover = require('../../../app/modules/prover').ProverDependency.duniter.methods.prover(this.server);
      this.permaProver = this.prover.permaProver
      this.server.pipe(this.prover);
    }
    this.prover.startService();
  }

  // server.startBlockComputation = () => this.prover.startService();
  stopBlockComputation() {
    return this.prover.stopService();
  }

  async closeCluster() {
    const server:any = this.server
    if (server._utProver) {
      const farm = await server._utProver.getWorker()
      await farm.shutDownEngine()
    }
  }
}