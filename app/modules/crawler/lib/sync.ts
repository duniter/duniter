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

import {CrawlerConstants} from "./constants"
import * as stream from "stream"
import {Server} from "../../../../server"
import {PeerDTO} from "../../../lib/dto/PeerDTO"
import {FileDAL} from "../../../lib/dal/fileDAL"
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {connect} from "./connect"
import {Contacter} from "./contacter"
import {pullSandboxToLocalServer} from "./sandbox"
import {tx_cleaner} from "./tx_cleaner"
import {AbstractDAO} from "./pulling"
import {DBBlock} from "../../../lib/db/DBBlock"
import {BlockchainService} from "../../../service/BlockchainService"
import {rawer} from "../../../lib/common-libs/index"
import {dos2unix} from "../../../lib/common-libs/dos2unix"
import {hashf} from "../../../lib/common"
import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {PeeringService} from "../../../service/PeeringService"

const util         = require('util');
const _            = require('underscore');
const moment       = require('moment');
const multimeter   = require('multimeter');
const makeQuerablePromise = require('querablep');

const CONST_BLOCKS_CHUNK = 250;
const EVAL_REMAINING_INTERVAL = 1000;
const INITIAL_DOWNLOAD_SLOTS = 1;

export class Synchroniser extends stream.Duplex {

  private watcher:Watcher
  private speed = 0
  private blocksApplied = 0
  private contacterOptions:any

  constructor(
    private server:Server,
    private host:string,
    private port:number,
    interactive = false,
    private slowOption = false) {

    super({ objectMode: true })

    // Wrapper to also push event stream
    this.watcher = new EventWatcher(
      interactive ? new MultimeterWatcher() : new LoggerWatcher(this.logger),
      (pct:number, innerWatcher:Watcher) => {
        if (pct !== undefined && innerWatcher.downloadPercent() < pct) {
          this.push({ download: pct });
        }
      },
      (pct:number, innerWatcher:Watcher) => {
        if (pct !== undefined && innerWatcher.appliedPercent() < pct) {
          this.push({ applied: pct });
        }
      }
    )

    if (interactive) {
      this.logger.mute();
    }

    this.contacterOptions = {
      timeout: CrawlerConstants.SYNC_LONG_TIMEOUT
    }
  }

  get conf(): ConfDTO {
    return this.server.conf
  }

  get logger() {
    return this.server.logger
  }

  get PeeringService(): PeeringService {
    return this.server.PeeringService
  }

  get BlockchainService() {
    return this.server.BlockchainService
  }

  get dal() {
    return this.server.dal
  }

  // Unused, but made mandatory by Duplex interface
  _read() {}
  _write() {}


  private async logRemaining(to:number) {
    const lCurrent = await this.dal.getCurrentBlockOrNull();
    const localNumber = lCurrent ? lCurrent.number : -1;

    if (to > 1 && this.speed > 0) {
      const remain = (to - (localNumber + 1 + this.blocksApplied));
      const secondsLeft = remain / this.speed;
      const momDuration = moment.duration(secondsLeft * 1000);
      this.watcher.writeStatus('Remaining ' + momDuration.humanize() + '');
    }
  }

  async test() {
    const peering = await Contacter.fetchPeer(this.host, this.port, this.contacterOptions);
    const node = await connect(PeerDTO.fromJSONObject(peering));
    return node.getCurrent();
  }

