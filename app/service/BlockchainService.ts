"use strict";
import {GlobalFifoPromise} from "./GlobalFifoPromise"
import {BlockchainContext} from "../lib/computation/BlockchainContext"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {FileDAL} from "../lib/dal/fileDAL"
import {QuickSynchronizer} from "../lib/computation/QuickSync"
import {BlockDTO} from "../lib/dto/BlockDTO"
import {DBIdentity} from "../lib/dal/sqliteDAL/IdentityDAL"
import {DBBlock} from "../lib/db/DBBlock"
import {GLOBAL_RULES_HELPERS} from "../lib/rules/global_rules"

const _               = require('underscore');
const co              = require('co');
const parsers         = require('../../app/common').parsers;
const constants       = require('../lib/constants');

const CHECK_ALL_RULES = true;

export class BlockchainService {

  mainContext:BlockchainContext
  conf:ConfDTO
  dal:FileDAL
  logger:any
  selfPubkey:string
  quickSynchronizer:QuickSynchronizer

  constructor(private server:any) {
    this.mainContext = new BlockchainContext()
  }

  getContext() {
    return this.mainContext
  }
  

  setConfDAL(newConf:ConfDTO, newDAL:FileDAL, newKeyPair:any) {
    this.dal = newDAL;
    this.conf = newConf;
    this.logger = require('../lib/logger').NewLogger(this.dal.profile)
    this.quickSynchronizer = new QuickSynchronizer(this.server.blockchain, this.conf, this.dal, this.logger)
    this.mainContext.setConfDAL(this.conf, this.dal, this.server.blockchain, this.quickSynchronizer)
    this.selfPubkey = newKeyPair.publicKey;
  }

  current() {
    return this.dal.getCurrentBlockOrNull()
  }
  

  async promoted(number:number) {
    const bb = await this.dal.getPromoted(number);
    if (!bb) throw constants.ERRORS.BLOCK_NOT_FOUND;
    return bb;
  }

  checkBlock(block:any) {
    const dto = BlockDTO.fromJSONObject(block)
    return this.mainContext.checkBlock(dto);
  }

  async branches() {
    let forkBlocks = await this.dal.blockDAL.getForkBlocks();
    forkBlocks = _.sortBy(forkBlocks, 'number');
    // Get the blocks refering current blockchain
    const forkables = [];
    for (const block of forkBlocks) {
      const refered = await this.dal.getBlockByNumberAndHashOrNull(block.number - 1, block.previousHash);
      if (refered) {
        forkables.push(block);
      }
    }
    const branches = this.getBranches(forkables, _.difference(forkBlocks, forkables));
    const current = await this.mainContext.current();
    const forks = branches.map((branch) => branch[branch.length - 1]);
    return forks.concat([current]);
  }

  private getBranches(forkables:any[], others:any[]) {
    // All starting branches
    let branches = forkables.map((fork) => [fork]);
    // For each "pending" block, we try to add it to all branches
    for (const other of others) {
      for (let j = 0, len2 = branches.length; j < len2; j++) {
        const branch = branches[j];
        const last = branch[branch.length - 1];
        if (other.number == last.number + 1 && other.previousHash == last.hash) {
          branch.push(other);
        } else if (branch[1]) {
          // We try to find out if another fork block can be forked
          const diff = other.number - branch[0].number;
          if (diff > 0 && branch[diff - 1] && branch[diff - 1].hash == other.previousHash) {
            // We duplicate the branch, and we add the block to this second branch
            branches.push(branch.slice());
            // First we remove the blocks this are not part of the fork
            branch.splice(diff, branch.length - diff);
            branch.push(other);
            j++;
          }
        }
      }
    }
    branches = _.sortBy(branches, (branch:any) => -branch.length);
    if (branches.length) {
      const maxSize = branches[0].length;
      const longestsBranches = [];
      for (const branch of branches) {
        if (branch.length == maxSize) {
          longestsBranches.push(branch);
        }
      }
      return longestsBranches;
    }
    return [];
  }

