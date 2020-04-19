// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import { ConfDTO } from "../dto/ConfDTO";
import * as stream from "stream";
import { BlockDTO } from "../dto/BlockDTO";
import { RevocationDTO } from "../dto/RevocationDTO";
import { IdentityDTO } from "../dto/IdentityDTO";
import { CertificationDTO } from "../dto/CertificationDTO";
import { MembershipDTO } from "../dto/MembershipDTO";
import { TransactionDTO } from "../dto/TransactionDTO";
import { PeerDTO } from "../dto/PeerDTO";
import { CommonConstants } from "../common-libs/constants";
import { DBPeer } from "../db/DBPeer";

const request = require("request");
const constants = require("../../lib/constants");
const logger = require("../logger").NewLogger("multicaster");

const WITH_ISOLATION = true;

export class Multicaster extends stream.Transform {
  constructor(
    private conf: ConfDTO | null = null,
    private timeout: number = 0
  ) {
    super({ objectMode: true });

    this.on("identity", (data: any, peers: DBPeer[]) =>
      this.idtyForward(data, peers)
    );
    this.on("cert", (data: any, peers: DBPeer[]) =>
      this.certForward(data, peers)
    );
    this.on("revocation", (data: any, peers: DBPeer[]) =>
      this.revocationForward(data, peers)
    );
    this.on("block", (data: any, peers: DBPeer[]) =>
      this.blockForward(data, peers)
    );
    this.on("transaction", (data: any, peers: DBPeer[]) =>
      this.txForward(data, peers)
    );
    this.on("peer", (data: any, peers: DBPeer[]) =>
      this.peerForward(data, peers)
    );
    this.on("membership", (data: any, peers: DBPeer[]) =>
      this.msForward(data, peers)
    );
  }

  async blockForward(doc: any, peers: DBPeer[]) {
    return this.forward({
      transform: (b: any) => BlockDTO.fromJSONObject(b),
      type: "Block",
      uri: "/blockchain/block",
      getObj: (block: any) => {
        return {
          block: block.getRawSigned(),
        };
      },
      getDocID: (block: any) => "block#" + block.number,
    })(doc, peers);
  }

  async idtyForward(doc: any, peers: DBPeer[]) {
    return this.forward({
      transform: (obj: any) => IdentityDTO.fromJSONObject(obj),
      type: "Identity",
      uri: "/wot/add",
      getObj: (idty: IdentityDTO) => {
        return {
          identity: idty.getRawSigned(),
        };
      },
      getDocID: (idty: any) => "with " + (idty.certs || []).length + " certs",
    })(doc, peers);
  }

  async certForward(doc: any, peers: DBPeer[]) {
    return this.forward({
      transform: (obj: any) => CertificationDTO.fromJSONObject(obj),
      type: "Cert",
      uri: "/wot/certify",
      getObj: (cert: CertificationDTO) => {
        return {
          cert: cert.getRawSigned(),
        };
      },
      getDocID: (idty: any) => "with " + (idty.certs || []).length + " certs",
    })(doc, peers);
  }

  async revocationForward(doc: any, peers: DBPeer[]) {
    return this.forward({
      transform: (json: any) => RevocationDTO.fromJSONObject(json),
      type: "Revocation",
      uri: "/wot/revoke",
      getObj: (revocation: RevocationDTO) => {
        return {
          revocation: revocation.getRaw(),
        };
      },
    })(doc, peers);
  }

  async txForward(doc: any, peers: DBPeer[]) {
    return this.forward({
      transform: (obj: any) => TransactionDTO.fromJSONObject(obj),
      type: "Transaction",
      uri: "/tx/process",
      getObj: (transaction: TransactionDTO) => {
        return {
          transaction: transaction.getRaw(),
          signature: transaction.signature,
        };
      },
    })(doc, peers);
  }

