import {
  getNewTestingPort,
  simpleTestingConf,
  simpleTestingServer,
  simpleUser,
  TestingServer,
  waitForkWS2PConnection
} from "./tools/toolbox"
import {WS2PCluster} from "../../app/modules/ws2p/lib/WS2PCluster"
import {WS2PConstants} from "../../app/modules/ws2p/lib/constants"
import { TestUser } from './tools/TestUser';

const assert = require('assert')

describe("WS2P cluster", function() {

  WS2PConstants.CONNEXION_TIMEOUT = 100
  WS2PConstants.REQUEST_TIMEOUT= 100

  const now = 1500000000
  let s1:TestingServer, s2:TestingServer, s3:TestingServer
  let cat:TestUser, tac:TestUser, toc:TestUser
  const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}
  const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}
  const tocKeyring = { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}

  let b0, b1, b2, portBMA1:number, portWS1:number, portWS2:number, portWS3:number

  before(async () => {
    const t1 = getTestingServer(catKeyring)
    const t2 = getTestingServer(tacKeyring)
    const t3 = getTestingServer(tocKeyring)
    s1 = t1.server
    s2 = t2.server
    s3 = t3.server
    portWS1 = t1.portWS
    portWS2 = t2.portWS
    portWS3 = t3.portWS
    portBMA1 = t1.portBMA
    cat = simpleUser('cat', catKeyring, s1)
    tac = simpleUser('tac', tacKeyring, s1)
    toc = simpleUser('toc', tocKeyring, s1)
    await s1.initDalBmaConnections()
    await s2.initDalBmaConnections()
    await s3.initDalBmaConnections()

    await cat.createIdentity();
    await tac.createIdentity();
    await toc.createIdentity();
    await cat.cert(tac);
    await tac.cert(toc);
    await toc.cert(cat);
    await cat.join();
    await tac.join();
    await toc.join();

    b0 = await s1.commit({ time: now })
    b1 = await s1.commit({ time: now })
    b2 = await s1.commit({ time: now })

    await s2.writeBlock(b0)
    await s2.writeBlock(b1)
    await s2.writeBlock(b2)
    await s3.writeBlock(b0)
    await s3.writeBlock(b1)
    await s3.writeBlock(b2)
    await s1.waitToHaveBlock(2)
    await s2.waitToHaveBlock(2)
    await s3.waitToHaveBlock(2)
    WS2PCluster.plugOn(s1._server)
    WS2PCluster.plugOn(s2._server)
    WS2PCluster.plugOn(s3._server)
    await (s1._server.ws2pCluster as WS2PCluster).listen('127.0.0.1', portWS1)
    await (s2._server.ws2pCluster as WS2PCluster).listen('127.0.0.1', portWS2)
    await (s3._server.ws2pCluster as WS2PCluster).listen('127.0.0.1', portWS3)
  })

  after(() => (s1._server.ws2pCluster as WS2PCluster).close())

  it('should have b#2 on s1, s2 and s3', async () => {
    const currentS1 = await s1.BlockchainService.current()
    const currentS2 = await s2.BlockchainService.current()
    const currentS3 = await s3.BlockchainService.current()
    assert.equal(currentS1.number, 2)
    assert.equal(currentS2.number, 2)
    assert.equal(currentS3.number, 2)
  })

  it('should be able to have a connected network on s2 start', async () => {
    const p1 = await s1.getPeer()
    assert.deepEqual(p1.endpoints, [
      'BASIC_MERKLED_API 127.0.0.1 ' + portBMA1,
      'WS2P 11111111 127.0.0.1 ' + portWS1
    ])
    await s2.writePeer(p1)
    WS2PCluster.plugOn(s2._server);
    await (s2._server.ws2pCluster as WS2PCluster).startCrawling(true)
    await s1.expect('/network/ws2p/info', (res:any) => {
      assert.equal(res.peers.level1, 0)
      assert.equal(res.peers.level2, 1)
    })
    await s2.expect('/network/ws2p/info', (res:any) => {
      assert.equal(res.peers.level1, 1)
      assert.equal(res.peers.level2, 0)
    })
  })

  it('should not start another connection if peer is already connected', async () => {
    await (s1._server.ws2pCluster as WS2PCluster).startCrawling(true)
    await s1.expect('/network/ws2p/info', (res:any) => {
      assert.equal(res.peers.level1, 0) // <- Does not increase!
      assert.equal(res.peers.level2, 1)
    })
    await s2.expect('/network/ws2p/info', (res:any) => {
      assert.equal(res.peers.level1, 1)
      assert.equal(res.peers.level2, 0) // <- Does not increase either!
    })
  })

  it('should be able to connect on s3 when s3 submits its peer document', async () => {
    const p3 = await s3.getPeer()
    await s2.writePeer(p3)
    await waitForkWS2PConnection(s2._server, 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')
    await waitForkWS2PConnection(s1._server, 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo')
    await s1.expect('/network/ws2p/info', (res:any) => {
      assert.equal(res.peers.level1, 1) // <- New connection to s3!
      assert.equal(res.peers.level2, 1)
    })
    await s2.expect('/network/ws2p/info', (res:any) => {
      assert.equal(res.peers.level1, 2) // <- New connection to s3!
      assert.equal(res.peers.level2, 0)
    })
    await s3.expect('/network/ws2p/info', (res:any) => {
      assert.equal(res.peers.level1, 0)
      assert.equal(res.peers.level2, 2) // <- New connections from s1 + s2!
    })
  })

  function getTestingServer(keyring:{ pub:string, sec:string }) {
    const conf1 = simpleTestingConf(now, keyring)
    const portBMA = getNewTestingPort()
    const portWS = getNewTestingPort()
    conf1.host = '127.0.0.1'
    conf1.port = portBMA
    // A server
    conf1.ws2p = {
      upnp: false,
      uuid: '11111111',
      host: '127.0.0.1',
      port: portWS,
      remotehost: '127.0.0.1',
      remoteport: portWS
    }
    const server = simpleTestingServer(conf1)
    server._server.addEndpointsDefinitions(async () => 'WS2P 11111111 127.0.0.1 ' + portWS)
    return { server, portWS, portBMA }
  }
})
