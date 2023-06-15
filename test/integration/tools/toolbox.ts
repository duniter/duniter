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

import * as os from 'os'
import * as path from 'path'
import {Server} from "../../../server"
import {PermanentProver} from "../../../app/modules/prover/lib/permanentProver"
import {Prover} from "../../../app/modules/prover/lib/prover"
import {BlockDTO} from "../../../app/lib/dto/BlockDTO"
import * as stream from "stream"
import {RevocationDTO} from "../../../app/lib/dto/RevocationDTO"
import {IdentityDTO} from "../../../app/lib/dto/IdentityDTO"
import {PeerDTO} from "../../../app/lib/dto/PeerDTO"
import {BmaApi, Network} from "../../../app/modules/bma/lib/network"
import {DBIdentity} from "../../../app/lib/dal/sqliteDAL/IdentityDAL"
import {CertificationDTO} from "../../../app/lib/dto/CertificationDTO"
import {BlockchainService} from "../../../app/service/BlockchainService"
import {PeeringService} from "../../../app/service/PeeringService"
import {ConfDTO} from "../../../app/lib/dto/ConfDTO"
import {FileDAL} from "../../../app/lib/dal/fileDAL"
import {MembershipDTO} from "../../../app/lib/dto/MembershipDTO"
import {TransactionDTO} from "../../../app/lib/dto/TransactionDTO"
import {Key} from "../../../app/lib/common-libs/crypto/keyring"
import {
  WS2PConnection,
  WS2PPubkeyLocalAuth,
  WS2PPubkeyRemoteAuth,
  WS2PPubkeySyncLocalAuth
} from "../../../app/modules/ws2p/lib/WS2PConnection"
import {WS2PResponse} from "../../../app/modules/ws2p/lib/impl/WS2PResponse"
import {WS2PMessageHandler} from "../../../app/modules/ws2p/lib/impl/WS2PMessageHandler"
import {WS2PCluster} from "../../../app/modules/ws2p/lib/WS2PCluster"
import {WS2PServer} from "../../../app/modules/ws2p/lib/WS2PServer"
import {WS2PServerMessageHandler} from "../../../app/modules/ws2p/lib/interface/WS2PServerMessageHandler"
import {TestUser} from "./TestUser"
import {RouterDependency} from "../../../app/modules/router"
import {ProverDependency} from "../../../app/modules/prover/index"
import {WS2PClient} from "../../../app/modules/ws2p/lib/WS2PClient"
import {DBBlock} from "../../../app/lib/db/DBBlock"
import {DBPeer} from "../../../app/lib/db/DBPeer"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {BmaDependency} from "../../../app/modules/bma/index"
import {NewLogger} from "../../../app/lib/logger"
import {BlockProver} from "../../../app/modules/prover/lib/blockProver"
import {DataErrors} from "../../../app/lib/common-libs/errors"
import {until} from "./test-until"
import {sync} from "./test-sync"
import {expectAnswer, expectError, expectJSON} from "./http-expect"
import {WebSocketServer} from "../../../app/lib/common-libs/websocket"
import {CommonConstants} from "../../../app/lib/common-libs/constants"
import {WS2PRequester} from "../../../app/modules/ws2p/lib/WS2PRequester"
import {WS2PDependency} from "../../../app/modules/ws2p/index"
import {ForcedBlockValues} from "../../../app/modules/prover/lib/blockGenerator"
import {LevelMIndexExpiresOnIndexer} from "../../../app/lib/dal/indexDAL/leveldb/indexers/LevelMIndexExpiresOnIndexer";

const assert      = require('assert');
const rp          = require('request-promise');
const es          = require('event-stream');
const logger      = NewLogger();

require('../../../app/modules/bma').BmaDependency.duniter.methods.noLimit(); // Disables the HTTP limiter

const MEMORY_MODE = true;
const CURRENCY_NAME = 'duniter_unit_test_currency';
const HOST = '127.0.0.1';
let PORT = 10000;

export const getNewTestingPort = () => {
  return PORT++
}

export const simpleUser = (uid:string, keyring:{ pub:string, sec:string }, server:TestingServer) => {
  return new TestUser(uid, keyring, { server });
}

