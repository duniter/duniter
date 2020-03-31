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
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {DBBlock} from "../../../lib/db/DBBlock"
import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {PeeringService} from "../../../service/PeeringService"
import {EventWatcher, LoggerWatcher, MultimeterWatcher} from "./sync/Watcher"
import {AbstractSynchronizer} from "./sync/AbstractSynchronizer"
import {DownloadStream} from "./sync/v2/DownloadStream"
import {LocalIndexStream} from "./sync/v2/LocalIndexStream"
import {GlobalIndexStream} from "./sync/v2/GlobalIndexStream"
import {BlockchainService} from "../../../service/BlockchainService"
import {FileDAL} from "../../../lib/dal/fileDAL"
import {cliprogram} from "../../../lib/common-libs/programOptions"
import {ValidatorStream} from "./sync/v2/ValidatorStream"

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
    this.watcher.onEvent('downloadChange', () => this.push(this.watcher.getStats()))
    this.watcher.onEvent('storageChange',  () => this.push(this.watcher.getStats()))
    this.watcher.onEvent('appliedChange',  () => this.push(this.watcher.getStats()))
    this.watcher.onEvent('sbxChange',      () => this.push(this.watcher.getStats()))
    this.watcher.onEvent('peersChange',    () => this.push(this.watcher.getStats()))
    this.watcher.onEvent('addWrongChunkFailure',  (data) => this.push({ p2pData: { name: 'addWrongChunkFailure', data }}))
    this.watcher.onEvent('failToGetChunk',        (data) => this.push({ p2pData: { name: 'failToGetChunk', data }}))
    this.watcher.onEvent('gettingChunk',          (data) => this.push({ p2pData: { name: 'gettingChunk', data }}))
    this.watcher.onEvent('gotChunk',              (data) => this.push({ p2pData: { name: 'gotChunk', data }}))
    this.watcher.onEvent('reserveNodes',          (data) => this.push({ p2pData: { name: 'reserveNodes', data }}))
    this.watcher.onEvent('unableToDownloadChunk', (data) => this.push({ p2pData: { name: 'unableToDownloadChunk', data }}))
    this.watcher.onEvent('wantToDownload',        (data) => this.push({ p2pData: { name: 'wantToDownload', data }}))
    this.watcher.onEvent('wantToLoad',            (data) => this.push({ p2pData: { name: 'wantToLoad', data }}))
    this.watcher.onEvent('beforeReadyNodes',      (data) => this.push({ p2pData: { name: 'beforeReadyNodes', data }}))
    this.watcher.onEvent('syncFailNoNodeFound',   (data) => this.push({ p2pData: { name: 'syncFailNoNodeFound', data }}))
    this.watcher.onEvent('syncFailCannotConnectToRemote', (data) => this.push({ p2pData: { name: 'syncFailCannotConnectToRemote', data }}))

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

  get BlockchainService(): BlockchainService {
    return this.server.BlockchainService
  }

  get dal(): FileDAL {
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

      const milestonesStream = new ValidatorStream(
        localNumber,
        to,
        rCurrent.hash,
        this.syncStrategy,
        this.watcher)
      const download = new DownloadStream(
        localNumber,
        to,
        rCurrent.hash,
        this.syncStrategy,
        this.server.dal,
        !cautious,
        this.watcher)

      const localIndexer = new LocalIndexStream()
      const globalIndexer = new GlobalIndexStream(
        this.server.conf,
        this.server.dal,
        to,
        localNumber,
        cautious,
        this.syncStrategy,
        this.watcher,
        
      )

      await new Promise((res, rej) => {
        milestonesStream
          .pipe(download)
          .pipe(localIndexer)
          .pipe(globalIndexer)
          .on('finish', res)
          .on('error', rej);
      })

      // Finished blocks
      this.watcher.downloadPercent(100.0);
      this.watcher.storagePercent(100.0);
      this.watcher.appliedPercent(100.0);

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
