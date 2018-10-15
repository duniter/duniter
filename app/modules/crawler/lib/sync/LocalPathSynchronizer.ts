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

import {ISyncDownloader} from "./ISyncDownloader"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {Watcher} from "./Watcher"
import {PeeringService} from "../../../../service/PeeringService"
import {Server} from "../../../../../server"
import {FileDAL} from "../../../../lib/dal/fileDAL"
import {FsSyncDownloader} from "./FsSyncDownloader"
import {AbstractSynchronizer} from "./AbstractSynchronizer"
import {CommonConstants} from "../../../../lib/common-libs/constants"
import {RealFS} from "../../../../lib/system/directory"

export class LocalPathSynchronizer extends AbstractSynchronizer {

  private theP2pDownloader: ISyncDownloader
  private theFsDownloader: ISyncDownloader
  private currency: string
  private watcher: Watcher
  private ls: Promise<string[]>

  constructor(
    private path: string,
    private server:Server,
    chunkSize: number,
  ) {
    super(chunkSize)
    const fs = RealFS()
    this.ls = fs.fsList(path)
    // We read from the real file system here, directly.
    this.theFsDownloader = new FsSyncDownloader(fs, this.path, this.getChunkName.bind(this), chunkSize)
    this.theP2pDownloader = new FsSyncDownloader(fs, this.path, this.getChunkName.bind(this), chunkSize)
  }

  get dal(): FileDAL {
    return this.server.dal
  }

  get readDAL(): FileDAL {
    return this.dal
  }

  get PeeringService(): PeeringService {
    return this.server.PeeringService
  }

  getCurrency(): string {
    return this.currency
  }

  getPeer(): PeerDTO {
    return this as any
  }

  getChunksPath(): string {
    return this.path
  }

  setWatcher(watcher: Watcher): void {
    this.watcher = watcher
  }

  async init(): Promise<void> {
    // TODO: check that path exists and that files seem consistent
  }

  async initWithKnownLocalAndToAndCurrency(to: number, localNumber: number, currency: string): Promise<void> {
    this.currency = currency
  }

  p2pDownloader(): ISyncDownloader {
    return this.theP2pDownloader
  }

  fsDownloader(): ISyncDownloader {
    return this.theFsDownloader
  }

  async getCurrent(): Promise<BlockDTO|null> {
    const chunkNumbers: number[] = (await this.ls).map(s => parseInt(s.replace(CommonConstants.CHUNK_PREFIX, '')))
    const topChunk = chunkNumbers.reduce((number, max) => Math.max(number, max), -1)
    if (topChunk === -1) {
      return null
    }
    const chunk = await this.theFsDownloader.getChunk(topChunk)
    return chunk[chunk.length - 1] // This is the top block of the top chunk = the current block
  }

  async getBlock(number: number): Promise<BlockDTO|null> {
    const chunkNumber = parseInt(String(number / this.chunkSize))
    const position = number % this.chunkSize
    const chunk = await this.theFsDownloader.getChunk(chunkNumber)
    return chunk[position]
  }

  async syncPeers(fullSync: boolean, to?: number): Promise<void> {
    // Does nothing on LocalPathSynchronizer
  }

  async syncSandbox(): Promise<void> {
    // Does nothing on LocalPathSynchronizer
  }
}
