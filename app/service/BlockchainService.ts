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

import {IdentityForRequirements} from './BlockchainService';
import {Server} from "../../server"
import {GlobalFifoPromise} from "./GlobalFifoPromise"
import {BlockchainContext} from "../lib/computation/BlockchainContext"
import {ConfDTO} from "../lib/dto/ConfDTO"
import {FileDAL} from "../lib/dal/fileDAL"
import {BlockDTO} from "../lib/dto/BlockDTO"
import {DBBlock} from "../lib/db/DBBlock"
import {GLOBAL_RULES_HELPERS} from "../lib/rules/global_rules"
import {parsers} from "../lib/common-libs/parsers/index"
import {HttpIdentityRequirement} from "../modules/bma/lib/dtos"
import {FIFOService} from "./FIFOService"
import {CommonConstants} from "../lib/common-libs/constants"
import {LOCAL_RULES_FUNCTIONS} from "../lib/rules/local_rules"
import {Switcher, SwitcherDao} from "../lib/blockchain/Switcher"
import {OtherConstants} from "../lib/other_constants"
import {DataErrors} from "../lib/common-libs/errors"
import {DuniterBlockchain} from "../lib/blockchain/DuniterBlockchain"

const constants       = require('../lib/constants');

export interface IdentityForRequirements {
  hash:string
  member:boolean
  wasMember:boolean
  pubkey:string
  uid:string
  buid:string
  sig:string
  revocation_sig:string|null
  revoked:boolean
  revoked_on:number
}

export interface ValidCert {
  from:string
  to:string
  sig:string
  timestamp:number
  expiresIn:number
}

export class BlockchainService extends FIFOService {

  mainContext:BlockchainContext
  conf:ConfDTO
  dal:FileDAL
  logger:any
  selfPubkey:string
  switcherDao:SwitcherDao<BlockDTO>
  invalidForks:string[] = []

  constructor(private server:Server, fifoPromiseHandler:GlobalFifoPromise) {
    super(fifoPromiseHandler)
    this.mainContext = new BlockchainContext()
    this.switcherDao = new (class ForkDao implements SwitcherDao<BlockDTO> {

      constructor(private bcService:BlockchainService) {}

      async getCurrent(): Promise<BlockDTO|null> {
        const current = await this.bcService.current()
        if (!current) {
          return null
        }
        return BlockDTO.fromJSONObject(current)
      }

      async getPotentials(numberStart: number, timeStart: number, maxNumber:number): Promise<BlockDTO[]> {
        const blocks = await this.bcService.dal.getPotentialForkBlocks(numberStart, timeStart, maxNumber)
        return blocks.map((b:any) => BlockDTO.fromJSONObject(b))
      }

      async getBlockchainBlock(number: number, hash: string): Promise<BlockDTO | null> {
        const b = await this.bcService.dal.getAbsoluteValidBlockInForkWindow(number, hash)
        if (!b) return null
        return BlockDTO.fromJSONObject(b)
      }

      async getAbsoluteBlockInForkWindow(number: number, hash: string): Promise<BlockDTO | null> {
        const block = await this.bcService.dal.getAbsoluteBlockInForkWindow(number, hash)
        if (block) {
          return BlockDTO.fromJSONObject(block)
        } else {
          return null
        }
      }

      async revertTo(number: number): Promise<BlockDTO[]> {
        const blocks:BlockDTO[] = []
        const current = await this.bcService.current();
        if (!current) {
          throw Error(DataErrors[DataErrors.CANNOT_REVERT_NO_CURRENT_BLOCK])
        }
        for (let i = 0, count = current.number - number; i < count; i++) {
          const reverted = await this.bcService.mainContext.revertCurrentBlock()
          blocks.push(BlockDTO.fromJSONObject(reverted))
        }
        if (current.number < number) {
          throw "Already below this number"
        }
        return blocks
      }

      async addBlock(block: BlockDTO): Promise<BlockDTO> {
        return await this.bcService.mainContext.checkAndAddBlock(block, false)
      }

    })(this)
  }

  /**
   * Mandatory with stream.Readable
   * @private
   */
  _read() {}

  getContext() {
    return this.mainContext
  }

