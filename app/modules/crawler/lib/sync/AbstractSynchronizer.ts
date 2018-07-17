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

import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {ISyncDownloader} from "./ISyncDownloader"
import {CommonConstants} from "../../../../lib/common-libs/constants"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {Watcher} from "./Watcher"
import {FileDAL} from "../../../../lib/dal/fileDAL"
import * as path from 'path'

export abstract class AbstractSynchronizer {

  constructor(public readonly chunkSize: number) {
  }

  abstract init(): Promise<void>
  abstract initWithKnownLocalAndToAndCurrency(to: number, localNumber: number, currency: string): Promise<void>
  abstract getCurrent(): Promise<BlockDTO|null>
  abstract getBlock(number: number): Promise<BlockDTO|null>
  abstract p2pDownloader(): ISyncDownloader
  abstract fsDownloader(): ISyncDownloader
  abstract syncPeers(fullSync:boolean, to?:number): Promise<void>
  abstract syncSandbox(): Promise<void>
  abstract getPeer(): PeerDTO
  abstract setWatcher(watcher: Watcher): void
  public abstract getCurrency(): string
  public abstract getChunksPath(): string
  public abstract get readDAL(): FileDAL

  public getChunkRelativePath(i: number) {
    return path.join(this.getCurrency(), this.getChunkName(i))
  }

  public getChunkName(i: number) {
    return CommonConstants.CHUNK_PREFIX + i + "-" + this.chunkSize + ".json"
  }
}
