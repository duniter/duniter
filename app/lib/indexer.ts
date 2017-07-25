"use strict";
import {BlockDTO} from "./dto/BlockDTO"
import {ConfDTO, CurrencyConfDTO} from "./dto/ConfDTO"
import {IdentityDTO} from "./dto/IdentityDTO"
import {RevocationDTO} from "./dto/RevocationDTO"
import {CertificationDTO} from "./dto/CertificationDTO"
import {TransactionDTO} from "./dto/TransactionDTO"
import {DBHead} from "./db/DBHead"
import {LOCAL_RULES_HELPERS} from "./rules/local_rules"
import {verify} from "./common-libs/crypto/keyring"
import {rawer, txunlock} from "./common-libs/index"
import {CommonConstants} from "./common-libs/constants"
import {MembershipDTO} from "./dto/MembershipDTO"

const _               = require('underscore');
const common          = require('../../app/common');

const constants       = CommonConstants
const Block           = common.document.Block

export interface IndexEntry {
  index: string,
  op: string,
  writtenOn: number,
  written_on: string,
}

export interface MindexEntry extends IndexEntry {
  pub: string,
  created_on: string,
  type: string | null,
  expires_on: number | null,
  expired_on: number | null,
  revocation: string | null,
  revokes_on: number | null,
  chainable_on: number | null,
  revoked_on: string | null,
  leaving: boolean | null,
  age: number,
  isBeingRevoked?: boolean,
  unchainables: number,
  numberFollowing?: boolean,
  distanceOK?: boolean,
  onRevoked?: boolean,
  joinsTwice?: boolean,
  enoughCerts?: boolean,
  leaverIsMember?: boolean,
  activeIsMember?: boolean,
  revokedIsMember?: boolean,
  alreadyRevoked?: boolean,
  revocationSigOK?: boolean,
}

export interface IindexEntry extends IndexEntry {
  uid: string | null,
  pub: string,
  hash: string | null,
  sig: string | null,
  created_on: string | null,
  member: boolean,
  wasMember: boolean | null,
  kick: boolean | null,
  wotb_id: number | null,
  age: number,
  pubUnique?: boolean,
  excludedIsMember?: boolean,
  isBeingKicked?: boolean,
  uidUnique?: boolean,
  hasToBeExcluded?: boolean,
}

export interface CindexEntry extends IndexEntry {
  issuer: string,
  receiver: string,
  created_on: number,
  sig: string,
  chainable_on: number,
  expires_on: number,
  expired_on: number,
  from_wid: null, // <-These 2 fields are useless
  to_wid: null,    // <-'
  unchainables: number,
  age: number,
  stock: number,
  fromMember?: boolean,
  toMember?: boolean,
  toNewcomer?: boolean,
  toLeaver?: boolean,
  isReplay?: boolean,
  sigOK?: boolean,
}

export interface SindexEntry extends IndexEntry {
  tx: string | null,
  identifier: string,
  pos: number,
  created_on: string | null,
  written_time: number,
  locktime: number,
  unlock: string | null,
  amount: number,
  base: number,
  conditions: string,
  consumed: boolean,
  txObj: TransactionDTO,
  age: number,
  type?: string,
  available?: boolean,
  isLocked?: boolean,
  isTimeLocked?: boolean,
}

interface Ranger {
  (n:number, m:number, prop?:string): Promise<DBHead[]>
}

function pushIindex(index: any[], entry: IindexEntry): void {
  index.push(entry)
}

function pushMindex(index: any[], entry: MindexEntry): void {
  index.push(entry)
}

function pushCindex(index: any[], entry: CindexEntry): void {
  index.push(entry)
}

export class Indexer {

  static localIndex(block:BlockDTO, conf:CurrencyConfDTO): IndexEntry[] {

    /********************
     * GENERAL BEHAVIOR
     *
     * * for each newcomer: 2 indexes (1 iindex CREATE, 1 mindex CREATE)
     * * for each comeback: 2 indexes (1 iindex UPDATE, 1 mindex UPDATE)
     * * for each renewer:  1 index   (                 1 mindex UPDATE)
     * * for each leaver:   1 index   (                 1 mindex UPDATE)
     * * for each revoked:  1 index   (                 1 mindex UPDATE)
     * * for each excluded: 1 indexes (1 iindex UPDATE)
     *
     * * for each certification: 1 index (1 cindex CREATE)
     *
     * * for each tx output: 1 index (1 sindex CREATE)
     * * for each tx input:  1 index (1 sindex UPDATE)
     */

    const index: IndexEntry[] = [];

    /***************************
     * IDENTITIES INDEX (IINDEX)
     **************************/
    for (const identity of block.identities) {
      const idty = IdentityDTO.fromInline(identity);
      // Computes the hash if not done yet
      pushIindex(index, {
        index: constants.I_INDEX,
        op: constants.IDX_CREATE,
        uid: idty.uid,
        pub: idty.pubkey,
        hash: idty.hash,
        sig: idty.sig,
        created_on: idty.buid,
        written_on: [block.number, block.hash].join('-'),
        writtenOn: block.number,
        age: 0,
        member: true,
        wasMember: true,
        kick: false,
        wotb_id: null
      })
    }

    /****************************
     * MEMBERSHIPS INDEX (MINDEX)
     ***************************/
    // Joiners (newcomer or join back)
    for (const inlineMS of block.joiners) {
      const ms = MembershipDTO.fromInline(inlineMS);
      const matchesANewcomer = _.filter(index, (row: IindexEntry) => row.index == constants.I_INDEX && row.pub == ms.issuer).length > 0;
      if (matchesANewcomer) {
        // Newcomer
        pushMindex(index, {
          index: constants.M_INDEX,
          op: constants.IDX_CREATE,
          pub: ms.issuer,
          created_on: [ms.number, ms.fpr].join('-'),
          written_on: [block.number, block.hash].join('-'),
          writtenOn: block.number,
          age: 0,
          unchainables: 0,
          type: 'JOIN',
          expires_on: conf.msValidity,
          expired_on: null,
          revokes_on: conf.msValidity * constants.REVOCATION_FACTOR,
          revocation: null,
          chainable_on: block.medianTime + conf.msPeriod,
          revoked_on: null,
          leaving: false
        })
      } else {
        // Join back
        pushMindex(index, {
          index: constants.M_INDEX,
          op: constants.IDX_UPDATE,
          pub: ms.issuer,
          created_on: [ms.number, ms.fpr].join('-'),
          written_on: [block.number, block.hash].join('-'),
          writtenOn: block.number,
          age: 0,
          unchainables: 0,
          type: 'JOIN',
          expires_on: conf.msValidity,
          expired_on: null,
          revokes_on: conf.msValidity * constants.REVOCATION_FACTOR,
          revocation: null,
          chainable_on: block.medianTime + conf.msPeriod,
          revoked_on: null,
          leaving: null
        })
        pushIindex(index, {
          index: constants.I_INDEX,
          op: constants.IDX_UPDATE,
          uid: null,
          pub: ms.issuer,
          hash: null,
          sig: null,
          created_on: null,
          written_on: [block.number, block.hash].join('-'),
          writtenOn: block.number,
          age: 0,
          member: true,
          wasMember: null,
          kick: null,
          wotb_id: null
        })
      }
    }
    // Actives
    for (const inlineMS of block.actives) {
      const ms = MembershipDTO.fromInline(inlineMS);
      // Renew
      pushMindex(index, {
        index: constants.M_INDEX,
        op: constants.IDX_UPDATE,
        pub: ms.issuer,
        created_on: [ms.number, ms.fpr].join('-'),
        written_on: [block.number, block.hash].join('-'),
        writtenOn: block.number,
        age: 0,
        unchainables: 0,
        type: 'ACTIVE',
        expires_on: conf.msValidity,
        expired_on: null,
        revokes_on: conf.msValidity * constants.REVOCATION_FACTOR,
        revocation: null,
        chainable_on: block.medianTime + conf.msPeriod,
        revoked_on: null,
        leaving: null
      })
    }
    // Leavers
    for (const inlineMS of block.leavers) {
      const ms = MembershipDTO.fromInline(inlineMS);
      pushMindex(index, {
        index: constants.M_INDEX,
        op: constants.IDX_UPDATE,
        pub: ms.issuer,
        created_on: [ms.number, ms.fpr].join('-'),
        written_on: [block.number, block.hash].join('-'),
        writtenOn: block.number,
        age: 0,
        unchainables: 0,
        type: 'LEAVE',
        expires_on: null,
        expired_on: null,
        revokes_on: null,
        revocation: null,
        chainable_on: block.medianTime + conf.msPeriod,
        revoked_on: null,
        leaving: true
      })
    }
    // Revoked
    for (const inlineRevocation of block.revoked) {
      const revocation = RevocationDTO.fromInline(inlineRevocation)
      pushMindex(index, {
        index: constants.M_INDEX,
        op: constants.IDX_UPDATE,
        pub: revocation.pubkey,
        created_on: [block.number, block.hash].join('-'),
        written_on: [block.number, block.hash].join('-'),
        writtenOn: block.number,
        age: 0,
        unchainables: 0,
        type: null,
        expires_on: null,
        expired_on: null,
        revokes_on: null,
        revocation: revocation.revocation,
        chainable_on: block.medianTime + conf.msPeriod, // Note: this is useless, because a revoked identity cannot join back. But we let this property for data consistency
        revoked_on: [block.number, block.hash].join('-'),
        leaving: false
      })
    }
    // Excluded
    for (const excluded of block.excluded) {
      pushIindex(index, {
        index: constants.I_INDEX,
        op: constants.IDX_UPDATE,
        uid: null,
        pub: excluded,
        hash: null,
        sig: null,
        created_on: null,
        written_on: [block.number, block.hash].join('-'),
        writtenOn: block.number,
        age: 0,
        member: false,
        wasMember: null,
        kick: false,
        wotb_id: null
      });
    }

    /*******************************
     * CERTIFICATIONS INDEX (CINDEX)
     ******************************/
    for (const inlineCert of block.certifications) {
      const cert = CertificationDTO.fromInline(inlineCert);
      pushCindex(index, {
        index: constants.C_INDEX,
        op: constants.IDX_CREATE,
        issuer: cert.pubkey,
        receiver: cert.to,
        created_on: cert.block_number,
        written_on: [block.number, block.hash].join('-'),
        writtenOn: block.number,
        age: 0,
        stock: conf.sigStock,
        unchainables: 0,
        sig: cert.sig,
        chainable_on: block.medianTime  + conf.sigPeriod,
        expires_on: conf.sigValidity,
        expired_on: 0,
        from_wid: null,
        to_wid: null
      })
    }

    return index.concat(Indexer.localSIndex(block));
  }

