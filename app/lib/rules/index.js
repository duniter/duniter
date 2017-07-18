"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const local_rules_1 = require("./local_rules");
const common = require('duniter-common');
const Block = common.document.Block;
exports.ALIAS = {
    ALL_LOCAL: (block, conf, index) => __awaiter(this, void 0, void 0, function* () {
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkParameters(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkProofOfWork(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkInnerHash(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkPreviousHash(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkPreviousIssuer(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkUnitBase(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkBlockSignature(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkBlockTimes(block, conf);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkIdentitiesSignature(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkIdentitiesUserIDConflict(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkIdentitiesPubkeyConflict(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkIdentitiesMatchJoin(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkMembershipUnicity(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkRevokedUnicity(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkRevokedAreExcluded(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkMembershipsSignature(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkPubkeyUnicity(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkCertificationOneByIssuer(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkCertificationUnicity(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkCertificationIsntForLeaverOrExcluded(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxVersion(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxIssuers(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxSources(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxRecipients(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxAmounts(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxSignature(block);
    }),
    ALL_LOCAL_BUT_POW_AND_SIGNATURE: (block, conf, index) => __awaiter(this, void 0, void 0, function* () {
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkParameters(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkInnerHash(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkPreviousHash(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkPreviousIssuer(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkUnitBase(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkBlockTimes(block, conf);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkIdentitiesSignature(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkIdentitiesUserIDConflict(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkIdentitiesPubkeyConflict(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkIdentitiesMatchJoin(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkMembershipUnicity(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkRevokedUnicity(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkRevokedAreExcluded(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkMembershipsSignature(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkPubkeyUnicity(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkCertificationOneByIssuer(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkCertificationUnicity(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkCertificationIsntForLeaverOrExcluded(block, conf, index);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxVersion(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxIssuers(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxSources(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxRecipients(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxAmounts(block);
        yield local_rules_1.LOCAL_RULES_FUNCTIONS.checkTxSignature(block);
    })
};
exports.CHECK = {
    ASYNC: {
        ALL_LOCAL: checkLocal(exports.ALIAS.ALL_LOCAL),
        ALL_LOCAL_BUT_POW: checkLocal(exports.ALIAS.ALL_LOCAL_BUT_POW_AND_SIGNATURE)
    }
};
function checkLocal(contract) {
    return (b, conf, index, done = undefined) => __awaiter(this, void 0, void 0, function* () {
        try {
            const block = Block.fromJSON(b);
            yield contract(block, conf, index);
            done && done();
        }
        catch (err) {
            if (done)
                return done(err);
            throw err;
        }
    });
}
//# sourceMappingURL=index.js.map