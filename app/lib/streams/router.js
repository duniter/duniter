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
const Peer = require('../entity/peer');
const constants = require('../constants');
class RouterStream extends stream.Transform {
    constructor(peeringService, dal) {
        super({ objectMode: true });
        this.peeringService = peeringService;
        this.dal = dal;
        this.active = true;
        this.logger = require('../logger').NewLogger('router');
    }
    setConfDAL(theDAL) {
        this.dal = theDAL;
    }
    setActive(shouldBeActive) {
        this.active = shouldBeActive;
    }
    _write(obj, enc, done) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (obj.joiners) {
                    yield this.route('block', obj, () => this.getRandomInUPPeers(obj.issuer === this.peeringService.pubkey)());
                }
                else if (obj.revocation) {
                    yield this.route('revocation', obj, () => this.getRandomInUPPeers(obj.pubkey === this.peeringService.pubkey)());
                }
                else if (obj.pubkey && obj.uid) {
                    yield this.route('identity', obj, () => this.getRandomInUPPeers(obj.pubkey === this.peeringService.pubkey)());
                }
                else if (obj.idty_uid) {
                    yield this.route('cert', obj, () => this.getRandomInUPPeers(obj.pubkey === this.peeringService.pubkey)());
                }
                else if (obj.userid) {
                    yield this.route('membership', obj, () => this.getRandomInUPPeers(obj.issuer === this.peeringService.pubkey)());
                }
                else if (obj.inputs) {
                    yield this.route('transaction', obj, () => this.getRandomInUPPeers(obj.issuers.indexOf(this.peeringService.pubkey) !== -1)());
                }
                else if (obj.endpoints) {
                    yield this.route('peer', obj, () => this.getRandomInUPPeers(obj.pubkey === this.peeringService.pubkey)());
                }
                else if (obj.from && obj.from == this.peeringService.pubkey) {
                    // Route ONLY status emitted by this node
                    yield this.route('status', obj, () => this.getTargeted(obj.to || obj.idty_issuer)());
                }
                else if (obj.unreachable) {
                    yield this.dal.setPeerDown(obj.peer.pubkey);
                    this.logger.info("Peer %s unreachable: now considered as DOWN.", obj.peer.pubkey);
                }
                else if (obj.outdated) {
                    yield this.peeringService.handleNewerPeer(obj.peer);
                }
            }
            catch (e) {
                if (e && e.uerr && e.uerr.ucode == constants.ERRORS.NEWER_PEER_DOCUMENT_AVAILABLE.uerr.ucode) {
                    this.logger.info('Newer peer document available on the network for local node');
                }
                else {
                    this.logger.error("Routing error: %s", e && (e.stack || e.message || (e.uerr && e.uerr.message) || e));
                }
            }
            done && done();
        });
    }
    route(type, obj, getPeersFunc) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.active)
                return;
            const peers = yield getPeersFunc();
            this.push({
                'type': type,
                'obj': obj,
                'peers': (peers || []).map(Peer.statics.peerize)
            });
        });
    }
    getRandomInUPPeers(isSelfDocument) {
        return this.getValidUpPeers([this.peeringService.pubkey], isSelfDocument);
    }
    getValidUpPeers(without, isSelfDocument) {
        return () => __awaiter(this, void 0, void 0, function* () {
            let members = [];
            let nonmembers = [];
            let peers = yield this.dal.getRandomlyUPsWithout(without); // Peers with status UP
            for (const p of peers) {
                let isMember = yield this.dal.isMember(p.pubkey);
                isMember ? members.push(p) : nonmembers.push(p);
            }
            members = RouterStream.chooseXin(members, isSelfDocument ? constants.NETWORK.MAX_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS : constants.NETWORK.MAX_MEMBERS_TO_FORWARD_TO);
            nonmembers = RouterStream.chooseXin(nonmembers, isSelfDocument ? constants.NETWORK.MAX_NON_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS : constants.NETWORK.MAX_NON_MEMBERS_TO_FORWARD_TO);
            let mainRoutes = members.map((p) => (p.member = true) && p).concat(nonmembers);
            let mirrors = yield this.peeringService.mirrorEndpoints();
            return mainRoutes.concat(mirrors.map((mep, index) => {
                return {
                    pubkey: 'M' + index + '_' + this.peeringService.pubkey,
                    endpoints: [mep]
                };
            }));
        });
    }
    /**
    * Get the peer targeted by `to` argument, this node excluded (for not to loop on self).
    */
    getTargeted(to) {
        return () => __awaiter(this, void 0, void 0, function* () {
            if (to == this.peeringService.pubkey) {
                return [];
            }
            const peer = yield this.dal.getPeer(to);
            return [peer];
        });
    }
    static chooseXin(peers, max) {
        const chosen = [];
        const nbPeers = peers.length;
        for (let i = 0; i < Math.min(nbPeers, max); i++) {
            const randIndex = Math.max(Math.floor(Math.random() * 10) - (10 - nbPeers) - i, 0);
            chosen.push(peers[randIndex]);
            peers.splice(randIndex, 1);
        }
        return chosen;
    }
}
exports.RouterStream = RouterStream;
//# sourceMappingURL=router.js.map