  submitBlock(obj:any, doCheck:boolean, forkAllowed:boolean) {
    return GlobalFifoPromise.pushFIFO(() => {
      return this.checkAndAddBlock(obj, doCheck, forkAllowed)
    })
  }

  private async checkAndAddBlock(blockToAdd:any, doCheck:boolean, forkAllowed:boolean = false) {
    // Check global format, notably version number
    const obj = parsers.parseBlock.syncWrite(BlockDTO.fromJSONObject(blockToAdd).getRawSigned());
    // Force usage of local currency name, do not accept other currencies documents
    if (this.conf.currency) {
      obj.currency = this.conf.currency || obj.currency;
    } else {
      this.conf.currency = obj.currency;
    }
    let existing = await this.dal.getBlockByNumberAndHashOrNull(obj.number, obj.hash);
    if (existing) {
      throw constants.ERRORS.BLOCK_ALREADY_PROCESSED;
    }
    let current = await this.mainContext.current();
    let followsCurrent = !current || (obj.number == current.number + 1 && obj.previousHash == current.hash);
    if (followsCurrent) {
      // try to add it on main blockchain
      const dto = BlockDTO.fromJSONObject(obj)
      if (doCheck) {
        const { index, HEAD } = await this.mainContext.checkBlock(dto, constants.WITH_SIGNATURES_AND_POW);
        return await this.mainContext.addBlock(dto, index, HEAD)
      } else {
        return await this.mainContext.addBlock(dto)
      }
    } else if (forkAllowed) {
      // add it as side chain
      if (current.number - obj.number + 1 >= this.conf.forksize) {
        throw 'Block out of fork window';
      }
      let absolute = await this.dal.getAbsoluteBlockByNumberAndHash(obj.number, obj.hash)
      let res = null;
      if (!absolute) {
        res = await this.mainContext.addSideBlock(obj)
      }
      await this.tryToFork(current);
      return res;
    } else {
      throw "Fork block rejected by " + this.selfPubkey;
    }
  }


  tryToFork(current:DBBlock) {
    return this.eventuallySwitchOnSideChain(current)
  }

  private async eventuallySwitchOnSideChain(current:DBBlock) {
    const branches = await this.branches()
    const blocksAdvance = this.conf.swichOnTimeAheadBy / (this.conf.avgGenTime / 60);
    const timeAdvance = this.conf.swichOnTimeAheadBy * 60;
    let potentials = _.without(branches, current);
    // We switch only to blockchain with X_MIN advance considering both theoretical time by block + written time
    potentials = _.filter(potentials, (p:DBBlock) => p.number - current.number >= blocksAdvance
                                  && p.medianTime - current.medianTime >= timeAdvance);
    this.logger.trace('SWITCH: %s branches...', branches.length);
    this.logger.trace('SWITCH: %s potential side chains...', potentials.length);
    for (const potential of potentials) {
      this.logger.info('SWITCH: get side chain #%s-%s...', potential.number, potential.hash);
      const sideChain = await this.getWholeForkBranch(potential)
      this.logger.info('SWITCH: revert main chain to block #%s...', sideChain[0].number - 1);
      await this.revertToBlock(sideChain[0].number - 1)
      try {
        this.logger.info('SWITCH: apply side chain #%s-%s...', potential.number, potential.hash);
        await this.applySideChain(sideChain)
      } catch (e) {
        this.logger.warn('SWITCH: error %s', e.stack || e);
        // Revert the revert (so we go back to original chain)
        const revertedChain = await this.getWholeForkBranch(current)
        await this.revertToBlock(revertedChain[0].number - 1)
        await this.applySideChain(revertedChain)
        await this.markSideChainAsWrong(sideChain)
      }
    }
  }

