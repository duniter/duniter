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

import { ConfDTO } from "../../lib/dto/ConfDTO";
import { Server } from "../../../server";
import { Contacter } from "./lib/contacter";
import { Crawler } from "./lib/crawler";
import { Synchroniser } from "./lib/sync";
import { req2fwd } from "./lib/req2fwd";
import { rawer } from "../../lib/common-libs/index";
import { PeerDTO } from "../../lib/dto/PeerDTO";
import { Buid } from "../../lib/common-libs/buid";
import { BlockDTO } from "../../lib/dto/BlockDTO";
import { Directory } from "../../lib/system/directory";
import { FileDAL } from "../../lib/dal/fileDAL";
import { RemoteSynchronizer } from "./lib/sync/RemoteSynchronizer";
import { AbstractSynchronizer } from "./lib/sync/AbstractSynchronizer";
import { LocalPathSynchronizer } from "./lib/sync/LocalPathSynchronizer";
import { CommonConstants } from "../../lib/common-libs/constants";
import { DataErrors } from "../../lib/common-libs/errors";
import { NewLogger } from "../../lib/logger";
import { CrawlerConstants } from "./lib/constants";
import { ExitCodes } from "../../lib/common-libs/exit-codes";
import { connect } from "./lib/connect";
import { BMARemoteContacter } from "./lib/sync/BMARemoteContacter";
import {
  applyMempoolRequirements,
  forwardToServer,
  pullSandboxToLocalServer,
} from "./lib/sandbox";
import { DBBlock } from "../../lib/db/DBBlock";

const HOST_PATTERN = /^[^:/]+(:[0-9]{1,5})?(\/.*)?$/;
const FILE_PATTERN = /^(\/.+)$/;