  static localSIndex(block:BlockDTO): SindexEntry[] {
    /*******************************
     * SOURCES INDEX (SINDEX)
     ******************************/
    const index: SindexEntry[] = [];
    for (const tx of block.transactions) {
      tx.currency = block.currency || tx.currency;
      const txHash = tx.getHash()
      let k = 0;
      for (const input of tx.inputsAsObjects()) {
        index.push({
          index: constants.S_INDEX,
          op: constants.IDX_UPDATE,
          tx: txHash,
          identifier: input.identifier,
          pos: input.pos,
          created_on: tx.blockstamp,
          written_on: [block.number, block.hash].join('-'),
          writtenOn: block.number,
          age: 0,
          written_time: block.medianTime,
          locktime: tx.locktime,
          unlock: tx.unlocks[k],
          amount: input.amount,
          base: input.base,
          conditions: "", // Is overriden thereafter
          consumed: true,
          txObj: tx
        });
        k++;
      }

      let i = 0;
      for (const output of tx.outputsAsObjects()) {
        index.push({
          index: constants.S_INDEX,
          op: constants.IDX_CREATE,
          tx: txHash,
          identifier: txHash,
          pos: i++,
          created_on: null,
          written_on: [block.number, block.hash].join('-'),
          writtenOn: block.number,
          age: 0,
          written_time: block.medianTime,
          locktime: tx.locktime,
          unlock: null,
          amount: output.amount,
          base: output.base,
          conditions: output.conditions,
          consumed: false,
          txObj: tx
        });
      }
    }
    return index;
  }

  static async quickCompleteGlobalScope(block: BlockDTO, conf: CurrencyConfDTO, bindex: DBHead[], iindex: IindexEntry[], mindex: MindexEntry[], cindex: CindexEntry[], dal: any) {

    function range(start: number, end: number, property = ""): any {
      let theRange;
      end = Math.min(end, bindex.length);
      if (start == 1) {
        theRange = bindex.slice(-end);
      } else {
        theRange = bindex.slice(-end, -start + 1);
      }
      theRange.reverse();
      if (property) {
        // Filter on a particular property
        return theRange.map((b:any) => b[property]);
      } else {
        return theRange;
      }
    }

    async function head(n:number) {
      return range(n, n)[0];
    }

    const HEAD = new DBHead()

    HEAD.version = block.version
    HEAD.currency = block.currency
    HEAD.bsize = Block.getLen(block)
    HEAD.hash = Block.getHash(block)
    HEAD.issuer = block.issuer
    HEAD.time = block.time
    HEAD.medianTime = block.medianTime
    HEAD.number = block.number
    HEAD.powMin = block.powMin
    HEAD.unitBase = block.unitbase
    HEAD.membersCount = block.membersCount
    HEAD.dividend = block.dividend
    HEAD.new_dividend = null

    const HEAD_1 = await head(1);

    if (HEAD.number == 0) {
      HEAD.dividend = conf.ud0;
    }
    else if (!HEAD.dividend) {
      HEAD.dividend = HEAD_1.dividend;
    } else {
      HEAD.new_dividend = HEAD.dividend;
    }

    // BR_G04
    await Indexer.prepareIssuersCount(HEAD, range, HEAD_1);

    // BR_G05
    Indexer.prepareIssuersFrame(HEAD, HEAD_1);

    // BR_G06
    Indexer.prepareIssuersFrameVar(HEAD, HEAD_1);

    // BR_G07
    await Indexer.prepareAvgBlockSize(HEAD, range);

    // BR_G09
    Indexer.prepareDiffNumber(HEAD, HEAD_1, conf)

    // BR_G11
    Indexer.prepareUDTime(HEAD, HEAD_1, conf)

    // BR_G15
    Indexer.prepareMass(HEAD, HEAD_1);

    // BR_G16
    await Indexer.prepareSpeed(HEAD, head, conf)

    // BR_G19
    await Indexer.prepareIdentitiesAge(iindex, HEAD, HEAD_1, conf, dal);

    // BR_G22
    await Indexer.prepareMembershipsAge(mindex, HEAD, HEAD_1, conf, dal);

    // BR_G37
    await Indexer.prepareCertificationsAge(cindex, HEAD, HEAD_1, conf, dal);

    // BR_G104
    await Indexer.ruleIndexCorrectMembershipExpiryDate(HEAD, mindex, dal);

    // BR_G105
    await Indexer.ruleIndexCorrectCertificationExpiryDate(HEAD, cindex, dal);

    return HEAD;
  }