  async sync(to:number, chunkLen:number, askedCautious = false, nopeers = false, noShufflePeers = false) {

    try {

      const peering = await Contacter.fetchPeer(this.host, this.port, this.contacterOptions);

      let peer = PeerDTO.fromJSONObject(peering);
      this.logger.info("Try with %s %s", peer.getURL(), peer.pubkey.substr(0, 6));
      let node:any = await connect(peer);
      node.pubkey = peer.pubkey;
      this.logger.info('Sync started.');

      const fullSync = !to;

      //============
      // Blockchain headers
      //============
      this.logger.info('Getting remote blockchain info...');
      this.watcher.writeStatus('Connecting to ' + this.host + '...');
      const lCurrent:DBBlock = await this.dal.getCurrentBlockOrNull();
      const localNumber = lCurrent ? lCurrent.number : -1;
      let rCurrent:BlockDTO
      if (isNaN(to)) {
        rCurrent = await node.getCurrent();
      } else {
        rCurrent = await node.getBlock(to);
      }
      to = rCurrent.number || 0

      //=======
      // Peers (just for P2P download)
      //=======
      let peers:PeerDTO[] = [];
      if (!nopeers && (to - localNumber > 1000)) { // P2P download if more than 1000 blocs
        this.watcher.writeStatus('Peers...');
        const merkle = await this.dal.merkleForPeers();
        const getPeers = node.getPeers.bind(node);
        const json2 = await getPeers({});
        const rm = new NodesMerkle(json2);
        if(rm.root() != merkle.root()){
          const leavesToAdd:string[] = [];
          const json = await getPeers({ leaves: true });
          _(json.leaves).forEach((leaf:string) => {
            if(merkle.leaves().indexOf(leaf) == -1){
              leavesToAdd.push(leaf);
            }
          });
          peers = await Promise.all(leavesToAdd.map(async (leaf) => {
            try {
              const json3 = await getPeers({ "leaf": leaf });
              const jsonEntry = json3.leaf.value;
              const endpoint = jsonEntry.endpoints[0];
              this.watcher.writeStatus('Peer ' + endpoint);
              return jsonEntry;
            } catch (e) {
              this.logger.warn("Could not get peer of leaf %s, continue...", leaf);
              return null;
            }
          }))
        }
        else {
          this.watcher.writeStatus('Peers already known');
        }
      }

      if (!peers.length) {
        peers.push(peer);
      }
      peers = peers.filter((p) => p);

      //============
      // Blockchain
      //============
      this.logger.info('Downloading Blockchain...');

      // We use cautious mode if it is asked, or not particulary asked but blockchain has been started
      const cautious = (askedCautious === true || localNumber >= 0);
      const shuffledPeers = noShufflePeers ? peers : _.shuffle(peers);
      const downloader = new P2PDownloader(rCurrent.currency, localNumber, to, rCurrent.hash, shuffledPeers, this.watcher, this.logger, hashf, this.dal, this.slowOption);

      downloader.start();

      let lastPullBlock:BlockDTO|null = null;

      let dao = new (class extends AbstractDAO {

        constructor(
          private server:Server,
          private watcher:Watcher,
          private dal:FileDAL,
          private BlockchainService:BlockchainService) {
            super()
        }

        async applyBranch(blocks:BlockDTO[]) {
          blocks = _.filter(blocks, (b:BlockDTO) => b.number <= to);
          if (cautious) {
            for (const block of blocks) {
              if (block.number == 0) {
                await this.BlockchainService.saveParametersForRootBlock(block);
              }
              await dao.applyMainBranch(block);
            }
          } else {
            await this.BlockchainService.fastBlockInsertions(blocks, to)
          }
          lastPullBlock = blocks[blocks.length - 1];
          this.watcher.appliedPercent(Math.floor(blocks[blocks.length - 1].number / to * 100));
          return true;
        }

        // Get the local blockchain current block
        async localCurrent(): Promise<DBBlock | null> {
          if (cautious) {
            return await this.dal.getCurrentBlockOrNull();
          } else {
            if (lCurrent && !lastPullBlock) {
              lastPullBlock = lCurrent.toBlockDTO()
            } else if (!lastPullBlock) {
              return null
            }
            return DBBlock.fromBlockDTO(lastPullBlock)
          }
        }
        // Get the remote blockchain (bc) current block
        async remoteCurrent(source?: any): Promise<BlockDTO | null> {
          return Promise.resolve(rCurrent)
        }
        // Get the remote peers to be pulled
        async remotePeers(source?: any): Promise<PeerDTO[]> {
          return [node]
        }
        async getLocalBlock(number: number): Promise<DBBlock> {
          return this.dal.getBlock(number)
        }
        async getRemoteBlock(thePeer: PeerDTO, number: number): Promise<BlockDTO> {
          let block = null;
          try {
            block = await node.getBlock(number);
            tx_cleaner(block.transactions);
          } catch (e) {
            if (e.httpCode != 404) {
              throw e;
            }
          }
          return block;
        }
        async applyMainBranch(block: BlockDTO): Promise<boolean> {
          const addedBlock = await this.BlockchainService.submitBlock(block, true)
          await this.BlockchainService.blockResolution()
          this.server.streamPush(addedBlock);
          this.watcher.appliedPercent(Math.floor(block.number / to * 100));
          return true
        }
        // Eventually remove forks later on
        async removeForks(): Promise<boolean> {
          return true
        }
        // Tells wether given peer is a member peer
        async isMemberPeer(thePeer: PeerDTO): Promise<boolean> {
          let idty = await this.dal.getWrittenIdtyByPubkeyForIsMember(thePeer.pubkey);
          return (idty && idty.member) || false;
        }
        downloadBlocks(thePeer: PeerDTO, fromNumber: number, count?: number | undefined): Promise<BlockDTO[]> {
          // Note: we don't care about the particular peer asked by the method. We use the network instead.
          const numberOffseted = fromNumber - (localNumber + 1);
          const targetChunk = Math.floor(numberOffseted / CONST_BLOCKS_CHUNK);
          // Return the download promise! Simple.
          return downloader.getChunk(targetChunk);
        }

      })(this.server, this.watcher, this.dal, this.BlockchainService)

      const logInterval = setInterval(() => this.logRemaining(to), EVAL_REMAINING_INTERVAL);
      await dao.pull(this.conf, this.logger)

      // Finished blocks
      this.watcher.downloadPercent(100.0);
      this.watcher.appliedPercent(100.0);

      if (logInterval) {
        clearInterval(logInterval);
      }

      // Save currency parameters given by root block
      const rootBlock = await this.server.dal.getBlock(0);
      await this.BlockchainService.saveParametersForRootBlock(BlockDTO.fromJSONObject(rootBlock))
      this.server.dal.blockDAL.cleanCache();

      //=======
      // Sandboxes
      //=======
      this.watcher.writeStatus('Synchronizing the sandboxes...');
      await pullSandboxToLocalServer(this.conf.currency, node, this.server, this.server.logger, this.watcher, 1, false)

      //=======
      // Peers
      //=======
      await this.syncPeers(nopeers, fullSync, this.host, this.port, to)

      this.watcher.end();
      this.push({ sync: true });
      this.logger.info('Sync finished.');
    } catch (err) {
      this.push({ sync: false, msg: err });
      err && this.watcher.writeStatus(err.message || (err.uerr && err.uerr.message) || String(err));
      this.watcher.end();
      throw err;
    }
  }

