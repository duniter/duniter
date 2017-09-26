import {getNewTestingPort, simpleTestingConf, simpleTestingServer, simpleUser, TestingServer} from "./tools/toolbox"
import {WS2PCluster} from "../../app/modules/ws2p/lib/WS2PCluster"
import {WS2PConstants} from "../../app/modules/ws2p/lib/constants"

const assert = require('assert')
const should = require('should')

describe("WS2P heads propagation", function() {

  WS2PConstants.CONNEXION_TIMEOUT = 100
  WS2PConstants.REQUEST_TIMEOUT= 100

  const now = 1500000000
  let s1:TestingServer, s2:TestingServer
  let cluster1:WS2PCluster, cluster2:WS2PCluster
  let cat:any, tac:any
  const catKeyring = { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}
  const tacKeyring = { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}

  let b0, b1, b2, b3:any, b4:any, portBMA1:number, portWS1:number, portWS2:number

  before(async () => {
    const t1 = getTestingServer(catKeyring)
    const t2 = getTestingServer(tacKeyring)
    s1 = t1.server
    s2 = t2.server
    portWS1 = t1.portWS
    portWS2 = t2.portWS
    portBMA1 = t1.portBMA
    cat = simpleUser('cat', catKeyring, s1)
    tac = simpleUser('tac', tacKeyring, s1)
    await s1.initDalBmaConnections()
    await s2.initDalBmaConnections()

    await cat.createIdentity();
    await tac.createIdentity();
    await cat.cert(tac);
    await tac.cert(cat);
    await cat.join();
    await tac.join();

    b0 = await s1.commit({ time: now })
    b1 = await s1.commit({ time: now })
    b2 = await s1.commit({ time: now })

    await s2.writeBlock(b0)
    await s2.writeBlock(b1)
    await s2.writeBlock(b2)
    await s1.waitToHaveBlock(2)
    await s2.waitToHaveBlock(2)
    cluster1 = WS2PCluster.plugOn(s1._server)
    cluster2 = WS2PCluster.plugOn(s2._server)
    await (s1._server.ws2pCluster as WS2PCluster).listen('127.0.0.1', portWS1)
    await (s2._server.ws2pCluster as WS2PCluster).listen('127.0.0.1', portWS2)
  })

  after(() => (s1._server.ws2pCluster as WS2PCluster).close())

  it('should have b#2 on s1, s2 and s3', async () => {
    const currentS1 = await s1.BlockchainService.current()
    const currentS2 = await s2.BlockchainService.current()
    assert.equal(currentS1.number, 2)
    assert.equal(currentS2.number, 2)
  })

  it('should be able to have a connected network on s2 start', async () => {
    const p1 = await s1.getPeer()
    assert.deepEqual(p1.endpoints, [
      'BASIC_MERKLED_API 127.0.0.1 ' + portBMA1,
      'WS2P 11111111 127.0.0.1 ' + portWS1
    ])
    await s2.writePeer(p1)
    await (s1._server.ws2pCluster as WS2PCluster).startCrawling(true)
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

  it('should be able to connect to s3 if the we increase size limit', async () => {
    b3 = s1.commit({ time: now })
    await s2.waitToHaveBlock(3)
    await s2.waitForHeads(1)
    await s1.expect('/network/ws2p/info', (res:any) => {
      assert.equal(res.peers.level1, 0)
      assert.equal(res.peers.level2, 1)
    })
    await s2.expect('/network/ws2p/info', (res:any) => {
      assert.equal(res.peers.level1, 1)
      assert.equal(res.peers.level2, 0)
    })
    await s2.expect('/network/ws2p/heads', (res:any) => {
      res.heads.length.should.be.greaterThan(1)
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
      remoteport: portWS,
      privilegedNodes: []
    }
    const server = simpleTestingServer(conf1)
    server._server.addEndpointsDefinitions(async () => 'WS2P 11111111 127.0.0.1 ' + portWS)
    return { server, portWS, portBMA }
  }
})