  static async completeGlobalScope(block: BlockDTO, conf: ConfDTO, index: IndexEntry[], dal: any) {

    const iindex = Indexer.iindex(index);
    const mindex = Indexer.mindex(index);
    const cindex = Indexer.cindex(index);
    const sindex = Indexer.sindex(index);

    const range = (n:number,m:number,p = "") => dal.range(n, m, p)
    const head = (n:number) => dal.head(n)

    const HEAD = new DBHead()

    HEAD.version = block.version
    HEAD.bsize = Block.getLen(block)
    HEAD.hash = Block.getHash(block)
    HEAD.issuer = block.issuer
    HEAD.time = block.time
    HEAD.powMin = block.powMin

    const HEAD_1 = await head(1);
    if (HEAD_1) {
      HEAD_1.currency = conf.currency;
    }

    // BR_G01
    Indexer.prepareNumber(HEAD, HEAD_1);

    // BR_G02
    if (HEAD.number > 0) {
      HEAD.previousHash = HEAD_1.hash;
    } else {
      HEAD.previousHash = null;
    }

    // BR_G99
    if (HEAD.number > 0) {
      HEAD.currency = HEAD_1.currency;
    } else {
      HEAD.currency = null;
    }

    // BR_G03
    if (HEAD.number > 0) {
      HEAD.previousIssuer = HEAD_1.issuer;
    } else {
      HEAD.previousIssuer = null;
    }

    // BR_G03
    if (HEAD.number > 0) {
      HEAD.issuerIsMember = reduce(await dal.iindexDAL.reducable(HEAD.issuer)).member;
    } else {
      HEAD.issuerIsMember = reduce(_.where(iindex, { pub: HEAD.issuer })).member;
    }

    // BR_G04
    await Indexer.prepareIssuersCount(HEAD, range, HEAD_1);

    // BR_G05
    Indexer.prepareIssuersFrame(HEAD, HEAD_1);

    // BR_G06
    Indexer.prepareIssuersFrameVar(HEAD, HEAD_1);

    // BR_G07
    await Indexer.prepareAvgBlockSize(HEAD, range);

    // BR_G08
    if (HEAD.number > 0) {
      HEAD.medianTime = Math.max(HEAD_1.medianTime, average(await range(1, Math.min(conf.medianTimeBlocks, HEAD.number), 'time')));
    } else {
      HEAD.medianTime = HEAD.time;
    }

    // BR_G09
    Indexer.prepareDiffNumber(HEAD, HEAD_1, conf)

    // BR_G10
    if (HEAD.number == 0) {
      HEAD.membersCount = count(_.filter(iindex, (entry:IindexEntry) => entry.member === true));
    } else {
      HEAD.membersCount = HEAD_1.membersCount
        + count(_.filter(iindex, (entry:IindexEntry) => entry.member === true))
        - count(_.filter(iindex, (entry:IindexEntry) => entry.member === false));
    }

    // BR_G11
    Indexer.prepareUDTime(HEAD, HEAD_1, conf)

    // BR_G12
    if (HEAD.number == 0) {
      HEAD.unitBase = 0;
    } else {
      HEAD.unitBase = HEAD_1.unitBase;
    }

    // BR_G13
    Indexer.prepareDividend(HEAD, HEAD_1, conf)

    // BR_G14
    Indexer.prepareUnitBase(HEAD);

    // BR_G15
    Indexer.prepareMass(HEAD, HEAD_1);

    // BR_G16
    await Indexer.prepareSpeed(HEAD, head, conf)

    // BR_G17
    if (HEAD.number > 0) {

      const ratio = constants.POW_DIFFICULTY_RANGE_RATIO;
      const maxGenTime = Math.ceil(conf.avgGenTime * ratio);
      const minGenTime = Math.floor(conf.avgGenTime / ratio);
      const minSpeed = 1 / maxGenTime;
      const maxSpeed = 1 / minGenTime;

      if (HEAD.diffNumber != HEAD_1.diffNumber && HEAD.speed >= maxSpeed && (HEAD_1.powMin + 2) % 16 == 0) {
        HEAD.powMin = HEAD_1.powMin + 2;
      } else if (HEAD.diffNumber != HEAD_1.diffNumber && HEAD.speed >= maxSpeed) {
        HEAD.powMin = HEAD_1.powMin + 1;
      } else if (HEAD.diffNumber != HEAD_1.diffNumber && HEAD.speed <= minSpeed && HEAD_1.powMin % 16 == 0) {
        HEAD.powMin = Math.max(0, HEAD_1.powMin - 2);
      } else if (HEAD.diffNumber != HEAD_1.diffNumber && HEAD.speed <= minSpeed) {
        HEAD.powMin = Math.max(0, HEAD_1.powMin - 1);
      } else {
        HEAD.powMin = HEAD_1.powMin;
      }
    }

    // BR_G18
    await Indexer.preparePersonalizedPoW(HEAD, HEAD_1, range, conf)

    // BR_G19
    await Indexer.prepareIdentitiesAge(iindex, HEAD, HEAD_1, conf, dal);

    // BR_G20
    await Promise.all(iindex.map(async (ENTRY: IindexEntry) => {
      if (ENTRY.op == constants.IDX_CREATE) {
        ENTRY.uidUnique = count(await dal.iindexDAL.sqlFind({ uid: ENTRY.uid })) == 0;
      } else {
        ENTRY.uidUnique = true;
      }
    }))

    // BR_G21
    await Promise.all(iindex.map(async (ENTRY: IindexEntry) => {
      if (ENTRY.op == constants.IDX_CREATE) {
        ENTRY.pubUnique = count(await dal.iindexDAL.sqlFind({pub: ENTRY.pub})) == 0;
      } else {
        ENTRY.pubUnique = true;
      }
    }))

    // BR_G33
    await Promise.all(iindex.map(async (ENTRY: IindexEntry) => {
      if (ENTRY.member !== false) {
        ENTRY.excludedIsMember = true;
      } else {
        ENTRY.excludedIsMember = reduce(await dal.iindexDAL.reducable(ENTRY.pub)).member;
      }
    }))

    // BR_G34
    mindex.map((ENTRY: MindexEntry) => {
      ENTRY.isBeingRevoked = !!ENTRY.revoked_on;
    })

    // BR_G107
    if (HEAD.number > 0) {
      await Promise.all(mindex.map(async (ENTRY: MindexEntry) => {
        const rows = await dal.mindexDAL.sqlFind({ pub: ENTRY.pub, chainable_on: { $gt: HEAD_1.medianTime }});
        // This rule will be enabled on
        if (HEAD.medianTime >= 1498860000) {
          ENTRY.unchainables = count(rows);
        }
      }))
    }

    // BR_G35
    await Promise.all(iindex.map(async (ENTRY: IindexEntry) => {
      ENTRY.isBeingKicked = ENTRY.member === false
    }))

    // BR_G36
    await Promise.all(iindex.map(async (ENTRY: IindexEntry) => {
      const isMarkedAsToKick = reduce(await dal.iindexDAL.reducable(ENTRY.pub)).kick;
      const isBeingRevoked = count(_.filter(mindex, (m:MindexEntry) => m.isBeingRevoked && m.pub == ENTRY.pub)) == 1;
      ENTRY.hasToBeExcluded = isMarkedAsToKick || isBeingRevoked;
    }))

    // BR_G22
    await Indexer.prepareMembershipsAge(mindex, HEAD, HEAD_1, conf, dal);

    // BR_G23
    await Promise.all(mindex.map(async (ENTRY: MindexEntry) => {
      if (!ENTRY.revoked_on) {
        const created_on = reduce(await dal.mindexDAL.reducable(ENTRY.pub)).created_on;
        if (created_on != null) {
          ENTRY.numberFollowing = number(ENTRY.created_on) > number(created_on);
        } else {
          ENTRY.numberFollowing = true; // Follows nothing
        }
      } else {
        ENTRY.numberFollowing = true;
      }
    }))

    // BR_G24
    // Global testing, because of wotb
    const oneIsOutdistanced = await checkPeopleAreNotOudistanced(
      _.filter(mindex, (entry: MindexEntry) => !entry.revoked_on).map((entry: MindexEntry) => entry.pub),
      cindex.reduce((newLinks:any, c: CindexEntry) => {
        newLinks[c.receiver] = newLinks[c.receiver] || [];
        newLinks[c.receiver].push(c.issuer);
        return newLinks;
      }, {}),
      // Newcomers
      _.where(iindex, { op: constants.IDX_CREATE }).map((entry: IindexEntry) => entry.pub),
      conf,
      dal
    );
    mindex.map((ENTRY: MindexEntry) => {
      if (ENTRY.expires_on) {
        ENTRY.distanceOK = !oneIsOutdistanced;
      } else {
        ENTRY.distanceOK = true;
      }
    });

    // BR_G25
    await Promise.all(mindex.map(async (ENTRY: MindexEntry) => {
      ENTRY.onRevoked = reduce(await dal.mindexDAL.reducable(ENTRY.pub)).revoked_on != null;
    }))

    // BR_G26
    await Promise.all(_.filter(mindex, (entry: MindexEntry) => entry.op == constants.IDX_UPDATE && entry.expired_on === 0).map(async (ENTRY: MindexEntry) => {
      ENTRY.joinsTwice = reduce(await dal.iindexDAL.reducable(ENTRY.pub)).member == true;
    }))

    // BR_G27
    await Promise.all(mindex.map(async (ENTRY: MindexEntry) => {
      if (ENTRY.type == 'JOIN' || ENTRY.type == 'ACTIVE') {
        const existing = count(await dal.cindexDAL.sqlFind({ receiver: ENTRY.pub, expired_on: 0 }))
        const pending = count(_.filter(cindex, (c:CindexEntry) => c.receiver == ENTRY.pub && c.expired_on == 0))
        ENTRY.enoughCerts = (existing + pending) >= conf.sigQty;
      } else {
        ENTRY.enoughCerts = true;
      }
    }))

    // BR_G28
    await Promise.all(mindex.map(async (ENTRY: MindexEntry) => {
      if (ENTRY.type == 'LEAVE') {
        ENTRY.leaverIsMember = reduce(await dal.iindexDAL.reducable(ENTRY.pub)).member
      } else {
        ENTRY.leaverIsMember = true;
      }
    }))

    // BR_G29
    await Promise.all(mindex.map(async (ENTRY: MindexEntry) => {
      if (ENTRY.type == 'ACTIVE') {
        const reducable = await dal.iindexDAL.reducable(ENTRY.pub)
        ENTRY.activeIsMember = reduce(reducable).member;
      } else {
        ENTRY.activeIsMember = true;
      }
    }))

    // BR_G30
    await Promise.all(mindex.map(async (ENTRY: MindexEntry) => {
      if (!ENTRY.revoked_on) {
        ENTRY.revokedIsMember = true;
      } else {
        ENTRY.revokedIsMember = reduce(await dal.iindexDAL.reducable(ENTRY.pub)).member
      }
    }))

    // BR_G31
    await Promise.all(mindex.map(async (ENTRY: MindexEntry) => {
      if (!ENTRY.revoked_on) {
        ENTRY.alreadyRevoked = false;
      } else {
        ENTRY.alreadyRevoked = reduce(await dal.mindexDAL.reducable(ENTRY.pub)).revoked_on
      }
    }))

    // BR_G32
    await Promise.all(mindex.map(async (ENTRY: MindexEntry) => {
      if (!ENTRY.revoked_on) {
        ENTRY.revocationSigOK = true;
      } else {
        ENTRY.revocationSigOK = await sigCheckRevoke(ENTRY, dal, block.currency);
      }
    }))

    // BR_G37
    await Indexer.prepareCertificationsAge(cindex, HEAD, HEAD_1, conf, dal);

    // BR_G38
    if (HEAD.number > 0) {
      await Promise.all(cindex.map(async (ENTRY: CindexEntry) => {
        const rows = await dal.cindexDAL.sqlFind({ issuer: ENTRY.issuer, chainable_on: { $gt: HEAD_1.medianTime }});
        ENTRY.unchainables = count(rows);
      }))
    }

    // BR_G39
    await Promise.all(cindex.map(async (ENTRY: CindexEntry) => {
      ENTRY.stock = count(await dal.cindexDAL.getValidLinksFrom(ENTRY.issuer))
    }))

    // BR_G40
    await Promise.all(cindex.map(async (ENTRY: CindexEntry) => {
      ENTRY.fromMember = reduce(await dal.iindexDAL.reducable(ENTRY.issuer)).member
    }))

    // BR_G41
    await Promise.all(cindex.map(async (ENTRY: CindexEntry) => {
      ENTRY.toMember = reduce(await dal.iindexDAL.reducable(ENTRY.receiver)).member
    }))

    // BR_G42
    await Promise.all(cindex.map(async (ENTRY: CindexEntry) => {
      ENTRY.toNewcomer = count(_.where(iindex, { member: true, pub: ENTRY.receiver })) > 0;
    }))

    // BR_G43
    await Promise.all(cindex.map(async (ENTRY: CindexEntry) => {
      ENTRY.toLeaver = reduce(await dal.mindexDAL.reducable(ENTRY.receiver)).leaving
    }))

    // BR_G44
    await Promise.all(cindex.map(async (ENTRY: CindexEntry) => {
      const reducable = await dal.cindexDAL.sqlFind({ issuer: ENTRY.issuer, receiver: ENTRY.receiver })
      ENTRY.isReplay = count(reducable) > 0 && reduce(reducable).expired_on === 0
    }))

    // BR_G45
    await Promise.all(cindex.map(async (ENTRY: CindexEntry) => {
      ENTRY.sigOK = await checkCertificationIsValid(block, ENTRY, async (block:BlockDTO,pub:string,dal:any) => {
        let localInlineIdty = block.getInlineIdentity(pub);
        if (localInlineIdty) {
          return IdentityDTO.fromInline(localInlineIdty)
        }
        return dal.getWrittenIdtyByPubkey(pub)
      }, conf, dal);
    }))

    // BR_G102
    await Promise.all(_.where(sindex, { op: constants.IDX_UPDATE }).map(async (ENTRY: SindexEntry) => {
      if (HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
        ENTRY.age = 0;
      } else {
        let ref = await dal.getBlockByBlockstamp(ENTRY.created_on);
        if (ref && blockstamp(ref.number, ref.hash) == ENTRY.created_on) {
          ENTRY.age = HEAD_1.medianTime - ref.medianTime;
        } else {
          ENTRY.age = constants.TX_WINDOW + 1;
        }
      }
    }))

    // BR_G46
    await Promise.all(_.where(sindex, { op: constants.IDX_UPDATE }).map(async (ENTRY: SindexEntry) => {
      const reducable = await dal.sindexDAL.sqlFind({
        identifier: ENTRY.identifier,
        pos: ENTRY.pos,
        amount: ENTRY.amount,
        base: ENTRY.base
      });
      ENTRY.conditions = reduce(reducable).conditions; // We valuate the input conditions, so we can map these records to a same account
      ENTRY.available = reduce(reducable).consumed === false;
    }))

    // BR_G47
    await Promise.all(_.where(sindex, { op: constants.IDX_UPDATE }).map(async (ENTRY: SindexEntry) => {
      let source = _.filter(sindex, (src:SindexEntry) => src.identifier == ENTRY.identifier && src.pos == ENTRY.pos && src.conditions && src.op === constants.IDX_CREATE)[0];
      if (!source) {
        const reducable = await dal.sindexDAL.sqlFind({
          identifier: ENTRY.identifier,
          pos: ENTRY.pos,
          amount: ENTRY.amount,
          base: ENTRY.base
        });
        source = reduce(reducable);
      }
      ENTRY.conditions = source.conditions;
      ENTRY.isLocked = !txSourceUnlock(ENTRY, source, HEAD);
    }))

    // BR_G48
    await Promise.all(_.where(sindex, { op: constants.IDX_UPDATE }).map(async (ENTRY: SindexEntry) => {
      ENTRY.isTimeLocked = ENTRY.written_time - reduce(await dal.sindexDAL.sqlFind({
          identifier: ENTRY.identifier,
          pos: ENTRY.pos,
          amount: ENTRY.amount,
          base: ENTRY.base
        })).written_time < ENTRY.locktime;
    }))

    return HEAD;
  }

