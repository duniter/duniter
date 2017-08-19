import * as stream from "stream"
import {Server} from "../../../../server"
import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {DuniterService} from "../../../../index"
import {PeerDTO} from "../../../lib/dto/PeerDTO"
import {AbstractDAO} from "./pulling"
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {DBBlock} from "../../../lib/db/DBBlock"
import {tx_cleaner} from "./tx_cleaner"
import {connect} from "./connect"
import {CrawlerConstants} from "./constants"
import {pullSandboxToLocalServer} from "./sandbox"
import {cleanLongDownPeers} from "./garbager"

const _ = require('underscore');
const async = require('async');
const querablep = require('querablep');

/**
 * Service which triggers the server's peering generation (actualization of the Peer document).
 * @constructor
 */
export class Crawler extends stream.Transform implements DuniterService {

  peerCrawler:PeerCrawler
  peerTester:PeerTester
  blockCrawler:BlockCrawler
  sandboxCrawler:SandboxCrawler

  constructor(
    private server:Server,
    private conf:ConfDTO,
    private logger:any) {
    super({ objectMode: true })

    this.peerCrawler = new PeerCrawler(server, conf, logger)
    this.peerTester = new PeerTester(server, conf, logger)
    this.blockCrawler = new BlockCrawler(server, logger, this)
    this.sandboxCrawler = new SandboxCrawler(server, conf, logger)
  }

  pullBlocks(server:Server, pubkey:string) {
    return this.blockCrawler.pullBlocks(server, pubkey)
  }

  sandboxPull(server:Server) {
    return this.sandboxCrawler.sandboxPull(server)
  }

  startService() {
    return Promise.all([
      this.peerCrawler.startService(),
      this.peerTester.startService(),
      this.blockCrawler.startService(),
      this.sandboxCrawler.startService()
    ])
  }

  stopService() {
    return Promise.all([
      this.peerCrawler.stopService(),
      this.peerTester.stopService(),
      this.blockCrawler.stopService(),
      this.sandboxCrawler.stopService()
    ])
  }

  // Unused
  _write(str:string, enc:any, done:any) {
    done && done();
  };
}

export class PeerCrawler implements DuniterService {

  private DONT_IF_MORE_THAN_FOUR_PEERS = true;
  private crawlPeersInterval:NodeJS.Timer
  private crawlPeersFifo = async.queue((task:any, callback:any) => task(callback), 1);

  constructor(
    private server:Server,
    private conf:ConfDTO,
    private logger:any) {}

  async startService() {
    if (this.crawlPeersInterval)
      clearInterval(this.crawlPeersInterval);
    this.crawlPeersInterval = setInterval(()  => this.crawlPeersFifo.push((cb:any) => this.crawlPeers(this.server, this.conf).then(cb).catch(cb)), 1000 * this.conf.avgGenTime * CrawlerConstants.SYNC_PEERS_INTERVAL);
    await this.crawlPeers(this.server, this.conf, this.DONT_IF_MORE_THAN_FOUR_PEERS);
  }

  async stopService() {
    this.crawlPeersFifo.kill();
    clearInterval(this.crawlPeersInterval);
  }

  private async crawlPeers(server:Server, conf:ConfDTO, dontCrawlIfEnoughPeers = false) {
    this.logger.info('Crawling the network...');
    const peers = await server.dal.listAllPeersWithStatusNewUPWithtout(conf.pair.pub);
    if (peers.length > CrawlerConstants.COUNT_FOR_ENOUGH_PEERS && dontCrawlIfEnoughPeers == this.DONT_IF_MORE_THAN_FOUR_PEERS) {
      return;
    }
    let peersToTest = peers.slice().map((p:PeerDTO) => PeerDTO.fromJSONObject(p));
    let tested:string[] = [];
    const found = [];
    while (peersToTest.length > 0) {
      const results = await Promise.all(peersToTest.map((p:PeerDTO) => this.crawlPeer(server, p)))
      tested = tested.concat(peersToTest.map((p:PeerDTO) => p.pubkey));
      // End loop condition
      peersToTest.splice(0);
      // Eventually continue the loop
      for (let i = 0, len = results.length; i < len; i++) {
        const res:any = results[i];
        for (let j = 0, len2 = res.length; j < len2; j++) {
          try {
            const subpeer = res[j].leaf.value;
            if (subpeer.currency && tested.indexOf(subpeer.pubkey) === -1) {
              const p = PeerDTO.fromJSONObject(subpeer);
              peersToTest.push(p);
              found.push(p);
            }
          } catch (e) {
            this.logger.warn('Invalid peer %s', res[j]);
          }
        }
      }
      // Make unique list
      peersToTest = _.uniq(peersToTest, false, (p:PeerDTO) => p.pubkey);
    }
    this.logger.info('Crawling done.');
    for (let i = 0, len = found.length; i < len; i++) {
      let p = found[i];
      try {
        // Try to write it
        await server.writePeer(p)
      } catch(e) {
        // Silent error
      }
    }
    await cleanLongDownPeers(server, Date.now());
  }

