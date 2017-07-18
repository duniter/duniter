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
exports.processForURL = (req, merkle, valueCoroutine) => __awaiter(this, void 0, void 0, function* () {
    // Result
    const json = {
        "depth": merkle.depth,
        "nodesCount": merkle.nodes,
        "leavesCount": merkle.levels[merkle.depth].length,
        "root": merkle.levels[0][0] || ""
    };
    if (req.query.leaves) {
        // Leaves
        json.leaves = merkle.leaves();
        return json;
    }
    else if (req.query.leaf) {
        // Extract of a leaf
        json.leaves = {};
        const hashes = [req.query.leaf];
        // This code is in a loop for historic reasons. Should be set to non-loop style.
        const values = yield valueCoroutine(hashes);
        hashes.forEach((hash) => {
            json.leaf = {
                "hash": hash,
                "value": values[hash] || ""
            };
        });
        return json;
    }
    else {
        return json;
    }
});
//# sourceMappingURL=merkle.js.map