"use strict";

const co              = require('co');
const _               = require('underscore');
const constants       = require('../constants');
const rawer           = require('duniter-common').rawer;
const unlock          = require('../ucp/txunlock');
const keyring         = require('duniter-common').keyring;
const Block           = require('../entity/block');
const Identity        = require('../entity/identity');
const Certification   = require('../entity/certification');
const Membership      = require('../entity/membership');
const Transaction     = require('../entity/transaction');

const indexer = module.exports = {

  localIndex: (block, conf) => {

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

    const index = [];

    /***************************
     * IDENTITIES INDEX (IINDEX)
     **************************/
    for (const identity of block.identities) {
      const idty = Identity.statics.fromInline(identity);
      // Computes the hash if not done yet
      index.push({
        index: constants.I_INDEX,
        op: constants.IDX_CREATE,
        uid: idty.uid,
        pub: idty.pubkey,
        hash: idty.hash,
        sig: idty.sig,
        created_on: idty.buid,
        written_on: [block.number, block.hash].join('-'),
        member: true,
        wasMember: true,
        kick: false,
        wid: null // wotb id
      });
    }

    /****************************
     * MEMBERSHIPS INDEX (MINDEX)
     ***************************/
    // Joiners (newcomer or join back)
    for (const inlineMS of block.joiners) {
      const ms = Membership.statics.fromInline(inlineMS);
      const matchesANewcomer = _.filter(index, (row) => row.index == constants.I_INDEX && row.pub == ms.issuer).length > 0;
      if (matchesANewcomer) {
        // Newcomer
        index.push({
          index: constants.M_INDEX,
          op: constants.IDX_CREATE,
          pub: ms.issuer,
          created_on: [ms.number, ms.fpr].join('-'),
          written_on: [block.number, block.hash].join('-'),
          type: 'JOIN',
          expires_on: conf.msValidity,
          revokes_on: conf.msValidity * constants.REVOCATION_FACTOR,
          revoked_on: null,
          leaving: false
        });
      } else {
        // Join back
        index.push({
          index: constants.M_INDEX,
          op: constants.IDX_UPDATE,
          pub: ms.issuer,
          created_on: [ms.number, ms.fpr].join('-'),
          written_on: [block.number, block.hash].join('-'),
          type: 'JOIN',
          expires_on: conf.msValidity,
          revokes_on: conf.msValidity * constants.REVOCATION_FACTOR,
          revoked_on: null,
          leaving: null
        });
        index.push({
          index: constants.I_INDEX,
          op: constants.IDX_UPDATE,
          uid: null,
          pub: ms.issuer,
          created_on: null,
          written_on: [block.number, block.hash].join('-'),
          member: true,
          wasMember: null,
          kick: null,
          wid: null
        });
      }
    }
    // Actives
    for (const inlineMS of block.actives) {
      const ms = Membership.statics.fromInline(inlineMS);
      // Renew
      index.push({
        index: constants.M_INDEX,
        op: constants.IDX_UPDATE,
        pub: ms.issuer,
        created_on: [ms.number, ms.fpr].join('-'),
        written_on: [block.number, block.hash].join('-'),
        type: 'ACTIVE',
        expires_on: conf.msValidity,
        revokes_on: conf.msValidity * constants.REVOCATION_FACTOR,
        revoked_on: null,
        leaving: null
      });
    }
    // Leavers
    for (const inlineMS of block.leavers) {
      const ms = Membership.statics.fromInline(inlineMS);
      index.push({
        index: constants.M_INDEX,
        op: constants.IDX_UPDATE,
        pub: ms.issuer,
        created_on: [ms.number, ms.fpr].join('-'),
        written_on: [block.number, block.hash].join('-'),
        type: 'LEAVE',
        expires_on: null,
        revokes_on: null,
        revoked_on: null,
        leaving: true
      });
    }
    // Revoked
    for (const inlineRevocation of block.revoked) {
      const revocation = Identity.statics.revocationFromInline(inlineRevocation);
      index.push({
        index: constants.M_INDEX,
        op: constants.IDX_UPDATE,
        pub: revocation.pubkey,
        created_on: [block.number, block.hash].join('-'),
        written_on: [block.number, block.hash].join('-'),
        expires_on: null,
        revokes_on: null,
        revoked_on: [block.number, block.hash].join('-'),
        revocation: revocation.sig,
        leaving: false
      });
    }
    // Excluded
    for (const excluded of block.excluded) {
      index.push({
        index: constants.I_INDEX,
        op: constants.IDX_UPDATE,
        uid: null,
        pub: excluded,
        created_on: null,
        written_on: [block.number, block.hash].join('-'),
        member: false,
        wasMember: null,
        kick: false,
        wid: null
      });
    }

    /*******************************
     * CERTIFICATIONS INDEX (CINDEX)
     ******************************/
    for (const inlineCert of block.certifications) {
      const cert = Certification.statics.fromInline(inlineCert);
      index.push({
        index: constants.C_INDEX,
        op: constants.IDX_CREATE,
        issuer: cert.pubkey,
        receiver: cert.to,
        created_on: cert.block_number,
        written_on: [block.number, block.hash].join('-'),
        sig: cert.sig,
        chainable_on: parseInt(block.medianTime)  + conf.sigPeriod,
        expires_on: conf.sigValidity,
        expired_on: 0,
        from_wid: null,
        to_wid: null
      });
    }

    return index.concat(module.exports.localSIndex(block));
  },

  localSIndex: (block) => {
    /*******************************
     * SOURCES INDEX (SINDEX)
     ******************************/
    const index = [];
    if (!block.transactions && block.getTransactions) {
      const txs = block.getTransactions();
      block.transactions = [];
      for (const tx of txs) {
        block.transactions.push({
          version: tx.version,
          comment: tx.comment,
          issuers: tx.issuers,
          signatures: tx.signatures,
          inputs: tx.inputs.map((i) => i.raw),
          outputs: tx.outputs.map((o) => o.raw)
        });
      }
    }
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      const tx = new Transaction(obj);
      const txObj = tx.getTransaction();
      const txHash = tx.getHash(true);
      let k = 0;
      for (const input of txObj.inputs) {
        index.push({
          index: constants.S_INDEX,
          op: constants.IDX_UPDATE,
          tx: txHash,
          identifier: input.identifier,
          pos: input.pos,
          created_on: tx.blockstamp,
          written_on: [block.number, block.hash].join('-'),
          written_time: block.medianTime,
          locktime: obj.locktime,
          unlock: txObj.unlocks[k],
          amount: input.amount,
          base: input.base,
          conditions: null,
          consumed: true,
          txObj: txObj
        });
        k++;
      }

      let i = 0;
      for (const output of txObj.outputs) {
        index.push({
          index: constants.S_INDEX,
          op: constants.IDX_CREATE,
          tx: txHash,
          identifier: txHash,
          pos: i++,
          written_on: [block.number, block.hash].join('-'),
          written_time: block.medianTime,
          locktime: obj.locktime,
          amount: output.amount,
          base: output.base,
          conditions: output.conditions,
          consumed: false,
          txObj: obj
        });
      }
    }
    return index;
  },

  quickCompleteGlobalScope: (block, conf, bindex, iindex, mindex, cindex, sindex, dal) => co(function*() {

    function range(start, end, property) {
      return co(function*() {
        let range;
        end = Math.min(end, bindex.length);
        if (start == 1) {
          range = bindex.slice(-end);
        } else {
          range = bindex.slice(-end, -start + 1);
        }
        range.reverse();
        if (property) {
          // Filter on a particular property
          return range.map((b) => b[property]);
        } else {
          return range;
        }
      });
    }

    function head(n) {
      return co(function*() {
        return (yield range(n, n))[0];
      });
    }

    const HEAD = {
      version: block.version,
      bsize: Block.statics.getLen(block),
      hash: Block.statics.getHash(block),
      issuer: block.issuer,
      time: block.time,
      medianTime: block.medianTime,
      number: block.number,
      powMin: block.powMin,
      unitBase: block.unitbase,
      membersCount: block.membersCount,
      dividend: block.dividend
    };
    const HEAD_1 = yield head(1);

    if (HEAD.number == 0) {
      HEAD.dividend = conf.ud0;
    }
    else if (!HEAD.dividend) {
      HEAD.dividend = HEAD_1.dividend;
    } else {
      HEAD.new_dividend = HEAD.dividend;
    }

    // BR_G04
    yield indexer.prepareIssuersCount(HEAD, range, HEAD_1);

    // BR_G05
    indexer.prepareIssuersFrame(HEAD, HEAD_1);

    // BR_G06
    indexer.prepareIssuersFrameVar(HEAD, HEAD_1);

    // BR_G07
    yield indexer.prepareAvgBlockSize(HEAD, range);

    // BR_G09
    indexer.prepareDiffNumber(HEAD, HEAD_1, conf);

    // BR_G11
    indexer.prepareUDTime(HEAD, HEAD_1, conf);

    // BR_G15
    indexer.prepareMass(HEAD, HEAD_1);

    // BR_G16
    yield indexer.prepareSpeed(HEAD, head, conf);

    // BR_G19
    yield indexer.prepareIdentitiesAge(iindex, HEAD, HEAD_1, conf, dal);

    // BR_G22
    yield indexer.prepareMembershipsAge(mindex, HEAD, HEAD_1, conf, dal);

    // BR_G37
    yield indexer.prepareCertificationsAge(cindex, HEAD, HEAD_1, conf, dal);

    // BR_G104
    yield indexer.ruleIndexCorrectMembershipExpiryDate(HEAD, mindex, dal);

    // BR_G105
    yield indexer.ruleIndexCorrectCertificationExpiryDate(HEAD, cindex, dal);

    return HEAD;
  }),

  completeGlobalScope: (block, conf, index, dal) => co(function*() {

    const iindex = module.exports.iindex(index);
    const mindex = module.exports.mindex(index);
    const cindex = module.exports.cindex(index);
    const sindex = module.exports.sindex(index);

    const range = dal.range;
    const head = dal.head;

    const HEAD = {
      version: block.version,
      bsize: Block.statics.getLen(block),
      hash: Block.statics.getHash(block),
      issuer: block.issuer,
      time: block.time,
      powMin: block.powMin
    };
    const HEAD_1 = yield head(1);
    if (HEAD_1) {
      HEAD_1.currency = conf.currency;
    }

    // BR_G01
    indexer.prepareNumber(HEAD, HEAD_1);

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
      HEAD.issuerIsMember = reduce(yield dal.iindexDAL.reducable(HEAD.issuer)).member;
    } else {
      HEAD.issuerIsMember = reduce(_.where(iindex, { pub: HEAD.issuer })).member;
    }

    // BR_G04
    yield indexer.prepareIssuersCount(HEAD, range, HEAD_1);

    // BR_G05
    indexer.prepareIssuersFrame(HEAD, HEAD_1);

    // BR_G06
    indexer.prepareIssuersFrameVar(HEAD, HEAD_1);

    // BR_G07
    yield indexer.prepareAvgBlockSize(HEAD, range);

    // BR_G08
    if (HEAD.number > 0) {
      HEAD.medianTime = Math.max(HEAD_1.medianTime, average(yield range(1, Math.min(conf.medianTimeBlocks, HEAD.number), 'time')));
    } else {
      HEAD.medianTime = HEAD.time;
    }

    // BR_G09
    indexer.prepareDiffNumber(HEAD, HEAD_1, conf);

    // BR_G10
    if (HEAD.number == 0) {
      HEAD.membersCount = count(_.filter(iindex, (entry) => entry.member === true));
    } else {
      HEAD.membersCount = HEAD_1.membersCount
        + count(_.filter(iindex, (entry) => entry.member === true))
        - count(_.filter(iindex, (entry) => entry.member === false));
    }

    // BR_G11
    indexer.prepareUDTime(HEAD, HEAD_1, conf);

    // BR_G12
    if (HEAD.number == 0) {
      HEAD.unitBase = 0;
    } else {
      HEAD.unitBase = HEAD_1.unitBase;
    }

    // BR_G13
    indexer.prepareDividend(HEAD, HEAD_1, conf);

    // BR_G14
    indexer.prepareUnitBase(HEAD, HEAD_1, conf);

    // BR_G15
    indexer.prepareMass(HEAD, HEAD_1);

    // BR_G16
    yield indexer.prepareSpeed(HEAD, head, conf);

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
    yield indexer.preparePersonalizedPoW(HEAD, HEAD_1, range, conf);

    // BR_G19
    yield indexer.prepareIdentitiesAge(iindex, HEAD, HEAD_1, conf, dal);

    // BR_G20
    yield iindex.map((ENTRY) => co(function*() {
      if (ENTRY.op == constants.IDX_CREATE) {
        ENTRY.uidUnique = count(yield dal.iindexDAL.sqlFind({ uid: ENTRY.uid })) == 0;
      } else {
        ENTRY.uidUnique = true;
      }
    }));

    // BR_G21
    yield iindex.map((ENTRY) => co(function*() {
      if (ENTRY.op == constants.IDX_CREATE) {
        ENTRY.pubUnique = count(yield dal.iindexDAL.sqlFind({pub: ENTRY.pub})) == 0;
      } else {
        ENTRY.pubUnique = true;
      }
    }));

    // BR_G33
    yield iindex.map((ENTRY) => co(function*() {
      if (ENTRY.member !== false) {
        ENTRY.excludedIsMember = true;
      } else {
        ENTRY.excludedIsMember = reduce(yield dal.iindexDAL.reducable(ENTRY.pub)).member;
      }
    }));

    // BR_G35
    yield iindex.map((ENTRY) => co(function*() {
      ENTRY.isBeingKicked = ENTRY.member === false;
    }));

    // BR_G36
    yield iindex.map((ENTRY) => co(function*() {
      ENTRY.hasToBeExcluded = reduce(yield dal.iindexDAL.reducable(ENTRY.pub)).kick;
    }));

    // BR_G22
    yield indexer.prepareMembershipsAge(mindex, HEAD, HEAD_1, conf, dal);

    // BR_G23
    yield mindex.map((ENTRY) => co(function*() {
      if (!ENTRY.revoked_on) {
        const created_on = reduce(yield dal.mindexDAL.reducable(ENTRY.pub)).created_on;
        if (created_on != null) {
          ENTRY.numberFollowing = number(ENTRY.created_on) > number(created_on);
        } else {
          ENTRY.numberFollowing = true; // Follows nothing
        }
      } else {
        ENTRY.numberFollowing = true;
      }
    }));

    // BR_G24
    // Global testing, because of wotb
    const oneIsOutdistanced = yield checkPeopleAreNotOudistanced(
      _.filter(mindex, (entry) => !entry.revoked_on).map((entry) => entry.pub),
      cindex.reduce((newLinks, c) => {
        newLinks[c.receiver] = newLinks[c.receiver] || [];
        newLinks[c.receiver].push(c.issuer);
        return newLinks;
      }, {}),
      // Newcomers
      _.where(iindex, { op: constants.IDX_CREATE }).map((entry) => entry.pub),
      conf,
      dal
    );
    mindex.map((ENTRY) => {
      if (ENTRY.expires_on) {
        ENTRY.distanceOK = !oneIsOutdistanced;
      } else {
        ENTRY.distanceOK = true;
      }
    });

    // BR_G25
    yield mindex.map((ENTRY) => co(function*() {
      ENTRY.onRevoked = reduce(yield dal.mindexDAL.reducable(ENTRY.pub)).revoked_on != null;
    }));

    // BR_G26
    yield _.filter(mindex, (entry) => entry.op == constants.IDX_UPDATE && entry.expired_on === 0).map((ENTRY) => co(function*() {
      ENTRY.joinsTwice = reduce(yield dal.iindexDAL.reducable(ENTRY.pub)).member == true;
    }));

    // BR_G27
    yield mindex.map((ENTRY) => co(function*() {
      if (ENTRY.type == 'JOIN' || ENTRY.type == 'ACTIVE') {
        const existing = count(yield dal.cindexDAL.sqlFind({ receiver: ENTRY.pub, expired_on: 0 }));
        const pending = count(_.filter(cindex, (c) => c.receiver == ENTRY.pub && c.expired_on == 0));
        ENTRY.enoughCerts = (existing + pending) >= conf.sigQty;
      } else {
        ENTRY.enoughCerts = true;
      }
    }));

    // BR_G28
    yield mindex.map((ENTRY) => co(function*() {
      if (ENTRY.type == 'LEAVE') {
        ENTRY.leaverIsMember = reduce(yield dal.iindexDAL.reducable(ENTRY.pub)).member;
      } else {
        ENTRY.leaverIsMember = true;
      }
    }));

    // BR_G29
    yield mindex.map((ENTRY) => co(function*() {
      if (ENTRY.type == 'ACTIVE') {
        const reducable = yield dal.iindexDAL.reducable(ENTRY.pub);
        ENTRY.activeIsMember = reduce(reducable).member;
      } else {
        ENTRY.activeIsMember = true;
      }
    }));

    // BR_G30
    yield mindex.map((ENTRY) => co(function*() {
      if (!ENTRY.revoked_on) {
        ENTRY.revokedIsMember = true;
      } else {
        ENTRY.revokedIsMember = reduce(yield dal.iindexDAL.reducable(ENTRY.pub)).member;
      }
    }));

    // BR_G31
    yield mindex.map((ENTRY) => co(function*() {
      if (!ENTRY.revoked_on) {
        ENTRY.alreadyRevoked = false;
      } else {
        ENTRY.alreadyRevoked = reduce(yield dal.mindexDAL.reducable(ENTRY.pub)).revoked_on;
      }
    }));

    // BR_G32
    yield mindex.map((ENTRY) => co(function*() {
      if (!ENTRY.revoked_on) {
        ENTRY.revocationSigOK = true;
      } else {
        ENTRY.revocationSigOK = yield sigCheckRevoke(ENTRY, dal, block.currency);
      }
    }));

    // BR_G34
    yield mindex.map((ENTRY) => co(function*() {
      ENTRY.isBeingRevoked = ENTRY.revoked;
    }));

    // BR_G37
    yield indexer.prepareCertificationsAge(cindex, HEAD, HEAD_1, conf, dal);

    // BR_G38
    if (HEAD.number > 0) {
      yield cindex.map((ENTRY) => co(function*() {
        const rows = yield dal.cindexDAL.sqlFind({ issuer: ENTRY.issuer, chainable_on: { $gt: HEAD_1.medianTime }});
        ENTRY.unchainables = count(rows);
      }));
    }

    // BR_G39
    yield cindex.map((ENTRY) => co(function*() {
      ENTRY.stock = count(yield dal.cindexDAL.sqlFind({ issuer: ENTRY.issuer, expired_on: 0 }));
    }));

    // BR_G40
    yield cindex.map((ENTRY) => co(function*() {
      ENTRY.fromMember = reduce(yield dal.iindexDAL.reducable(ENTRY.issuer)).member;
    }));

    // BR_G41
    yield cindex.map((ENTRY) => co(function*() {
      ENTRY.toMember = reduce(yield dal.iindexDAL.reducable(ENTRY.receiver)).member;
    }));

    // BR_G42
    yield cindex.map((ENTRY) => co(function*() {
      ENTRY.toNewcomer = count(_.where(iindex, { member: true, pub: ENTRY.receiver })) > 0;
    }));

    // BR_G43
    yield cindex.map((ENTRY) => co(function*() {
      ENTRY.toLeaver = reduce(yield dal.mindexDAL.reducable(ENTRY.pub)).leaving;
    }));

    // BR_G44
    yield cindex.map((ENTRY) => co(function*() {
      const reducable = yield dal.cindexDAL.sqlFind({ issuer: ENTRY.issuer, receiver: ENTRY.receiver });
      ENTRY.isReplay = count(reducable) > 0 && reduce(reducable).expired_on === 0;
    }));

    // BR_G45
    yield cindex.map((ENTRY) => co(function*() {
      ENTRY.sigOK = checkCertificationIsValid(block, ENTRY, (pub) => {
        let localInlineIdty = block.getInlineIdentity(pub);
        if (localInlineIdty) {
          return Identity.statics.fromInline(localInlineIdty);
        }
        return dal.getWrittenIdtyByPubkey(pub);
      }, conf, dal);
    }));

    // BR_G102
    yield _.where(sindex, { op: constants.IDX_UPDATE }).map((ENTRY) => co(function*() {
      if (HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
        ENTRY.age = 0;
      } else {
        let ref = yield dal.getBlockByBlockstamp(ENTRY.created_on);
        if (ref && blockstamp(ref.number, ref.hash) == ENTRY.created_on) {
          ENTRY.age = HEAD_1.medianTime - ref.medianTime;
        } else {
          ENTRY.age = constants.TRANSACTION_EXPIRY_DELAY + 1;
        }
      }
    }));

    // BR_G46
    yield _.where(sindex, { op: constants.IDX_UPDATE }).map((ENTRY) => co(function*() {
      const reducable = yield dal.sindexDAL.sqlFind({
        identifier: ENTRY.identifier,
        pos: ENTRY.pos,
        amount: ENTRY.amount,
        base: ENTRY.base
      });
      ENTRY.conditions = reduce(reducable).conditions; // We valuate the input conditions, so we can map these records to a same account
      ENTRY.available = reduce(reducable).consumed === false;
    }));

    // BR_G47
    yield _.where(sindex, { op: constants.IDX_UPDATE }).map((ENTRY) => co(function*() {
      let source = _.filter(sindex, (src) => src.identifier == ENTRY.identifier && src.pos == ENTRY.pos && src.conditions)[0];
      if (!source) {
        const reducable = yield dal.sindexDAL.sqlFind({
          identifier: ENTRY.identifier,
          pos: ENTRY.pos,
          amount: ENTRY.amount,
          base: ENTRY.base
        });
        source = reduce(reducable);
      }
      ENTRY.conditions = source.conditions;
      ENTRY.isLocked = !txSourceUnlock(ENTRY, source);
    }));

    // BR_G48
    yield _.where(sindex, { op: constants.IDX_UPDATE }).map((ENTRY) => co(function*() {
      ENTRY.isTimeLocked = ENTRY.written_time - reduce(yield dal.sindexDAL.sqlFind({
          identifier: ENTRY.identifier,
          pos: ENTRY.pos,
          amount: ENTRY.amount,
          base: ENTRY.base
        })).written_time < ENTRY.locktime;
    }));

    return HEAD;
  }),

  // BR_G01
  prepareNumber: (HEAD, HEAD_1) => {
    if (HEAD_1) {
      HEAD.number = HEAD_1.number + 1;
    } else {
      HEAD.number = 0;
    }
  },

  // BR_G04
  prepareIssuersCount: (HEAD, range, HEAD_1) => co(function*() {
    if (HEAD.number == 0) {
      HEAD.issuersCount = 0;
    } else {
      HEAD.issuersCount = count(uniq(yield range(1, HEAD_1.issuersFrame, 'issuer')));
    }
  }),

  // BR_G05
  prepareIssuersFrame: (HEAD, HEAD_1) => {
    if (HEAD.number == 0) {
      HEAD.issuersFrame = 1;
    } else if (HEAD_1.issuersFrameVar > 0) {
      HEAD.issuersFrame = HEAD_1.issuersFrame + 1
    } else if (HEAD_1.issuersFrameVar < 0) {
      HEAD.issuersFrame = HEAD_1.issuersFrame - 1
    } else {
      HEAD.issuersFrame = HEAD_1.issuersFrame
    }
  },

  // BR_G06
  prepareIssuersFrameVar: (HEAD, HEAD_1) => {
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
  },

  // BR_G07
  prepareAvgBlockSize: (HEAD, range) => co(function*() {
    HEAD.avgBlockSize = average(yield range(1, HEAD.issuersCount, 'bsize'));
  }),

  // BR_G09
  prepareDiffNumber: (HEAD, HEAD_1, conf) => {
    if (HEAD.number == 0) {
      HEAD.diffNumber = HEAD.number + conf.dtDiffEval;
    } else if (HEAD_1.diffNumber <= HEAD.number) {
      HEAD.diffNumber = HEAD_1.diffNumber + conf.dtDiffEval;
    } else {
      HEAD.diffNumber = HEAD_1.diffNumber;
    }
  },

  // BR_G11
  prepareUDTime: (HEAD, HEAD_1, conf) => {
    if (HEAD.number == 0) {
      HEAD.udTime = HEAD.medianTime + conf.dt;
    } else if (HEAD_1.udTime <= HEAD.medianTime) {
      HEAD.udTime = HEAD_1.udTime + conf.dt;
    } else {
      HEAD.udTime = HEAD_1.udTime;
    }
  },

  // BR_G13
  prepareDividend: (HEAD, HEAD_1, conf) => {
    if (HEAD.number == 0) {
      HEAD.dividend = conf.ud0;
      HEAD.new_dividend = null;
    } else if (HEAD.udTime != HEAD_1.udTime) {
      // DUG
      const previousUB = HEAD_1.unitBase;
      HEAD.dividend = Math.ceil(HEAD_1.dividend + Math.pow(conf.c, 2) * Math.ceil(HEAD_1.mass / Math.pow(10, previousUB)) / HEAD.membersCount);
      HEAD.new_dividend = HEAD.dividend;
    } else {
      HEAD.dividend = HEAD_1.dividend;
      HEAD.new_dividend = null;
    }
  },

  // BR_G14
  prepareUnitBase: (HEAD) => {
    if (HEAD.dividend >= Math.pow(10, constants.NB_DIGITS_UD)) {
      HEAD.dividend = Math.ceil(HEAD.dividend / 10);
      HEAD.new_dividend = HEAD.dividend;
      HEAD.unitBase = HEAD.unitBase + 1;
    }
  },

  // BR_G15
  prepareMass: (HEAD, HEAD_1) => {
    if (HEAD.number == 0) {
      HEAD.mass = 0;
    }
    else if (HEAD.udTime != HEAD_1.udTime) {
      HEAD.mass = HEAD_1.mass + HEAD.dividend * Math.pow(10, HEAD.unitBase) * HEAD.membersCount;
    } else {
      HEAD.mass = HEAD_1.mass;
    }
  },

  // BR_G16
  prepareSpeed: (HEAD, head, conf) => co(function*() {
    if (HEAD.number == 0) {
      HEAD.speed = 0;
    } else {
      const quantity = Math.min(conf.dtDiffEval, HEAD.number);
      const elapsed = (HEAD.medianTime - (yield head(quantity)).medianTime);
      if (!elapsed) {
        HEAD.speed = 100;
      } else {
        HEAD.speed = quantity / elapsed;
      }
    }
  }),

  // BR_G18
  preparePersonalizedPoW: (HEAD, HEAD_1, range, conf) => co(function*() {
    let nbPersonalBlocksInFrame, medianOfBlocksInFrame, blocksOfIssuer;
    let nbPreviousIssuers = 0, nbBlocksSince = 0;
    if (HEAD.number == 0) {
      nbPersonalBlocksInFrame = 0;
      medianOfBlocksInFrame = 1;
    } else {
      const blocksInFrame = _.filter(yield range(1, HEAD_1.issuersFrame), (b) => b.number <= HEAD_1.number);
      const issuersInFrame = blocksInFrame.map((b) => b.issuer);
      blocksOfIssuer = _.filter(blocksInFrame, (entry) => entry.issuer == HEAD.issuer);
      nbPersonalBlocksInFrame = count(blocksOfIssuer);
      const blocksPerIssuerInFrame = uniq(issuersInFrame).map((issuer) => count(_.where(blocksInFrame, { issuer })));
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
  }),

  // BR_G19
  prepareIdentitiesAge: (iindex, HEAD, HEAD_1, conf, dal) => co(function*() {
    yield _.where(iindex, { op: constants.IDX_CREATE }).map((ENTRY) => co(function*() {
      if (HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
        ENTRY.age = 0;
      } else {
        let ref = yield dal.getBlockByBlockstamp(ENTRY.created_on);
        if (ref && blockstamp(ref.number, ref.hash) == ENTRY.created_on) {
          ENTRY.age = HEAD_1.medianTime - ref.medianTime;
        } else {
          ENTRY.age = conf.idtyWindow + 1;
        }
      }
    }));
  }),

  // BR_G22
  prepareMembershipsAge: (mindex, HEAD, HEAD_1, conf, dal) => co(function*() {
    yield _.filter(mindex, (entry) => !entry.revoked_on).map((ENTRY) => co(function*() {
      if (HEAD.number == 0 && ENTRY.created_on == '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855') {
        ENTRY.age = 0;
      } else {
        let ref = yield dal.getBlockByBlockstamp(ENTRY.created_on);
        if (ref && blockstamp(ref.number, ref.hash) == ENTRY.created_on) {
          ENTRY.age = HEAD_1.medianTime - ref.medianTime;
        } else {
          ENTRY.age = conf.msWindow + 1;
        }
      }
    }));
  }),

  // BR_G37
  prepareCertificationsAge: (cindex, HEAD, HEAD_1, conf, dal) => co(function*() {
    yield cindex.map((ENTRY) => co(function*() {
      if (HEAD.number == 0) {
        ENTRY.age = 0;
      } else {
        let ref = yield dal.getBlock(number(ENTRY.created_on));
        if (ref) {
          ENTRY.age = HEAD_1.medianTime - ref.medianTime;
        } else {
          ENTRY.age = conf.sigWindow + 1;
        }
      }
    }));
  }),

  // BR_G49
  ruleVersion: (HEAD, HEAD_1) => {
    if (HEAD.number > 0) {
      return HEAD.version == HEAD_1.version || HEAD.version == HEAD_1.version + 1;
    }
    return true;
  },

  // BR_G50
  ruleBlockSize: (HEAD) => HEAD.bsize < indexer.DUP_HELPERS.getMaxBlockSize(HEAD),

  // BR_G98
  ruleCurrency: (block, HEAD) => {
    if (HEAD.number > 0) {
      return block.currency === HEAD.currency;
    }
    return true;
  },

  // BR_G51
  ruleNumber: (block, HEAD) => block.number == HEAD.number,

  // BR_G52
  rulePreviousHash: (block, HEAD) => block.previousHash == HEAD.previousHash || (!block.previousHash && !HEAD.previousHash),

  // BR_G53
  rulePreviousIssuer: (block, HEAD) => block.previousIssuer == HEAD.previousIssuer || (!block.previousIssuer && !HEAD.previousIssuer),

  // BR_G101
  ruleIssuerIsMember: (HEAD) => HEAD.issuerIsMember == true,

  // BR_G54
  ruleIssuersCount: (block, HEAD) => block.issuersCount == HEAD.issuersCount,

  // BR_G55
  ruleIssuersFrame: (block, HEAD) => block.issuersFrame == HEAD.issuersFrame,

  // BR_G56
  ruleIssuersFrameVar: (block, HEAD) => block.issuersFrameVar == HEAD.issuersFrameVar,

  // BR_G57
  ruleMedianTime: (block, HEAD) => block.medianTime == HEAD.medianTime,

  // BR_G58
  ruleDividend: (block, HEAD) => block.dividend == HEAD.new_dividend,

  // BR_G59
  ruleUnitBase: (block, HEAD) => block.unitbase == HEAD.unitBase,

  // BR_G60
  ruleMembersCount: (block, HEAD) => block.membersCount == HEAD.membersCount,

  // BR_G61
  rulePowMin: (block, HEAD) => {
    if (HEAD.number > 0) {
      return block.powMin == HEAD.powMin;
    }
  },

  // BR_G62
  ruleProofOfWork: (HEAD) => {
    // Compute exactly how much zeros are required for this block's issuer
    const remainder = HEAD.powRemainder;
    const nbZerosReq = HEAD.powZeros;
    const highMark = constants.PROOF_OF_WORK.UPPER_BOUND[remainder];
    const powRegexp = new RegExp('^0{' + nbZerosReq + '}' + '[0-' + highMark + ']');
    try {
      if (!HEAD.hash.match(powRegexp)) {
        const givenZeros = Math.max(0, Math.min(nbZerosReq, HEAD.hash.match(/^0*/)[0].length));
        const c = HEAD.hash.substr(givenZeros, 1);
        throw Error('Wrong proof-of-work level: given ' + givenZeros + ' zeros and \'' + c + '\', required was ' + nbZerosReq + ' zeros and an hexa char between [0-' + highMark + ']');
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  // BR_G63
  ruleIdentityWritability: (iindex, conf) => {
    for (const ENTRY of iindex) {
      if (ENTRY.age > conf.idtyWindow) return false;
    }
  },

  // BR_G64
  ruleMembershipWritability: (mindex, conf) => {
    for (const ENTRY of mindex) {
      if (ENTRY.age > conf.msWindow) return false;
    }
  },

  // BR_G65
  ruleCertificationWritability: (cindex, conf) => {
    for (const ENTRY of cindex) {
      if (ENTRY.age > conf.sigWindow) return false;
    }
  },

  // BR_G66
  ruleCertificationStock: (cindex, conf) => {
    for (const ENTRY of cindex) {
      if (ENTRY.stock > conf.sigStock) return false;
    }
  },

  // BR_G67
  ruleCertificationPeriod: (cindex) => {
    for (const ENTRY of cindex) {
      if (ENTRY.unchainables > 0) return false;
    }
  },

  // BR_G68
  ruleCertificationFromMember: (HEAD, cindex) => {
    if (HEAD.number > 0) {
      for (const ENTRY of cindex) {
        if (!ENTRY.fromMember) return false;
      }
    }
  },

  // BR_G69
  ruleCertificationToMemberOrNewcomer: (cindex) => {
    for (const ENTRY of cindex) {
      if (!ENTRY.toMember && !ENTRY.toNewcomer) return false;
    }
  },

  // BR_G70
  ruleCertificationToLeaver: (cindex) => {
    for (const ENTRY of cindex) {
      if (ENTRY.toLeaver) return false;
    }
  },

  // BR_G71
  ruleCertificationReplay: (cindex) => {
    for (const ENTRY of cindex) {
      if (ENTRY.isReplay) return false;
    }
  },

  // BR_G72
  ruleCertificationSignature: (cindex) => {
    for (const ENTRY of cindex) {
      if (!ENTRY.sigOK) return false;
    }
  },

  // BR_G73
  ruleIdentityUIDUnicity: (iindex) => {
    for (const ENTRY of iindex) {
      if (!ENTRY.uidUnique) return false;
    }
  },

  // BR_G74
  ruleIdentityPubkeyUnicity: (iindex) => {
    for (const ENTRY of iindex) {
      if (!ENTRY.pubUnique) return false;
    }
  },

  // BR_G75
  ruleMembershipSuccession: (mindex) => {
    for (const ENTRY of mindex) {
      if (!ENTRY.numberFollowing) return false;
    }
  },

  // BR_G76
  ruleMembershipDistance: (mindex) => {
    for (const ENTRY of mindex) {
      if (!ENTRY.distanceOK) return false;
    }
  },

  // BR_G77
  ruleMembershipOnRevoked: (mindex) => {
    for (const ENTRY of mindex) {
      if (ENTRY.onRevoked) return false;
    }
  },

  // BR_G78
  ruleMembershipJoinsTwice: (mindex) => {
    for (const ENTRY of mindex) {
      if (ENTRY.joinsTwice) return false;
    }
  },

  // BR_G79
  ruleMembershipEnoughCerts: (mindex) => {
    for (const ENTRY of mindex) {
      if (!ENTRY.enoughCerts) return false;
    }
  },

  // BR_G80
  ruleMembershipLeaverIsMember: (mindex) => {
    for (const ENTRY of mindex) {
      if (!ENTRY.leaverIsMember) return false;
    }
  },

  // BR_G81
  ruleMembershipActiveIsMember: (mindex) => {
    for (const ENTRY of mindex) {
      if (!ENTRY.activeIsMember) return false;
    }
  },

  // BR_G82
  ruleMembershipRevokedIsMember: (mindex) => {
    for (const ENTRY of mindex) {
      if (!ENTRY.revokedIsMember) return false;
    }
  },

  // BR_G83
  ruleMembershipRevokedSingleton: (mindex) => {
    for (const ENTRY of mindex) {
      if (ENTRY.alreadyRevoked) return false;
    }
  },

  // BR_G84
  ruleMembershipRevocationSignature: (mindex) => {
    for (const ENTRY of mindex) {
      if (!ENTRY.revocationSigOK) return false;
    }
  },

  // BR_G85
  ruleMembershipExcludedIsMember: (iindex) => {
    for (const ENTRY of iindex) {
      if (!ENTRY.excludedIsMember) return false;
    }
  },

  // BR_G86
  ruleToBeKickedArePresent: (mindex, dal) => co(function*() {
    const toBeKicked = yield dal.iindexDAL.getToBeKickedPubkeys();
    for (const toKick of toBeKicked) {
      if (count(_.where(mindex, { pub: toKick, isBeingKicked: true })) !== 1) {
        return false;
      }
    }
  }),

  // BR_G103
  ruleTxWritability: (sindex) => {
    for (const ENTRY of sindex) {
      if (ENTRY.age > constants.TRANSACTION_EXPIRY_DELAY) return false;
    }
  },

  // BR_G87
  ruleInputIsAvailable: (sindex) => {
    const inputs = _.where(sindex, { op: constants.IDX_UPDATE });
    for (const ENTRY of inputs) {
      if (!ENTRY.available) {
        return false;
      }
    }
  },

  // BR_G88
  ruleInputIsUnlocked: (sindex) => {
    const inputs = _.where(sindex, { op: constants.IDX_UPDATE });
    for (const ENTRY of inputs) {
      if (ENTRY.isLocked) {
        return false;
      }
    }
  },

  // BR_G89
  ruleInputIsTimeUnlocked: (sindex) => {
    const inputs = _.where(sindex, { op: constants.IDX_UPDATE });
    for (const ENTRY of inputs) {
      if (ENTRY.isTimeLocked) {
        return false;
      }
    }
  },

  // BR_G90
  ruleOutputBase: (sindex, HEAD_1) => {
    const inputs = _.where(sindex, { op: constants.IDX_CREATE });
    for (const ENTRY of inputs) {
      if (ENTRY.unitBase > HEAD_1.unitBase) {
        return false;
      }
    }
  },

  // BR_G91
  ruleIndexGenDividend: (HEAD, dal) => co(function*() {
    const dividends = [];
    if (HEAD.new_dividend) {
      const potentials = reduceBy(yield dal.iindexDAL.sqlFind({ member: true }), ['pub']);
      for (const potential of potentials) {
        const MEMBER = reduce(yield dal.iindexDAL.reducable(potential.pub));
        if (MEMBER.member) {
          dividends.push({
            op: 'CREATE',
            identifier: MEMBER.pub,
            pos: HEAD.number,
            written_on: [HEAD.number, HEAD.hash].join('-'),
            written_time: HEAD.medianTime,
            amount: HEAD.dividend,
            base: HEAD.unitBase,
            locktime: null,
            conditions: 'SIG(' + MEMBER.pub + ')',
            consumed: false
          });
        }
      }
    }
    return dividends;
  }),

  // BR_G106
  ruleIndexGarbageSmallAccounts: (HEAD, sindex, dal) => co(function*() {
    const garbages = [];
    let potentialSources = yield dal.sindexDAL.findLowerThan(constants.ACCOUNT_MINIMUM_CURRENT_BASED_AMOUNT, HEAD.unitBase);
    let localSources = _.where(sindex, { op: constants.IDX_CREATE });
    potentialSources = potentialSources.concat(localSources);
    const accounts = Object.keys(potentialSources.reduce((acc, src) => {
      acc[src.conditions] = true;
      return acc;
    }, {}));
    const accountsBalance = yield accounts.reduce((map, acc) => {
      map[acc] = dal.sindexDAL.getAvailableForConditions(acc);
      return map;
    }, {});
    for (const account of accounts) {
      let sources = yield accountsBalance[account];
      const localAccountEntries = _.filter(sindex, (src) => src.conditions == account);
      const balance = sources.concat(localAccountEntries).reduce((sum, src) => {
        if (src.op === 'CREATE') {
          return sum + src.amount * Math.pow(10, src.base);
        } else {
          return sum - src.amount * Math.pow(10, src.base);
        }
      }, 0)
      if (balance < constants.ACCOUNT_MINIMUM_CURRENT_BASED_AMOUNT * Math.pow(10, HEAD.unitBase)) {
        for (const src of sources.concat(localAccountEntries)) {
          const sourceBeingConsumed = _.filter(sindex, (entry) => entry.op === 'UPDATE' && entry.identifier == src.identifier && entry.pos == src.pos).length > 0;
          if (!sourceBeingConsumed) {
            garbages.push({
              op: 'UPDATE',
              tx: src.tx,
              identifier: src.identifier,
              pos: src.pos,
              amount: src.amount,
              base: src.base,
              written_on: [HEAD.number, HEAD.hash].join('-'),
              written_time: HEAD.medianTime,
              conditions: src.conditions,
              consumed: true // It is now consumed
            });
          }
        }
      }
    }
    return garbages;
  }),

  // BR_G92
  ruleIndexGenCertificationExpiry: (HEAD, dal) => co(function*() {
    const expiries = [];
    const certs = yield dal.cindexDAL.findExpired(HEAD.medianTime);
    for (const CERT of certs) {
      expiries.push({
        op: 'UPDATE',
        issuer: CERT.issuer,
        receiver: CERT.receiver,
        created_on: CERT.created_on,
        written_on: [HEAD.number, HEAD.hash].join('-'),
        expired_on: HEAD.medianTime
      });
    }
    return expiries;
  }),

  // BR_G93
  ruleIndexGenMembershipExpiry: (HEAD, dal) => co(function*() {
    const expiries = [];
    const memberships = reduceBy(yield dal.mindexDAL.sqlFind({ expires_on: { $lte: HEAD.medianTime } }), ['pub']);
    for (const POTENTIAL of memberships) {
      const MS = yield dal.mindexDAL.getReducedMS(POTENTIAL.pub);
      const hasRenewedSince = MS.expires_on > HEAD.medianTime;
      if (!MS.expired_on && !hasRenewedSince) {
        let shouldBeKicked = true;
        // ------ Fast synchronization specific code ------
        const idty = yield dal.iindexDAL.getFromPubkey(POTENTIAL.pub);
        if (!idty.member) {
          shouldBeKicked = false;
        }
        // ------------------------------------------------
        if (shouldBeKicked) {
          expiries.push({
            op: 'UPDATE',
            pub: MS.pub,
            created_on: MS.created_on,
            written_on: [HEAD.number, HEAD.hash].join('-'),
            expired_on: HEAD.medianTime
          });
        }
      }
    }
    return expiries;
  }),

  // BR_G94
  ruleIndexGenExclusionByMembership: (HEAD, mindex) => co(function*() {
    const exclusions = [];
    const memberships = _.filter(mindex, (entry) => entry.expired_on);
    for (const MS of memberships) {
      exclusions.push({
        op: 'UPDATE',
        pub: MS.pub,
        written_on: [HEAD.number, HEAD.hash].join('-'),
        kick: true
      });
    }
    return exclusions;
  }),

  // BR_G95
  ruleIndexGenExclusionByCertificatons: (HEAD, cindex, conf, dal) => co(function*() {
    const exclusions = [];
    const expiredCerts = _.filter(cindex, (c) => c.expired_on > 0);
    for (const CERT of expiredCerts) {
      const just_expired = _.filter(cindex, (c) => c.receiver == CERT.receiver && c.expired_on > 0);
      const just_received = _.filter(cindex, (c) => c.receiver == CERT.receiver && c.expired_on == 0);
      const non_expired_global = yield dal.cindexDAL.sqlFind({ receiver: CERT.receiver, expired_on: 0 });
      if ((count(non_expired_global) - count(just_expired) + count(just_received)) < conf.sigQty) {
        exclusions.push({
          op: 'UPDATE',
          pub: CERT.receiver,
          written_on: [HEAD.number, HEAD.hash].join('-'),
          kick: true
        });
      }
    }
    return exclusions;
  }),

  // BR_G96
  ruleIndexGenImplicitRevocation: (HEAD, dal) => co(function*() {
    const revocations = [];
    const pending = yield dal.mindexDAL.sqlFind({ revokes_on: { $lte: HEAD.medianTime}, revoked_on: { $null: true } });
    for (const MS of pending) {
      const REDUCED = reduce(yield dal.mindexDAL.sqlFind({ pub: MS.pub }));
      if (REDUCED.revokes_on <= HEAD.medianTime && !REDUCED.revoked_on) {
        revocations.push({
          op: 'UPDATE',
          pub: MS.receiver,
          written_on: [HEAD.number, HEAD.hash].join('-'),
          revoked_on: HEAD.medianTime
        });
      }
    }
    return revocations;
  }),

  // BR_G104
  ruleIndexCorrectMembershipExpiryDate: (HEAD, mindex, dal) => co(function*() {
    for (const MS of mindex) {
      if (MS.type == 'JOIN' || MS.type == 'ACTIVE') {
        let basedBlock = { medianTime: 0 };
        if (HEAD.number == 0) {
          basedBlock = HEAD;
        } else {
          basedBlock = yield dal.getBlockByBlockstamp(MS.created_on);
        }
        MS.expires_on += basedBlock.medianTime;
        MS.revokes_on += basedBlock.medianTime;
      }
    }
  }),

  // BR_G105
  ruleIndexCorrectCertificationExpiryDate: (HEAD, cindex, dal) => co(function*() {
    for (const CERT of cindex) {
      let basedBlock = { medianTime: 0 };
      if (HEAD.number == 0) {
        basedBlock = HEAD;
      } else {
        basedBlock = yield dal.getBlock(CERT.created_on);
      }
      CERT.expires_on += basedBlock.medianTime;
    }
  }),

  iindexCreate: (index) => _(index).filter({ index: constants.I_INDEX, op: constants.IDX_CREATE }),
  mindexCreate: (index) => _(index).filter({ index: constants.M_INDEX, op: constants.IDX_CREATE }),
  iindex:       (index) => _(index).filter({ index: constants.I_INDEX }),
  mindex:       (index) => _(index).filter({ index: constants.M_INDEX }),
  cindex:       (index) => _(index).filter({ index: constants.C_INDEX }),
  sindex:       (index) => _(index).filter({ index: constants.S_INDEX }),

  DUP_HELPERS: {

    reduce: reduce,
    reduceBy: reduceBy,
    getMaxBlockSize: (HEAD) => Math.max(500, Math.ceil(1.1 * HEAD.avgBlockSize)),
    checkPeopleAreNotOudistanced: checkPeopleAreNotOudistanced
  }
};

function count(range) {
  return range.length;
}

function uniq(range) {
  return _.uniq(range);
}

function average(values) {
  // No values => 0 average
  if (!values.length) return 0;
  // Otherwise, real average
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.floor(avg);
}

function median(values) {
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

function number(blockstamp) {
  return parseInt(blockstamp);
}

function blockstamp(number, hash) {
  return [number, hash].join('-');
}

function reduce(records) {
  return records.reduce((obj, record) => {
    const keys = Object.keys(record);
    for (const k of keys) {
      if (record[k] !== undefined && record[k] !== null) {
        obj[k] = record[k];
      }
    }
    return obj;
  }, {});
}

function reduceBy(reducables, properties) {
  const reduced = reducables.reduce((map, entry) => {
    const id = properties.map((prop) => entry[prop]).join('-');
    map[id] = map[id] || [];
    map[id].push(entry);
    return map;
  }, {});
  return Object.values(reduced).map((value) => indexer.DUP_HELPERS.reduce(value));
}

function checkPeopleAreNotOudistanced (pubkeys, newLinks, newcomers, conf, dal) {
  return co(function *() {
    // let wotb = dal.wotb;
    let wotb = dal.wotb.memcopy();
    let current = yield dal.getCurrentBlockOrNull();
    let membersCount = current ? current.membersCount : 0;
    // TODO: make a temporary copy of the WoT in RAM
    // We add temporarily the newcomers to the WoT, to integrate their new links
    let nodesCache = newcomers.reduce((map, pubkey) => {
      let nodeID = wotb.addNode();
      map[pubkey] = nodeID;
      wotb.setEnabled(false, nodeID); // These are not members yet
      return map;
    }, {});
    // Add temporarily the links to the WoT
    let tempLinks = [];
    let toKeys = _.keys(newLinks);
    for (const toKey of toKeys) {
      let toNode = yield getNodeIDfromPubkey(nodesCache, toKey, dal);
      for (const fromKey of newLinks[toKey]) {
        let fromNode = yield getNodeIDfromPubkey(nodesCache, fromKey, dal);
        tempLinks.push({ from: fromNode, to: toNode });
      }
    }
    tempLinks.forEach((link) => wotb.addLink(link.from, link.to));
    // Checking distance of each member against them
    let error;
    for (const pubkey of pubkeys) {
      let nodeID = yield getNodeIDfromPubkey(nodesCache, pubkey, dal);
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
  });
}

function getNodeIDfromPubkey(nodesCache, pubkey, dal) {
  return co(function *() {
    let toNode = nodesCache[pubkey];
    // Eventually cache the target nodeID
    if (toNode === null || toNode === undefined) {
      let idty = yield dal.getWrittenIdtyByPubkey(pubkey);
      toNode = idty.wotb_id;
      nodesCache[pubkey] = toNode;
    }
    return toNode;
  });
}

function sigCheckRevoke(entry, dal, currency) {
  return co(function*() {
    try {
      let pubkey = entry.pub, sig = entry.revocation;
      let idty = yield dal.getWrittenIdtyByPubkey(pubkey);
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
      let sigOK = keyring.verify(rawRevocation, sig, pubkey);
      if (!sigOK) {
        throw Error("Revocation signature must match");
      }
      return true;
    } catch (e) {
      return false;
    }
  });
}



function checkCertificationIsValid (block, cert, findIdtyFunc, conf, dal) {
  return co(function *() {
    if (block.number == 0 && cert.created_on != 0) {
      throw Error('Number must be 0 for root block\'s certifications');
    } else {
      try {
        let basedBlock = {
          hash: constants.BLOCK.SPECIAL_HASH
        };
        if (block.number != 0) {
          try {
            basedBlock = yield dal.getBlock(cert.created_on);
          } catch (e) {
            throw Error('Certification based on an unexisting block');
          }
        }
        let idty = yield findIdtyFunc(block, cert.to, dal);
        let current = block.number == 0 ? null : yield dal.getCurrentBlockOrNull();
        if (!idty) {
          throw Error('Identity does not exist for certified');
        }
        else if (current && current.medianTime > basedBlock.medianTime + conf.sigValidity) {
          throw Error('Certification has expired');
        }
        else if (cert.from == idty.pubkey)
          throw Error('Rejected certification: certifying its own self-certification has no meaning');
        else {
          const buid = [cert.created_on, basedBlock.hash].join('-');
          idty.currency = conf.currency;
          const raw = rawer.getOfficialCertification(_.extend(idty, {
            idty_issuer: idty.pubkey,
            idty_uid: idty.uid,
            idty_buid: idty.buid,
            idty_sig: idty.sig,
            issuer: cert.from,
            buid: buid,
            sig: ''
          }));
          const verified = keyring.verify(raw, cert.sig, cert.from);
          if (!verified) {
            throw Error('Wrong signature for certification');
          }
          return true;
        }
      } catch (e) {
        return false;
      }
    }
  });
}

function txSourceUnlock(ENTRY, source) {
  const tx = ENTRY.txObj;
  let sigResults = require('../rules/local_rules').HELPERS.getSigResult(tx, 'a');
  let unlocksForCondition = [];
  let unlockValues = ENTRY.unlock;
  if (source.conditions) {
    if (unlockValues) {
      // Evaluate unlock values
      let sp = unlockValues.split(' ');
      for (const func of sp) {
        let param = func.match(/\((.+)\)/)[1];
        if (func.match(/SIG/)) {
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
    if (unlock(source.conditions, unlocksForCondition)) {
      return true;
    }
  }
  return false;
}