  private async crawlPeer(server:Server, aPeer:PeerDTO) {
    let subpeers:any[] = [];
    try {
      this.logger.debug('Crawling peers of %s %s', aPeer.pubkey.substr(0, 6), aPeer.getNamedURL());
      const node = await connect(aPeer);
      await checkPeerValidity(server, aPeer, node);
      const json = await node.getPeers.bind(node)({ leaves: true });
      for (let i = 0, len = json.leaves.length; i < len; i++) {
        let leaf = json.leaves[i];
        let subpeer = await node.getPeers.bind(node)({ leaf: leaf });
        subpeers.push(subpeer);
      }
      return subpeers;
    } catch (e) {
      return subpeers;
    }
  }
}

export class SandboxCrawler implements DuniterService {

  private pullInterval:NodeJS.Timer
  private pullFifo = async.queue((task:any, callback:any) => task(callback), 1);

  constructor(
    private server:Server,
    private conf:ConfDTO,
    private logger:any) {}

  async startService() {
    if (this.pullInterval)
      clearInterval(this.pullInterval);
    this.pullInterval = setInterval(()  => this.pullFifo.push((cb:any) => this.sandboxPull(this.server).then(cb).catch(cb)), 1000 * this.conf.avgGenTime * CrawlerConstants.SANDBOX_CHECK_INTERVAL);
    setTimeout(() => {
      this.pullFifo.push((cb:any) => this.sandboxPull(this.server).then(cb).catch(cb))
    }, CrawlerConstants.SANDBOX_FIRST_PULL_DELAY)
  }

  async stopService() {
    this.pullFifo.kill();
    clearInterval(this.pullInterval);
  }

  async sandboxPull(server:Server) {
    this.logger && this.logger.info('Sandbox pulling started...');
      const peers = await server.dal.getRandomlyUPsWithout([this.conf.pair.pub])
      const randoms = chooseXin(peers, CrawlerConstants.SANDBOX_PEERS_COUNT)
      let peersToTest = randoms.slice().map((p) => PeerDTO.fromJSONObject(p));
      for (const peer of peersToTest) {
        const fromHost = await connect(peer)
        await pullSandboxToLocalServer(server.conf.currency, fromHost, server, this.logger)
      }
      this.logger && this.logger.info('Sandbox pulling done.');
  }
}

export class PeerTester implements DuniterService {

  private FIRST_CALL = true
  private testPeerFifo = async.queue((task:any, callback:any) => task(callback), 1);
  private testPeerFifoInterval:NodeJS.Timer

  constructor(
    private server:Server,
    private conf:ConfDTO,
    private logger:any) {}

  async startService() {
    if (this.testPeerFifoInterval)
      clearInterval(this.testPeerFifoInterval);
    this.testPeerFifoInterval = setInterval(() => this.testPeerFifo.push((cb:any) => this.testPeers.bind(this, this.server, this.conf, !this.FIRST_CALL)().then(cb).catch(cb)), 1000 * CrawlerConstants.TEST_PEERS_INTERVAL);
    await this.testPeers(this.server, this.conf, this.FIRST_CALL);
  }

  async stopService() {
    clearInterval(this.testPeerFifoInterval);
    this.testPeerFifo.kill();
  }

