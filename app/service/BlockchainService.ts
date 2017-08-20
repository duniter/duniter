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
import {parsers} from "../lib/common-libs/parsers/index"
import {HttpIdentityRequirement} from "../modules/bma/lib/dtos"
import {FIFOService} from "./FIFOService"
import {CommonConstants} from "../lib/common-libs/constants"
import {LOCAL_RULES_FUNCTIONS} from "../lib/rules/local_rules"
import {Switcher, SwitcherDao} from "../lib/blockchain/Switcher"
import {OtherConstants} from "../lib/other_constants"

const _               = require('underscore');
const constants       = require('../lib/constants');

export class BlockchainService extends FIFOService {

  mainContext:BlockchainContext
  conf:ConfDTO
  dal:FileDAL
  logger:any
  selfPubkey:string
  quickSynchronizer:QuickSynchronizer
  switcherDao:SwitcherDao<BlockDTO>

  constructor(private server:any, fifoPromiseHandler:GlobalFifoPromise) {
    super(fifoPromiseHandler)
    this.mainContext = new BlockchainContext()
    this.switcherDao = new (class ForkDao implements SwitcherDao<BlockDTO> {

      constructor(private bcService:BlockchainService) {}

      getCurrent(): Promise<BlockDTO> {
        return this.bcService.current()
      }

      async getPotentials(numberStart: number, timeStart: number): Promise<BlockDTO[]> {
        const blocks = await this.bcService.dal.getPotentialForkBlocks(numberStart, timeStart)
        return blocks.map((b:any) => BlockDTO.fromJSONObject(b))
      }

      async getBlockchainBlock(number: number, hash: string): Promise<BlockDTO | null> {
        try {
          return BlockDTO.fromJSONObject(await this.bcService.dal.getBlockByNumberAndHash(number, hash))
        } catch (e) {
          return null
        }
      }

      async getSandboxBlock(number: number, hash: string): Promise<BlockDTO | null> {
        const block = await this.bcService.dal.getAbsoluteBlockByNumberAndHash(number, hash)
        if (block && block.fork) {
          return BlockDTO.fromJSONObject(block)
        } else {
          return null
        }
      }

      async revertTo(number: number): Promise<BlockDTO[]> {
        const blocks:BlockDTO[] = []
        const current = await this.bcService.current();
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
        return await this.bcService.mainContext.checkAndAddBlock(block)
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

  checkBlock(block:any, withPoWAndSignature = true) {
    const dto = BlockDTO.fromJSONObject(block)
    return this.mainContext.checkBlock(dto, withPoWAndSignature)
  }

  async branches() {
    const current = await this.current()
    const switcher = new Switcher(this.switcherDao, this.conf.avgGenTime, this.conf.forksize, this.conf.switchOnHeadAdvance, this.logger)
    const heads = await switcher.findPotentialSuitesHeads(current)
    return heads.concat([current])
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
      const absolute = await this.dal.getAbsoluteBlockByNumberAndHash(obj.number, obj.hash)
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
              const current = this.current()
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

  async blockResolution() {
    let added = true
    while (added) {
      const current = await this.current()
      let potentials = []
      if (current) {
        potentials = await this.dal.getForkBlocksFollowing(current)
        this.logger.info('Block resolution: %s potential blocks after current#%s...', potentials.length, current.number)
      } else {
        potentials = await this.dal.getPotentialRootBlocks()
        this.logger.info('Block resolution: %s potential blocks for root block...', potentials.length)
      }
      added = false
      let i = 0
      while (!added && i < potentials.length) {
        const dto = BlockDTO.fromJSONObject(potentials[i])
        try {
          await this.mainContext.checkAndAddBlock(dto)
          added = true
          this.push({
            bcEvent: OtherConstants.BC_EVENT.HEAD_CHANGED,
            block: dto
          })
        } catch (e) {
          this.logger.error(e)
          added = false
          this.push({
            blockResolutionError: e && e.message
          })
        }
        i++
      }
    }
  }

  async forkResolution() {
    const switcher = new Switcher(this.switcherDao, this.conf.avgGenTime, this.conf.forksize, this.conf.switchOnHeadAdvance, this.logger)
    const newCurrent = await switcher.tryToFork()
    if (newCurrent) {
      this.push({
        bcEvent: OtherConstants.BC_EVENT.SWITCHED,
        block: newCurrent
      })
    }
  }

  revertCurrentBlock() {
    return this.pushFIFO("revertCurrentBlock", () => this.mainContext.revertCurrentBlock())
  }
  

  applyNextAvailableFork() {
    return this.pushFIFO("applyNextAvailableFork", () => this.mainContext.applyNextAvailableFork())
  }
  

  async requirementsOfIdentities(identities:DBIdentity[], computeDistance = true) {
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

  async requirementsOfIdentity(idty:DBIdentity, current:DBBlock, computeDistance = true): Promise<HttpIdentityRequirement> {
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
      if (computeDistance) {
        outdistanced = await GLOBAL_RULES_HELPERS.isOver3Hops(pubkey, newLinks, someNewcomers, current, this.conf, this.dal);
      }
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
