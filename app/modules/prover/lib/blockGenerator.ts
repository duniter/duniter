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

import * as moment from "moment"
import {Server} from "../../../../server"
import {BlockchainContext} from "../../../lib/computation/BlockchainContext"
import {TransactionDTO} from "../../../lib/dto/TransactionDTO"
import {GLOBAL_RULES_HELPERS} from "../../../lib/rules/global_rules"
import {LOCAL_RULES_HELPERS} from "../../../lib/rules/local_rules"
import {Indexer} from "../../../lib/indexer"
import {DBBlock} from "../../../lib/db/DBBlock"
import {verify} from "../../../lib/common-libs/crypto/keyring"
import {rawer} from "../../../lib/common-libs/index"
import {hashf} from "../../../lib/common"
import {CommonConstants} from "../../../lib/common-libs/constants"
import {IdentityDTO} from "../../../lib/dto/IdentityDTO"
import {CertificationDTO} from "../../../lib/dto/CertificationDTO"
import {MembershipDTO} from "../../../lib/dto/MembershipDTO"
import {BlockDTO} from "../../../lib/dto/BlockDTO"
import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {FileDAL} from "../../../lib/dal/fileDAL"
import {DataErrors} from "../../../lib/common-libs/errors"
import {Underscore} from "../../../lib/common-libs/underscore"
import {DBCert} from "../../../lib/dal/sqliteDAL/CertDAL"
import {Map} from "../../../lib/common-libs/crypto/map"

const inquirer        = require('inquirer');

const constants     = CommonConstants

export interface PreJoin {
  identity: {
    pubkey: string
    uid: string
    buid: string
    sig: string
    member: boolean
    wasMember: boolean
    revoked: boolean
  }
  key: null
  idHash: string
  certs: DBCert[]
  ms: any
}

interface LeaveData {
  identity: {
    member: boolean
  } | null
  ms: any
  key: any
  idHash: string
}

export class BlockGenerator {

  mainContext:BlockchainContext
  selfPubkey:string
  logger:any

  constructor(private server:Server) {
    this.mainContext = server.BlockchainService.getContext();
    this.selfPubkey = (this.conf.pair && this.conf.pair.pub) || ''
    this.logger = server.logger;
  }

  get conf(): ConfDTO {
    return this.server.conf
  }

  get dal(): FileDAL {
    return this.server.dal
  }

  nextBlock(manualValues:any = {}, simulationValues:any = {}) {
    return this.generateNextBlock(new NextBlockGenerator(this.mainContext, this.server, this.logger), manualValues, simulationValues)
  }

  async manualRoot() {
    let current = await this.dal.getCurrentBlockOrNull()
    if (current) {
      throw 'Cannot generate root block: it already exists.';
    }
    return this.generateNextBlock(new ManualRootGenerator());
  }

  /**
   * Generate next block, gathering both updates & newcomers
   */
  private async generateNextBlock(generator:BlockGeneratorInterface, manualValues:any = null, simulationValues:any = null) {
    const vHEAD_1 = await this.mainContext.getvHEAD_1()
    if (simulationValues && simulationValues.medianTime) {
      vHEAD_1.medianTime = simulationValues.medianTime
    }
    const current = await this.dal.getCurrentBlockOrNull();
    const blockVersion = (manualValues && manualValues.version) || (await LOCAL_RULES_HELPERS.getMaxPossibleVersionNumber(current, this.dal))
    const revocations = await this.dal.getRevocatingMembers();
    const exclusions = await this.dal.getToBeKickedPubkeys();
    const wereExcludeds = await this.dal.getRevokedPubkeys();
    const newCertsFromWoT = await generator.findNewCertsFromWoT(current);
    const newcomers = await this.findNewcomers(current, joinersData => generator.filterJoiners(joinersData))
    const leavers = await this.findLeavers(current)
    const transactions = await this.findTransactions(current, manualValues);
    const certifiersOfNewcomers = Underscore.uniq(Underscore.keys(newcomers).reduce((theCertifiers, newcomer:string) => {
      return theCertifiers.concat(Underscore.pluck(newcomers[newcomer].certs, 'from'));
    }, <string[]>[]))
    // Merges updates
    Underscore.keys(newCertsFromWoT).forEach(function(certified:string){
      newCertsFromWoT[certified] = newCertsFromWoT[certified].filter((cert:any) => {
        // Must not certify a newcomer, since it would mean multiple certifications at same time from one member
        const isCertifier = certifiersOfNewcomers.indexOf(cert.from) != -1;
        if (!isCertifier) {
          certifiersOfNewcomers.push(cert.from);
        }
        return !isCertifier;
      });
    });
    // Create the block
    return this.createBlock(blockVersion, current, newcomers, leavers, newCertsFromWoT, revocations, exclusions, wereExcludeds, transactions, manualValues);
  }

