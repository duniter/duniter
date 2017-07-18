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
const stream = require("stream");
const constants = require('../lib/constants');
const router = require('../lib/streams/router');
const multicaster = require('../lib/streams/multicaster');
module.exports = {
    duniter: {
        service: {
            output: (server, conf, logger) => new Router(server)
        },
        methods: {
            routeToNetwork: (server) => {
                const theRouter = new Router(server);
                theRouter.startService();
                server.pipe(theRouter);
            }
        }
    }
};
/**
 * Service which triggers the server's peering generation (actualization of the Peer document).
 * @constructor
 */
class Router extends stream.Transform {
    constructor(server) {
        super({ objectMode: true });
        this.server = server;
        this.theMulticaster = multicaster();
    }
    _write(obj, enc, done) {
        // Never close the stream
        if (obj) {
            this.push(obj);
        }
        done && done();
    }
    ;
    startService() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.theRouter) {
                this.theRouter = router(this.server.PeeringService, this.server.dal);
            }
            this.theRouter.setActive(true);
            this.theRouter.setConfDAL(this.server.dal);
            /**
             * Enable routing features:
             *   - The server will try to send documents to the network
             *   - The server will eventually be notified of network failures
             */
            // The router asks for multicasting of documents
            this
                .pipe(this.theRouter)
                .pipe(this.theMulticaster)
                .pipe(this.theRouter);
        });
    }
    stopService() {
        return __awaiter(this, void 0, void 0, function* () {
            this.unpipe();
            this.theRouter && this.theRouter.unpipe();
            this.theMulticaster && this.theMulticaster.unpipe();
        });
    }
}
//# sourceMappingURL=router.js.map