  async syncPeers(nopeers:boolean, fullSync:boolean, host:string, port:number, to?:number) {
    if (!nopeers && fullSync) {

      const peering = await Contacter.fetchPeer(host, port, this.contacterOptions);

      let peer = PeerDTO.fromJSONObject(peering);
      this.logger.info("Try with %s %s", peer.getURL(), peer.pubkey.substr(0, 6));
      let node:any = await connect(peer);
      node.pubkey = peer.pubkey;
      this.logger.info('Sync started.');

      this.watcher.writeStatus('Peers...');
      await this.syncPeer(node);
      const merkle = await this.dal.merkleForPeers();
      const getPeers = node.getPeers.bind(node);
      const json2 = await getPeers({});
      const rm = new NodesMerkle(json2);
      if(rm.root() != merkle.root()){
        const leavesToAdd:string[] = [];
        const json = await getPeers({ leaves: true });
        _(json.leaves).forEach((leaf:string) => {
          if(merkle.leaves().indexOf(leaf) == -1){
            leavesToAdd.push(leaf);
          }
        });
        for (const leaf of leavesToAdd) {
          try {
            const json3 = await getPeers({ "leaf": leaf });
            const jsonEntry = json3.leaf.value;
            const sign = json3.leaf.value.signature;
            const entry:any = {};
            ["version", "currency", "pubkey", "endpoints", "block"].forEach((key) => {
              entry[key] = jsonEntry[key];
            });
            entry.signature = sign;
            this.watcher.writeStatus('Peer ' + entry.pubkey);
            await this.PeeringService.submitP(entry, false, to === undefined);
          } catch (e) {
            this.logger.warn(e);
          }
        }
      }
      else {
        this.watcher.writeStatus('Peers already known');
      }
    }
  }