  private async findTransactions(current:DBBlock|null, options:{ dontCareAboutChaining?:boolean }) {
    if (!current) {
      return []
    }
    const versionMin = current ? Math.min(CommonConstants.LAST_VERSION_FOR_TX, current.version) : CommonConstants.DOCUMENTS_VERSION;
    const txs = await this.dal.getTransactionsPending(versionMin);
    const transactions = [];
    const passingTxs:any[] = [];
    const medianTime = current ? current.medianTime : 0
    for (const obj of txs) {
      obj.currency = this.conf.currency
      const tx = TransactionDTO.fromJSONObject(obj);
      try {
        await LOCAL_RULES_HELPERS.checkBunchOfTransactions(passingTxs.concat(tx), this.conf, medianTime, options)
        const nextBlockWithFakeTimeVariation = { medianTime: current.medianTime + 1 };
        await GLOBAL_RULES_HELPERS.checkSingleTransaction(tx, nextBlockWithFakeTimeVariation, this.conf, this.dal, async (txHash:string) => {
          return Underscore.findWhere(passingTxs, { hash: txHash }) || null
        });
        await GLOBAL_RULES_HELPERS.checkTxBlockStamp(tx, this.dal);
        transactions.push(tx);
        passingTxs.push(tx);
        this.logger.info('Transaction %s added to block', tx.hash);
      } catch (err) {
        this.logger.error(err);
        const currentNumber = (current && current.number) || 0;
        const blockstamp = tx.blockstamp || (currentNumber + '-');
        const txBlockNumber = parseInt(blockstamp.split('-')[0]);
        // X blocks before removing the transaction
        if (currentNumber - txBlockNumber + 1 >= CommonConstants.TRANSACTION_MAX_TRIES) {
          await this.dal.removeTxByHash(tx.hash);
        }
      }
    }
    return transactions;
  }

  private async findLeavers(current:DBBlock|null) {
    const leaveData: { [pub:string]: { identity: { member:boolean }|null, ms: any, key: any, idHash: string } } = {};
    const memberships = await this.dal.findLeavers((current && current.medianTime) || 0)
    const leavers:string[] = [];
    memberships.forEach((ms:any) => leavers.push(ms.issuer));
    for (const ms of memberships) {
      const leave: { identity: { member:boolean }|null, ms: any, key: any, idHash: string } = { identity: null, ms: ms, key: null, idHash: '' };
      leave.idHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
      let block;
      if (current) {
        block = await this.dal.getAbsoluteValidBlockInForkWindowByBlockstamp(ms.block)
      }
      else {
        block = {};
      }
      const identity = await this.dal.getGlobalIdentityByHashForIsMember(leave.idHash)
      const currentMembership = await this.dal.mindexDAL.getReducedMSForImplicitRevocation(ms.issuer);
      const currentMSN = currentMembership ? parseInt(currentMembership.created_on) : -1;
      if (identity && block && currentMSN < leave.ms.number && identity.member) {
        // MS + matching cert are found
        leave.identity = identity;
        leaveData[identity.pub] = leave;
      }
    }
    return leaveData;
  }

