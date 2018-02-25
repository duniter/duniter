"use strict";
import {BlockDTO} from "../dto/BlockDTO"
import {ConfDTO} from "../dto/ConfDTO"
import {IndexEntry} from "../indexer"
import {LOCAL_RULES_FUNCTIONS} from "./local_rules"

export const ALIAS = {

  ALL_LOCAL: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    await LOCAL_RULES_FUNCTIONS.checkParameters(block);
    await LOCAL_RULES_FUNCTIONS.checkProofOfWork(block);
    await LOCAL_RULES_FUNCTIONS.checkInnerHash(block);
    await LOCAL_RULES_FUNCTIONS.checkPreviousHash(block);
    await LOCAL_RULES_FUNCTIONS.checkPreviousIssuer(block);
    await LOCAL_RULES_FUNCTIONS.checkUnitBase(block);
    await LOCAL_RULES_FUNCTIONS.checkBlockSignature(block);
    await LOCAL_RULES_FUNCTIONS.checkBlockTimes(block, conf);
    await LOCAL_RULES_FUNCTIONS.checkIdentitiesSignature(block);
    await LOCAL_RULES_FUNCTIONS.checkIdentitiesUserIDConflict(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkIdentitiesPubkeyConflict(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkIdentitiesMatchJoin(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkMembershipUnicity(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkRevokedUnicity(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkRevokedAreExcluded(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkMembershipsSignature(block);
    await LOCAL_RULES_FUNCTIONS.checkPubkeyUnicity(block);
    await LOCAL_RULES_FUNCTIONS.checkCertificationOneByIssuer(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkCertificationUnicity(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkCertificationIsntForLeaverOrExcluded(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkTxVersion(block);
    await LOCAL_RULES_FUNCTIONS.checkTxIssuers(block);
    await LOCAL_RULES_FUNCTIONS.checkTxSources(block);
    await LOCAL_RULES_FUNCTIONS.checkTxRecipients(block);
    await LOCAL_RULES_FUNCTIONS.checkTxAmounts(block);
    await LOCAL_RULES_FUNCTIONS.checkTxSignature(block);
    await LOCAL_RULES_FUNCTIONS.checkMaxTransactionChainingDepth(block, conf, index);
  },

  ALL_LOCAL_BUT_POW_AND_SIGNATURE: async (block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => {
    await LOCAL_RULES_FUNCTIONS.checkParameters(block);
    await LOCAL_RULES_FUNCTIONS.checkInnerHash(block);
    await LOCAL_RULES_FUNCTIONS.checkPreviousHash(block);
    await LOCAL_RULES_FUNCTIONS.checkPreviousIssuer(block);
    await LOCAL_RULES_FUNCTIONS.checkUnitBase(block);
    await LOCAL_RULES_FUNCTIONS.checkBlockTimes(block, conf);
    await LOCAL_RULES_FUNCTIONS.checkIdentitiesSignature(block);
    await LOCAL_RULES_FUNCTIONS.checkIdentitiesUserIDConflict(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkIdentitiesPubkeyConflict(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkIdentitiesMatchJoin(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkMembershipUnicity(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkRevokedUnicity(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkRevokedAreExcluded(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkMembershipsSignature(block);
    await LOCAL_RULES_FUNCTIONS.checkPubkeyUnicity(block);
    await LOCAL_RULES_FUNCTIONS.checkCertificationOneByIssuer(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkCertificationUnicity(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkCertificationIsntForLeaverOrExcluded(block, conf, index);
    await LOCAL_RULES_FUNCTIONS.checkTxVersion(block);
    await LOCAL_RULES_FUNCTIONS.checkTxIssuers(block);
    await LOCAL_RULES_FUNCTIONS.checkTxSources(block);
    await LOCAL_RULES_FUNCTIONS.checkTxRecipients(block);
    await LOCAL_RULES_FUNCTIONS.checkTxAmounts(block);
    await LOCAL_RULES_FUNCTIONS.checkTxSignature(block);
    await LOCAL_RULES_FUNCTIONS.checkMaxTransactionChainingDepth(block, conf, index);
  }
}

export const CHECK = {
  ASYNC: {
    ALL_LOCAL: checkLocal(ALIAS.ALL_LOCAL),
    ALL_LOCAL_BUT_POW: checkLocal(ALIAS.ALL_LOCAL_BUT_POW_AND_SIGNATURE)
  }
};

function checkLocal(contract:(block:BlockDTO, conf:ConfDTO, index:IndexEntry[]) => Promise<void>) {
  return async (b:BlockDTO, conf:ConfDTO, index:IndexEntry[], done:any = undefined) => {
    try {
      const block = BlockDTO.fromJSONObject(b)
      await contract(block, conf, index)
      done && done();
    } catch (err) {
      if (done) return done(err);
      throw err;
    }
  };
}