  private async getWholeForkBranch(topForkBlock:DBBlock) {
    const fullBranch = [];
    let isForkBlock = true;
    let next = topForkBlock;
    while (isForkBlock) {
      fullBranch.push(next);
      this.logger.trace('SWITCH: get absolute #%s-%s...', next.number - 1, next.previousHash);
      next = await this.dal.getAbsoluteBlockByNumberAndHash(next.number - 1, next.previousHash);
      isForkBlock = next.fork;
    }
    //fullBranch.push(next);
    // Revert order so we have a crescending branch
    return fullBranch.reverse();
  }

  private async revertToBlock(number:number) {
    let nowCurrent = await this.current();
    this.logger.trace('SWITCH: main chain current = #%s-%s...', nowCurrent.number, nowCurrent.hash);
    while (nowCurrent.number > number) {
      this.logger.trace('SWITCH: main chain revert #%s-%s...', nowCurrent.number, nowCurrent.hash);
      await this.mainContext.revertCurrentBlock();
      nowCurrent = await this.current();
    }
  }

  private async applySideChain(chain:DBBlock[]) {
    for (const block of chain) {
      this.logger.trace('SWITCH: apply side block #%s-%s -> #%s-%s...', block.number, block.hash, block.number - 1, block.previousHash);
      await this.checkAndAddBlock(block, CHECK_ALL_RULES);
    }
  }

  private async markSideChainAsWrong(chain:DBBlock[]) {
    for (const block of chain) {
      block.wrong = true;
      // Saves the block (DAL)
      await this.dal.saveSideBlockInFile(block);
    }
  }

  revertCurrentBlock() {
    return GlobalFifoPromise.pushFIFO(() => this.mainContext.revertCurrentBlock())
  }
  

  applyNextAvailableFork() {
    return GlobalFifoPromise.pushFIFO(() => this.mainContext.applyNextAvailableFork())
  }
  

  async requirementsOfIdentities(identities:DBIdentity[]) {
    let all = [];
    let current = await this.dal.getCurrentBlockOrNull();
    for (const obj of identities) {
      try {
        let reqs = await this.requirementsOfIdentity(obj, current);
        all.push(reqs);
      } catch (e) {
        this.logger.warn(e);
      }
    }
    return all;
  }

