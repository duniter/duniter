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

import * as stream from "stream"
import * as moment from "moment"
import {CrawlerConstants} from "./constants"
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
import {dos2unix} from "../../../lib/common-libs/dos2unix"
import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {PeeringService} from "../../../service/PeeringService"
import {CommonConstants} from "../../../lib/common-libs/constants"
import {Underscore} from "../../../lib/common-libs/underscore"
import {HttpMerkleOfPeers} from "../../bma/lib/dtos"
import {DBPeer, JSONDBPeer} from "../../../lib/db/DBPeer"
import {cliprogram} from "../../../lib/common-libs/programOptions"
import {EventWatcher, LoggerWatcher, MultimeterWatcher, Watcher} from "./sync/Watcher"
import {ChunkGetter} from "./sync/ChunkGetter"

const EVAL_REMAINING_INTERVAL = 1000;

export class Synchroniser extends stream.Duplex {

  private watcher:EventWatcher
  private speed = 0
  private blocksApplied = 0
  private contacterOptions:any

  constructor(
    private server:Server,
    private host:string,
    private port:number,
    interactive = false,
    private otherDAL?:FileDAL) {

    super({ objectMode: true })

    // Wrapper to also push event stream
    this.watcher = new EventWatcher(interactive ? new MultimeterWatcher() : new LoggerWatcher(this.logger))
    this.watcher.onEvent('downloadChange', (pct: number) => this.push({ download: pct }))
    this.watcher.onEvent('storageChange',  (pct: number) => this.push({ saved: pct }))
    this.watcher.onEvent('appliedChange',  (pct: number) => this.push({ applied: pct }))
    this.watcher.onEvent('sbxChange',      (pct: number) => this.push({ sandbox: pct }))
    this.watcher.onEvent('peersChange',    (pct: number) => this.push({ peersSync: pct }))

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

  async sync(to:number, chunkLen:number, askedCautious = false, noShufflePeers = false) {

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
      const lCurrent:DBBlock|null = await this.dal.getCurrentBlockOrNull();
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
      let peers:(JSONDBPeer|null)[] = [];
      if (!cliprogram.nopeers && (to - localNumber > 1000)) { // P2P download if more than 1000 blocs
        this.watcher.writeStatus('Peers...');
        const merkle = await this.dal.merkleForPeers();
        const getPeers:(params:any) => Promise<HttpMerkleOfPeers> = node.getPeers.bind(node);
        const json2 = await getPeers({});
        const rm = new NodesMerkle(json2);
        if(rm.root() != merkle.root()){
          const leavesToAdd:string[] = [];
          const json = await getPeers({ leaves: true });
          json.leaves.forEach((leaf:string) => {
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
        peers.push(DBPeer.fromPeerDTO(peer))
      }
      peers = peers.filter((p) => p);

      //============
      // Blockchain
      //============
      this.logger.info('Downloading Blockchain...');

      // We use cautious mode if it is asked, or not particulary asked but blockchain has been started
      const cautious = (askedCautious === true || localNumber >= 0);
      const shuffledPeers = (noShufflePeers ? peers : Underscore.shuffle(peers)).filter(p => !!(p)) as JSONDBPeer[]
      const downloader = new ChunkGetter(
        rCurrent.currency,
        localNumber,
        to,
        rCurrent.hash,
        shuffledPeers,
        this.dal,
        !cautious,
        this.watcher,
        this.otherDAL)

      downloader.start()

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
          blocks = Underscore.filter(blocks, (b:BlockDTO) => b.number <= to);
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
          return this.dal.getBlockWeHaveItForSure(number)
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
        async downloadBlocks(thePeer: PeerDTO, fromNumber: number, count?: number | undefined): Promise<BlockDTO[]> {
          // Note: we don't care about the particular peer asked by the method. We use the network instead.
          const numberOffseted = fromNumber - (localNumber + 1);
          const targetChunk = Math.floor(numberOffseted / CommonConstants.CONST_BLOCKS_CHUNK);
          // Return the download promise! Simple.
          return (await downloader.getChunk(targetChunk))()
        }

      })(this.server, this.watcher, this.dal, this.BlockchainService)

      const logInterval = setInterval(() => this.logRemaining(to), EVAL_REMAINING_INTERVAL);
      await dao.pull(this.conf, this.logger)

      // Finished blocks
      this.watcher.downloadPercent(100.0);
      this.watcher.storagePercent(100.0);
      this.watcher.appliedPercent(100.0);

      if (logInterval) {
        clearInterval(logInterval);
      }

      // Save currency parameters given by root block
      const rootBlock = await this.server.dal.getFullBlockOf(0)
      await this.BlockchainService.saveParametersForRootBlock(BlockDTO.fromJSONObject(rootBlock))
      this.server.dal.blockDAL.cleanCache();

      if (!cliprogram.nosbx) {
        //=======
        // Sandboxes
        //=======
        this.watcher.writeStatus('Synchronizing the sandboxes...');
        await pullSandboxToLocalServer(this.conf.currency, node, this.server, this.server.logger, this.watcher, 1, false)
      }

      if (!cliprogram.nopeers) {
        //=======
        // Peers
        //=======
        await this.syncPeers(fullSync, this.host, this.port, to)
      }

      // Trim the loki data
      await this.server.dal.loki.flushAndTrimData()

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

  async syncPeers(fullSync:boolean, host:string, port:number, to?:number) {
    if (!cliprogram.nopeers && fullSync) {

      const peering = await Contacter.fetchPeer(host, port, this.contacterOptions);

      let peer = PeerDTO.fromJSONObject(peering);
      this.logger.info("Try with %s %s", peer.getURL(), peer.pubkey.substr(0, 6));
      let node:any = await connect(peer);
      node.pubkey = peer.pubkey;
      this.logger.info('Sync started.');

      this.watcher.writeStatus('Peers...');
      await this.syncPeer(node);
      const merkle = await this.dal.merkleForPeers();
      const getPeers:(params:any) => Promise<HttpMerkleOfPeers> = node.getPeers.bind(node);
      const json2 = await getPeers({});
      const rm = new NodesMerkle(json2);
      if(rm.root() != merkle.root()){
        const leavesToAdd:string[] = [];
        const json = await getPeers({ leaves: true });
        json.leaves.forEach((leaf:string) => {
          if(merkle.leaves().indexOf(leaf) == -1){
            leavesToAdd.push(leaf);
          }
        });
        for (let i = 0; i < leavesToAdd.length; i++) {
          try {
            const leaf = leavesToAdd[i]
            const json3 = await getPeers({ "leaf": leaf });
            const jsonEntry = json3.leaf.value;
            const sign = json3.leaf.value.signature;
            const entry:any = {};
            entry.version = jsonEntry.version
            entry.currency = jsonEntry.currency
            entry.pubkey = jsonEntry.pubkey
            entry.endpoints = jsonEntry.endpoints
            entry.block = jsonEntry.block
            entry.signature = sign;
            this.watcher.writeStatus('Peer ' + entry.pubkey);
            this.watcher.peersPercent((i + 1) / leavesToAdd.length * 100)
            await this.PeeringService.submitP(entry, false, to === undefined);
          } catch (e) {
            this.logger.warn(e && e.message || e)
          }
        }
        this.watcher.peersPercent(100)
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