export const simpleNetworkOf2NodesAnd2Users = async (options:any) => {
  const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'};
  const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'};

  const s1 = NewTestingServer(Underscore.extend({ pair: catKeyring }, options || {}));
  const s2 = NewTestingServer(Underscore.extend({ pair: tacKeyring }, options || {}));

  const cat = new TestUser('cat', catKeyring, { server: s1 });
  const tac = new TestUser('tac', tacKeyring, { server: s1 });

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
  RouterDependency.duniter.methods.routeToNetwork(s1._server)
  RouterDependency.duniter.methods.routeToNetwork(s2._server)

  return { s1, s2, cat, tac };
}

export const simpleNodeWith2Users = async (options:any) => {

  const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'};
  const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'};

  const s1 = NewTestingServer(Underscore.extend({ pair: catKeyring }, options || {}));

  const cat = new TestUser('cat', catKeyring, { server: s1 });
  const tac = new TestUser('tac', tacKeyring, { server: s1 });

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

  const s1 = NewTestingServer(Underscore.extend({ pair: ticKeyring }, options || {}));

  const tic = new TestUser('cat', ticKeyring, { server: s1 });
  const toc = new TestUser('tac', tocKeyring, { server: s1 });

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
  return new TestUser(uid, keyring, { server: defaultServer });
}