  // BR_G01
  static prepareNumber(HEAD: DBHead, HEAD_1: DBHead) {
    if (HEAD_1) {
      HEAD.number = HEAD_1.number + 1;
    } else {
      HEAD.number = 0;
    }
  }

  // BR_G04
  static async prepareIssuersCount(HEAD: DBHead, range:Ranger, HEAD_1: DBHead) {
    if (HEAD.number == 0) {
      HEAD.issuersCount = 0;
    } else {
      HEAD.issuersCount = count(uniq(await range(1, HEAD_1.issuersFrame, 'issuer'))); // TODO
    }
  }

  // BR_G05
  static prepareIssuersFrame(HEAD: DBHead, HEAD_1: DBHead) {
    if (HEAD.number == 0) {
      HEAD.issuersFrame = 1;
    } else if (HEAD_1.issuersFrameVar > 0) {
      HEAD.issuersFrame = HEAD_1.issuersFrame + 1
    } else if (HEAD_1.issuersFrameVar < 0) {
      HEAD.issuersFrame = HEAD_1.issuersFrame - 1
    } else {
      HEAD.issuersFrame = HEAD_1.issuersFrame
    }
  }

  // BR_G06
  static prepareIssuersFrameVar(HEAD: DBHead, HEAD_1: DBHead) {
    if (HEAD.number == 0) {
      HEAD.issuersFrameVar = 0;
    } else {
      const issuersVar = (HEAD.issuersCount - HEAD_1.issuersCount);
      if (HEAD_1.issuersFrameVar > 0) {
        HEAD.issuersFrameVar = HEAD_1.issuersFrameVar + 5 * issuersVar - 1;
      } else if (HEAD_1.issuersFrameVar < 0) {
        HEAD.issuersFrameVar = HEAD_1.issuersFrameVar + 5 * issuersVar + 1;
      } else {
        HEAD.issuersFrameVar = HEAD_1.issuersFrameVar + 5 * issuersVar;
      }
    }
  }

  // BR_G07
  static async prepareAvgBlockSize(HEAD: DBHead, range: (n:number,m:number,s:string)=>Promise<number[]>) {
    HEAD.avgBlockSize = average(await range(1, HEAD.issuersCount, 'bsize'))
  }

  // BR_G09
  static prepareDiffNumber(HEAD: DBHead, HEAD_1: DBHead, conf: CurrencyConfDTO) {
    if (HEAD.number == 0) {
      HEAD.diffNumber = HEAD.number + conf.dtDiffEval;
    } else if (HEAD_1.diffNumber <= HEAD.number) {
      HEAD.diffNumber = HEAD_1.diffNumber + conf.dtDiffEval;
    } else {
      HEAD.diffNumber = HEAD_1.diffNumber;
    }
  }

  // BR_G11
  static prepareUDTime(HEAD: DBHead, HEAD_1: DBHead, conf: CurrencyConfDTO) {
    // UD Production
    if (HEAD.number == 0) {
      HEAD.udTime = conf.udTime0;
    } else if (HEAD_1.udTime <= HEAD.medianTime) {
      HEAD.udTime = HEAD_1.udTime + conf.dt;
    } else {
      HEAD.udTime = HEAD_1.udTime;
    }
    // UD Reevaluation
    if (HEAD.number == 0) {
      HEAD.udReevalTime = conf.udReevalTime0;
    } else if (HEAD_1.udReevalTime <= HEAD.medianTime) {
      HEAD.udReevalTime = HEAD_1.udReevalTime + conf.dtReeval;
    } else {
      HEAD.udReevalTime = HEAD_1.udReevalTime;
    }
  }

