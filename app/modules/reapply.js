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
module.exports = {
    duniter: {
        cli: [{
                name: 'reapply-to [number]',
                desc: 'Reapply reverted blocks until block #[number] is reached. EXPERIMENTAL',
                preventIfRunning: true,
                onDatabaseExecute: (server, conf, program, params) => __awaiter(this, void 0, void 0, function* () {
                    const number = params[0];
                    const logger = server.logger;
                    try {
                        yield server.reapplyTo(number);
                    }
                    catch (err) {
                        logger.error('Error during reapply:', err);
                    }
                    // Save DB
                    if (server) {
                        yield server.disconnect();
                    }
                })
            }]
    }
};
//# sourceMappingURL=reapply.js.map