  private async findNewcomers(current:DBBlock|null, filteringFunc: (joinData: Map<PreJoin>) => Promise<Map<PreJoin>>) {
    const preJoinData = await this.getPreJoinData(current);
    const joinData = await filteringFunc(preJoinData);
    const members = await this.dal.getMembers();
    const wotMembers = Underscore.pluck(members, 'pubkey');
    // Checking step
    let newcomers = Underscore.keys(joinData).map(String)
    newcomers = Underscore.shuffle(newcomers)
    const nextBlockNumber = current ? current.number + 1 : 0;
    try {
      const realNewcomers = await this.iteratedChecking(newcomers, async (someNewcomers:string[]) => {
        const nextBlock = {
          number: nextBlockNumber,
          joiners: someNewcomers,
          identities: Underscore.where(newcomers.map((pub:string) => joinData[pub].identity), { wasMember: false }).map((idty:any) => idty.pubkey)
        };
        const theNewLinks = await this.computeNewLinks(nextBlockNumber, someNewcomers, joinData)
        await this.checkWoTConstraints(nextBlock, theNewLinks, current);
      })
      const newLinks = await this.computeNewLinks(nextBlockNumber, realNewcomers, joinData)
      const newWoT = wotMembers.concat(realNewcomers);
      const finalJoinData: { [pub:string]: PreJoin } = {};
      realNewcomers.forEach((newcomer:string) => {
        // Only keep membership of selected newcomers
        finalJoinData[newcomer] = joinData[newcomer];
        // Only keep certifications from final members
        const keptCerts:any[] = [];
        joinData[newcomer].certs.forEach((cert:any) => {
          const issuer = cert.from;
          if (~newWoT.indexOf(issuer) && ~newLinks[cert.to].indexOf(issuer)) {
            keptCerts.push(cert);
          }
        });
        joinData[newcomer].certs = keptCerts;
      });
      return finalJoinData
    } catch(err) {
      this.logger.error(err);
      throw err;
    }
  }

  private async checkWoTConstraints(block:{ number:number, joiners:string[], identities:string[] }, newLinks:any, current:DBBlock|null) {
    if (block.number < 0) {
      throw 'Cannot compute WoT constraint for negative block number';
    }
    const newcomers = block.joiners.map((inlineMS:string) => inlineMS.split(':')[0]);
    const realNewcomers = block.identities;
    for (const newcomer of newcomers) {
      if (block.number > 0) {
        try {
          // Will throw an error if not enough links
          await this.mainContext.checkHaveEnoughLinks(newcomer, newLinks);
          // This one does not throw but returns a boolean
          const isOut = await GLOBAL_RULES_HELPERS.isOver3Hops(newcomer, newLinks, realNewcomers, current, this.conf, this.dal);
          if (isOut) {
            throw 'Key ' + newcomer + ' is not recognized by the WoT for this block';
          }
        } catch (e) {
          this.logger.debug(e);
          throw e;
        }
      }
    }
  }

  private async iteratedChecking(newcomers:string[], checkWoTForNewcomers: (someNewcomers:string[]) => Promise<void>): Promise<string[]> {
    const passingNewcomers:string[] = []
    let hadError = false;
    for (const newcomer of newcomers) {
      try {
        await checkWoTForNewcomers(passingNewcomers.concat(newcomer));
        passingNewcomers.push(newcomer);
      } catch (err) {
        hadError = hadError || err;
      }
    }
    if (hadError) {
      return await this.iteratedChecking(passingNewcomers, checkWoTForNewcomers);
    } else {
      return passingNewcomers;
    }
  }

  private async getPreJoinData(current:DBBlock|null) {
    const preJoinData:{ [k:string]: PreJoin } = {}
    const memberships = await this.dal.findNewcomers((current && current.medianTime) || 0)
    const joiners:string[] = [];
    memberships.forEach((ms:any) => joiners.push(ms.issuer));
    for (const ms of memberships) {
      try {
        if (ms.block !== CommonConstants.SPECIAL_BLOCK) {
          let msBasedBlock = await this.dal.getAbsoluteValidBlockInForkWindow(ms.blockNumber, ms.blockHash)
          if (!msBasedBlock) {
            throw constants.ERRORS.BLOCKSTAMP_DOES_NOT_MATCH_A_BLOCK;
          }
          if (!current) {
            throw Error(DataErrors[DataErrors.CANNOT_DETERMINATE_MEMBERSHIP_AGE])
          }
          let age = current.medianTime - msBasedBlock.medianTime;
          if (age > this.conf.msWindow) {
            throw constants.ERRORS.TOO_OLD_MEMBERSHIP;
          }
        }
        const idtyHash = (hashf(ms.userid + ms.certts + ms.issuer) + "").toUpperCase();
        const join = await this.getSinglePreJoinData(current, idtyHash, joiners);
        join.ms = ms;
        const currentMembership = await this.dal.mindexDAL.getReducedMSForImplicitRevocation(ms.issuer);
        const currentMSN = currentMembership ? parseInt(currentMembership.created_on) : -1;
        if (!join.identity.revoked && currentMSN < parseInt(join.ms.number)) {
          if (!preJoinData[join.identity.pubkey] || preJoinData[join.identity.pubkey].certs.length < join.certs.length) {
            preJoinData[join.identity.pubkey] = join;
          }
        }
      } catch (err) {
        if (err && !err.uerr) {
          this.logger.warn(err);
        }
      }
    }
    return preJoinData;
  }

