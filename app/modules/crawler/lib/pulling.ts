"use strict";
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {DBBlock} from "../../../lib/db/DBBlock"
import {PeerDTO} from "../../../lib/dto/PeerDTO"
import {BranchingDTO, ConfDTO} from "../../../lib/dto/ConfDTO"

const _ = require('underscore');

export abstract class PullingDao {
  abstract applyBranch(blocks:BlockDTO[]): Promise<boolean>
  abstract localCurrent(): Promise<DBBlock|null>
  abstract remoteCurrent(source?:any): Promise<BlockDTO|null>
  abstract remotePeers(source?:any): Promise<PeerDTO[]>
  abstract getLocalBlock(number:number): Promise<DBBlock>
  abstract getRemoteBlock(thePeer:PeerDTO, number:number): Promise<BlockDTO>
  abstract applyMainBranch(block:BlockDTO): Promise<boolean>
  abstract removeForks(): Promise<boolean>
  abstract isMemberPeer(thePeer:PeerDTO): Promise<boolean>
  abstract downloadBlocks(thePeer:PeerDTO, fromNumber:number, count?:number): Promise<BlockDTO[]>
}

export abstract class AbstractDAO extends PullingDao {

  /**
   * Sugar function. Apply a bunch of blocks instead of one.
   * @param blocks
   */
  async applyBranch (blocks:BlockDTO[]) {
    for (const block of blocks) {
      await this.applyMainBranch(block);
    }
    return true;
  }

  /**
   * Binary search algorithm to find the common root block between a local and a remote blockchain.
   * @param fork An object containing a peer, its current block and top fork block
   * @param forksize The maximum length we can look at to find common root block.
   * @returns {*|Promise}
   */
  async findCommonRoot(fork:any, forksize:number) {
    let commonRoot = null;
    let localCurrent = await this.localCurrent();

    if (!localCurrent) {
      throw Error('Local blockchain is empty, cannot find a common root')
    }

    // We look between the top block that is known as fork ...
    let topBlock = fork.block;
    // ... and the bottom which is bounded by `forksize`
    let bottomBlock = await this.getRemoteBlock(fork.peer, Math.max(0, localCurrent.number - forksize));
    let lookBlock = bottomBlock;
    let localEquivalent = await this.getLocalBlock(bottomBlock.number);
    let isCommonBlock = lookBlock.hash == localEquivalent.hash;
    if (isCommonBlock) {

      // Then common root can be found between top and bottom. We process.
      let position = -1, wrongRemotechain = false;
      do {

        isCommonBlock = lookBlock.hash == localEquivalent.hash;
        if (!isCommonBlock) {

          // Too high, look downward
          topBlock = lookBlock;
          position = middle(topBlock.number, bottomBlock.number);
        }
        else {
          let upperBlock = await this.getRemoteBlock(fork.peer, lookBlock.number + 1);
          let localUpper = await this.getLocalBlock(upperBlock.number);
          let isCommonUpper = upperBlock.hash == localUpper.hash;
          if (isCommonUpper) {

            // Too low, look upward
            bottomBlock = lookBlock;
            position = middle(topBlock.number, bottomBlock.number);
          }
          else {

            // Spotted!
            commonRoot = lookBlock;
          }
        }

        let noSpace = topBlock.number == bottomBlock.number + 1;
        if (!commonRoot && noSpace) {
          // Remote node have inconsistency blockchain, stop search
          wrongRemotechain = true;
        }

        if (!wrongRemotechain) {
          lookBlock = await this.getRemoteBlock(fork.peer, position);
          localEquivalent = await this.getLocalBlock(position);
        }
      } while (!commonRoot && !wrongRemotechain);
    }
    // Otherwise common root is unreachable

    return commonRoot;
  }

  static defaultLocalBlock() {
    const localCurrent = new DBBlock()
    localCurrent.number = -1
    return localCurrent
  }