  //============
  // Peer
  //============
  private async syncPeer (node:any) {

    // Global sync vars
    const remotePeer = PeerDTO.fromJSONObject({});
    let remoteJsonPeer:any = {};
    const json = await node.getPeer();
    remotePeer.version = json.version
    remotePeer.currency = json.currency
    remotePeer.pubkey = json.pub
    remotePeer.endpoints = json.endpoints
    remotePeer.blockstamp = json.block
    remotePeer.signature = json.signature
    const entry = remotePeer.getRawUnsigned();
    const signature = dos2unix(remotePeer.signature);
    // Parameters
    if(!(entry && signature)){
      throw 'Requires a peering entry + signature';
    }

    remoteJsonPeer = json;
    remoteJsonPeer.pubkey = json.pubkey;
    let signatureOK = this.PeeringService.checkPeerSignature(remoteJsonPeer);
    if (!signatureOK) {
      this.watcher.writeStatus('Wrong signature for peer #' + remoteJsonPeer.pubkey);
    }
    try {
      await this.PeeringService.submitP(remoteJsonPeer);
    } catch (err) {
      if (err.indexOf !== undefined && err.indexOf(CrawlerConstants.ERRORS.NEWER_PEER_DOCUMENT_AVAILABLE.uerr.message) !== -1 && err != CrawlerConstants.ERROR.PEER.UNKNOWN_REFERENCE_BLOCK) {
        throw err;
      }
    }
  }
}

class NodesMerkle {

  private depth:number
  private nodesCount:number
  private leavesCount:number
  private merkleRoot:string

  constructor(json:any) {
    this.depth = json.depth
    this.nodesCount = json.nodesCount
    this.leavesCount = json.leavesCount
    this.merkleRoot = json.root;
  }

  // var i = 0;
  // this.levels = [];
  // while(json && json.levels[i]){
  //   this.levels.push(json.levels[i]);
  //   i++;
  // }

  root() {
    return this.merkleRoot
  }
}

interface Watcher {
  writeStatus(str: string): void
  downloadPercent(pct?: number): number
  appliedPercent(pct?: number): number
  end(): void
}

class EventWatcher implements Watcher {

  constructor(
    private innerWatcher:Watcher,
    private beforeDownloadPercentHook: (pct:number, innerWatcher:Watcher) => void,
    private beforeAppliedPercentHook: (pct:number, innerWatcher:Watcher) => void) {
  }

  writeStatus(str: string): void {
    this.innerWatcher.writeStatus(str)
  }

  downloadPercent(pct?: number): number {
    this.beforeDownloadPercentHook(pct || 0, this.innerWatcher)
    return this.innerWatcher.downloadPercent(pct)
  }

  appliedPercent(pct?: number): number {
    this.beforeAppliedPercentHook(pct || 0, this.innerWatcher)
    return this.innerWatcher.appliedPercent(pct)
  }

  end(): void {
    this.innerWatcher.end()
  }
}

class MultimeterWatcher implements Watcher {

  private xPos:number
  private yPos:number
  private multi:any
  private charm:any
  private appliedBar:any
  private downloadBar:any
  private writtens:string[] = []

  constructor() {
    this.multi = multimeter(process);
    this.charm = this.multi.charm;
    this.charm.on('^C', process.exit);
    this.charm.reset();

    this.multi.write('Progress:\n\n');

    this.multi.write("Download: \n");
    this.downloadBar = this.multi("Download: \n".length, 3, {
      width : 20,
      solid : {
        text : '|',
        foreground : 'white',
        background : 'blue'
      },
      empty : { text : ' ' }
    });

    this.multi.write("Apply:    \n");
    this.appliedBar = this.multi("Apply:    \n".length, 4, {
      width : 20,
      solid : {
        text : '|',
        foreground : 'white',
        background : 'blue'
      },
      empty : { text : ' ' }
    });

    this.multi.write('\nStatus: ');

    this.charm.position( (x:number, y:number) => {
      this.xPos = x;
      this.yPos = y;
    });

    this.writtens = [];

    this.downloadBar.percent(0);
    this.appliedBar.percent(0);
  }

  writeStatus(str:string) {
    this.writtens.push(str);
    //require('fs').writeFileSync('writtens.json', JSON.stringify(writtens));
    this.charm
      .position(this.xPos, this.yPos)
      .erase('end')
      .write(str)
    ;
  };

  downloadPercent(pct:number) {
    return this.downloadBar.percent(pct)
  }

  appliedPercent(pct:number) {
    return this.appliedBar.percent(pct)
  }

  end() {
    this.multi.write('\nAll done.\n');
    this.multi.destroy();
  }
}

class LoggerWatcher implements Watcher {

  private downPct = 0
  private appliedPct = 0
  private lastMsg = ""

  constructor(private logger:any) {
  }