  // BR_G13
  static prepareDividend(HEAD: DBHead, HEAD_1: DBHead, conf: ConfDTO) {
    // UD re-evaluation
    if (HEAD.number == 0) {
      HEAD.dividend = conf.ud0;
    } else if (HEAD.udReevalTime != HEAD_1.udReevalTime) {
      // DUG
      const previousUB = HEAD_1.unitBase;
      HEAD.dividend = Math.ceil(HEAD_1.dividend + Math.pow(conf.c, 2) * Math.ceil(HEAD_1.massReeval / Math.pow(10, previousUB)) / HEAD.membersCount / (conf.dtReeval / conf.dt));
    } else {
      HEAD.dividend = HEAD_1.dividend;
    }
    // UD creation
    if (HEAD.number == 0) {
      HEAD.new_dividend = null;
    } else if (HEAD.udTime != HEAD_1.udTime) {
      HEAD.new_dividend = HEAD.dividend;
    } else {
      HEAD.new_dividend = null;
    }
  }

  // BR_G14
  static prepareUnitBase(HEAD: DBHead) {
    if (HEAD.dividend >= Math.pow(10, constants.NB_DIGITS_UD)) {
      HEAD.dividend = Math.ceil(HEAD.dividend / 10);
      HEAD.new_dividend = HEAD.dividend;
      HEAD.unitBase = HEAD.unitBase + 1;
    }
  }

  // BR_G15
  static prepareMass(HEAD: DBHead, HEAD_1: DBHead) {
    // Mass
    if (HEAD.number == 0) {
      HEAD.mass = 0;
    }
    else if (HEAD.udTime != HEAD_1.udTime) {
      HEAD.mass = HEAD_1.mass + HEAD.dividend * Math.pow(10, HEAD.unitBase) * HEAD.membersCount;
    } else {
      HEAD.mass = HEAD_1.mass;
    }
    // Mass on re-evaluation
    if (HEAD.number == 0) {
      HEAD.massReeval = 0;
    }
    else if (HEAD.udReevalTime != HEAD_1.udReevalTime) {
      HEAD.massReeval = HEAD_1.mass;
    } else {
      HEAD.massReeval = HEAD_1.massReeval;
    }
  }

  // BR_G16
  static async prepareSpeed(HEAD: DBHead, head: (n:number) => Promise<BlockDTO>, conf: CurrencyConfDTO) {
    if (HEAD.number == 0) {
      HEAD.speed = 0;
    } else {
      const quantity = Math.min(conf.dtDiffEval, HEAD.number);
      const elapsed = (HEAD.medianTime - (await head(quantity)).medianTime);
      if (!elapsed) {
        HEAD.speed = 100;
      } else {
        HEAD.speed = quantity / elapsed;
      }
    }
  }

  // BR_G18
  static async preparePersonalizedPoW(HEAD: DBHead, HEAD_1: DBHead, range: (n:number,m:number)=>Promise<BlockDTO>, conf: ConfDTO) {
    let nbPersonalBlocksInFrame, medianOfBlocksInFrame, blocksOfIssuer;
    let nbPreviousIssuers = 0, nbBlocksSince = 0;
    if (HEAD.number == 0) {
      nbPersonalBlocksInFrame = 0;
      medianOfBlocksInFrame = 1;
    } else {
      const blocksInFrame = _.filter(await range(1, HEAD_1.issuersFrame), (b:BlockDTO) => b.number <= HEAD_1.number);
      const issuersInFrame = blocksInFrame.map((b:BlockDTO) => b.issuer);
      blocksOfIssuer = _.filter(blocksInFrame, (entry:BlockDTO) => entry.issuer == HEAD.issuer);
      nbPersonalBlocksInFrame = count(blocksOfIssuer);
      const blocksPerIssuerInFrame = uniq(issuersInFrame).map((issuer:string) => count(_.where(blocksInFrame, { issuer })));
      medianOfBlocksInFrame = Math.max(1, median(blocksPerIssuerInFrame));
      if (nbPersonalBlocksInFrame == 0) {
        nbPreviousIssuers = 0;
        nbBlocksSince = 0;
      } else {
        const last = blocksOfIssuer[0];
        nbPreviousIssuers = last.issuersCount;
        nbBlocksSince = HEAD_1.number - last.number;
      }
    }

    // V0.6 Hardness
    const PERSONAL_EXCESS = Math.max(0, ( (nbPersonalBlocksInFrame + 1) / medianOfBlocksInFrame) - 1);
    const PERSONAL_HANDICAP = Math.floor(Math.log(1 + PERSONAL_EXCESS) / Math.log(1.189));
    HEAD.issuerDiff = Math.max(HEAD.powMin, HEAD.powMin * Math.floor(conf.percentRot * nbPreviousIssuers / (1 + nbBlocksSince))) + PERSONAL_HANDICAP;
    if ((HEAD.issuerDiff + 1) % 16 == 0) {
      HEAD.issuerDiff += 1;
    }

    HEAD.powRemainder = HEAD.issuerDiff  % 16;
    HEAD.powZeros = (HEAD.issuerDiff - HEAD.powRemainder) / 16;
  }

  // BR_G19
  static async prepareIdentitiesAge(iindex: IindexEntry[], HEAD: DBHead, HEAD_1: DBHead, conf: CurrencyConfDTO, dal: any) {
    await Promise.all(_.where(iindex, { op: constants.IDX_CREATE }).map(async (ENTRY: IindexEntry) => {
      if (HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
        ENTRY.age = 0;
      } else {
        let ref = await dal.getBlockByBlockstamp(ENTRY.created_on);
        if (ref && blockstamp(ref.number, ref.hash) == ENTRY.created_on) {
          ENTRY.age = HEAD_1.medianTime - ref.medianTime;
        } else {
          ENTRY.age = conf.idtyWindow + 1;
        }
      }
    }))
  }

  // BR_G22
  static async prepareMembershipsAge(mindex: MindexEntry[], HEAD: DBHead, HEAD_1: DBHead, conf: CurrencyConfDTO, dal: any) {
    await Promise.all(_.filter(mindex, (entry: MindexEntry) => !entry.revoked_on).map(async (ENTRY:MindexEntry) => {
      if (HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
        ENTRY.age = 0;
      } else {
        let ref = await dal.getBlockByBlockstamp(ENTRY.created_on);
        if (ref && blockstamp(ref.number, ref.hash) == ENTRY.created_on) {
          ENTRY.age = HEAD_1.medianTime - ref.medianTime;
        } else {
          ENTRY.age = conf.msWindow + 1;
        }
      }
    }))
  }

  // BR_G37
  static async prepareCertificationsAge(cindex: CindexEntry[], HEAD: DBHead, HEAD_1: DBHead, conf: CurrencyConfDTO, dal: any) {
    await Promise.all(cindex.map(async (ENTRY) => {
      if (HEAD.number == 0) {
        ENTRY.age = 0;
      } else {
        let ref = await dal.getBlock(ENTRY.created_on)
        if (ref) {
          ENTRY.age = HEAD_1.medianTime - ref.medianTime;
        } else {
          ENTRY.age = conf.sigWindow + 1;
        }
      }
    }))
  }

  // BR_G49
  static ruleVersion(HEAD: DBHead, HEAD_1: DBHead) {
    if (HEAD.number > 0) {
      return HEAD.version == HEAD_1.version || HEAD.version == HEAD_1.version + 1;
    }
    return true;
  }

  // BR_G50
  static ruleBlockSize(HEAD: DBHead) {
    if (HEAD.number > 0) {
      return HEAD.bsize < Indexer.DUP_HELPERS.getMaxBlockSize(HEAD);
    }
    return true;
  }

  // BR_G98
  static ruleCurrency(block:BlockDTO, HEAD: DBHead) {
    if (HEAD.number > 0) {
      return block.currency === HEAD.currency;
    }
    return true;
  }

  // BR_G51
  static ruleNumber(block:BlockDTO, HEAD: DBHead) {
    return block.number == HEAD.number
  }

  // BR_G52
  static rulePreviousHash(block:BlockDTO, HEAD: DBHead) {
    return block.previousHash == HEAD.previousHash || (!block.previousHash && !HEAD.previousHash)
  }

  // BR_G53
  static rulePreviousIssuer(block:BlockDTO, HEAD: DBHead) {
    return block.previousIssuer == HEAD.previousIssuer || (!block.previousIssuer && !HEAD.previousIssuer)
  }

  // BR_G101
  static ruleIssuerIsMember(HEAD: DBHead) {
    return HEAD.issuerIsMember == true
  }

  // BR_G54
  static ruleIssuersCount(block:BlockDTO, HEAD: DBHead) {
    return block.issuersCount == HEAD.issuersCount
  }

  // BR_G55
  static ruleIssuersFrame(block:BlockDTO, HEAD: DBHead) {
    return block.issuersFrame == HEAD.issuersFrame
  }

  // BR_G56
  static ruleIssuersFrameVar(block:BlockDTO, HEAD: DBHead) {
    return block.issuersFrameVar == HEAD.issuersFrameVar
  }

  // BR_G57
  static ruleMedianTime(block:BlockDTO, HEAD: DBHead) {
    return block.medianTime == HEAD.medianTime
  }