  /**
   * Pull algorithm. Look at given peers' blockchain and try to pull blocks from it.
   * May lead local blockchain to fork.
   * @param conf The local node configuration
   * @param dao An abstract layer to retrieve peers data (blocks).
   * @param logger Logger of the main application.
   */
  async pull(conf:BranchingDTO, logger:any) {
    let localCurrent:DBBlock = await this.localCurrent() || AbstractDAO.defaultLocalBlock()
    const forks:any = [];

    if (!localCurrent) {
      localCurrent = new DBBlock()
      localCurrent.number = -1
    }

    const applyCoroutine = async (peer:PeerDTO, blocks:BlockDTO[]) => {
      if (blocks.length > 0) {
        let isFork = localCurrent
          && !(blocks[0].previousHash == localCurrent.hash
          && blocks[0].number == localCurrent.number + 1);
        if (!isFork) {
          await this.applyBranch(blocks);
          const newLocalCurrent = await this.localCurrent()
          localCurrent = newLocalCurrent || AbstractDAO.defaultLocalBlock()
          const appliedSuccessfully = localCurrent.number == blocks[blocks.length - 1].number
            && localCurrent.hash == blocks[blocks.length - 1].hash;
          return appliedSuccessfully;
        } else {
          let remoteCurrent = await this.remoteCurrent(peer);
          forks.push({
            peer: peer,
            block: blocks[0],
            current: remoteCurrent
          });
          return false;
        }
      }
      return true;
    }

    const downloadCoroutine = async (peer:any, number:number) => {
      return await this.downloadBlocks(peer, number);
    }

    const downloadChuncks = async (peer:PeerDTO) => {
      let blocksToApply:BlockDTO[] = [];
      const currentBlock = await this.localCurrent();
      let currentChunckStart;
      if (currentBlock) {
        currentChunckStart = currentBlock.number + 1;
      } else {
        currentChunckStart = 0;
      }
      let res:any = { applied: {}, downloaded: [] }
      do {
        let [ applied, downloaded ] = await Promise.all([
          applyCoroutine(peer, blocksToApply),
          downloadCoroutine(peer, currentChunckStart)
        ])
        res.applied = applied
        res.downloaded = downloaded
        blocksToApply = downloaded;
        currentChunckStart += downloaded.length;
        if (!applied) {
          logger && logger.info("Blocks were not applied.")
        }
      } while (res.downloaded.length > 0 && res.applied);
    }

    let peers = await this.remotePeers();
    // Try to get new legit blocks for local blockchain
    const downloadChuncksTasks = [];
    for (const peer of peers) {
      downloadChuncksTasks.push(downloadChuncks(peer));
    }
    await Promise.all(downloadChuncksTasks)
    // Filter forks: do not include mirror peers (non-member peers)
    let memberForks = [];
    for (const fork of forks) {
      let isMember = await this.isMemberPeer(fork.peer);
      if (isMember) {
        memberForks.push(fork);
      }
    }
    memberForks = memberForks.sort((f1, f2) => {
      let result = compare(f1, f2, "number");
      if (result == 0) {
        result = compare(f1, f2, "medianTime");
      }
      return result;
    });
    memberForks = _.filter(memberForks, (fork:any) => {
      let blockDistanceInBlocks = (fork.current.number - localCurrent.number)
      let timeDistanceInBlocks = (fork.current.medianTime - localCurrent.medianTime) / conf.avgGenTime
      const requiredTimeAdvance = conf.switchOnHeadAdvance
      logger && logger.debug('Fork of %s has blockDistance %s ; timeDistance %s ; required is >= %s for both values to try to follow the fork', fork.peer.pubkey.substr(0, 6), blockDistanceInBlocks.toFixed(2), timeDistanceInBlocks.toFixed(2), requiredTimeAdvance);
      return blockDistanceInBlocks >= requiredTimeAdvance
        && timeDistanceInBlocks >= requiredTimeAdvance
    });
    // Remove any previous fork block
    await this.removeForks();
    // Find the common root block
    let j = 0, successFork = false;
    while (!successFork && j < memberForks.length) {
      let fork = memberForks[j];
      let commonRootBlock = await this.findCommonRoot(fork, conf.forksize);
      if (commonRootBlock) {
        let blocksToApply = await this.downloadBlocks(fork.peer, commonRootBlock.number + 1, conf.forksize);
        successFork = await this.applyBranch(blocksToApply);
      } else {
        logger && logger.debug('No common root block with peer %s', fork.peer.pubkey.substr(0, 6));
      }
      j++;
    }
    return this.localCurrent();
  }
}

function compare(f1:any, f2:any, field:string) {
  if (f1[field] > f2[field]) {
    return 1;
  }
  if (f1[field] < f2[field]) {
    return -1;
  }
  return 0;
}

function middle(top:number, bottom:number) {
  let difference = top - bottom;
  if (difference % 2 == 1) {
    // We look one step below to not forget any block
    difference++;
  }
  return bottom + (difference / 2);
}