  showProgress() {
    return this.logger.info('Downloaded %s%, Applied %s%', this.downPct, this.appliedPct)
  }

  writeStatus(str:string) {
    if (str != this.lastMsg) {
      this.lastMsg = str;
      this.logger.info(str);
    }
  }

  downloadPercent(pct:number) {
    if (pct !== undefined) {
      let changed = pct > this.downPct;
      this.downPct = pct;
      if (changed) this.showProgress();
    }
    return this.downPct;
  }

  appliedPercent(pct:number) {
    if (pct !== undefined) {
      let changed = pct > this.appliedPct;
      this.appliedPct = pct;
      if (changed) this.showProgress();
    }
    return this.appliedPct;
  }

  end() {
  }

}

class P2PDownloader {

  private PARALLEL_PER_CHUNK = 1;
  private MAX_DELAY_PER_DOWNLOAD = 15000;
  private NO_NODES_AVAILABLE = "No node available for download";
  private TOO_LONG_TIME_DOWNLOAD:string
  private nbBlocksToDownload:number
  private numberOfChunksToDownload:number
  private downloadSlots:number
  private chunks:any
  private processing:any
  private handler:any
  private resultsDeferers:any
  private resultsData:Promise<BlockDTO[]>[]
  private nodes:any = {}
  private nbDownloadsTried = 0
  private nbDownloading = 0
  private lastAvgDelay:number
  private aSlotWasAdded = false
  private slots:number[] = [];
  private downloads:any = {};
  private startResolver:any
  private downloadStarter:Promise<any>

  constructor(
    private currency:string,
    private localNumber:number,
    private to:number,
    private toHash:string,
    private peers:PeerDTO[],
    private watcher:Watcher,
    private logger:any,
    private hashf:any,
    private dal:FileDAL,
    private slowOption:any) {

    this.TOO_LONG_TIME_DOWNLOAD = "No answer after " + this.MAX_DELAY_PER_DOWNLOAD + "ms, will retry download later.";
    this.nbBlocksToDownload = Math.max(0, to - localNumber);
    this.numberOfChunksToDownload = Math.ceil(this.nbBlocksToDownload / CONST_BLOCKS_CHUNK);
    this.chunks          = Array.from({ length: this.numberOfChunksToDownload }).map(() => null);
    this.processing      = Array.from({ length: this.numberOfChunksToDownload }).map(() => false);
    this.handler         = Array.from({ length: this.numberOfChunksToDownload }).map(() => null);
    this.resultsDeferers = Array.from({ length: this.numberOfChunksToDownload }).map(() => null);
    this.resultsData     = Array.from({ length: this.numberOfChunksToDownload }).map((unused, index) => new Promise((resolve, reject) => {
      this.resultsDeferers[index] = { resolve, reject };
    }));

    // Create slots of download, in a ready stage
    this.downloadSlots = slowOption ? 1 : Math.min(INITIAL_DOWNLOAD_SLOTS, peers.length);
    this.lastAvgDelay = this.MAX_DELAY_PER_DOWNLOAD;

    /**
     * Triggers for starting the download.
     */
    this.downloadStarter = new Promise((resolve) => this.startResolver = resolve);

    /**
     * Download worker
     * @type {*|Promise} When finished.
     */
    (async () => {
      try {
        await this.downloadStarter;
        let doneCount = 0, resolvedCount = 0;
        while (resolvedCount < this.chunks.length) {
          doneCount = 0;
          resolvedCount = 0;
          // Add as much possible downloads as possible, and count the already done ones
          for (let i = this.chunks.length - 1; i >= 0; i--) {
            if (this.chunks[i] === null && !this.processing[i] && this.slots.indexOf(i) === -1 && this.slots.length < this.downloadSlots) {
              this.slots.push(i);
              this.processing[i] = true;
              this.downloads[i] = makeQuerablePromise(this.downloadChunk(i)); // Starts a new download
            } else if (this.downloads[i] && this.downloads[i].isFulfilled() && this.processing[i]) {
              doneCount++;
            }
            // We count the number of perfectly downloaded & validated chunks
            if (this.chunks[i]) {
              resolvedCount++;
            }
          }
          watcher.downloadPercent(Math.round(doneCount / this.numberOfChunksToDownload * 100));
          let races = this.slots.map((i) => this.downloads[i]);
          if (races.length) {
            try {
              await this.raceOrCancelIfTimeout(this.MAX_DELAY_PER_DOWNLOAD, races);
            } catch (e) {
              this.logger.warn(e);
            }
            for (let i = 0; i < this.slots.length; i++) {
              // We must know the index of what resolved/rejected to free the slot
              const doneIndex = this.slots.reduce((found:any, realIndex:number, index:number) => {
                if (found !== null) return found;
                if (this.downloads[realIndex].isFulfilled()) return index;
                return null;
              }, null);
              if (doneIndex !== null) {
                const realIndex = this.slots[doneIndex];
                if (this.downloads[realIndex].isResolved()) {
                  // IIFE to be safe about `realIndex`
                  (async () => {
                      const blocks = await this.downloads[realIndex];
                      if (realIndex < this.chunks.length - 1) {
                        // We must wait for NEXT blocks to be STRONGLY validated before going any further, otherwise we
                        // could be on the wrong chain
                        await this.getChunk(realIndex + 1);
                      }
                      const chainsWell = await this.chainsCorrectly(blocks, realIndex);
                      if (chainsWell) {
                        // Chunk is COMPLETE
                        this.logger.warn("Chunk #%s is COMPLETE from %s", realIndex, [this.handler[realIndex].host, this.handler[realIndex].port].join(':'));
                        this.chunks[realIndex] = blocks;
                        this.resultsDeferers[realIndex].resolve(this.chunks[realIndex]);
                      } else {
                        this.logger.warn("Chunk #%s DOES NOT CHAIN CORRECTLY from %s", realIndex, [this.handler[realIndex].host, this.handler[realIndex].port].join(':'));
                        // Penality on this node to avoid its usage
                        if (this.handler[realIndex].resetFunction) {
                          await this.handler[realIndex].resetFunction();
                        }
                        if (this.handler[realIndex].tta !== undefined) {
                          this.handler[realIndex].tta += this.MAX_DELAY_PER_DOWNLOAD;
                        }
                        // Need a retry
                        this.processing[realIndex] = false;
                      }
                  })()
                } else {
                  this.processing[realIndex] = false; // Need a retry
                }
                this.slots.splice(doneIndex, 1);
              }
            }
          }
          // Wait a bit
          await new Promise((resolve, reject) => setTimeout(resolve, 10));
        }
      } catch (e) {
        this.logger.error('Fatal error in the downloader:');
        this.logger.error(e);
      }
    })()
  }