  // BR_G58
  static ruleDividend(block:BlockDTO, HEAD: DBHead) {
    return block.dividend == HEAD.new_dividend
  }

  // BR_G59
  static ruleUnitBase(block:BlockDTO, HEAD: DBHead) {
    return block.unitbase == HEAD.unitBase
  }

  // BR_G60
  static ruleMembersCount(block:BlockDTO, HEAD: DBHead) {
    return block.membersCount == HEAD.membersCount
  }

  // BR_G61
  static rulePowMin(block: BlockDTO, HEAD: DBHead) {
    if (HEAD.number > 0) {
      return block.powMin == HEAD.powMin;
    }
    return true
  }

  // BR_G62
  static ruleProofOfWork(HEAD: DBHead) {
    // Compute exactly how much zeros are required for this block's issuer
    const remainder = HEAD.powRemainder;
    const nbZerosReq = HEAD.powZeros;
    const highMark = constants.PROOF_OF_WORK.UPPER_BOUND[remainder];
    const powRegexp = new RegExp('^0{' + nbZerosReq + '}' + '[0-' + highMark + ']');
    try {
      if (!HEAD.hash.match(powRegexp)) {
        const match = HEAD.hash.match(/^0*/)
        const givenZeros = Math.max(0, Math.min(nbZerosReq, (match && match[0].length) || 0))
        const c = HEAD.hash.substr(givenZeros, 1);
        throw Error('Wrong proof-of-work level: given ' + givenZeros + ' zeros and \'' + c + '\', required was ' + nbZerosReq + ' zeros and an hexa char between [0-' + highMark + ']');
      }
      return true;
    } catch (e) {
      console.error(e)
      return false;
    }
  }

  // BR_G63
  static ruleIdentityWritability(iindex: IindexEntry[], conf: ConfDTO) {
    for (const ENTRY of iindex) {
      if (ENTRY.age > conf.idtyWindow) return false;
    }
    return true
  }

  // BR_G64
  static ruleMembershipWritability(mindex: MindexEntry[], conf: ConfDTO) {
    for (const ENTRY of mindex) {
      if (ENTRY.age > conf.msWindow) return false;
    }
    return true
  }