  private async computeNewLinks(forBlock:number, theNewcomers:any, joinData:Map<PreJoin>) {
    let newCerts = await this.computeNewCerts(forBlock, theNewcomers, joinData);
    return this.newCertsToLinks(newCerts);
  }

  newCertsToLinks(newCerts:Map<DBCert[]>) {
    let newLinks: Map<string[]> = {}
    for (const pubkey of Underscore.keys(newCerts)) {
      newLinks[pubkey] = Underscore.pluck(newCerts[pubkey], 'from')
    }
    return newLinks
  }

  async computeNewCerts(forBlock:number, theNewcomers:any, joinData:Map<PreJoin>) {
    const newCerts:Map<DBCert[]> = {}, certifiers:string[] = []
    const certsByKey = Underscore.mapObjectByProp(joinData, 'certs')
    for (const newcomer of theNewcomers) {
      // New array of certifiers
      newCerts[newcomer] = newCerts[newcomer] || [];
      // Check wether each certification of the block is from valid newcomer/member
      for (const cert of certsByKey[newcomer]) {
        const isAlreadyCertifying = certifiers.indexOf(cert.from) !== -1;
        if (!(isAlreadyCertifying && forBlock > 0)) {
          if (~theNewcomers.indexOf(cert.from)) {
            // Newcomer to newcomer => valid link
            newCerts[newcomer].push(cert);
            certifiers.push(cert.from);
          } else {
            let isMember = await this.dal.isMember(cert.from)
            // Member to newcomer => valid link
            if (isMember) {
              newCerts[newcomer].push(cert);
              certifiers.push(cert.from);
            }
          }
        }
      }
    }
    return newCerts
  }