  private async testPeers(server:Server, conf:ConfDTO, displayDelays:boolean) {
    let peers = await server.dal.listAllPeers();
    let now = (new Date().getTime());
    peers = _.filter(peers, (p:any) => p.pubkey != conf.pair.pub);
    await Promise.all(peers.map(async (thePeer:any) => {
      let p = PeerDTO.fromJSONObject(thePeer);
      if (thePeer.status == 'DOWN') {
        let shouldDisplayDelays = displayDelays;
        let downAt = thePeer.first_down || now;
        let waitRemaining = this.getWaitRemaining(now, downAt, thePeer.last_try);
        let nextWaitRemaining = this.getWaitRemaining(now, downAt, now);
        let testIt = waitRemaining <= 0;
        if (testIt) {
          // We try to reconnect only with peers marked as DOWN
          try {
            this.logger.trace('Checking if node %s is UP... (%s:%s) ', p.pubkey.substr(0, 6), p.getHostPreferDNS(), p.getPort());
            // We register the try anyway
            await server.dal.setPeerDown(p.pubkey);
            // Now we test
            let node = await connect(p);
            let peering = await node.getPeer();
            await checkPeerValidity(server, p, node);
            // The node answered, it is no more DOWN!
            this.logger.info('Node %s (%s:%s) is UP!', p.pubkey.substr(0, 6), p.getHostPreferDNS(), p.getPort());
            await server.dal.setPeerUP(p.pubkey);
            // We try to forward its peering entry
            let sp1 = peering.block.split('-');
            let currentBlockNumber = sp1[0];
            let currentBlockHash = sp1[1];
            let sp2 = peering.block.split('-');
            let blockNumber = sp2[0];
            let blockHash = sp2[1];
            if (!(currentBlockNumber == blockNumber && currentBlockHash == blockHash)) {
              // The peering changed
              await server.PeeringService.submitP(peering);
            }
            // Do not need to display when next check will occur: the node is now UP
            shouldDisplayDelays = false;
          } catch (err) {
            if (!err) {
              err = "NO_REASON"
            }
            // Error: we set the peer as DOWN
            this.logger.trace("Peer %s is DOWN (%s)", p.pubkey, (err.httpCode && 'HTTP ' + err.httpCode) || err.code || err.message || err);
            await server.dal.setPeerDown(p.pubkey);
            shouldDisplayDelays = true;
          }
        }
        if (shouldDisplayDelays) {
          this.logger.debug('Will check that node %s (%s:%s) is UP in %s min...', p.pubkey.substr(0, 6), p.getHostPreferDNS(), p.getPort(), (nextWaitRemaining / 60).toFixed(0));
        }
      }
    }))
  }

  private getWaitRemaining(now:number, downAt:number, last_try:number) {
    let downDelay = Math.floor((now - downAt) / 1000);
    let waitedSinceLastTest = Math.floor((now - (last_try || now)) / 1000);
    let waitRemaining = 1;
    if (downDelay <= CrawlerConstants.DURATIONS.A_MINUTE) {
      waitRemaining = CrawlerConstants.DURATIONS.TEN_SECONDS - waitedSinceLastTest;
    }
    else if (downDelay <= CrawlerConstants.DURATIONS.TEN_MINUTES) {
      waitRemaining = CrawlerConstants.DURATIONS.A_MINUTE - waitedSinceLastTest;
    }
    else if (downDelay <= CrawlerConstants.DURATIONS.AN_HOUR) {
      waitRemaining = CrawlerConstants.DURATIONS.TEN_MINUTES - waitedSinceLastTest;
    }
    else if (downDelay <= CrawlerConstants.DURATIONS.A_DAY) {
      waitRemaining = CrawlerConstants.DURATIONS.AN_HOUR - waitedSinceLastTest;
    }
    else if (downDelay <= CrawlerConstants.DURATIONS.A_WEEK) {
      waitRemaining = CrawlerConstants.DURATIONS.A_DAY - waitedSinceLastTest;
    }
    else if (downDelay <= CrawlerConstants.DURATIONS.A_MONTH) {
      waitRemaining = CrawlerConstants.DURATIONS.A_WEEK - waitedSinceLastTest;
    }
    // Else do not check it, DOWN for too long
    return waitRemaining;
  }
}

export class BlockCrawler {

  private CONST_BLOCKS_CHUNK = 50
  private pullingActualIntervalDuration = CrawlerConstants.PULLING_MINIMAL_DELAY
  private programStart = Date.now()
  private syncBlockFifo = async.queue((task:any, callback:any) => task(callback), 1)
  private syncBlockInterval:NodeJS.Timer

  constructor(
    private server:Server,
    private logger:any,
    private PROCESS:stream.Transform) {
  }

