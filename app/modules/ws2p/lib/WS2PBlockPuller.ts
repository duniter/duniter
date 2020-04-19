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

import { BlockDTO } from "../../../lib/dto/BlockDTO";
import { AbstractDAO } from "../../crawler/lib/pulling";
import { Server } from "../../../../server";
import { DBBlock } from "../../../lib/db/DBBlock";
import { PeerDTO } from "../../../lib/dto/PeerDTO";
import { CrawlerConstants } from "../../crawler/lib/constants";
import { tx_cleaner } from "../../crawler/lib/tx_cleaner";
import { WS2PConnection } from "./WS2PConnection";
import { WS2PRequester } from "./WS2PRequester";

export class WS2PBlockPuller {
  constructor(private server: Server, private connection: WS2PConnection) {}

  async pull() {
    const requester = WS2PRequester.fromConnection(this.connection);
    // node.pubkey = p.pubkey;
    let dao = new WS2PDao(this.server, requester);
    await dao.pull(this.server.conf, this.server.logger);
  }
}

interface RemoteNode {
  getCurrent: () => Promise<BlockDTO>;
  getBlock: (number: number) => Promise<BlockDTO>;
  getBlocks: (count: number, fromNumber: number) => Promise<BlockDTO[]>;
  pubkey: string;
}

class WS2PDao extends AbstractDAO {
  private node: RemoteNode;
  private lastDownloaded: BlockDTO | null;
  private nodeCurrent: BlockDTO | null = null;
  public newCurrent: BlockDTO | null = null;

  constructor(private server: Server, private requester: WS2PRequester) {
    super();
    this.node = {
      getCurrent: async () => {
        return this.requester.getCurrent();
      },
      getBlock: async (number: number) => {
        return this.requester.getBlock(number);
      },
      getBlocks: async (count: number, fromNumber: number) => {
        return this.requester.getBlocks(count, fromNumber);
      },
      pubkey: this.requester.getPubkey(),
    };
  }

  async localCurrent(): Promise<DBBlock | null> {
    return this.server.dal.getCurrentBlockOrNull();
  }

  async remoteCurrent(source: RemoteNode): Promise<BlockDTO | null> {
    this.nodeCurrent = await source.getCurrent();
    return this.nodeCurrent;
  }

  async remotePeers(source?: any): Promise<PeerDTO[]> {
    const peer: any = this.node;
    return Promise.resolve([peer]);
  }

  async getLocalBlock(number: number): Promise<DBBlock> {
    return this.server.dal.getBlockWeHaveItForSure(number);
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
    const existing = await this.server.dal.getAbsoluteBlockByNumberAndHash(
      block.number,
      block.hash
    );
    if (!existing) {
      let addedBlock = await this.server.writeBlock(block, false, true);
      if (!this.lastDownloaded) {
        this.lastDownloaded = await this.remoteCurrent(this.node);
      }
      this.server.pullingEvent("applying", {
        number: block.number,
        last: this.lastDownloaded && this.lastDownloaded.number,
      });
      if (addedBlock) {
        this.newCurrent = addedBlock;
        // Emit block events (for sharing with the network) only in forkWindowSize
        if (
          this.nodeCurrent &&
          this.nodeCurrent.number - addedBlock.number <
            this.server.conf.forksize
        ) {
          this.server.streamPush(addedBlock);
        }
      }
    }
    return true;
  }

  async removeForks(): Promise<boolean> {
    return true;
  }

  async isMemberPeer(thePeer: PeerDTO): Promise<boolean> {
    return true;
  }

  async downloadBlocks(
    thePeer: any,
    fromNumber: number,
    count?: number | undefined
  ): Promise<BlockDTO[]> {
    if (!count) {
      count = CrawlerConstants.CRAWL_BLOCK_CHUNK;
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
}