  // BR_G108
  static ruleMembershipPeriod(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (ENTRY.unchainables > 0) return false;
    }
    return true
  }

  // BR_G65
  static ruleCertificationWritability(cindex: CindexEntry[], conf: ConfDTO) {
    for (const ENTRY of cindex) {
      if (ENTRY.age > conf.sigWindow) return false;
    }
    return true
  }

  // BR_G66
  static ruleCertificationStock(cindex: CindexEntry[], conf: ConfDTO) {
    for (const ENTRY of cindex) {
      if (ENTRY.stock > conf.sigStock) return false;
    }
    return true
  }

  // BR_G67
  static ruleCertificationPeriod(cindex: CindexEntry[]) {
    for (const ENTRY of cindex) {
      if (ENTRY.unchainables > 0) return false;
    }
    return true
  }

  // BR_G68
  static ruleCertificationFromMember(HEAD: DBHead, cindex: CindexEntry[]) {
    if (HEAD.number > 0) {
      for (const ENTRY of cindex) {
        if (!ENTRY.fromMember) return false;
      }
    }
    return true
  }

  // BR_G69
  static ruleCertificationToMemberOrNewcomer(cindex: CindexEntry[]) {
    for (const ENTRY of cindex) {
      if (!ENTRY.toMember && !ENTRY.toNewcomer) return false;
    }
    return true
  }

  // BR_G70
  static ruleCertificationToLeaver(cindex: CindexEntry[]) {
    for (const ENTRY of cindex) {
      if (ENTRY.toLeaver) return false;
    }
    return true
  }

  // BR_G71
  static ruleCertificationReplay(cindex: CindexEntry[]) {
    for (const ENTRY of cindex) {
      if (ENTRY.isReplay) return false;
    }
    return true
  }

  // BR_G72
  static ruleCertificationSignature(cindex: CindexEntry[]) {
    for (const ENTRY of cindex) {
      if (!ENTRY.sigOK) return false;
    }
    return true
  }

  // BR_G73
  static ruleIdentityUIDUnicity(iindex: IindexEntry[]) {
    for (const ENTRY of iindex) {
      if (!ENTRY.uidUnique) return false;
    }
    return true
  }

  // BR_G74
  static ruleIdentityPubkeyUnicity(iindex: IindexEntry[]) {
    for (const ENTRY of iindex) {
      if (!ENTRY.pubUnique) return false;
    }
    return true
  }

  // BR_G75
  static ruleMembershipSuccession(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (!ENTRY.numberFollowing) return false;
    }
    return true
  }

  // BR_G76
  static ruleMembershipDistance(HEAD: DBHead, mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (HEAD.currency == 'gtest'
        && !ENTRY.distanceOK
        // && HEAD.number != 8450
        // && HEAD.number != 9775
        // && HEAD.number != 10893
        // && HEAD.number != 11090
        // && HEAD.number != 11263
        // && HEAD.number != 11392
        && HEAD.number < 11512) {
        return false;
      }
      else if (HEAD.currency != 'gtest' && !ENTRY.distanceOK) {
        return false;
      }
    }
    return true
  }

  // BR_G77
  static ruleMembershipOnRevoked(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (ENTRY.onRevoked) return false;
    }
    return true
  }

  // BR_G78
  static ruleMembershipJoinsTwice(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (ENTRY.joinsTwice) return false;
    }
    return true
  }

  // BR_G79
  static ruleMembershipEnoughCerts(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (!ENTRY.enoughCerts) return false;
    }
    return true
  }

  // BR_G80
  static ruleMembershipLeaverIsMember(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (!ENTRY.leaverIsMember) return false;
    }
    return true
  }

  // BR_G81
  static ruleMembershipActiveIsMember(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (!ENTRY.activeIsMember) return false;
    }
    return true
  }

  // BR_G82
  static ruleMembershipRevokedIsMember(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (!ENTRY.revokedIsMember) return false;
    }
    return true
  }

  // BR_G83
  static ruleMembershipRevokedSingleton(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (ENTRY.alreadyRevoked) return false;
    }
    return true
  }

  // BR_G84
  static ruleMembershipRevocationSignature(mindex: MindexEntry[]) {
    for (const ENTRY of mindex) {
      if (!ENTRY.revocationSigOK) return false;
    }
    return true
  }

  // BR_G85
  static ruleMembershipExcludedIsMember(iindex: IindexEntry[]) {
    for (const ENTRY of iindex) {
      if (!ENTRY.excludedIsMember) return false;
    }
    return true
  }

  // BR_G86
  static async ruleToBeKickedArePresent(iindex: IindexEntry[], dal:any) {
    const toBeKicked = await dal.iindexDAL.getToBeKickedPubkeys();
    for (const toKick of toBeKicked) {
      if (count(_.where(iindex, { pub: toKick, isBeingKicked: true })) !== 1) {
        return false;
      }
    }
    const beingKicked = _.filter(iindex, (i:IindexEntry) => i.member === false);
    for (const entry of beingKicked) {
      if (!entry.hasToBeExcluded) {
        return false;
      }
    }
    return true
  }

  // BR_G103
  static ruleTxWritability(sindex: SindexEntry[]) {
    for (const ENTRY of sindex) {
      if (ENTRY.age > constants.TX_WINDOW) return false;
    }
    return true
  }

  // BR_G87
  static ruleInputIsAvailable(sindex: SindexEntry[]) {
    const inputs = _.where(sindex, { op: constants.IDX_UPDATE });
    for (const ENTRY of inputs) {
      if (!ENTRY.available) {
        return false;
      }
    }
    return true
  }

  // BR_G88
  static ruleInputIsUnlocked(sindex: SindexEntry[]) {
    const inputs = _.where(sindex, { op: constants.IDX_UPDATE });
    for (const ENTRY of inputs) {
      if (ENTRY.isLocked) {
        return false;
      }
    }
    return true
  }

  // BR_G89
  static ruleInputIsTimeUnlocked(sindex: SindexEntry[]) {
    const inputs = _.where(sindex, { op: constants.IDX_UPDATE });
    for (const ENTRY of inputs) {
      if (ENTRY.isTimeLocked) {
        return false;
      }
    }
    return true
  }

  // BR_G90
  static ruleOutputBase(sindex: SindexEntry[], HEAD_1: DBHead) {
    const inputs = _.where(sindex, { op: constants.IDX_CREATE });
    for (const ENTRY of inputs) {
      if (ENTRY.unitBase > HEAD_1.unitBase) {
        return false;
      }
    }
    return true
  }

  // BR_G91
  static async ruleIndexGenDividend(HEAD: DBHead, dal: any) {
    const dividends = [];
    if (HEAD.new_dividend) {
      const members = await dal.iindexDAL.getMembersPubkeys()
      for (const MEMBER of members) {
        dividends.push({
          op: 'CREATE',
          identifier: MEMBER.pub,
          pos: HEAD.number,
          written_on: [HEAD.number, HEAD.hash].join('-'),
          writtenOn: HEAD.number,
          written_time: HEAD.medianTime,
          amount: HEAD.dividend,
          base: HEAD.unitBase,
          locktime: null,
          conditions: 'SIG(' + MEMBER.pub + ')',
          consumed: false
        });
      }
    }
    return dividends;
  }

  // BR_G106
  static async ruleIndexGarbageSmallAccounts(HEAD: DBHead, sindex: SindexEntry[], dal: any) {
    const garbages = [];
    const accounts = Object.keys(sindex.reduce((acc: { [k:string]: boolean }, src) => {
      acc[src.conditions] = true;
      return acc;
    }, {}));
    const wallets: { [k:string]: Promise<any> } = accounts.reduce((map: { [k:string]: Promise<any> }, acc) => {
      map[acc] = dal.getWallet(acc);
      return map;
    }, {});
    for (const account of accounts) {
      const localAccountEntries = _.filter(sindex, (src:SindexEntry) => src.conditions == account);
      const wallet = await wallets[account];
      const balance = wallet.balance
      const variations = localAccountEntries.reduce((sum:number, src:SindexEntry) => {
        if (src.op === 'CREATE') {
          return sum + src.amount * Math.pow(10, src.base);
        } else {
          return sum - src.amount * Math.pow(10, src.base);
        }
      }, 0)
      // console.log('Balance of %s = %s (%s)', account, balance, variations > 0 ? '+' + variations : variations)
      if (balance + variations < constants.ACCOUNT_MINIMUM_CURRENT_BASED_AMOUNT * Math.pow(10, HEAD.unitBase)) {
        const globalAccountEntries = await dal.sindexDAL.getAvailableForConditions(account)
        for (const src of localAccountEntries.concat(globalAccountEntries)) {
          const sourceBeingConsumed = _.filter(sindex, (entry:SindexEntry) => entry.op === 'UPDATE' && entry.identifier == src.identifier && entry.pos == src.pos).length > 0;
          if (!sourceBeingConsumed) {
            garbages.push({
              op: 'UPDATE',
              tx: src.tx,
              identifier: src.identifier,
              pos: src.pos,
              amount: src.amount,
              base: src.base,
              written_on: [HEAD.number, HEAD.hash].join('-'),
              writtenOn: HEAD.number,
              written_time: HEAD.medianTime,
              conditions: src.conditions,
              consumed: true // It is now consumed
            });
          }
        }
      }
    }
    return garbages;
  }

  // BR_G92
  static async ruleIndexGenCertificationExpiry(HEAD: DBHead, dal:any) {
    const expiries = [];
    const certs = await dal.cindexDAL.findExpired(HEAD.medianTime);
    for (const CERT of certs) {
      expiries.push({
        op: 'UPDATE',
        issuer: CERT.issuer,
        receiver: CERT.receiver,
        created_on: CERT.created_on,
        written_on: [HEAD.number, HEAD.hash].join('-'),
        writtenOn: HEAD.number,
        expired_on: HEAD.medianTime
      });
    }
    return expiries;
  }

  // BR_G93
  static async ruleIndexGenMembershipExpiry(HEAD: DBHead, dal:any) {
    const expiries = [];
    const memberships: MindexEntry[] = reduceBy(await dal.mindexDAL.sqlFind({ expires_on: { $lte: HEAD.medianTime } }), ['pub']);
    for (const POTENTIAL of memberships) {
      const MS = await dal.mindexDAL.getReducedMS(POTENTIAL.pub);
      const hasRenewedSince = MS.expires_on > HEAD.medianTime;
      if (!MS.expired_on && !hasRenewedSince) {
        expiries.push({
          op: 'UPDATE',
          pub: MS.pub,
          created_on: MS.created_on,
          written_on: [HEAD.number, HEAD.hash].join('-'),
          writtenOn: HEAD.number,
          expired_on: HEAD.medianTime
        });
      }
    }
    return expiries;
  }

  // BR_G94
  static async ruleIndexGenExclusionByMembership(HEAD: DBHead, mindex: MindexEntry[], dal:any) {
    const exclusions = [];
    const memberships = _.filter(mindex, (entry: MindexEntry) => entry.expired_on);
    for (const MS of memberships) {
      const idty = await dal.iindexDAL.getFromPubkey(MS.pub);
      if (idty.member) {
        exclusions.push({
          op: 'UPDATE',
          pub: MS.pub,
          written_on: [HEAD.number, HEAD.hash].join('-'),
          writtenOn: HEAD.number,
          kick: true
        });
      }
    }
    return exclusions;
  }

  // BR_G95
  static async ruleIndexGenExclusionByCertificatons(HEAD: DBHead, cindex: CindexEntry[], iindex: IindexEntry[], conf: ConfDTO, dal: any) {
    const exclusions = [];
    const expiredCerts = _.filter(cindex, (c: CindexEntry) => c.expired_on > 0);
    for (const CERT of expiredCerts) {
      const just_expired = _.filter(cindex, (c: CindexEntry) => c.receiver == CERT.receiver && c.expired_on > 0);
      const just_received = _.filter(cindex, (c: CindexEntry) => c.receiver == CERT.receiver && c.expired_on == 0);
      const non_expired_global = await dal.cindexDAL.getValidLinksTo(CERT.receiver);
      if ((count(non_expired_global) - count(just_expired) + count(just_received)) < conf.sigQty) {
        const isInExcluded = _.filter(iindex, (i: IindexEntry) => i.member === false && i.pub === CERT.receiver)[0];
        const idty = await dal.iindexDAL.getFromPubkey(CERT.receiver);
        if (!isInExcluded && idty.member) {
          exclusions.push({
            op: 'UPDATE',
            pub: CERT.receiver,
            written_on: [HEAD.number, HEAD.hash].join('-'),
            writtenOn: HEAD.number,
            kick: true
          });
        }
      }
    }
    return exclusions;
  }

  // BR_G96
  static async ruleIndexGenImplicitRevocation(HEAD: DBHead, dal:any) {
    const revocations = [];
    const pending = await dal.mindexDAL.sqlFind({ revokes_on: { $lte: HEAD.medianTime}, revoked_on: { $null: true } })
    for (const MS of pending) {
      const REDUCED = reduce(await dal.mindexDAL.sqlFind({ pub: MS.pub }))
      if (REDUCED.revokes_on <= HEAD.medianTime && !REDUCED.revoked_on) {
        revocations.push({
          op: 'UPDATE',
          pub: MS.pub,
          created_on: REDUCED.created_on,
          written_on: [HEAD.number, HEAD.hash].join('-'),
          writtenOn: HEAD.number,
          revoked_on: HEAD.medianTime
        });
      }
    }
    return revocations;
  }

  // BR_G104
  static async ruleIndexCorrectMembershipExpiryDate(HEAD: DBHead, mindex: MindexEntry[], dal:any) {
    for (const MS of mindex) {
      if (MS.type == 'JOIN' || MS.type == 'ACTIVE') {
        let basedBlock = { medianTime: 0 };
        if (HEAD.number == 0) {
          basedBlock = HEAD;
        } else {
          if (HEAD.currency === 'gtest') {
            basedBlock = await dal.getBlockByBlockstamp(MS.created_on);
          } else {
            basedBlock = await dal.getBlockByBlockstamp(MS.created_on);
          }
        }
        if (MS.expires_on === null) {
          MS.expires_on = 0
        }
        if (MS.revokes_on === null) {
          MS.revokes_on = 0
        }
        MS.expires_on += basedBlock.medianTime;
        MS.revokes_on += basedBlock.medianTime;
      }
    }
  }

  // BR_G105
  static async ruleIndexCorrectCertificationExpiryDate(HEAD: DBHead, cindex: CindexEntry[], dal:any) {
    for (const CERT of cindex) {
      let basedBlock = { medianTime: 0 };
      if (HEAD.number == 0) {
        basedBlock = HEAD;
      } else {
        if (HEAD.currency === 'gtest') {
          basedBlock = await dal.getBlock(CERT.created_on);
        } else {
          basedBlock = await dal.getBlock(CERT.created_on);
        }
      }
      CERT.expires_on += basedBlock.medianTime;
    }
  }

  static iindexCreate(index: IndexEntry[]): IindexEntry[] {
    return _(index).filter({ index: constants.I_INDEX, op: constants.IDX_CREATE })
  }

  static mindexCreate(index: IndexEntry[]): MindexEntry[] {
    return _(index).filter({ index: constants.M_INDEX, op: constants.IDX_CREATE })
  }

  static iindex(index: IndexEntry[]): IindexEntry[] {
    return _(index).filter({ index: constants.I_INDEX })
  }

  static mindex(index: IndexEntry[]): MindexEntry[] {
    return _(index).filter({ index: constants.M_INDEX })
  }

  static cindex(index: IndexEntry[]): CindexEntry[] {
    return _(index).filter({ index: constants.C_INDEX })
  }

  static sindex(index: IndexEntry[]): SindexEntry[] {
    return _(index).filter({ index: constants.S_INDEX })
  }

  static DUP_HELPERS = {

    reduce: reduce,
    reduceBy: reduceBy,
    getMaxBlockSize: (HEAD: DBHead) => Math.max(500, Math.ceil(1.1 * HEAD.avgBlockSize)),
    checkPeopleAreNotOudistanced: checkPeopleAreNotOudistanced
  }
}