export const CrawlerDependency = {
  duniter: {
    service: {
      process: (server: Server, conf: ConfDTO, logger: any) =>
        new Crawler(server, conf, logger),
    },

    methods: {
      contacter: (host: string, port: number, opts?: any) =>
        new Contacter(host, port, opts),

      pullBlocks: async (server: Server, pubkey = "") => {
        const crawler = new Crawler(server, server.conf, server.logger);
        return crawler.pullBlocks(server, pubkey);
      },

      pullSandbox: async (server: Server) => {
        const crawler = new Crawler(server, server.conf, server.logger);
        return crawler.sandboxPull(server);
      },

      synchronize: (
        server: Server,
        onHost: string,
        onPort: number,
        upTo: number,
        chunkLength: number,
        allowLocalSync = false
      ) => {
        const strategy = new RemoteSynchronizer(
          onHost,
          onPort,
          server,
          chunkLength,
          undefined,
          undefined,
          allowLocalSync
        );
        const remote = new Synchroniser(server, strategy);
        const syncPromise = remote.sync(upTo, chunkLength);
        return {
          flow: remote,
          syncPromise,
        };
      },

      /**
       * Used by duniter-ui
       * @param {Server} server
       * @param {string} onHost
       * @param {number} onPort
       * @returns {Promise<any>}
       */
      testForSync: (server: Server, onHost: string, onPort: number) => {
        return RemoteSynchronizer.test(onHost, onPort, server.conf.pair);
      },
    },

    cliOptions: [
      { value: "--nointeractive", desc: "Disable interactive sync UI." },
      {
        value: "--nocautious",
        desc: "Do not check blocks validity during sync.",
      },
      {
        value: "--cautious",
        desc:
          "Check blocks validity during sync (overrides --nocautious option).",
      },
      { value: "--nopeers", desc: "Do not retrieve peers during sync." },
      {
        value: "--nop2p",
        desc: "Disables P2P downloading of blocs during sync.",
      },
      {
        value: "--localsync",
        desc:
          "Allow to synchronize on nodes with local network IP address for `sync` command",
      },
      {
        value: "--nosources",
        desc: "Do not parse sources (UD, TX) during sync (debug purposes).",
      },
      { value: "--nosbx", desc: "Do not retrieve sandboxes during sync." },
      { value: "--onlypeers", desc: "Will only try to sync peers." },
      {
        value: "--slow",
        desc: "Download slowly the blokchcain (for low connnections).",
      },
      {
        value: "--readfilesystem",
        desc: "Also read the filesystem to speed up block downloading.",
      },
      {
        value: "--minsig <minsig>",
        desc:
          "Minimum pending signatures count for `crawl-lookup`. Default is 5.",
      },
    ],

    cli: [
      {
        name: "sync [source] [to]",
        desc:
          "Synchronize blockchain from a remote Duniter node. [source] is [host][:port]. [to] defaults to remote current block number.",
        preventIfRunning: true,
        onConfiguredExecute: async (server: Server) => {
          await server.resetData();
        },
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ): Promise<any> => {
          const source = params[0];
          const to = params[1];
          if (
            !source ||
            !(source.match(HOST_PATTERN) || source.match(FILE_PATTERN))
          ) {
            throw "Source of sync is required. (either a host:port or a file path)";
          }
          let cautious;
          if (program.nocautious) {
            cautious = false;
          }
          if (program.cautious) {
            cautious = true;
          }
          const upTo = parseInt(to);
          const chunkLength = 0;
          const interactive = !program.nointeractive;
          const askedCautious = cautious;
          const noShufflePeers = program.noshuffle;

          let otherDAL = undefined;
          if (program.readfilesystem) {
            const dbName = program.mdb;
            const dbHome = program.home;
            const home = Directory.getHome(dbName, dbHome);
            const params = await Directory.getHomeParams(false, home);
            otherDAL = new FileDAL(
              params,
              async () => null as any,
              async () => null as any
            );
          }

          let strategy: AbstractSynchronizer;
          if (source.match(HOST_PATTERN)) {
            const sp = source.split(":");
            const onHost = sp[0];
            const onPort = parseInt(sp[1] ? sp[1] : "443"); // Defaults to 443
            strategy = new RemoteSynchronizer(
              onHost,
              onPort,
              server,
              CommonConstants.SYNC_BLOCKS_CHUNK,
              noShufflePeers === true,
              otherDAL,
              program.localsync !== undefined
            );
          } else {
            strategy = new LocalPathSynchronizer(
              source,
              server,
              CommonConstants.SYNC_BLOCKS_CHUNK
            );
          }
          if (program.onlypeers === true) {
            return strategy.syncPeers(true);
          } else {
            const remote = new Synchroniser(
              server,
              strategy,
              interactive === true
            );

            // If the sync fail, stop the program
            process.on("unhandledRejection", (reason: any) => {
              if (
                reason.message ===
                DataErrors[DataErrors.NO_NODE_FOUND_TO_DOWNLOAD_CHUNK]
              ) {
                NewLogger().error(
                  "Synchronization interrupted: no node was found to continue downloading after %s tries.",
                  CrawlerConstants.SYNC_MAX_FAIL_NO_NODE_FOUND
                );
                process.exit(ExitCodes.SYNC_FAIL);
              }
            });

            return remote.sync(upTo, chunkLength, askedCautious);
          }
        },
      },
      {
        name: "peer [host] [port]",
        desc: "Exchange peerings with another node",
        preventIfRunning: true,
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const host = params[0];
          const port = params[1];
          const logger = server.logger;
          try {
            const ERASE_IF_ALREADY_RECORDED = true;
            logger.info("Fetching peering record at %s:%s...", host, port);
            let peering = await Contacter.fetchPeer(host, port);
            logger.info("Apply peering ...");
            await server.PeeringService.submitP(
              peering,
              ERASE_IF_ALREADY_RECORDED,
              !program.nocautious,
              true
            );
            logger.info("Applied");
            let selfPeer = await server.dal.getPeer(
              server.PeeringService.pubkey
            );
            if (!selfPeer) {
              await server.PeeringService.generateSelfPeer(server.conf);
              selfPeer = await server.dal.getPeer(server.PeeringService.pubkey);
            }
            logger.info("Send self peering ...");
            const p = PeerDTO.fromJSONObject(peering);
            const contact = new Contacter(
              p.getHostPreferDNS(),
              p.getPort() as number,
              {}
            );
            await contact.postPeer(PeerDTO.fromJSONObject(selfPeer));
            logger.info("Sent.");
            await server.disconnect();
          } catch (e) {
            logger.error(e.code || e.message || e);
            throw Error("Exiting");
          }
        },
      },
      {
        name: "import <fromHost> <fromPort> <search> <toHost> <toPort>",
        desc: "Import all pending data from matching <search>",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const fromHost = params[0];
          const fromPort = params[1];
          const search = params[2];
          const toHost = params[3];
          const toPort = params[4];
          const logger = server.logger;
          try {
            const peers =
              fromHost && fromPort
                ? [
                    {
                      endpoints: [
                        [
                          fromPort == "443" ? "BMAS" : "BASIC_MERKLED_API",
                          fromHost,
                          fromPort,
                        ].join(" "),
                      ],
                    },
                  ]
                : await server.dal.peerDAL.withUPStatus();
            // Memberships
            for (const p of peers) {
              const peer = PeerDTO.fromJSONObject(p);
              const fromHost = peer.getHostPreferDNS();
              const fromPort = peer.getPort();
              logger.info("Looking at %s:%s...", fromHost, fromPort);
              try {
                const node = new Contacter(fromHost, fromPort as number, {
                  timeout: 10000,
                });
                const requirements = await node.getRequirements(search);
                await req2fwd(requirements, toHost, toPort, logger);
              } catch (e) {
                logger.error(e);
              }
            }
            await server.disconnect();
          } catch (e) {
            logger.error(e);
            throw Error("Exiting");
          }
        },
      },
      {
        name: "sync-mempool <from>",
        desc: "Import all pending data from matching <search>",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const source: string = params[0];
          if (
            !source ||
            !(source.match(HOST_PATTERN) || source.match(FILE_PATTERN))
          ) {
            throw "Source of sync is required. (host[:port])";
          }
          const logger = NewLogger();
          const from: string = params[0];
          const { host, port } = extractHostPort(from);
          try {
            const peer = PeerDTO.fromJSONObject({
              endpoints: [
                [port == "443" ? "BMAS" : "BASIC_MERKLED_API", host, port].join(
                  " "
                ),
              ],
            });
            const fromHost = peer.getHostPreferDNS();
            const fromPort = peer.getPort();
            logger.info("Looking at %s:%s...", fromHost, fromPort);
            try {
              const fromHost = await connect(peer, 60 * 1000);
              const api = new BMARemoteContacter(fromHost);
              await pullSandboxToLocalServer(
                server.conf.currency,
                api,
                server,
                logger
              );
            } catch (e) {
              logger.error(e);
            }

            await server.disconnect();
          } catch (e) {
            logger.error(e);
            throw Error("Exiting");
          }
        },
      },
      {
        name: "sync-mempool-search <from> <search>",
        desc: "Import all pending data from matching <search>",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const source: string = params[0];
          const search: string = params[1];
          if (
            !source ||
            !(source.match(HOST_PATTERN) || source.match(FILE_PATTERN))
          ) {
            throw "Source of sync is required. (host[:port])";
          }
          const logger = NewLogger();
          const from: string = params[0];
          const { host, port } = extractHostPort(from);
          try {
            const peer = PeerDTO.fromJSONObject({
              endpoints: [
                [port == "443" ? "BMAS" : "BASIC_MERKLED_API", host, port].join(
                  " "
                ),
              ],
            });
            const fromHost = peer.getHostPreferDNS();
            const fromPort = peer.getPort();
            logger.info("Looking at %s:%s...", fromHost, fromPort);
            try {
              const fromHost = await connect(peer);
              const res = await fromHost.getRequirements(search);
              await applyMempoolRequirements(
                server.conf.currency,
                res,
                server,
                logger
              );
            } catch (e) {
              logger.error(e);
            }

            await server.disconnect();
          } catch (e) {
            logger.error(e);
            throw Error("Exiting");
          }
        },
      },
      {
        name: "sync-mempool-fwd <from> <to> <search>",
        desc: "Import all pending data from matching <search>",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const source: string = params[0];
          const target: string = params[1];
          const search: string = params[2];
          if (
            !source ||
            !(source.match(HOST_PATTERN) || source.match(FILE_PATTERN))
          ) {
            throw "Source of sync is required. (host[:port])";
          }
          if (
            !target ||
            !(target.match(HOST_PATTERN) || target.match(FILE_PATTERN))
          ) {
            throw "Target of sync is required. (host[:port])";
          }
          const logger = NewLogger();
          const { host, port } = extractHostPort(source);
          const { host: toHost, port: toPort } = extractHostPort(target);
          try {
            const peer = PeerDTO.fromJSONObject({
              endpoints: [
                [port == "443" ? "BMAS" : "BASIC_MERKLED_API", host, port].join(
                  " "
                ),
              ],
            });
            logger.info("Looking at %s...", source);
            try {
              const fromHost = await connect(peer);
              const res = await fromHost.getRequirements(search);
              await forwardToServer(
                server.conf.currency,
                res,
                toHost,
                toPort,
                logger
              );
            } catch (e) {
              logger.error(e);
            }

            await server.disconnect();
          } catch (e) {
            logger.error(e);
            throw Error("Exiting");
          }
        },
      },
      {
        name: "pull <from> [<start>] [<end>]",
        desc: "Pull blocks from <from> source up to block <number>",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const source: string = params[0];
          const to = parseInt(params[2] || params[1]);
          let from: null | number = null;
          if (params[2]) {
            from = parseInt(params[1]);
          }
          if (
            !source ||
            !(source.match(HOST_PATTERN) || source.match(FILE_PATTERN))
          ) {
            throw "Source of sync is required. (host[:port])";
          }
          const logger = NewLogger();
          const { host, port } = extractHostPort(source);
          try {
            const peer = PeerDTO.fromJSONObject({
              endpoints: [
                [port == "443" ? "BMAS" : "BASIC_MERKLED_API"].join(" "),
              ],
            });
            logger.info("Looking at %s...", source);
            try {
              const fromHost = await connect(peer);
              let current: DBBlock | null = await server.dal.getCurrentBlockOrNull();
              if (from) {
                current = { number: from - 1 } as any;
              }
              // Loop until an error occurs
              while (current && (isNaN(to) || current.number < to)) {
                current = await fromHost.getBlock(current.number + 1);
                await server.writeBlock(current, false);
              }
            } catch (e) {
              logger.error(e);
            }
          } catch (e) {
            logger.error(e);
            throw Error("Exiting");
          }
        },
      },
      {
        name: "forward <number> <fromHost> <fromPort> <toHost> <toPort>",
        desc: "Forward existing block <number> from a host to another",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const number = params[0];
          const fromHost = params[1];
          const fromPort = params[2];
          const toHost = params[3];
          const toPort = params[4];
          const logger = server.logger;
          try {
            logger.info("Looking at %s:%s...", fromHost, fromPort);
            try {
              const source = new Contacter(fromHost, fromPort, {
                timeout: 10000,
              });
              const target = new Contacter(toHost, toPort, { timeout: 10000 });
              const block = await source.getBlock(number);
              const raw = BlockDTO.fromJSONObject(block).getRawSigned();
              await target.postBlock(raw);
            } catch (e) {
              logger.error(e);
            }
            await server.disconnect();
          } catch (e) {
            logger.error(e);
            throw Error("Exiting");
          }
        },
      },
      {
        name:
          "import-lookup [search] [fromhost] [fromport] [frompath] [tohost] [toport] [topath]",
        desc: "Exchange peerings with another node",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const search = params[0];
          const fromhost = params[1];
          const fromport = params[2];
          const frompath = params[3];
          const tohost = params[4];
          const toport = params[5];
          const topath = params[6];
          const logger = server.logger;
          try {
            logger.info(
              'Looking for "%s" at %s:%s%s...',
              search,
              fromhost,
              fromport,
              frompath
            );
            const sourcePeer = Contacter.fromHostPortPath(
              fromhost,
              fromport,
              frompath,
              { timeout: 60 * 1000 }
            );
            const targetPeer = Contacter.fromHostPortPath(
              tohost,
              toport,
              topath,
              { timeout: 60 * 1000 }
            );
            const lookup = await sourcePeer.getLookup(search);
            for (const res of lookup.results) {
              for (const uid of res.uids) {
                const rawIdty = rawer.getOfficialIdentity({
                  currency: "g1",
                  issuer: res.pubkey,
                  uid: uid.uid,
                  buid: uid.meta.timestamp,
                  sig: uid.self,
                });
                logger.info("Success idty %s", uid.uid);
                try {
                  await targetPeer.postIdentity(rawIdty);
                } catch (e) {
                  logger.error(e);
                }
                for (const received of uid.others) {
                  const rawCert = rawer.getOfficialCertification({
                    currency: "g1",
                    issuer: received.pubkey,
                    idty_issuer: res.pubkey,
                    idty_uid: uid.uid,
                    idty_buid: uid.meta.timestamp,
                    idty_sig: uid.self,
                    buid: Buid.format.buid(
                      received.meta.block_number,
                      received.meta.block_hash
                    ),
                    sig: received.signature,
                  });
                  try {
                    logger.info(
                      "Success cert %s -> %s",
                      received.pubkey.slice(0, 8),
                      uid.uid
                    );
                    await targetPeer.postCert(rawCert);
                  } catch (e) {
                    logger.error(e);
                  }
                }
              }
            }
            let certBy: any = { certifications: [] };
            try {
              certBy = await sourcePeer.getCertifiedBy(search);
            } catch (e) {
              logger.error("No certified-by on remote");
            }
            const mapBlocks: any = {};
            for (const signed of certBy.certifications) {
              if (signed.written) {
                logger.info(
                  "Already written cert %s -> %s",
                  certBy.pubkey.slice(0, 8),
                  signed.uid
                );
              } else {
                const lookupIdty = await sourcePeer.getLookup(signed.pubkey);
                let idty = null;
                for (const result of lookupIdty.results) {
                  for (const uid of result.uids) {
                    if (
                      uid.uid === signed.uid &&
                      result.pubkey === signed.pubkey &&
                      uid.meta.timestamp === signed.sigDate
                    ) {
                      idty = uid;
                    }
                  }
                }
                let block = mapBlocks[signed.cert_time.block];
                if (!block) {
                  block = await sourcePeer.getBlock(signed.cert_time.block);
                  mapBlocks[block.number] = block;
                }
                const rawCert = rawer.getOfficialCertification({
                  currency: "g1",
                  issuer: certBy.pubkey,
                  idty_issuer: signed.pubkey,
                  idty_uid: signed.uid,
                  idty_buid: idty.meta.timestamp,
                  idty_sig: idty.self,
                  buid: Buid.format.buid(block.number, block.hash),
                  sig: signed.signature,
                });
                try {
                  logger.info(
                    "Posting cert %s -> %s",
                    certBy.pubkey.slice(0, 8),
                    signed.uid
                  );
                  await targetPeer.postCert(rawCert);
                } catch (e) {
                  logger.error(e);
                }
              }
            }
            // Memberships
            const requirements = await sourcePeer.getRequirements(search);
            for (let idty of requirements.identities) {
              for (let pendingMs of idty.pendingMemberships) {
                const rawMs = rawer.getMembership({
                  currency: "g1",
                  issuer: pendingMs.issuer,
                  type: pendingMs.membership,
                  blockstamp: pendingMs.blockstamp,
                  userid: pendingMs.userid,
                  certts: pendingMs.certts,
                  signature: pendingMs.signature,
                });
                try {
                  logger.info("Posting membership");
                  await targetPeer.postRenew(rawMs);
                } catch (e) {
                  logger.error(e);
                }
              }
            }
            logger.info("Sent.");
            await server.disconnect();
          } catch (e) {
            logger.error(e);
            throw Error("Exiting");
          }
        },
      },
      {
        name: "crawl-lookup <toHost> <toPort> [<fromHost> [<fromPort>]]",
        desc:
          "Make a full network scan and rebroadcast every WoT pending document (identity, certification, membership)",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const toHost = params[0];
          const toPort = params[1];
          const fromHost = params[2];
          const fromPort = params[3];
          const logger = server.logger;
          try {
            const peers =
              fromHost && fromPort
                ? [
                    {
                      endpoints: [
                        [
                          fromPort == "443" ? "BMAS" : "BASIC_MERKLED_API",
                          fromHost,
                          fromPort,
                        ].join(" "),
                      ],
                    },
                  ]
                : await server.dal.peerDAL.withUPStatus();
            // Memberships
            for (const p of peers) {
              const peer = PeerDTO.fromJSONObject(p);
              const fromHost = peer.getHostPreferDNS();
              const fromPort = peer.getPort();
              logger.info("Looking at %s:%s...", fromHost, fromPort);
              try {
                const node = new Contacter(fromHost, fromPort as number, {
                  timeout: 10000,
                });
                const requirements = await node.getRequirementsPending(
                  program.minsig || 5
                );
                await req2fwd(requirements, toHost, toPort, logger);
              } catch (e) {
                logger.error(e);
              }
            }
            await server.disconnect();
          } catch (e) {
            logger.error(e);
            throw Error("Exiting");
          }
        },
      },
      {
        name: "fwd-pending-ms",
        desc: "Forwards all the local pending memberships to target node",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          const logger = server.logger;
          try {
            const pendingMSS = await server.dal.msDAL.getPendingIN();
            const targetPeer = new Contacter("g1.cgeek.fr", 80, {
              timeout: 5000,
            });
            // Membership
            let rawMS;
            for (const theMS of pendingMSS) {
              console.log("New membership pending for %s", theMS.userid);
              try {
                rawMS = rawer.getMembership({
                  currency: "g1",
                  issuer: theMS.issuer,
                  block: theMS.block,
                  membership: theMS.membership,
                  userid: theMS.userid,
                  certts: theMS.certts,
                  signature: theMS.signature,
                });
                await targetPeer.postRenew(rawMS);
                logger.info("Success ms idty %s", theMS.userid);
              } catch (e) {
                logger.warn(e);
              }
            }
            await server.disconnect();
          } catch (e) {
            logger.error(e);
            throw Error("Exiting");
          }
        },
      },
    ],
  },
};

function extractHostPort(source: string) {
  const sp = source.split(":");
  const onHost = sp[0];
  const onPort = sp[1] ? sp[1] : "443"; // Defaults to 443
  return {
    host: onHost,
    port: onPort,
  };
}