export const fakeSyncServer = async (currency: string, readBlocksMethod:any, readParticularBlockMethod:any, onPeersRequested:any) => {

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

  const fakeServer = await Network.createServersAndListen("Fake Duniter Server", new Server("", true, ConfDTO.mock()), [{
    ip: host,
    port: port
  }], NO_HTTP_LOGS, logger, NO_STATIC_PATH, (app:any, httpMethods:any) => {

    // Mock BMA method for sync mocking
    httpMethods.httpGET('/network/peering', async () => {
      return {
        currency,
        endpoints: [['BASIC_MERKLED_API', host, port].join(' ')]
      }
    }, noLimit);

    // Mock BMA method for sync mocking
    httpMethods.httpGET('/network/peers', onPeersRequested, noLimit);

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
export const simpleTestingServer = (conf:any) => NewTestingServer(conf)

export const NewTestingServer = (conf:any) => {
  const host = conf.host || HOST
  const port = conf.port || PORT++
  const commonConf = {
    nobma: false,
    bmaWithCrawler: true,
    port: port,
    ipv4: host,
    remoteipv4: host,
    currency: conf.currency || CURRENCY_NAME,
    httpLogs: true,
    forksize: conf.forksize !== undefined ? conf.forksize : 3,
    nonWoTPeersLimit: CommonConstants.DEFAULT_NON_WOT_PEERS_LIMIT,
    storage: {
      transaction: true,
      wotwizard: false,
      ...conf.storage
    }
  };
  if (conf.sigQty === undefined) {
    conf.sigQty = 1;
  }
  // Disable UPnP during tests
  if (!conf.ws2p) {
    conf.ws2p = { upnp: false }
  }
  const server = new Server(
    path.resolve(path.join(os.homedir(), '/.config/duniter/' + (conf.homename || 'dev_unit_tests'))),
    conf.memory !== undefined ? conf.memory : MEMORY_MODE,
    Underscore.extend(conf, commonConf));

  return new TestingServer(port, server)
}

export const serverWaitBlock = async (server:Server, number:number) => {
  await new Promise<void>((res) => {
    const interval = setInterval(async () => {
      const current = await server.dal.getCurrentBlockOrNull()
      if (current && current.number == number) {
        res()
        clearInterval(interval)
      }
    }, 1)
  })
}

export const waitToHaveBlock = async (server:Server, number:number) => {
  return serverWaitBlock(server, number)
}

export const waitForkResolution = async (server:Server, number:number) => {
  await new Promise<void>(res => {
    server.pipe(es.mapSync((e:any) => {
      if (e.bcEvent === 'switched' && e.block.number === number) {
        res()
      }
      return e
    }))

  })
}

export const waitForkWS2PConnection = async (server:Server, pubkey:string) => {
  await new Promise<void>(res => {
    server.pipe(es.mapSync((e:any) => {
      if (e.ws2p === 'connected' && e.to.pubkey === pubkey) {
        res()
      }
      return e
    }))

  })
}

export const waitForkWS2PDisconnection = async (server:Server, pubkey:string) => {
  await new Promise<void>((res) => {
    server.pipe(es.mapSync((e:any) => {
      if (e.ws2p === 'disconnected' && e.peer.pub === pubkey) {
        res()
      }
      return e
    }))

  })
}

export const waitForHeads = async (server:Server, nbHeads:number) => {
  return new Promise(res => {
    server.pipe(es.mapSync((e:any) => {
      if (e.ws2p === 'heads') {
        if (e.added.length === nbHeads) {
          res(e.added)
        }
      }
      return e
    }))
  })
}

export class TestingServer {

  private prover:Prover
  public permaProver:PermanentProver
  public bma:BmaApi

  constructor(
    private port:number,
    private server:Server) {

    ProverDependency.duniter.methods.hookServer(server)

    server.addEndpointsDefinitions(async () => {
      return require('../../../app/modules/bma').BmaDependency.duniter.methods.getMainEndpoint(server.conf)
    })
  }

  get _server() {
    return this.server
  }

  get BlockchainService(): BlockchainService {
    return this.server.BlockchainService
  }

  get PeeringService(): PeeringService {
    return this.server.PeeringService
  }

  get conf(): ConfDTO {
    return this.server.conf
  }

  get dal(): FileDAL {
    return this.server.dal
  }

  get logger() {
    return this.server.logger
  }

  get home() {
    return this.server.home
  }

  initWithDAL() {
    return this.server.initWithDAL()
  }

  revert(): Promise<DBBlock> {
    return this.server.revert()
  }

  async resolve(filterFunc?: (b: DBBlock) => boolean): Promise<BlockDTO> {
    const blocksResolved = await this.server.BlockchainService.blockResolution(filterFunc)
    if (!blocksResolved) {
      await new Promise(res => setTimeout(res, 200))
      throw Error(DataErrors[DataErrors.BLOCK_WASNT_COMMITTED])
    }
    console.log(BlockDTO.fromJSONObject(blocksResolved).getRawSigned())
    return blocksResolved
  }

  async resolveForError(): Promise<string|null> {
    const server = this.server
    const bcService = await server.BlockchainService
    let errorCatch: Promise<string> = new Promise(res => {
      server.pipe(es.mapSync((e:any) => {
        if (e.blockResolutionError) {
          res(e.blockResolutionError)
        }
      }))
    })
    await bcService.blockResolution()
    return Promise.race([
      errorCatch,
      new Promise<null>(res => setTimeout(() => res(null), 200))
    ])
  }

  getMindexExpiresOnIndexer(): LevelMIndexExpiresOnIndexer {
    return (this.server.dal.mindexDAL as any).indexForExpiresOn
  }

  async resolveFork(): Promise<BlockDTO|null> {
    return this.server.BlockchainService.forkResolution()
  }

  resetHome() {
    return this.server.resetHome()
  }

  on(event:string, f:any) {
    return this.server.on(event, f)
  }

  recomputeSelfPeer(): Promise<DBPeer | null> {
    return this.server.recomputeSelfPeer()
  }

  async writeBlock(obj:any) {
    return this.server.writeBlock(obj)
  }

  async writeRawBlock(raw:string) {
    return this.server.writeRawBlock(raw)
  }
  
  async writeIdentity(obj:any): Promise<DBIdentity> {
    return this.server.writeIdentity(obj)
  }
  
  async writeCertification(obj:any): Promise<CertificationDTO> {
    return this.server.writeCertification(obj)
  }
  
  async writeMembership(obj:any): Promise<MembershipDTO> {
    return this.server.writeMembership(obj)
  }
  
  async writeRevocation(obj:any) {
    return this.server.writeRevocation(obj)
  }
  
  async writeTransaction(obj:any): Promise<TransactionDTO> {
    return this.server.writeTransaction(obj)
  }
  
  async writePeer(obj:any) {
    return this.server.writePeer(obj)
  }

  async pullingEvent(type:string, number:number) {
    this.server.pullingEvent(type, number)
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
    return this.server.push(chunk, encoding as BufferEncoding)
  }

  pipe(writable:stream.Writable) {
    return this.server.pipe(writable)
  }

  async initDalBmaConnections() {
    await this.server.initWithDAL()
    const bmapi = await BmaDependency.duniter.methods.bma(this.server)
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
    return typeof expectations == 'function' ? expectAnswer(rp(this.url(uri), { json: true }), expectations) : expectJSON(rp(this.url(uri), { json: true }), expectations);
  }

  expectThat(uri:string, expectations:any) {
    return expectAnswer(rp(this.url(uri), { json: true }), expectations);
  }

  expectJSON(uri:string, expectations:any) {
    return expectJSON(rp(this.url(uri), { json: true }), expectations);
  }

  expectError(uri:string, code:number, message = '') {
    return expectError(code, message, rp(this.url(uri), { json: true }));
  }

  syncFrom(otherServer:Server, fromIncuded:number, toIncluded:number) {
    return sync(fromIncuded, toIncluded, otherServer, this.server);
  }

  until(type:string, count:number) {
    return until(this, type, count);
  }

  async justCommit(options:any = null) {
    const proven = await this.generateNext(options)
    await this.server.writeBlock(proven, false, true)
    return proven
  }

  async commit(options:ForcedBlockValues|null = null) {
    const proven = await this.generateNext(options)
    await this.server.writeBlock(proven, true, true) // The resolution is done manually
    const blocksResolved = await this.server.BlockchainService.blockResolution()
    if (!blocksResolved) {
      throw Error(DataErrors[DataErrors.BLOCK_WASNT_COMMITTED])
    }
    console.log(BlockDTO.fromJSONObject(blocksResolved).getRawSigned())
    return blocksResolved
  }

  async resolveExistingBlock(filterFunc: (b: DBBlock) => boolean) {
    const blocksResolved = await this.server.BlockchainService.blockResolution(filterFunc)
    if (!blocksResolved) {
      throw Error(DataErrors[DataErrors.BLOCK_WASNT_COMMITTED])
    }
    return blocksResolved
  }

  generateNext(options:any) {
    const server = this.server as any
    // Brings a priver to the server
    if (!server._utProver) {
      server._utProver = new BlockProver(server)
      server._utGenerator = ProverDependency.duniter.methods.blockGenerator(server, server._utProver)
    }
    return server._utGenerator.makeNextBlock(null, null, options)
  }

  async commitWaitError(options:any, expectedError:string) {
    const results = await Promise.all([
      new Promise<void>((res) => {
        this.server.pipe(es.mapSync((e:any) => {
          if (e.blockResolutionError === expectedError) {
            res()
          }
        }))
      }),
      (async () => {
        const proven = await this.generateNext(options)
        await this.server.writeBlock(proven, false)
      })()
    ])
    return results[1]
  }

  async commitExpectError(options:any) {
    try {
      await this.commit(options)
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

  waitToHaveBlock(number:number) {
    return waitToHaveBlock(this.server, number)
  }

  waitForHeads(nbHeads:number) {
    return waitForHeads(this.server, nbHeads)
  }

  waitForkResolution(number:number) {
    return waitForkResolution(this.server, number)
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
    const bmaAPI = await BmaDependency.duniter.methods.bma(this.server);
    await bmaAPI.openConnections();
    this.bma = bmaAPI;
    RouterDependency.duniter.methods.routeToNetwork(this.server)
    // Extra: for /wot/requirements URL
    require('../../../app/modules/prover').ProverDependency.duniter.methods.hookServer(this.server);
  }

  async disableBMA() {
    await this.bma.closeConnections()
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
    const server:Server = this.server
    if ((server as any)._utProver) {
      const farm = await (server as any)._utProver.getWorker()
      await farm.shutDownEngine()
    }
  }

  async enableWS2P(port: number = PORT++): Promise<TestWS2PAPI> {
    // Configure
    this._server.conf.ws2p = {
      host: HOST,
      port,
      remotehost: HOST,
      remoteport: port,
      upnp: false,
      uuid: '00000000',
      preferedOnly: false,
      privilegedOnly: false,
      privateAccess: true,
      publicAccess: true,
    }
    // Plug cluster
    const api = WS2PDependency.duniter.methods.bindWS2P(this._server)
    // Bind cluster
    await api.getCluster().listen(HOST, port)
    // Recompute the peer
    await this._server.recomputeSelfPeer()
    // Then, create testing facilities to connect to the node
    const doConnection = (pair: Key, ws2pId: string, constructor: new (
      currency:string,
      pair:Key,
      ws2pId:string,
    ) => WS2PPubkeyLocalAuth) => {
      const connection = WS2PConnection.newConnectionToAddress(1,
        `ws://${HOST}:${port}`,
        new WS2PServerMessageHandler(this._server, api.getCluster()),
        new constructor("", pair, ws2pId),
        new WS2PPubkeyRemoteAuth(this.conf.currency, pair)
      )
      return WS2PRequester.fromConnection(connection)
    }
    return {
      connect: (pair: Key, ws2pId: string) => {
        return doConnection(pair, ws2pId, WS2PPubkeyLocalAuth)
      },
      connectForSync: (pair: Key, ws2pId: string) => {
        return doConnection(pair, ws2pId, WS2PPubkeySyncLocalAuth)
      },
      host: HOST,
      port
    }
  }
}

export interface TestWS2PAPI {
  connect: (pair: Key, ws2pId: string) => WS2PRequester
  connectForSync: (pair: Key, ws2pId: string) => WS2PRequester
  host: string
  port: number
}

export async function newWS2PBidirectionnalConnection(currency:string, k1:Key, k2:Key, serverHandler:WS2PMessageHandler) {
  let i = 1
  let port = PORT++
  const wss = new WebSocketServer({ port })
  let s1:WS2PConnection
  let c1:WS2PConnection
  return await new Promise<{
    p1:WS2PConnection,
    p2:WS2PConnection,
    wss:any
  }>(resolveBefore => {
    wss.on('connection', async (ws:any) => {
      switch (i) {
        case 1:
          s1 = WS2PConnection.newConnectionFromWebSocketServer(ws, serverHandler, new WS2PPubkeyLocalAuth(currency, k1, ""), new WS2PPubkeyRemoteAuth(currency, k1), {
            connectionTimeout: 1000,
            requestTimeout: 1000
          });
          s1.connect().catch((e:any) => console.error('WS2P: newConnectionFromWebSocketServer connection error:', e))
          break;
      }
      resolveBefore({
        p1: s1,
        p2: c1,
        wss
      })
      i++
    })
    c1 = WS2PConnection.newConnectionToAddress(1, 'ws://localhost:' + port, new (class EmptyHandler implements WS2PMessageHandler {
      async handlePushMessage(json: any): Promise<void> {
      }
      async answerToRequest(json: any): Promise<WS2PResponse> {
        return {}
      }
    }), new WS2PPubkeyLocalAuth(currency, k2, ""), new WS2PPubkeyRemoteAuth(currency, k2))
  })
}

export const simpleWS2PNetwork: (s1: TestingServer, s2: TestingServer) => Promise<{ w1: WS2PConnection; ws2pc: WS2PClient; wss: WS2PServer, cluster1:WS2PCluster, cluster2:WS2PCluster }> = async (s1: TestingServer, s2: TestingServer) => {
  let port = getNewTestingPort()
  const clientPub = s2.conf.pair.pub
  let w1: WS2PConnection | null

  const cluster1 = WS2PCluster.plugOn(s1._server)
  const cluster2 = WS2PCluster.plugOn(s2._server)
  const ws2ps = await cluster1.listen('localhost', port)
  const connexionPromise = new Promise(res => {
    ws2ps.on('newConnection', res)
  })
  const ws2pc = await cluster2.connectToRemoteWS(1, 'localhost', port, '', new WS2PServerMessageHandler(s2._server, cluster2), s1._server.conf.pair.pub)

  await connexionPromise
  w1 = await ws2ps.getConnection(clientPub)
  if (!w1) {
    throw "Connection coming from " + clientPub + " was not found"
  }

  return {
    w1,
    ws2pc,
    wss: ws2ps,
    cluster1,
    cluster2
  }
}

export function simpleTestingConf(now = 1500000000, pair:{ pub:string, sec:string }): any {
  return {
    bmaWithCrawler: true,
    pair,
    nbCores: 1,
    udTime0: now,
    udReevalTime0: now,
    sigQty: 1,
    medianTimeBlocks: 1 // The medianTime always equals previous block's medianTime
  }
}

export function catUser(server: TestingServer) {
  return new TestUser('cat', {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'},
    {
      server
    })
}

export function tacUser(server: TestingServer) {
  return new TestUser('tac', {
    pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc',
    sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'},
    {
      server
    })
}

export function tocUser(server: TestingServer) {
  return new TestUser('toc', {
    pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
    sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'},
    {
      server
    })
}

export function ticUser(server: TestingServer) {
  return new TestUser('tic', {
    pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV',
    sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'},
    {
      server
    })
}
