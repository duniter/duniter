"use strict";

const _               = require('underscore');
const constants       = require('../constants');
const Identity        = require('../entity/identity');
const Certification   = require('../entity/certification');
const Membership      = require('../entity/membership');
const Transaction     = require('../entity/transaction');

module.exports = {

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
        fields: {
          uid: idty.uid,
          pubkey: idty.pubkey,
          created_on: idty.buid,
          written_on: [block.number, block.hash].join('-'),
          member: true,
          wasMember: true,
          kick: false,
          wid: null // wotb id
        }
      });
    }

    /****************************
     * MEMBERSHIPS INDEX (MINDEX)
     ***************************/
    // Joiners (newcomer or join back)
    for (const inlineMS of block.joiners) {
      const ms = Membership.statics.fromInline(inlineMS);
      const matchesANewcomer = _.filter(index, (row) => row.index == constants.I_INDEX && row.fields.pubkey == ms.issuer).length > 0;
      if (matchesANewcomer) {
        // Newcomer
        index.push({
          index: constants.M_INDEX,
          op: constants.IDX_CREATE,
          fields: {
            pubkey: ms.issuer,
            created_on: [ms.number, ms.fpr].join('-'),
            written_on: [block.number, block.hash].join('-'),
            expires_on: block.medianTime + conf.msValidity,
            revokes_on: block.medianTime + conf.msValidity * constants.REVOCATION_FACTOR,
            revoked_on: null,
            leaving: false
          }
        });
      } else {
        // Join back
        index.push({
          index: constants.M_INDEX,
          op: constants.IDX_UPDATE,
          fields: {
            pubkey: ms.issuer,
            created_on: [ms.number, ms.fpr].join('-'),
            written_on: [block.number, block.hash].join('-'),
            expires_on: block.medianTime + conf.msValidity,
            revokes_on: block.medianTime + conf.msValidity * constants.REVOCATION_FACTOR,
            revoked_on: null,
            leaving: null
          }
        });
        index.push({
          index: constants.I_INDEX,
          op: constants.IDX_UPDATE,
          fields: {
            uid: null,
            pubkey: ms.issuer,
            created_on: null,
            written_on: [block.number, block.hash].join('-'),
            member: true,
            wasMember: null,
            kick: null,
            wid: null
          }
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
        fields: {
          pubkey: ms.issuer,
          created_on: [ms.number, ms.fpr].join('-'),
          written_on: [block.number, block.hash].join('-'),
          expires_on: block.medianTime + conf.msValidity,
          revokes_on: block.medianTime + conf.msValidity * constants.REVOCATION_FACTOR,
          revoked_on: null,
          leaving: null
        }
      });
    }
    // Leavers
    for (const inlineMS of block.leavers) {
      const ms = Membership.statics.fromInline(inlineMS);
      index.push({
        index: constants.M_INDEX,
        op: constants.IDX_UPDATE,
        fields: {
          pubkey: ms.issuer,
          created_on: [ms.number, ms.fpr].join('-'),
          written_on: [block.number, block.hash].join('-'),
          expires_on: null,
          revokes_on: null,
          revoked_on: null,
          leaving: true
        }
      });
    }
    // Revoked
    for (const inlineRevocation of block.revoked) {
      const revocation = Identity.statics.revocationFromInline(inlineRevocation);
      index.push({
        index: constants.M_INDEX,
        op: constants.IDX_UPDATE,
        fields: {
          pubkey: revocation.pubkey,
          created_on: [block.number, block.hash].join('-'),
          written_on: [block.number, block.hash].join('-'),
          expires_on: null,
          revokes_on: null,
          revoked_on: [block.number, block.hash].join('-'),
          leaving: null
        }
      });
    }
    // Excluded
    for (const excluded of block.excluded) {
      index.push({
        index: constants.I_INDEX,
        op: constants.IDX_UPDATE,
        fields: {
          uid: null,
          pubkey: excluded,
          created_on: [block.number, block.hash].join('-'),
          written_on: [block.number, block.hash].join('-'),
          member: false,
          wasMember: null,
          kick: false,
          wid: null
        }
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
        fields: {
          issuer: cert.pubkey,
          receiver: cert.to,
          created_on: cert.block_number,
          written_on: [block.number, block.hash].join('-'),
          expires_on: block.medianTime + conf.sigValidity,
          expired_on: block.medianTime + conf.sigValidity,
          from_wid: null,
          to_wid: null
        }
      });
    }

    /*******************************
     * SOURCES INDEX (SINDEX)
     ******************************/
    for (const obj of block.transactions) {
      obj.currency = block.currency;
      obj.issuers = obj.signatories;
      const tx = new Transaction(obj);
      const txObj = tx.getTransaction();
      const txHash = tx.getHash(true);
      for (const input of txObj.inputs) {
        index.push({
          index: constants.S_INDEX,
          op: constants.IDX_UPDATE,
          fields: {
            type: 'T',
            identifier: input.identifier,
            pos: input.noffset,
            created_on: null,
            written_on: [block.number, block.hash].join('-'),
            amount: input.amount,
            base: input.base,
            consumed: true,
            conditions: null
          }
        });
      }

      let i = 0;
      for (const output of txObj.outputs) {
        index.push({
          index: constants.S_INDEX,
          op: constants.IDX_CREATE,
          fields: {
            type: 'T',
            identifier: txHash,
            pos: i++,
            created_on: [block.number, block.hash].join('-'),
            written_on: [block.number, block.hash].join('-'),
            amount: output.amount,
            base: output.base,
            consumed: false,
            conditions: output.conditions
          }
        });
      }
    }

    return index;
  }
};
