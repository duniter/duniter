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
const request = require('request');
const constants = require('../../lib/constants');
const Peer = require('../../lib/entity/peer');
const Identity = require('../../lib/entity/identity');
const Certification = require('../../lib/entity/certification');
const Revocation = require('../../lib/entity/revocation');
const Membership = require('../../lib/entity/membership');
const Block = require('../../lib/entity/block');
const Transaction = require('../../lib/entity/transaction');
const logger = require('../logger').NewLogger('multicaster');
const WITH_ISOLATION = true;
class Multicaster extends stream.Transform {
    constructor(conf = null, timeout = 0) {
        super({ objectMode: true });
        this.conf = conf;
        this.timeout = timeout;
        this.on('identity', (data, peers) => this.idtyForward(data, peers));
        this.on('cert', (data, peers) => this.certForward(data, peers));
        this.on('revocation', (data, peers) => this.revocationForward(data, peers));
        this.on('block', (data, peers) => this.blockForward(data, peers));
        this.on('transaction', (data, peers) => this.txForward(data, peers));
        this.on('peer', (data, peers) => this.peerForward(data, peers));
        this.on('membership', (data, peers) => this.msForward(data, peers));
    }
    blockForward(doc, peers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.forward({
                transform: Block.statics.fromJSON,
                type: 'Block',
                uri: '/blockchain/block',
                getObj: (block) => {
                    return {
                        "block": block.getRawSigned()
                    };
                },
                getDocID: (block) => 'block#' + block.number
            })(doc, peers);
        });
    }
    idtyForward(doc, peers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.forward({
                transform: Identity.statics.fromJSON,
                type: 'Identity',
                uri: '/wot/add',
                getObj: (idty) => {
                    return {
                        "identity": idty.createIdentity()
                    };
                },
                getDocID: (idty) => 'with ' + (idty.certs || []).length + ' certs'
            })(doc, peers);
        });
    }
    certForward(doc, peers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.forward({
                transform: Certification.statics.fromJSON,
                type: 'Cert',
                uri: '/wot/certify',
                getObj: (cert) => {
                    return {
                        "cert": cert.getRaw()
                    };
                },
                getDocID: (idty) => 'with ' + (idty.certs || []).length + ' certs'
            })(doc, peers);
        });
    }
    revocationForward(doc, peers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.forward({
                transform: Revocation.statics.fromJSON,
                type: 'Revocation',
                uri: '/wot/revoke',
                getObj: (revocation) => {
                    return {
                        "revocation": revocation.getRaw()
                    };
                }
            })(doc, peers);
        });
    }
    txForward(doc, peers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.forward({
                transform: Transaction.statics.fromJSON,
                type: 'Transaction',
                uri: '/tx/process',
                getObj: (transaction) => {
                    return {
                        "transaction": transaction.getRaw(),
                        "signature": transaction.signature
                    };
                }
            })(doc, peers);
        });
    }
    peerForward(doc, peers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.forward({
                type: 'Peer',
                uri: '/network/peering/peers',
                transform: Peer.statics.peerize,
                getObj: (peering) => {
                    return {
                        peer: peering.getRawSigned()
                    };
                },
                getDocID: (doc) => doc.keyID() + '#' + doc.block.match(/(\d+)-/)[1],
                withIsolation: WITH_ISOLATION,
                onError: (resJSON, peering, to) => {
                    const sentPeer = Peer.statics.peerize(peering);
                    if (Peer.statics.blockNumber(resJSON.peer) > sentPeer.blockNumber()) {
                        this.push({ outdated: true, peer: resJSON.peer });
                        logger.warn('Outdated peer document (%s) sent to %s', sentPeer.keyID() + '#' + sentPeer.block.match(/(\d+)-/)[1], to);
                    }
                    return Promise.resolve();
                }
            })(doc, peers);
        });
    }
    msForward(doc, peers) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.forward({
                transform: Membership.statics.fromJSON,
                type: 'Membership',
                uri: '/blockchain/membership',
                getObj: (membership) => {
                    return {
                        "membership": membership.getRaw(),
                        "signature": membership.signature
                    };
                }
            })(doc, peers);
        });
    }
    _write(obj, enc, done) {
        this.emit(obj.type, obj.obj, obj.peers);
        done();
    }
    sendBlock(toPeer, block) {
        return this.blockForward(block, [toPeer]);
    }
    sendPeering(toPeer, peer) {
        return this.peerForward(peer, [toPeer]);
    }
    forward(params) {
        return (doc, peers) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!params.withIsolation || !(this.conf && this.conf.isolate)) {
                    let theDoc = params.transform ? params.transform(doc) : doc;
                    logger.debug('--> new %s to be sent to %s peer(s)', params.type, peers.length);
                    if (params.getDocID) {
                        logger.info('POST %s %s', params.type, params.getDocID(theDoc));
                    }
                    else {
                        logger.info('POST %s', params.type);
                    }
                    // Parallel treatment for superfast propagation
                    yield Promise.all(peers.map((p) => __awaiter(this, void 0, void 0, function* () {
                        let peer = Peer.statics.peerize(p);
                        const namedURL = peer.getNamedURL();
                        logger.debug(' `--> to peer %s [%s] (%s)', peer.keyID(), peer.member ? 'member' : '------', namedURL);
                        try {
                            yield this.post(peer, params.uri, params.getObj(theDoc));
                        }
                        catch (e) {
                            if (params.onError) {
                                try {
                                    const json = JSON.parse(e.body);
                                    yield params.onError(json, doc, namedURL);
                                }
                                catch (ex) {
                                    logger.warn('Could not reach %s', namedURL);
                                }
                            }
                        }
                    })));
                }
                else {
                    logger.debug('[ISOLATE] Prevent --> new Peer to be sent to %s peer(s)', peers.length);
                }
            }
            catch (err) {
                logger.error(err);
            }
        });
    }
    post(peer, uri, data) {
        if (!peer.isReachable()) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const postReq = request.post({
                "uri": protocol(peer.getPort()) + '://' + peer.getURL() + uri,
                "timeout": this.timeout || constants.NETWORK.DEFAULT_TIMEOUT
            }, (err, res) => {
                if (err) {
                    this.push({ unreachable: true, peer: { pubkey: peer.pubkey } });
                    logger.warn(err.message || err);
                }
                if (res && res.statusCode != 200) {
                    return reject(res);
                }
                resolve(res);
            });
            postReq.form(data);
        });
    }
}
exports.Multicaster = Multicaster;
function protocol(port) {
    return port == 443 ? 'https' : 'http';
}
//# sourceMappingURL=multicaster.js.map