  async getSinglePreJoinData(current:DBBlock|null, idHash:string, joiners:string[]): Promise<PreJoin> {
    const identity = await this.dal.getGlobalIdentityByHashForJoining(idHash)
    let foundCerts = [];
    const vHEAD_1 = await this.mainContext.getvHEAD_1();
    if (!identity) {
      throw 'Identity with hash \'' + idHash + '\' not found';
    }
    if (current && identity.buid == CommonConstants.SPECIAL_BLOCK && !identity.wasMember) {
      throw constants.ERRORS.TOO_OLD_IDENTITY;
    }
    else if (!identity.wasMember && identity.buid != CommonConstants.SPECIAL_BLOCK) {
      const idtyBasedBlock = await this.dal.getTristampOf(parseInt(identity.buid.split('-')[0]))
      if (!current || !idtyBasedBlock) {
        throw Error(DataErrors[DataErrors.CANNOT_DETERMINATE_IDENTITY_AGE])
      }
      const age = current.medianTime - idtyBasedBlock.medianTime;
      if (age > this.conf.idtyWindow) {
        throw constants.ERRORS.TOO_OLD_IDENTITY;
      }
    }
    const idty = IdentityDTO.fromJSONObject(identity);
    idty.currency = this.conf.currency;
    const createIdentity = idty.rawWithoutSig();
    const verified = verify(createIdentity, idty.sig, idty.pubkey);
    if (!verified) {
      throw constants.ERRORS.IDENTITY_WRONGLY_SIGNED;
    }
    const isIdentityLeaving = await this.dal.isLeaving(idty.pubkey);
    if (!isIdentityLeaving) {
      if (!current) {
        // Look for certifications from initial joiners
        const certs = await this.dal.certsNotLinkedToTarget(idHash);
        foundCerts = Underscore.filter(certs, (cert:any) => {
          // Add 'joiners && ': special case when block#0 not written ANd not joiner yet (avoid undefined error)
          return !!(joiners && ~joiners.indexOf(cert.from))
        });
      } else {
        // Look for certifications from WoT members
        let certs = await this.dal.certsNotLinkedToTarget(idHash);
        const certifiers = [];
        for (const cert of certs) {
          try {
            const basedBlock = await this.dal.getTristampOf(cert.block_number)
            if (!basedBlock) {
              throw 'Unknown timestamp block for identity';
            }
            if (current) {
              const age = current.medianTime - basedBlock.medianTime;
              if (age > this.conf.sigWindow || age > this.conf.sigValidity) {
                throw 'Too old certification';
              }
            }
            // Already exists a link not replayable yet?
            let exists = await this.dal.existsNonReplayableLink(cert.from, cert.to);
            if (exists) {
              throw 'It already exists a similar certification written, which is not replayable yet';
            }
            // Already exists a link not chainable yet?
            exists = await this.dal.existsNonChainableLink(cert.from, vHEAD_1, this.conf.sigStock);
            if (exists) {
              throw 'It already exists a written certification from ' + cert.from + ' which is not chainable yet';
            }
            const isMember = await this.dal.isMember(cert.from);
            const doubleSignature = !!(~certifiers.indexOf(cert.from))
            if (isMember && !doubleSignature) {
              const isValid = await GLOBAL_RULES_HELPERS.checkCertificationIsValidForBlock(
                cert,
                { number: current.number + 1, currency: current.currency },
                async () => this.dal.getGlobalIdentityByHashForHashingAndSig(idHash),
                this.conf,
                this.dal)
              if (isValid) {
                certifiers.push(cert.from);
                foundCerts.push(cert);
              }
            }
          } catch (e) {
            this.logger.debug(e.stack || e.message || e);
            // Go on
          }
        }
      }
    }
    const ms:any = null // TODO: refactor
    return {
      identity: identity,
      key: null,
      idHash: idHash,
      certs: foundCerts,
      ms
    };
  }