  async startService() {
    if (this.syncBlockInterval)
      clearInterval(this.syncBlockInterval);
    this.syncBlockInterval = setInterval(() => this.syncBlockFifo.push((cb:any) => this.syncBlock(this.server).then(cb).catch(cb)), 1000 * this.pullingActualIntervalDuration);
    this.syncBlock(this.server);
  }

  async stopService() {
    clearInterval(this.syncBlockInterval);
    this.syncBlockFifo.kill();
  }

  pullBlocks(server:Server, pubkey:string) {
    return this.syncBlock(server, pubkey)
  }

  private async syncBlock(server:Server, pubkey:string = "") {
    // Eventually change the interval duration
    const minutesElapsed = Math.ceil((Date.now() - this.programStart) / (60 * 1000));
    const FACTOR = Math.sin((minutesElapsed / CrawlerConstants.PULLING_INTERVAL_TARGET) * (Math.PI / 2));
    // Make the interval always higher than before
    const pullingTheoreticalIntervalNow = Math.max(Math.max(FACTOR * CrawlerConstants.PULLING_INTERVAL_TARGET, CrawlerConstants.PULLING_MINIMAL_DELAY), this.pullingActualIntervalDuration);
    if (pullingTheoreticalIntervalNow !== this.pullingActualIntervalDuration) {
      this.pullingActualIntervalDuration = pullingTheoreticalIntervalNow;
      // Change the interval
      if (this.syncBlockInterval)
        clearInterval(this.syncBlockInterval);
      this.syncBlockInterval = setInterval(()  => this.syncBlockFifo.push((cb:any) => this.syncBlock(server).then(cb).catch(cb)), 1000 * this.pullingActualIntervalDuration);
    }

    try {
      let current = await server.dal.getCurrentBlockOrNull();
      if (current) {
        this.pullingEvent(server, 'start', current.number);
        this.logger && this.logger.info("Pulling blocks from the network...");
        let peers = await server.dal.findAllPeersNEWUPBut([server.conf.pair.pub]);
        peers = _.shuffle(peers);
        if (pubkey) {
          _(peers).filter((p:any) => p.pubkey == pubkey);
        }
        // Shuffle the peers
        peers = _.shuffle(peers);
        // Only take at max X of them
        peers = peers.slice(0, CrawlerConstants.MAX_NUMBER_OF_PEERS_FOR_PULLING);
        await Promise.all(peers.map(async (thePeer:any, i:number) => {
          let p = PeerDTO.fromJSONObject(thePeer);
          this.pullingEvent(server, 'peer', _.extend({number: i, length: peers.length}, p));
          this.logger && this.logger.trace("Try with %s %s", p.getURL(), p.pubkey.substr(0, 6));
          try {
            let node:any = await connect(p);
            let nodeCurrent:BlockDTO|null = null
            node.pubkey = p.pubkey;
            await checkPeerValidity(server, p, node);

            let dao = new (class extends AbstractDAO {

              private lastDownloaded:BlockDTO|null

              constructor(private crawler:BlockCrawler) {
                super()
              }

              async localCurrent(): Promise<DBBlock | null> {
                return server.dal.getCurrentBlockOrNull()
              }
              async remoteCurrent(source?: any): Promise<BlockDTO | null> {
                nodeCurrent = await source.getCurrent()
                return nodeCurrent
              }
              async remotePeers(source?: any): Promise<PeerDTO[]> {
                return Promise.resolve([node])
              }
              async getLocalBlock(number: number): Promise<DBBlock> {
                return server.dal.getBlock(number)
              }
              async getRemoteBlock(thePeer: any, number: number): Promise<BlockDTO> {
                let block = null;
                try {
                  block = await thePeer.getBlock(number);
                  tx_cleaner(block.transactions);
                } catch (e) {
                  if (e.httpCode != 404) {
                    throw e;
                  }
                }
                return block;
              }
              async applyMainBranch(block: BlockDTO): Promise<boolean> {
                const existing = await server.dal.getAbsoluteBlockByNumberAndHash(block.number, block.hash)
                if (!existing) {
                  let addedBlock = await server.writeBlock(block, false, true)
                  if (!this.lastDownloaded) {
                    this.lastDownloaded = await dao.remoteCurrent(node);
                  }
                  this.crawler.pullingEvent(server, 'applying', {number: block.number, last: this.lastDownloaded && this.lastDownloaded.number});
                  if (addedBlock) {
                    current = addedBlock;
                    // Emit block events (for sharing with the network) only in forkWindowSize
                    if (nodeCurrent && nodeCurrent.number - addedBlock.number < server.conf.forksize) {
                      server.streamPush(addedBlock);
                    }
                  }
                }
                return true
              }
              async removeForks(): Promise<boolean> {
                return true
              }
              async isMemberPeer(thePeer: PeerDTO): Promise<boolean> {
                return true
              }
              async downloadBlocks(thePeer: any, fromNumber: number, count?: number | undefined): Promise<BlockDTO[]> {
                if (!count) {
                  count = this.crawler.CONST_BLOCKS_CHUNK;
                }
                let blocks = await thePeer.getBlocks(count, fromNumber);
                // Fix for #734
                for (const block of blocks) {
                  for (const tx of block.transactions) {
                    tx.version = CrawlerConstants.TRANSACTION_VERSION;
                  }
                }
                return blocks;
              }
            })(this)
            await dao.pull(server.conf, server.logger)
          } catch (e) {
            if (this.isConnectionError(e)) {
              this.logger && this.logger.info("Peer %s unreachable: now considered as DOWN.", p.pubkey);
              await server.dal.setPeerDown(p.pubkey);
            }
            else if (e.httpCode == 404) {
              this.logger && this.logger.trace("No new block from %s %s", p.pubkey.substr(0, 6), p.getURL());
            }
            else {
              this.logger && this.logger.warn(e);
            }
          }
        }))

        await this.server.BlockchainService.pushFIFO("crawlerResolution", async () => {
          await server.BlockchainService.blockResolution()
          await server.BlockchainService.forkResolution()
        })

        this.pullingEvent(server, 'end', current.number);
      }
      this.logger && this.logger.info('Will pull blocks from the network in %s min %s sec', Math.floor(this.pullingActualIntervalDuration / 60), Math.floor(this.pullingActualIntervalDuration % 60));
    } catch(err) {
      this.pullingEvent(server, 'error');
      this.logger && this.logger.warn(err.code || err.stack || err.message || err);
    }
  }