  async requirementsOfIdentity(idty:DBIdentity, current:DBBlock) {
    // TODO: this is not clear
    let expired = false;
    let outdistanced = false;
    let isSentry = false;
    let wasMember = false;
    let expiresMS = 0;
    let expiresPending = 0;
    let certs = [];
    let certsPending = [];
    let mssPending = [];
    try {
      const join = await this.server.generatorGetJoinData(current, idty.hash, 'a');
      const pubkey = join.identity.pubkey;
      // Check WoT stability
      const someNewcomers = join.identity.wasMember ? [] : [join.identity.pubkey];
      const nextBlockNumber = current ? current.number + 1 : 0;
      const joinData:any = {};
      joinData[join.identity.pubkey] = join;
      const updates = {};
      certsPending = await this.dal.certDAL.getToTarget(idty.hash);
      certsPending = certsPending.map((c:any) => {
        c.blockstamp = [c.block_number, c.block_hash].join('-')
        return c
      });
      mssPending = await this.dal.msDAL.getPendingINOfTarget(idty.hash)
      mssPending = mssPending.map((ms:any) => {
        ms.blockstamp = ms.block
        ms.sig = ms.signature
        ms.type = ms.membership
        return ms
      });
      const newCerts = await this.server.generatorComputeNewCerts(nextBlockNumber, [join.identity.pubkey], joinData, updates);
      const newLinks = await this.server.generatorNewCertsToLinks(newCerts, updates);
      const currentTime = current ? current.medianTime : 0;
      certs = await this.getValidCerts(pubkey, newCerts);
      outdistanced = await GLOBAL_RULES_HELPERS.isOver3Hops(pubkey, newLinks, someNewcomers, current, this.conf, this.dal);
      // Expiration of current membershship
      const currentMembership = await this.dal.mindexDAL.getReducedMS(pubkey);
      const currentMSN = currentMembership ? parseInt(currentMembership.created_on) : -1;
      if (currentMSN >= 0) {
        if (join.identity.member) {
          const msBlock = await this.dal.getBlock(currentMSN);
          if (msBlock && msBlock.medianTime) { // special case for block #0
            expiresMS = Math.max(0, (msBlock.medianTime + this.conf.msValidity - currentTime));
          }
          else {
            expiresMS = this.conf.msValidity;
          }
        } else {
          expiresMS = 0;
        }
      }
      // Expiration of pending membership
      const lastJoin = await this.dal.lastJoinOfIdentity(idty.hash);
      if (lastJoin) {
        const msBlock = await this.dal.getBlock(lastJoin.blockNumber);
        if (msBlock && msBlock.medianTime) { // Special case for block#0
          expiresPending = Math.max(0, (msBlock.medianTime + this.conf.msValidity - currentTime));
        }
        else {
          expiresPending = this.conf.msValidity;
        }
      }
      wasMember = idty.wasMember;
      isSentry = idty.member && (await this.dal.isSentry(idty.pubkey, this.conf));
      // Expiration of certifications
      for (const cert of certs) {
        cert.expiresIn = Math.max(0, cert.timestamp + this.conf.sigValidity - currentTime);
      }
    } catch (e) {
      // We throw whatever isn't "Too old identity" error
      if (!(e && e.uerr && e.uerr.ucode == constants.ERRORS.TOO_OLD_IDENTITY.uerr.ucode)) {
        throw e;
      } else {
        expired = true;
      }
    }
    return {
      pubkey: idty.pubkey,
      uid: idty.uid,
      sig: idty.sig,
      meta: {
        timestamp: idty.buid
      },
      revocation_sig: idty.revocation_sig,
      revoked: idty.revoked,
      revoked_on: idty.revoked_on,
      expired: expired,
      outdistanced: outdistanced,
      isSentry: isSentry,
      wasMember: wasMember,
      certifications: certs,
      pendingCerts: certsPending,
      pendingMemberships: mssPending,
      membershipPendingExpiresIn: expiresPending,
      membershipExpiresIn: expiresMS
    };
  }

  async getValidCerts(newcomer:string, newCerts:any) {
    const links = await this.dal.getValidLinksTo(newcomer);
    const certsFromLinks = links.map((lnk:any) => { return { from: lnk.issuer, to: lnk.receiver, timestamp: lnk.expires_on - this.conf.sigValidity }; });
    const certsFromCerts = [];
    const certs = newCerts[newcomer] || [];
    for (const cert of certs) {
      const block = await this.dal.getBlock(cert.block_number);
      certsFromCerts.push({
        from: cert.from,
        to: cert.to,
        sig: cert.sig,
        timestamp: block.medianTime
      });
    }
    return certsFromLinks.concat(certsFromCerts);
  }

  isMember() {
    return this.dal.isMember(this.selfPubkey)
  }
  
  getCountOfSelfMadePoW() {
    return this.dal.getCountOfPoW(this.selfPubkey)
  }
  

  // This method is called by duniter-crawler 1.3.x
  saveParametersForRootBlock(block:BlockDTO) {
    return this.server.blockchain.saveParametersForRoot(block, this.conf, this.dal)
  }

  async blocksBetween(from:number, count:number) {
    if (count > 5000) {
      throw 'Count is too high';
    }
    const current = await this.current()
    count = Math.min(current.number - from + 1, count);
    if (!current || current.number < from) {
      return [];
    }
    return this.dal.getBlocksBetween(from, from + count - 1);
  }

  /**
   * Allows to quickly insert a bunch of blocks. To reach such speed, this method skips global rules and buffers changes.
   *
   * **This method should be used ONLY when a node is really far away from current blockchain HEAD (i.e several hundreds of blocks late).
   *
   * This method is called by duniter-crawler 1.3.x.
   *
   * @param blocks An array of blocks to insert.
   * @param to The final block number of the fast insertion.
   */
  fastBlockInsertions(blocks:BlockDTO[], to:number | null) {
    return this.mainContext.quickApplyBlocks(blocks, to)
  }
}