  setConfDAL(newConf:ConfDTO, newDAL:FileDAL, newKeyPair:any) {
    this.dal = newDAL;
    this.conf = newConf;
    this.logger = require('../lib/logger').NewLogger(this.dal.profile)
    this.mainContext.setConfDAL(this.conf, this.dal)
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

  checkBlock(block:any, withPoWAndSignature = true) {
    const dto = BlockDTO.fromJSONObject(block)
    return this.mainContext.checkBlock(dto, withPoWAndSignature)
  }

  /**
   * Return the potential HEADs we could fork to (necessarily above us, since we don't fork on older branches).
   * @returns {Promise<any>}
   */
  async branches() {
    const current = await this.current()
    if (!current) {
      throw Error(DataErrors[DataErrors.CANNOT_REVERT_NO_CURRENT_BLOCK])
    }
    const switcher = new Switcher(this.switcherDao, this.invalidForks, this.conf.avgGenTime, this.conf.forksize, this.conf.switchOnHeadAdvance, this.logger)
    const heads = await switcher.findPotentialSuitesHeads(current)
    return heads.concat([BlockDTO.fromJSONObject(current)])
  }

  submitBlock(blockToAdd:any, noResolution = false): Promise<BlockDTO> {
    const obj = parsers.parseBlock.syncWrite(BlockDTO.fromJSONObject(blockToAdd).getRawSigned())
    const dto = BlockDTO.fromJSONObject(obj)
    const hash = dto.getHash()
    return this.pushFIFO(hash, async () => {
      // Check basic fields:
      // * currency relatively to conf
      if (this.conf && this.conf.currency && this.conf.currency !== dto.currency) {
        throw CommonConstants.ERRORS.WRONG_CURRENCY
      }
      // * hash relatively to powMin
      if (!LOCAL_RULES_FUNCTIONS.isProofOfWorkCorrect(dto)) {
        throw CommonConstants.ERRORS.WRONG_POW
      }
      // * number relatively to fork window and current block
      if (this.conf && this.conf.forksize !== undefined) {
        const current = await this.current()
        if (current && dto.number < current.number - this.conf.forksize) {
          throw CommonConstants.ERRORS.OUT_OF_FORK_WINDOW
        }
      }
      const absolute = await this.dal.existsAbsoluteBlockInForkWindow(parseInt(obj.number), obj.hash)
      if (!absolute) {
        // Save the block in the sandbox
        await this.mainContext.addSideBlock(dto);
        // Trigger the save + block resolution in an async way: this allows to answer immediately that the submission
        // was accepted, and that the document can be rerouted and is under treatment.
        // This will enhence the block propagation on the network, thus will avoid potential forks to emerge.
        if (!noResolution) {
          (() => {
            return this.pushFIFO('resolution_' + dto.getHash(), async () => {
              // Resolve the potential new HEAD
              await this.blockResolution()
              // Resolve the potential forks
              await this.forkResolution()
              const current = await this.current()
              this.push({
                bcEvent: OtherConstants.BC_EVENT.RESOLUTION_DONE,
                block: current
              })
            })
          })()
        }
      } else {
        throw "Block already known"
      }
      return dto
    })
  }

  async blockResolution(filterFunc: (b: DBBlock) => boolean = () => true): Promise<BlockDTO|null> {
    let lastAdded:BlockDTO|null = null
    let added:BlockDTO|null
    let nbAdded = 0
    do {
      const current = await this.current()
      let potentials = []
      if (current) {
        potentials = (await this.dal.getForkBlocksFollowing(current)).filter(filterFunc)
        this.logger.info('Block resolution: %s potential blocks after current#%s...', potentials.length, current.number)
      } else {
        potentials = (await this.dal.getPotentialRootBlocks()).filter(filterFunc)
        this.logger.info('Block resolution: %s potential blocks for root block...', potentials.length)
      }
      added = null
      let i = 0
      while (!added && i < potentials.length) {
        const dto = BlockDTO.fromJSONObject(potentials[i])
        try {
          if (dto.issuer === this.conf.pair.pub) {
            for (const tx of dto.transactions) {
              await this.dal.removeTxByHash(tx.hash);
            }
          }
          lastAdded = added = await this.mainContext.checkAndAddBlock(dto)
          this.push({
            bcEvent: OtherConstants.BC_EVENT.HEAD_CHANGED,
            block: added
          })
          nbAdded++
          // Clear invalid forks' cache
          this.invalidForks.splice(0, this.invalidForks.length)
        } catch (e) {
          this.logger.error(e)
          added = null
          const theError = e && (e.message || e)
          this.push({
            blockResolutionError: theError
          })
        }
        i++
      }
    } while (added)
    return lastAdded
  }

  async forkResolution() {
    const switcher = new Switcher(this.switcherDao, this.invalidForks, this.conf.avgGenTime, this.conf.forksize, this.conf.switchOnHeadAdvance, this.logger)
    const newCurrent = await switcher.tryToFork()
    if (newCurrent) {
      this.push({
        bcEvent: OtherConstants.BC_EVENT.SWITCHED,
        block: newCurrent
      })
    }
    return newCurrent
  }

  revertCurrentBlock() {
    return this.pushFIFO("revertCurrentBlock", () => this.mainContext.revertCurrentBlock())
  }

  revertCurrentHead() {
    return this.pushFIFO("revertCurrentHead", () => this.mainContext.revertCurrentHead())
  }
  

  applyNextAvailableFork() {
    return this.pushFIFO("applyNextAvailableFork", () => this.mainContext.applyNextAvailableFork())
  }
  

  async requirementsOfIdentities(identities:IdentityForRequirements[], computeDistance = true) {
    let all:HttpIdentityRequirement[] = [];
    let current = await this.dal.getCurrentBlockOrNull();
    for (const obj of identities) {
      try {
        let reqs = await this.requirementsOfIdentity(obj, current, computeDistance);
        all.push(reqs);
      } catch (e) {
        this.logger.warn(e);
      }
    }
    return all;
  }

  async requirementsOfIdentity(idty:IdentityForRequirements, current:DBBlock|null, computeDistance = true): Promise<HttpIdentityRequirement> {
    // TODO: this is not clear
    let expired = false;
    let outdistanced = false;
    let isSentry = false;
    let wasMember = false;
    let expiresMS = 0;
    let expiresPending = 0;
    let certs:ValidCert[] = [];
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
      certs = await this.getValidCerts(pubkey, newCerts, currentTime);
      if (computeDistance) {
        outdistanced = await GLOBAL_RULES_HELPERS.isOver3Hops(pubkey, newLinks, someNewcomers, current, this.conf, this.dal);
      }
      // Expiration of current membershship
      const currentMembership = await this.dal.mindexDAL.getReducedMSForImplicitRevocation(pubkey);
      const currentMSN = currentMembership ? parseInt(currentMembership.created_on) : -1;
      if (currentMSN >= 0) {
        if (join.identity.member) {
          const msBlock = await this.dal.getTristampOf(currentMSN)
          if (msBlock) { // special case for block #0
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
        const msBlock = await this.dal.getTristampOf(lastJoin.blockNumber)
        if (msBlock) { // Special case for block#0
          expiresPending = Math.max(0, (msBlock.medianTime + this.conf.msValidity - currentTime));
        }
        else {
          expiresPending = this.conf.msValidity;
        }
      }
      wasMember = idty.wasMember;
      isSentry = idty.member && (await this.dal.isSentry(idty.pubkey, this.conf));
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

  async getValidCerts(newcomer:string, newCerts:any, currentTime:number): Promise<ValidCert[]> {
    const links = await this.dal.getValidLinksTo(newcomer);
    const certsFromLinks = links.map((lnk:any) => { return {
        from: lnk.issuer,
        to: lnk.receiver,
        sig: lnk.sig,
        timestamp: lnk.expires_on - this.conf.sigValidity,
        expiresIn: 0
      }
    })
    const certsFromCerts = [];
    const certs = newCerts[newcomer] || [];
    for (const cert of certs) {
      const block = await this.dal.getTristampOf(cert.block_number)
      if (block) {
        certsFromCerts.push({
          from: cert.from,
          to: cert.to,
          sig: cert.sig,
          timestamp: block.medianTime,
          expiresIn: 0
        })
      }
    }
    return certsFromLinks.concat(certsFromCerts).map(c => {
      c.expiresIn = Math.max(0, c.timestamp + this.conf.sigValidity - currentTime)
      return c
    })
  }

  // TODO: look in archives too
  getCountOfSelfMadePoW() {
    return this.dal.getCountOfPoW(this.selfPubkey)
  }
  

  // This method is called by duniter-crawler 1.3.x
  saveParametersForRootBlock(block:BlockDTO) {
    return DuniterBlockchain.saveParametersForRoot(block, this.conf, this.dal)
  }

  async blocksBetween(from:number, count:number): Promise<DBBlock[]> {
    if (count > 5000) {
      throw 'Count is too high';
    }
    const current = await this.current()
    if (!current) {
      return []
    }
    count = Math.min(current.number - from + 1, count);
    if (!current || current.number < from) {
      return [];
    }
    return this.dal.getBlocksBetween(from, from + count - 1);
  }

  async trimIndexes() {
    const HEAD = await this.dal.getCurrentBlockOrNull()
    if (HEAD) {
      return DuniterBlockchain.trimIndexes(this.dal, HEAD, this.conf)
    }
  }
}