  private pullingEvent(server:Server, type:string, number:any = null) {
    server.push({
      pulling: {
        type: type,
        data: number
      }
    });
    if (type !== 'end') {
      this.PROCESS.push({ pulling: 'processing' });
    } else {
      this.PROCESS.push({ pulling: 'finished' });
    }
  }

  private isConnectionError(err:any) {
    return err && (
      err.code == "E_DUNITER_PEER_CHANGED"
      || err.code == "EINVAL"
      || err.code == "ECONNREFUSED"
      || err.code == "ETIMEDOUT"
      || (err.httpCode !== undefined && err.httpCode !== 404));
  }
}

function chooseXin (peers:PeerDTO[], max:number) {
  const chosen = [];
  const nbPeers = peers.length;
  for (let i = 0; i < Math.min(nbPeers, max); i++) {
    const randIndex = Math.max(Math.floor(Math.random() * 10) - (10 - nbPeers) - i, 0);
    chosen.push(peers[randIndex]);
    peers.splice(randIndex, 1);
  }
  return chosen;
}

const checkPeerValidity = async (server:Server, p:PeerDTO, node:any) => {
  try {
    let document = await node.getPeer();
    let thePeer = PeerDTO.fromJSONObject(document);
    let goodSignature = server.PeeringService.checkPeerSignature(thePeer);
    if (!goodSignature) {
      throw 'Signature from a peer must match';
    }
    if (p.currency !== thePeer.currency) {
      throw 'Currency has changed from ' + p.currency + ' to ' + thePeer.currency;
    }
    if (p.pubkey !== thePeer.pubkey) {
      throw 'Public key of the peer has changed from ' + p.pubkey + ' to ' + thePeer.pubkey;
    }
    let sp1 = p.block.split('-');
    let sp2 = thePeer.block.split('-');
    let blockNumber1 = parseInt(sp1[0]);
    let blockNumber2 = parseInt(sp2[0]);
    if (blockNumber2 < blockNumber1) {
      throw 'Signature date has changed from block ' + blockNumber1 + ' to older block ' + blockNumber2;
    }
  } catch (e) {
    throw { code: "E_DUNITER_PEER_CHANGED" };
  }
}