function count(range:any[]) {
  return range.length;
}

function uniq(range:any[]) {
  return _.uniq(range);
}

function average(values:number[]) {
  // No values => 0 average
  if (!values.length) return 0;
  // Otherwise, real average
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.floor(avg);
}

function median(values:number[]) {
  let med = 0;
  values.sort((a, b) => a < b ? -1 : (a > b ? 1 : 0));
  const nbValues = values.length;
  if (nbValues > 0) {
    if (nbValues % 2 === 0) {
      // Even number: the median is the average between the 2 central values, ceil rounded.
      const firstValue = values[nbValues / 2];
      const secondValue = values[nbValues / 2 - 1];
      med = ((firstValue + secondValue) / 2);
    } else {
      med = values[(nbValues + 1) / 2 - 1];
    }
  }
  return med;
}

function number(theBlockstamp: string) {
  return parseInt(theBlockstamp);
}

function blockstamp(aNumber: number, aHash: string) {
  return [aNumber, aHash].join('-');
}

function reduce(records: any[]) {
  return records.reduce((obj:any, record) => {
    const keys = Object.keys(record);
    for (const k of keys) {
      if (record[k] !== undefined && record[k] !== null) {
        obj[k] = record[k];
      }
    }
    return obj;
  }, {});
}

function reduceBy(reducables: IndexEntry[], properties: string[]): any[] {
  const reduced = reducables.reduce((map: any, entry: any) => {
    const id = properties.map((prop) => entry[prop]).join('-');
    map[id] = map[id] || [];
    map[id].push(entry);
    return map;
  }, {});
  return _.values(reduced).map((value: SindexEntry[]) => Indexer.DUP_HELPERS.reduce(value));
}

async function checkPeopleAreNotOudistanced (pubkeys: string[], newLinks: any, newcomers: string[], conf: ConfDTO, dal: any) {
  // let wotb = dal.wotb;
  let wotb = dal.wotb.memCopy();
  let current = await dal.getCurrentBlockOrNull();
  let membersCount = current ? current.membersCount : 0;
  // TODO: make a temporary copy of the WoT in RAM
  // We add temporarily the newcomers to the WoT, to integrate their new links
  let nodesCache = newcomers.reduce((map: any, pubkey) => {
    let nodeID = wotb.addNode();
    map[pubkey] = nodeID;
    wotb.setEnabled(false, nodeID); // These are not members yet
    return map;
  }, {});
  // Add temporarily the links to the WoT
  let tempLinks = [];
  let toKeys = _.keys(newLinks);
  for (const toKey of toKeys) {
    let toNode = await getNodeIDfromPubkey(nodesCache, toKey, dal);
    for (const fromKey of newLinks[toKey]) {
      let fromNode = await getNodeIDfromPubkey(nodesCache, fromKey, dal);
      tempLinks.push({ from: fromNode, to: toNode });
    }
  }
  wotb.setMaxCert(conf.sigStock + tempLinks.length);
  tempLinks.forEach((link) => wotb.addLink(link.from, link.to));
  // Checking distance of each member against them
  let error;
  for (const pubkey of pubkeys) {
    let nodeID = await getNodeIDfromPubkey(nodesCache, pubkey, dal);
    const dSen = Math.ceil(Math.pow(membersCount, 1 / conf.stepMax));
    let isOutdistanced = wotb.isOutdistanced(nodeID, dSen, conf.stepMax, conf.xpercent);
    if (isOutdistanced) {
      error = Error('Joiner/Active is outdistanced from WoT');
      break;
    }
  }
  // Undo temp links/nodes
  tempLinks.forEach((link) => wotb.removeLink(link.from, link.to));
  newcomers.forEach(() => wotb.removeNode());
  wotb.clear();
  return error ? true : false;
}

async function getNodeIDfromPubkey(nodesCache: any, pubkey: string, dal: any) {
  let toNode = nodesCache[pubkey];
  // Eventually cache the target nodeID
  if (toNode === null || toNode === undefined) {
    let idty = await dal.getWrittenIdtyByPubkey(pubkey);
    toNode = idty.wotb_id;
    nodesCache[pubkey] = toNode;
  }
  return toNode;
}

async function sigCheckRevoke(entry: MindexEntry, dal: any, currency: string) {
  try {
    let pubkey = entry.pub, sig = entry.revocation || "";
    let idty = await dal.getWrittenIdtyByPubkey(pubkey);
    if (!idty) {
      throw Error("A pubkey who was never a member cannot be revoked");
    }
    if (idty.revoked) {
      throw Error("A revoked identity cannot be revoked again");
    }
    let rawRevocation = rawer.getOfficialRevocation({
      currency: currency,
      issuer: idty.pubkey,
      uid: idty.uid,
      buid: idty.buid,
      sig: idty.sig,
      revocation: ''
    });
    let sigOK = verify(rawRevocation, sig, pubkey);
    if (!sigOK) {
      throw Error("Revocation signature must match");
    }
    return true;
  } catch (e) {
    return false;
  }
}



async function checkCertificationIsValid (block: BlockDTO, cert: CindexEntry, findIdtyFunc: (b:BlockDTO,to:string,dal:any)=>Promise<IdentityDTO>, conf: ConfDTO, dal: any) {
  if (block.number == 0 && cert.created_on != 0) {
    throw Error('Number must be 0 for root block\'s certifications');
  } else {
    try {
      let basedBlock = new BlockDTO()
      basedBlock.hash = constants.SPECIAL_HASH

      if (block.number != 0) {
        try {
          basedBlock = await dal.getBlock(cert.created_on);
        } catch (e) {
          throw Error('Certification based on an unexisting block');
        }
      }
      let idty = await findIdtyFunc(block, cert.receiver, dal)
      let current = block.number == 0 ? null : await dal.getCurrentBlockOrNull();
      if (!idty) {
        throw Error('Identity does not exist for certified');
      }
      else if (current && current.medianTime > basedBlock.medianTime + conf.sigValidity) {
        throw Error('Certification has expired');
      }
      else if (cert.issuer == idty.pubkey)
        throw Error('Rejected certification: certifying its own self-certification has no meaning');
      else {
        const buid = [cert.created_on, basedBlock.hash].join('-');
        idty.currency = conf.currency;
        const raw = rawer.getOfficialCertification(_.extend(idty, {
          idty_issuer: idty.pubkey,
          idty_uid: idty.uid,
          idty_buid: idty.buid,
          idty_sig: idty.sig,
          issuer: cert.issuer,
          buid: buid,
          sig: ''
        }));
        const verified = verify(raw, cert.sig, cert.issuer);
        if (!verified) {
          throw constants.ERRORS.WRONG_SIGNATURE_FOR_CERT
        }
        return true;
      }
    } catch (e) {
      return false;
    }
  }
}

function txSourceUnlock(ENTRY:SindexEntry, source:SindexEntry, HEAD: DBHead) {
  const tx = ENTRY.txObj;
  let sigResults = LOCAL_RULES_HELPERS.getSigResult(tx)
  let unlocksForCondition = [];
  let unlocksMetadata: any = {};
  let unlockValues = ENTRY.unlock;
  if (source.conditions) {
    if (unlockValues) {
      // Evaluate unlock values
      let sp = unlockValues.split(' ');
      for (const func of sp) {
        const match = func.match(/\((.+)\)/)
        let param = match && match[1];
        if (param && func.match(/SIG/)) {
          let pubkey = tx.issuers[parseInt(param)];
          if (!pubkey) {
            return false;
          }
          unlocksForCondition.push({
            pubkey: pubkey,
            sigOK: sigResults.sigs[pubkey] && sigResults.sigs[pubkey].matching || false
          });
        } else {
          // XHX
          unlocksForCondition.push(param);
        }
      }
    }

    if (source.conditions.match(/CLTV/)) {
      unlocksMetadata.currentTime = HEAD.medianTime;
    }

    if (source.conditions.match(/CSV/)) {
      unlocksMetadata.elapsedTime = HEAD.medianTime - source.written_time;
    }

    if (txunlock(source.conditions, unlocksForCondition, unlocksMetadata)) {
      return true;
    }
  }
  return false;
}