  async peerForward(doc: any, peers: DBPeer[]) {
    return this.forward({
      type: "Peer",
      uri: "/network/peering/peers",
      transform: (obj: any) => PeerDTO.fromJSONObject(obj),
      getObj: (peering: PeerDTO) => {
        return {
          peer: peering.getRawSigned(),
        };
      },
      getDocID: (doc: PeerDTO) => doc.keyID() + "#" + doc.blockNumber(),
      withIsolation: WITH_ISOLATION,
      onError: (
        resJSON: {
          peer: {
            block: string;
            endpoints: string[];
          };
          ucode?: number;
          message?: string;
        },
        peering: any,
        to: any
      ) => {
        if (
          resJSON.ucode !== undefined &&
          resJSON.ucode !==
            CommonConstants.ERRORS.NEWER_PEER_DOCUMENT_AVAILABLE.uerr.ucode
        ) {
          if (
            resJSON.ucode ==
              CommonConstants.ERRORS.DOCUMENT_BEING_TREATED.uerr.ucode ||
            resJSON.ucode ==
              constants.ERRORS.PEER_DOCUMENT_ALREADY_KNOWN.uerr.ucode
          ) {
            return Promise.resolve();
          } else {
            throw Error(resJSON.message);
          }
        } else {
          // Handle possibly outdated peering document
          const sentPeer = PeerDTO.fromJSONObject(peering);
          if (
            PeerDTO.blockNumber(resJSON.peer.block) > sentPeer.blockNumber()
          ) {
            this.push({ outdated: true, peer: resJSON.peer });
            logger.warn(
              "Outdated peer document (%s) sent to %s",
              sentPeer.keyID() + "#" + sentPeer.blockNumber(),
              to
            );
          }
          return Promise.resolve();
        }
      },
    })(doc, peers);
  }

  async msForward(doc: any, peers: DBPeer[]) {
    return this.forward({
      transform: (obj: any) => MembershipDTO.fromJSONObject(obj),
      type: "Membership",
      uri: "/blockchain/membership",
      getObj: (membership: MembershipDTO) => {
        return {
          membership: membership.getRaw(),
          signature: membership.signature,
        };
      },
    })(doc, peers);
  }

  _write(obj: any, enc: any, done: any) {
    this.emit(obj.type, obj.obj, obj.peers);
    done();
  }

  sendBlock(toPeer: any, block: any) {
    return this.blockForward(block, [toPeer]);
  }

  sendPeering(toPeer: any, peer: any) {
    return this.peerForward(peer, [toPeer]);
  }

  forward(params: any) {
    return async (doc: any, peers: DBPeer[]) => {
      try {
        if (!params.withIsolation || !(this.conf && this.conf.isolate)) {
          let theDoc = params.transform ? params.transform(doc) : doc;
          if (params.getDocID) {
            logger.info(
              "POST %s %s to %s peers",
              params.type,
              params.getDocID(theDoc),
              peers.length
            );
          } else {
            logger.info("POST %s to %s peers", params.type, peers.length);
          }
          // Parallel treatment for superfast propagation
          await Promise.all(
            peers.map(async (p) => {
              let peer = PeerDTO.fromJSONObject(p);
              const namedURL = peer.getNamedURL();
              try {
                await this.post(peer, params.uri, params.getObj(theDoc));
              } catch (e) {
                if (params.onError) {
                  try {
                    const json = JSON.parse(e.body);
                    await params.onError(json, doc, namedURL);
                  } catch (ex) {
                    logger.warn(
                      "Could not reach %s, reason: %s",
                      namedURL,
                      (ex && ex.message) || ex
                    );
                  }
                }
              }
            })
          );
        } else {
          logger.debug(
            "[ISOLATE] Prevent --> new Peer to be sent to %s peer(s)",
            peers.length
          );
        }
      } catch (err) {
        logger.error(err);
      }
    };
  }

  post(peer: any, uri: string, data: any) {
    if (!peer.isReachable()) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const postReq = request.post(
        {
          uri: protocol(peer.getPort()) + "://" + peer.getURL() + uri,
          timeout: this.timeout || constants.NETWORK.DEFAULT_TIMEOUT,
        },
        (err: any, res: any) => {
          if (err) {
            this.push({ unreachable: true, peer: { pubkey: peer.pubkey } });
            logger.warn(err.message || err);
          }
          if (res && res.statusCode != 200) {
            return reject(res);
          }
          resolve(res);
        }
      );
      postReq.form(data);
    });
  }
}

function protocol(port: number) {
  return port == 443 ? "https" : "http";
}
