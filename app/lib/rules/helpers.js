"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common = require('duniter-common');
const constants = common.constants;
function maxAcceleration(conf) {
    let maxGenTime = Math.ceil(conf.avgGenTime * constants.POW_DIFFICULTY_RANGE_RATIO);
    return Math.ceil(maxGenTime * conf.medianTimeBlocks);
}
exports.maxAcceleration = maxAcceleration;
//# sourceMappingURL=helpers.js.map