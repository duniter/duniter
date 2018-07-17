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
import {Server} from "../../../../server"
import {PeerDTO} from "../../../lib/dto/PeerDTO"
import {FileDAL} from "../../../lib/dal/fileDAL"
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {tx_cleaner} from "./tx_cleaner"
import {AbstractDAO} from "./pulling"
import {DBBlock} from "../../../lib/db/DBBlock"
import {BlockchainService} from "../../../service/BlockchainService"
import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {PeeringService} from "../../../service/PeeringService"
import {Underscore} from "../../../lib/common-libs/underscore"
import {cliprogram} from "../../../lib/common-libs/programOptions"
import {EventWatcher, LoggerWatcher, MultimeterWatcher, Watcher} from "./sync/Watcher"
import {ChunkGetter} from "./sync/ChunkGetter"
import {AbstractSynchronizer} from "./sync/AbstractSynchronizer"

const EVAL_REMAINING_INTERVAL = 1000;

export class Synchroniser extends stream.Duplex {

  private watcher:EventWatcher
  private speed = 0
  private blocksApplied = 0

  constructor(
    private server:Server,
    private syncStrategy: AbstractSynchronizer,
    interactive = false) {

    super({ objectMode: true })

    // Wrapper to also push event stream
    this.watcher = new EventWatcher(interactive ? new MultimeterWatcher() : new LoggerWatcher(this.logger))
    this.watcher.onEvent('downloadChange', (pct: number) => this.push({ download: pct }))
    this.watcher.onEvent('storageChange',  (pct: number) => this.push({ saved: pct }))
    this.watcher.onEvent('appliedChange',  (pct: number) => this.push({ applied: pct }))
    this.watcher.onEvent('sbxChange',      (pct: number) => this.push({ sandbox: pct }))
    this.watcher.onEvent('peersChange',    (pct: number) => this.push({ peersSync: pct }))

    this.syncStrategy.setWatcher(this.watcher)

    if (interactive) {
      this.logger.mute();
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

  async sync(to:number, chunkLen:number, askedCautious = false) {

    try {
      await this.syncStrategy.init()
      this.logger.info('Sync started.');

      const fullSync = !to;

      //============
      // Blockchain headers
      //============
      this.logger.info('Getting remote blockchain info...');
      const lCurrent:DBBlock|null = await this.dal.getCurrentBlockOrNull();
      const localNumber = lCurrent ? lCurrent.number : -1;
      let rCurrent:BlockDTO|null
      if (isNaN(to)) {
        rCurrent = await this.syncStrategy.getCurrent();
        if (!rCurrent) {
          throw 'Remote does not have a current block. Sync aborted.'
        }
      } else {
        rCurrent = await this.syncStrategy.getBlock(to)
        if (!rCurrent) {
          throw 'Remote does not have a target block. Sync aborted.'
        }
      }
      to = rCurrent.number || 0

      const rootBlock = await this.syncStrategy.getBlock(0)
      if (!rootBlock) {
        throw 'Could not get root block. Sync aborted.'
      }
      await this.BlockchainService.saveParametersForRootBlock(rootBlock)
      await this.server.reloadConf()

      await this.syncStrategy.initWithKnownLocalAndToAndCurrency(to, localNumber, rCurrent.currency)

      //============
      // Blockchain
      //============
      this.logger.info('Downloading Blockchain...');

      // We use cautious mode if it is asked, or not particulary asked but blockchain has been started
      const cautious = (askedCautious === true || localNumber >= 0);
      const downloader = new ChunkGetter(
        localNumber,
        to,
        rCurrent.hash,
        this.syncStrategy,
        this.dal,
        !cautious,
        this.watcher)

      const startp = downloader.start()

      let lastPullBlock:BlockDTO|null = null;
      let syncStrategy = this.syncStrategy
      let node = this.syncStrategy.getPeer()

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
            block = await syncStrategy.getBlock(number)
            if (!block) {
              throw 'Could not get remote block'
            }
            tx_cleaner(block.transactions);
          } catch (e) {
            if (e.httpCode != 404) {
              throw e;
            }
          }
          return block as BlockDTO
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
          const targetChunk = Math.floor(numberOffseted / syncStrategy.chunkSize);
          // Return the download promise! Simple.
          return (await downloader.getChunk(targetChunk))()
        }

      })(this.server, this.watcher, this.dal, this.BlockchainService)

      const logInterval = setInterval(() => this.logRemaining(to), EVAL_REMAINING_INTERVAL);
      await Promise.all([
        dao.pull(this.conf, this.logger),
        await startp // In case of errors, will stop the process
      ])

      // Finished blocks
      this.watcher.downloadPercent(100.0);
      this.watcher.storagePercent(100.0);
      this.watcher.appliedPercent(100.0);

      if (logInterval) {
        clearInterval(logInterval);
      }

      this.server.dal.blockDAL.cleanCache();

      if (!cliprogram.nosbx) {
        //=======
        // Sandboxes
        //=======
        await this.syncStrategy.syncSandbox()
      }

      if (!cliprogram.nopeers) {
        //=======
        // Peers
        //=======
        await this.syncStrategy.syncPeers(fullSync, to)
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
}