  private async createBlock(
    blockVersion: number,
    current:DBBlock|null,
    joinData:{ [pub:string]: PreJoin },
    leaveData:{ [pub:string]: LeaveData },
    updates:any,
    revocations:any,
    exclusions:any,
    wereExcluded:any,
    transactions:any,
    manualValues:any) {

    if (manualValues && manualValues.excluded) {
      exclusions = manualValues.excluded;
    }
    if (manualValues && manualValues.revoked) {
      revocations = [];
    }

    const vHEAD = await this.mainContext.getvHeadCopy();
    const vHEAD_1 = await this.mainContext.getvHEAD_1();
    const maxLenOfBlock = Indexer.DUP_HELPERS.getMaxBlockSize(vHEAD);
    let blockLen = 0;
    // Revocations have an impact on exclusions
    revocations.forEach((idty:any) => exclusions.push(idty.pubkey));
    // Prevent writing joins/updates for members who will be excluded
    exclusions = Underscore.uniq(exclusions);
    exclusions.forEach((excluded:any) => {
      delete updates[excluded];
      delete joinData[excluded];
      delete leaveData[excluded];
    });
    // Prevent writing joins/updates for excluded members
    wereExcluded = Underscore.uniq(wereExcluded);
    wereExcluded.forEach((excluded:any) => {
      delete updates[excluded];
      delete joinData[excluded];
      delete leaveData[excluded];
    });
    Underscore.keys(leaveData).forEach((leaver:any) => {
      delete updates[leaver];
      delete joinData[leaver];
    });
    const block = new BlockDTO();
    block.number = current ? current.number + 1 : 0;
    // Compute the new MedianTime
    if (block.number == 0) {
      block.medianTime = moment.utc().unix() - this.conf.rootoffset;
    }
    else {
      block.medianTime = vHEAD.medianTime;
    }
    // Choose the version
    block.version = blockVersion
    block.currency = current ? current.currency : this.conf.currency;
    block.nonce = 0;
    if (!this.conf.dtReeval) {
      this.conf.dtReeval = this.conf.dt;
    }
    if (!this.conf.udTime0) {
      this.conf.udTime0 = block.medianTime + this.conf.dt;
    }
    if (!this.conf.udReevalTime0) {
      this.conf.udReevalTime0 = block.medianTime + this.conf.dtReeval;
    }
    block.parameters = block.number > 0 ? '' : [
      this.conf.c, this.conf.dt, this.conf.ud0,
      this.conf.sigPeriod, this.conf.sigStock, this.conf.sigWindow, this.conf.sigValidity,
      this.conf.sigQty, this.conf.idtyWindow, this.conf.msWindow, this.conf.xpercent, this.conf.msValidity,
      this.conf.stepMax, this.conf.medianTimeBlocks, this.conf.avgGenTime, this.conf.dtDiffEval,
      (this.conf.percentRot == 1 ? "1.0" : this.conf.percentRot),
      this.conf.udTime0,
      this.conf.udReevalTime0,
      this.conf.dtReeval
    ].join(':');
    block.previousHash = current ? current.hash : "";
    block.previousIssuer = current ? current.issuer : "";
    if (this.selfPubkey) {
      block.issuer = this.selfPubkey
    }
    // Members merkle
    const joiners = Underscore.keys(joinData)
    joiners.sort()
    const previousCount = current ? current.membersCount : 0;
    if (joiners.length == 0 && !current) {
      throw constants.ERRORS.CANNOT_ROOT_BLOCK_NO_MEMBERS;
    }

    // Kicked people
    block.excluded = exclusions;

    /*****
     * Priority 1: keep the WoT sane
     */
    // Certifications from the WoT, to the WoT
    Underscore.keys(updates).forEach((certifiedMember:any) => {
      const certs = updates[certifiedMember] || [];
      certs.forEach((cert:any) => {
        if (blockLen < maxLenOfBlock) {
          block.certifications.push(CertificationDTO.fromJSONObject(cert).inline());
          blockLen++;
        }
      });
    });
    // Renewed
    joiners.forEach((joiner:any) => {
      const data = joinData[joiner];
      // Join only for non-members
      if (data.identity.member) {
        if (blockLen < maxLenOfBlock) {
          block.actives.push(MembershipDTO.fromJSONObject(data.ms).inline());
          blockLen++;
        }
      }
    });
    // Leavers
    const leavers = Underscore.keys(leaveData)
    leavers.forEach((leaver:any) => {
      const data = leaveData[leaver];
      // Join only for non-members
      if (data.identity && data.identity.member) {
        if (blockLen < maxLenOfBlock) {
          block.leavers.push(MembershipDTO.fromJSONObject(data.ms).inline());
          blockLen++;
        }
      }
    });

    /*****
     * Priority 2: revoked identities
     */
    revocations.forEach((idty:any) => {
      if (blockLen < maxLenOfBlock) {
        block.revoked.push([idty.pubkey, idty.revocation_sig].join(':'));
        blockLen++;
      }
    });

    /*****
     * Priority 3: newcomers/renewcomers
     */
    let countOfCertsToNewcomers = 0;
    // Newcomers
    // Newcomers + back people
    joiners.forEach((joiner:any) => {
      const data = joinData[joiner];
      // Identities only for never-have-been members
      if (!data.identity.member && !data.identity.wasMember) {
        block.identities.push(IdentityDTO.fromJSONObject(data.identity).inline());
      }
      // Join only for non-members
      if (!data.identity.member) {
        block.joiners.push(MembershipDTO.fromJSONObject(data.ms).inline());
      }
    });
    block.identities = Underscore.sortBy(block.identities, (line:string) => {
      const sp = line.split(':');
      return sp[2] + sp[3];
    });

    // Certifications from the WoT, to newcomers
    joiners.forEach((joiner:any) => {
      const data = joinData[joiner] || [];
      data.certs.forEach((cert:any) => {
        countOfCertsToNewcomers++;
        block.certifications.push(CertificationDTO.fromJSONObject(cert).inline());
      });
    });

    // Eventually revert newcomers/renewcomer
    if (block.number > 0 && BlockDTO.getLen(block) > maxLenOfBlock) {
      for (let i = 0; i < block.identities.length; i++) {
        block.identities.pop();
        block.joiners.pop();
      }
      for (let i = 0; i < countOfCertsToNewcomers; i++) {
        block.certifications.pop();
      }
    }

    // Final number of members
    block.membersCount = previousCount + block.joiners.length - block.excluded.length;

    vHEAD.membersCount = block.membersCount;

    /*****
     * Priority 4: transactions
     */
    block.transactions = [];
    blockLen = BlockDTO.getLen(block);
    if (blockLen < maxLenOfBlock) {
      transactions.forEach((tx:any) => {
        const txDTO = TransactionDTO.fromJSONObject(tx)
        const txLen = txDTO.getLen()
        if (txLen <= CommonConstants.MAXIMUM_LEN_OF_COMPACT_TX && blockLen + txLen <= maxLenOfBlock && tx.version == CommonConstants.TRANSACTION_VERSION) {
          block.transactions.push(txDTO);
        }
        blockLen += txLen;
      });
    }

    /**
     * Finally handle the Universal Dividend
     */
    block.powMin = vHEAD.powMin;

    // Universal Dividend
    if (vHEAD.new_dividend) {

      // BR_G13
      // Recompute according to block.membersCount
      Indexer.prepareDividend(vHEAD, vHEAD_1, this.conf)
      // BR_G14
      Indexer.prepareUnitBase(vHEAD)

      // Fix BR_G14 double call
      vHEAD.unitBase = Math.min(vHEAD_1.unitBase + 1, vHEAD.unitBase);

      block.dividend = vHEAD.dividend;
      block.unitbase = vHEAD.unitBase;
    } else {
      block.unitbase = block.number == 0 ? 0 : (current as DBBlock).unitbase; // For sur current is not null, as UD is only on blocks# > 0
    }
    // Rotation
    block.issuersCount = vHEAD.issuersCount;
    block.issuersFrame = vHEAD.issuersFrame;
    block.issuersFrameVar = vHEAD.issuersFrameVar;
    // Manual values before hashing
    if (manualValues) {
      Underscore.extend(block, Underscore.omit(manualValues, 'time'));
    }
    // InnerHash
    block.time = block.medianTime;
    block.inner_hash = hashf(rawer.getBlockInnerPart(block)).toUpperCase();
    return block;
  }
}