  /**
   * Get a list of P2P nodes to use for download.
   * If a node is not yet correctly initialized (we can test a node before considering it good for downloading), then
   * this method would not return it.
   */
  private async getP2Pcandidates(): Promise<any[]> {
    let promises = this.peers.reduce((chosens:any, other:any, index:number) => {
      if (!this.nodes[index]) {
        // Create the node
        let p = PeerDTO.fromJSONObject(this.peers[index]);
        this.nodes[index] = makeQuerablePromise((async () => {
          // We wait for the download process to be triggered
          // await downloadStarter;
          // if (nodes[index - 1]) {
          //   try { await nodes[index - 1]; } catch (e) {}
          // }
          const node:any = await connect(p)
          // We initialize nodes with the near worth possible notation
          node.tta = 1;
          node.nbSuccess = 0;
          return node;
        })())
        chosens.push(this.nodes[index]);
      } else {
        chosens.push(this.nodes[index]);
      }
      // Continue
      return chosens;
    }, []);
    let candidates:any[] = await Promise.all(promises)
    candidates.forEach((c:any) => {
      c.tta = c.tta || 0; // By default we say a node is super slow to answer
      c.ttas = c.ttas || []; // Memorize the answer delays
    });
    if (candidates.length === 0) {
      throw this.NO_NODES_AVAILABLE;
    }
    // We remove the nodes impossible to reach (timeout)
    let withGoodDelays = _.filter(candidates, (c:any) => c.tta <= this.MAX_DELAY_PER_DOWNLOAD);
    if (withGoodDelays.length === 0) {
      // No node can be reached, we can try to lower the number of nodes on which we download
      this.downloadSlots = Math.floor(this.downloadSlots / 2);
      // We reinitialize the nodes
      this.nodes = {};
      // And try it all again
      return this.getP2Pcandidates();
    }
    const parallelMax = Math.min(this.PARALLEL_PER_CHUNK, withGoodDelays.length);
    withGoodDelays = _.sortBy(withGoodDelays, (c:any) => c.tta);
    withGoodDelays = withGoodDelays.slice(0, parallelMax);
    // We temporarily augment the tta to avoid asking several times to the same node in parallel
    withGoodDelays.forEach((c:any) => c.tta = this.MAX_DELAY_PER_DOWNLOAD);
    return withGoodDelays;
  }

  /**
   * Download a chunk of blocks using P2P network through BMA API.
   * @param from The starting block to download
   * @param count The number of blocks to download.
   * @param chunkIndex The # of the chunk in local algorithm (logging purposes only)
   */
  private async p2pDownload(from:number, count:number, chunkIndex:number) {
    let candidates = await this.getP2Pcandidates();
    // Book the nodes
    return await this.raceOrCancelIfTimeout(this.MAX_DELAY_PER_DOWNLOAD, candidates.map(async (node:any) => {
      try {
        const start = Date.now();
        this.handler[chunkIndex] = node;
        node.downloading = true;
        this.nbDownloading++;
        this.watcher.writeStatus('Getting chunck #' + chunkIndex + '/' + (this.numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + [node.host, node.port].join(':'));
        let blocks = await node.getBlocks(count, from);
        node.ttas.push(Date.now() - start);
        // Only keep a flow of 5 ttas for the node
        if (node.ttas.length > 5) node.ttas.shift();
        // Average time to answer
        node.tta = Math.round(node.ttas.reduce((sum:number, tta:number) => sum + tta, 0) / node.ttas.length);
        this.watcher.writeStatus('GOT chunck #' + chunkIndex + '/' + (this.numberOfChunksToDownload - 1) + ' from ' + from + ' to ' + (from + count - 1) + ' on peer ' + [node.host, node.port].join(':'));
        node.nbSuccess++;

        // Opening/Closing slots depending on the Interne connection
        if (this.slots.length == this.downloadSlots) {
          const peers = await Promise.all(_.values(this.nodes))
          const downloading = _.filter(peers, (p:any) => p.downloading && p.ttas.length);
          const currentAvgDelay = downloading.reduce((sum:number, c:any) => {
              const tta = Math.round(c.ttas.reduce((sum:number, tta:number) => sum + tta, 0) / c.ttas.length);
              return sum + tta;
            }, 0) / downloading.length;
          // Opens or close downloading slots
          if (!this.slowOption) {
            // Check the impact of an added node (not first time)
            if (!this.aSlotWasAdded) {
              // We try to add a node
              const newValue = Math.min(peers.length, this.downloadSlots + 1);
              if (newValue !== this.downloadSlots) {
                this.downloadSlots = newValue;
                this.aSlotWasAdded = true;
                this.logger.info('AUGMENTED DOWNLOAD SLOTS! Now has %s slots', this.downloadSlots);
              }
            } else {
              this.aSlotWasAdded = false;
              const decelerationPercent = currentAvgDelay / this.lastAvgDelay - 1;
              const addedNodePercent = 1 / this.nbDownloading;
              this.logger.info('Deceleration = %s (%s/%s), AddedNodePercent = %s', decelerationPercent, currentAvgDelay, this.lastAvgDelay, addedNodePercent);
              if (decelerationPercent > addedNodePercent) {
                this.downloadSlots = Math.max(1, this.downloadSlots - 1); // We reduce the number of slots, but we keep at least 1 slot
                this.logger.info('REDUCED DOWNLOAD SLOT! Now has %s slots', this.downloadSlots);
              }
            }
          }
          this.lastAvgDelay = currentAvgDelay;
        }

        this.nbDownloadsTried++;
        this.nbDownloading--;
        node.downloading = false;

        return blocks;
      } catch (e) {
        this.nbDownloading--;
        node.downloading = false;
        this.nbDownloadsTried++;
        node.ttas.push(this.MAX_DELAY_PER_DOWNLOAD + 1); // No more ask on this node
        // Average time to answer
        node.tta = Math.round(node.ttas.reduce((sum:number, tta:number) => sum + tta, 0) / node.ttas.length);
        throw e;
      }
    }))
  }

  /**
   * Function for downloading a chunk by its number.
   * @param index Number of the chunk.
   */
  private async downloadChunk(index:number): Promise<BlockDTO[]> {
    // The algorithm to download a chunk
    const from = this.localNumber + 1 + index * CONST_BLOCKS_CHUNK;
    let count = CONST_BLOCKS_CHUNK;
    if (index == this.numberOfChunksToDownload - 1) {
      count = this.nbBlocksToDownload % CONST_BLOCKS_CHUNK || CONST_BLOCKS_CHUNK;
    }
    try {
      const fileName = this.currency + "/chunk_" + index + "-" + CONST_BLOCKS_CHUNK + ".json";
      if (this.localNumber <= 0 && (await this.dal.confDAL.coreFS.exists(fileName))) {
        this.handler[index] = {
          host: 'filesystem',
          port: 'blockchain',
          resetFunction: () => this.dal.confDAL.coreFS.remove(fileName)
        };
        return (await this.dal.confDAL.coreFS.readJSON(fileName)).blocks;
      } else {
        const chunk:any = await this.p2pDownload(from, count, index);
        // Store the file to avoid re-downloading
        if (this.localNumber <= 0 && chunk.length === CONST_BLOCKS_CHUNK) {
          await this.dal.confDAL.coreFS.makeTree(this.currency);
          await this.dal.confDAL.coreFS.writeJSON(fileName, { blocks: chunk });
        }
        return chunk;
      }
    } catch (e) {
      this.logger.error(e);
      return this.downloadChunk(index);
    }
  }

  /**
   * Utility function this starts a race between promises but cancels it if no answer is found before `timeout`
   * @param timeout
   * @param races
   * @returns {Promise}
   */
  private raceOrCancelIfTimeout(timeout:number, races:any[]) {
    return Promise.race([
      // Process the race, but cancel it if we don't get an anwser quickly enough
      new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(this.TOO_LONG_TIME_DOWNLOAD);
        }, timeout)
      })
    ].concat(races));
  };

  private async chainsCorrectly(blocks:BlockDTO[], index:number) {

    if (!blocks.length) {
      this.logger.error('No block was downloaded');
      return false;
    }

    for (let i = blocks.length - 1; i > 0; i--) {
      if (blocks[i].number !== blocks[i - 1].number + 1 || blocks[i].previousHash !== blocks[i - 1].hash) {
        this.logger.error("Blocks do not chaing correctly", blocks[i].number);
        return false;
      }
      if (blocks[i].version != blocks[i - 1].version && blocks[i].version != blocks[i - 1].version + 1) {
        this.logger.error("Version cannot be downgraded", blocks[i].number);
        return false;
      }
    }

    // Check hashes
    for (let i = 0; i < blocks.length; i++) {
      // Note: the hash, in Duniter, is made only on the **signing part** of the block: InnerHash + Nonce
      if (blocks[i].version >= 6) {
        for (const tx of blocks[i].transactions) {
          tx.version = CrawlerConstants.TRANSACTION_VERSION;
        }
      }
      if (blocks[i].inner_hash !== hashf(rawer.getBlockInnerPart(blocks[i])).toUpperCase()) {
        this.logger.error("Inner hash of block#%s from %s does not match", blocks[i].number);
        return false;
      }
      if (blocks[i].hash !== hashf(rawer.getBlockInnerHashAndNonceWithSignature(blocks[i])).toUpperCase()) {
        this.logger.error("Hash of block#%s from %s does not match", blocks[i].number);
        return false;
      }
    }

    const lastBlockOfChunk = blocks[blocks.length - 1];
    if ((lastBlockOfChunk.number == this.to || blocks.length < CONST_BLOCKS_CHUNK) && lastBlockOfChunk.hash != this.toHash) {
      // Top chunk
      this.logger.error('Top block is not on the right chain');
      return false;
    } else {
      // Chaining between downloads
      const previousChunk = await this.getChunk(index + 1);
      const blockN = blocks[blocks.length - 1]; // The block n
      const blockNp1 = previousChunk[0]; // The block n + 1
      if (blockN && blockNp1 && (blockN.number + 1 !== blockNp1.number || blockN.hash != blockNp1.previousHash)) {
        this.logger.error('Chunk is not referenced by the upper one');
        return false;
      }
    }
    return true;
  }

  /**
   * PUBLIC API
   */

  /***
   * Triggers the downloading
   */
  start() {
    return this.startResolver()
  }

  /***
   * Promises a chunk to be downloaded and returned
   * @param index The number of the chunk to download & return
   */
  getChunk(index:number) {
    return this.resultsData[index] || Promise.resolve([])
  }
}