export class BlockGeneratorWhichProves extends BlockGenerator {

  constructor(server:Server, private prover:any) {
    super(server)
  }

  async makeNextBlock(block:DBBlock|null, trial?:number|null, manualValues:any = null) {
    const unsignedBlock = block || (await this.nextBlock(manualValues))
    const trialLevel = trial || (await this.mainContext.getIssuerPersonalizedDifficulty(this.selfPubkey))
    return this.prover.prove(unsignedBlock, trialLevel, (manualValues && manualValues.time) || null);
  }
}

interface BlockGeneratorInterface {
  findNewCertsFromWoT(current:DBBlock|null): Promise<any>
  filterJoiners(preJoinData:any): Promise<any>
}

/**
 * Class to implement strategy of automatic selection of incoming data for next block.
 * @constructor
 */
class NextBlockGenerator implements BlockGeneratorInterface {

  constructor(
    private mainContext:BlockchainContext,
    private server:Server,
    private logger:any) {
  }

  get conf() {
    return this.server.conf
  }

  get dal() {
    return this.server.dal
  }

  async findNewCertsFromWoT(current:DBBlock|null) {
    const updates:any = {};
    const updatesToFrom:any = {};
    const certs = await this.dal.certsFindNew();
    const vHEAD_1 = await this.mainContext.getvHEAD_1();
    for (const cert of certs) {
      const targetIdty = await this.dal.getGlobalIdentityByHashForHashingAndSig(cert.target)
      // The identity must be known
      if (targetIdty) {
        const certSig = cert.sig;
        // Do not rely on certification block UID, prefer using the known hash of the block by its given number
        const targetBlock = await this.dal.getTristampOf(cert.block_number)
        // Check if writable
        let duration = current && targetBlock ? current.medianTime - targetBlock.medianTime : 0;
        if (targetBlock && duration <= this.conf.sigWindow) {
          const rawCert = CertificationDTO.fromJSONObject({
            sig: '',
            currency: this.conf.currency,
            issuer: cert.from,
            idty_issuer: targetIdty.pubkey,
            idty_uid: targetIdty.uid,
            idty_buid: targetIdty.buid,
            idty_sig: targetIdty.sig,
            buid: current ? [cert.block_number, targetBlock.hash].join('-') : CommonConstants.SPECIAL_BLOCK,
          }).getRawUnSigned();
          if (verify(rawCert, certSig, cert.from)) {
            cert.sig = certSig;
            let exists = false;
            if (current) {
              // Already exists a link not replayable yet?
              exists = await this.dal.existsNonReplayableLink(cert.from, cert.to);
            }
            if (!exists) {
              // Already exists a link not chainable yet?
              // No chainability block means absolutely nobody can issue certifications yet
              exists = await this.dal.existsNonChainableLink(cert.from, vHEAD_1, this.conf.sigStock);
              if (!exists) {
                // It does NOT already exists a similar certification written, which is not replayable yet
                // Signatory must be a member
                const isSignatoryAMember = await this.dal.isMember(cert.from);
                const isCertifiedANonLeavingMember = isSignatoryAMember && (await this.dal.isMemberAndNonLeaver(cert.to));
                // Certified must be a member and non-leaver
                if (isSignatoryAMember && isCertifiedANonLeavingMember) {
                  updatesToFrom[cert.to] = updatesToFrom[cert.to] || [];
                  updates[cert.to] = updates[cert.to] || [];
                  if (updatesToFrom[cert.to].indexOf(cert.from) == -1) {
                    updates[cert.to].push(cert);
                    updatesToFrom[cert.to].push(cert.from);
                  }
                }
              }
            }
          }
        }
      }
    }
    return updates;
  }

  async filterJoiners(preJoinData:any) {
    const filtered:any = {};
    const filterings:any = [];
    const filter = async (pubkey:string) => {
      try {
        // No manual filtering, takes all BUT already used UID or pubkey
        let exists = await GLOBAL_RULES_HELPERS.checkExistsUserID(preJoinData[pubkey].identity.uid, this.dal);
        if (exists && !preJoinData[pubkey].identity.wasMember) {
          throw 'UID already taken';
        }
        exists = await GLOBAL_RULES_HELPERS.checkExistsPubkey(pubkey, this.dal);
        if (exists && !preJoinData[pubkey].identity.wasMember) {
          throw 'Pubkey already taken';
        }
        filtered[pubkey] = preJoinData[pubkey];
      }
      catch (err) {
        this.logger.warn(err);
      }
    }
    Underscore.keys(preJoinData).forEach( (joinPubkey:any) => filterings.push(filter(joinPubkey)));
    await Promise.all(filterings)
    return filtered;
  }
}

/**
 * Class to implement strategy of manual selection of root members for root block.
 * @constructor
 */
class ManualRootGenerator implements BlockGeneratorInterface {

  findNewCertsFromWoT() {
    return Promise.resolve({})
  }

  async filterJoiners(preJoinData:any) {
    const filtered:any = {};
    const newcomers = Underscore.keys(preJoinData)
    const uids:string[] = [];
    newcomers.forEach((newcomer:string) => uids.push(preJoinData[newcomer].ms.userid));

    if (newcomers.length > 0) {
      const answers = await inquirer.prompt([{
        type: "checkbox",
        name: "uids",
        message: "Newcomers to add",
        choices: uids,
        default: uids[0]
      }]);
      newcomers.forEach((newcomer:string) => {
        if (~answers.uids.indexOf(preJoinData[newcomer].ms.userid))
          filtered[newcomer] = preJoinData[newcomer];
      });
      if (answers.uids.length == 0)
        throw 'No newcomer selected';
      return filtered
    } else {
      throw 'No newcomer found';
    }
  }
}
