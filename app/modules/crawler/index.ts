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

import {ConfDTO} from "../../lib/dto/ConfDTO"
import {Server} from "../../../server"
import {Contacter} from "./lib/contacter"
import {Crawler} from "./lib/crawler"
import {Synchroniser} from "./lib/sync"
import {req2fwd} from "./lib/req2fwd"
import {rawer} from "../../lib/common-libs/index"
import {PeerDTO} from "../../lib/dto/PeerDTO"
import {Buid} from "../../lib/common-libs/buid"
import {BlockDTO} from "../../lib/dto/BlockDTO"
import {Directory} from "../../lib/system/directory"
import {FileDAL} from "../../lib/dal/fileDAL"
import {RemoteSynchronizer} from "./lib/sync/RemoteSynchronizer"
import {AbstractSynchronizer} from "./lib/sync/AbstractSynchronizer"
import {LocalPathSynchronizer} from "./lib/sync/LocalPathSynchronizer"

export const CrawlerDependency = {
  duniter: {

    service: {
      process: (server:Server, conf:ConfDTO, logger:any) => new Crawler(server, conf, logger)
    },

    methods: {

      contacter: (host:string, port:number, opts?:any) => new Contacter(host, port, opts),

      pullBlocks: async (server:Server, pubkey = "") => {
        const crawler = new Crawler(server, server.conf, server.logger);
        return crawler.pullBlocks(server, pubkey);
      },

      pullSandbox: async (server:Server) => {
        const crawler = new Crawler(server, server.conf, server.logger);
        return crawler.sandboxPull(server)
      },

      synchronize: (server:Server, onHost:string, onPort:number, upTo:number, chunkLength:number) => {
        const strategy = new RemoteSynchronizer(onHost, onPort, server)
        const remote = new Synchroniser(server, strategy)
        const syncPromise = (async () => {
          await server.dal.disableChangesAPI()
          await remote.sync(upTo, chunkLength)
          await server.dal.enableChangesAPI()
        })()
        return {
          flow: remote,
          syncPromise
        };
      },

      /**
       * Used by duniter-ui
       * @param {Server} server
       * @param {string} onHost
       * @param {number} onPort
       * @returns {Promise<any>}
       */
      testForSync: (server:Server, onHost:string, onPort:number) => {
        return RemoteSynchronizer.test(onHost, onPort)
      }
    },

    cliOptions: [
      { value: '--nointeractive', desc: 'Disable interactive sync UI.'},
      { value: '--nocautious',    desc: 'Do not check blocks validity during sync.'},
      { value: '--cautious',      desc: 'Check blocks validity during sync (overrides --nocautious option).'},
      { value: '--nopeers',       desc: 'Do not retrieve peers during sync.'},
      { value: '--nosources',     desc: 'Do not parse sources (UD, TX) during sync (debug purposes).'},
      { value: '--nosbx',         desc: 'Do not retrieve sandboxes during sync.'},
      { value: '--onlypeers',     desc: 'Will only try to sync peers.'},
      { value: '--slow',          desc: 'Download slowly the blokchcain (for low connnections).'},
      { value: '--readfilesystem',desc: 'Also read the filesystem to speed up block downloading.'},
      { value: '--minsig <minsig>', desc: 'Minimum pending signatures count for `crawl-lookup`. Default is 5.'}
    ],

    cli: [{
      name: 'sync [source] [to]',
      desc: 'Synchronize blockchain from a remote Duniter node',
      preventIfRunning: true,
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any): Promise<any> => {
        const source = params[0]
        const to     = params[1]
        const HOST_PATTERN = /^[^:/]+(:[0-9]{1,5})?$/
        const FILE_PATTERN = /^(\/.+)$/
        if (!source || !(source.match(HOST_PATTERN) || source.match(FILE_PATTERN))) {
          throw 'Source of sync is required. (either a host:port or a file path)'
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

        let otherDAL = undefined
        if (program.readfilesystem) {
          const dbName = program.mdb;
          const dbHome = program.home;
          const home = Directory.getHome(dbName, dbHome);
          const params = await Directory.getHomeParams(false, home)
          otherDAL = new FileDAL(params)
        }

        let strategy: AbstractSynchronizer
        if (source.match(HOST_PATTERN)) {
          const sp = source.split(':')
          const onHost = sp[0]
          const onPort = parseInt(sp[1] ? sp[1] : '443') // Defaults to 443
          strategy = new RemoteSynchronizer(onHost, onPort, server, noShufflePeers === true, otherDAL)
        } else {
          strategy = new LocalPathSynchronizer(source, server)
        }
        if (program.onlypeers === true) {
          return strategy.syncPeers(true)
        } else {
          const remote = new Synchroniser(server, strategy, interactive === true)
          return remote.sync(upTo, chunkLength, askedCautious)
        }
      }
    }, {
      name: 'peer [host] [port]',
      desc: 'Exchange peerings with another node',
      preventIfRunning: true,
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const host = params[0];
        const port = params[1];
        const logger = server.logger;
        try {
          const ERASE_IF_ALREADY_RECORDED = true;
          logger.info('Fetching peering record at %s:%s...', host, port);
          let peering = await Contacter.fetchPeer(host, port);
          logger.info('Apply peering ...');
          await server.PeeringService.submitP(peering, ERASE_IF_ALREADY_RECORDED, !program.nocautious, true);
          logger.info('Applied');
          let selfPeer = await server.dal.getPeer(server.PeeringService.pubkey);
          if (!selfPeer) {
            await server.PeeringService.generateSelfPeer(server.conf)
            selfPeer = await server.dal.getPeer(server.PeeringService.pubkey);
          }
          logger.info('Send self peering ...');
          const p = PeerDTO.fromJSONObject(peering)
          const contact = new Contacter(p.getHostPreferDNS(), p.getPort(), {})
          await contact.postPeer(PeerDTO.fromJSONObject(selfPeer))
          logger.info('Sent.');
          await server.disconnect();
        } catch(e) {
          logger.error(e.code || e.message || e);
          throw Error("Exiting");
        }
      }
    }, {
      name: 'import <fromHost> <fromPort> <search> <toHost> <toPort>',
      desc: 'Import all pending data from matching <search>',
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const fromHost = params[0];
        const fromPort = params[1];
        const search = params[2];
        const toHost = params[3];
        const toPort = params[4];
        const logger = server.logger;
        try {
          const peers = fromHost && fromPort ? [{ endpoints: [['BASIC_MERKLED_API', fromHost, fromPort].join(' ')] }] : await server.dal.peerDAL.withUPStatus()
          // Memberships
          for (const p of peers) {
            const peer = PeerDTO.fromJSONObject(p)
            const fromHost = peer.getHostPreferDNS();
            const fromPort = peer.getPort();
            logger.info('Looking at %s:%s...', fromHost, fromPort);
            try {
              const node = new Contacter(fromHost, fromPort, { timeout: 10000 });
              const requirements = await node.getRequirements(search);
              await req2fwd(requirements, toHost, toPort, logger)
            } catch (e) {
              logger.error(e);
            }
          }
          await server.disconnect();
        } catch(e) {
          logger.error(e);
          throw Error("Exiting");
        }
      }
    }, {
      name: 'forward <number> <fromHost> <fromPort> <toHost> <toPort>',
      desc: 'Forward existing block <number> from a host to another',
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const number = params[0];
        const fromHost = params[1];
        const fromPort = params[2];
        const toHost = params[3];
        const toPort = params[4];
        const logger = server.logger;
        try {
          logger.info('Looking at %s:%s...', fromHost, fromPort)
          try {
            const source = new Contacter(fromHost, fromPort, { timeout: 10000 })
            const target = new Contacter(toHost, toPort, { timeout: 10000 })
            const block = await source.getBlock(number)
            const raw = BlockDTO.fromJSONObject(block).getRawSigned()
            await target.postBlock(raw)
          } catch (e) {
            logger.error(e);
          }
          await server.disconnect();
        } catch(e) {
          logger.error(e);
          throw Error("Exiting");
        }
      }
    }, {
      name: 'import-lookup [search] [fromhost] [fromport] [tohost] [toport]',
      desc: 'Exchange peerings with another node',
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const search = params[0];
        const fromhost = params[1];
        const fromport = params[2];
        const tohost = params[3];
        const toport = params[4];
        const logger = server.logger;
        try {
          logger.info('Looking for "%s" at %s:%s...', search, fromhost, fromport);
          const sourcePeer = new Contacter(fromhost, fromport);
          const targetPeer = new Contacter(tohost, toport);
          const lookup = await sourcePeer.getLookup(search);
          for (const res of lookup.results) {
            for (const uid of res.uids) {
              const rawIdty = rawer.getOfficialIdentity({
                currency: 'g1',
                issuer: res.pubkey,
                uid: uid.uid,
                buid: uid.meta.timestamp,
                sig: uid.self
              });
              logger.info('Success idty %s', uid.uid);
              try {
                await targetPeer.postIdentity(rawIdty);
              } catch (e) {
                logger.error(e);
              }
              for (const received of uid.others) {
                const rawCert = rawer.getOfficialCertification({
                  currency: 'g1',
                  issuer: received.pubkey,
                  idty_issuer: res.pubkey,
                  idty_uid: uid.uid,
                  idty_buid: uid.meta.timestamp,
                  idty_sig: uid.self,
                  buid: Buid.format.buid(received.meta.block_number, received.meta.block_hash),
                  sig: received.signature
                });
                try {
                  logger.info('Success cert %s -> %s', received.pubkey.slice(0, 8), uid.uid);
                  await targetPeer.postCert(rawCert);
                } catch (e) {
                  logger.error(e);
                }
              }
            }
          }
          const certBy = await sourcePeer.getCertifiedBy(search)
          const mapBlocks:any = {}
          for (const signed of certBy.certifications) {
            if (signed.written) {
              logger.info('Already written cert %s -> %s', certBy.pubkey.slice(0, 8), signed.uid)
            } else {
              const lookupIdty = await sourcePeer.getLookup(signed.pubkey);
              let idty = null
              for (const result of lookupIdty.results) {
                for (const uid of result.uids) {
                  if (uid.uid === signed.uid && result.pubkey === signed.pubkey && uid.meta.timestamp === signed.sigDate) {
                    idty = uid
                  }
                }
              }
              let block = mapBlocks[signed.cert_time.block]
              if (!block) {
                block = await sourcePeer.getBlock(signed.cert_time.block)
                mapBlocks[block.number] = block
              }
              const rawCert = rawer.getOfficialCertification({
                currency: 'g1',
                issuer: certBy.pubkey,
                idty_issuer: signed.pubkey,
                idty_uid: signed.uid,
                idty_buid: idty.meta.timestamp,
                idty_sig: idty.self,
                buid: Buid.format.buid(block.number, block.hash),
                sig: signed.signature
              });
              try {
                logger.info('Success cert %s -> %s', certBy.pubkey.slice(0, 8), signed.uid);
                await targetPeer.postCert(rawCert);
              } catch (e) {
                logger.error(e);
              }
            }
          }
          logger.info('Sent.');
          await server.disconnect();
        } catch(e) {
          logger.error(e);
          throw Error("Exiting");
        }
      }
    }, {
      name: 'crawl-lookup <toHost> <toPort> [<fromHost> [<fromPort>]]',
      desc: 'Make a full network scan and rebroadcast every WoT pending document (identity, certification, membership)',
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const toHost = params[0]
        const toPort = params[1]
        const fromHost = params[2]
        const fromPort = params[3]
        const logger = server.logger;
        try {
          const peers = fromHost && fromPort ? [{ endpoints: [['BASIC_MERKLED_API', fromHost, fromPort].join(' ')] }] : await server.dal.peerDAL.withUPStatus()
          // Memberships
          for (const p of peers) {
            const peer = PeerDTO.fromJSONObject(p)
            const fromHost = peer.getHostPreferDNS();
            const fromPort = peer.getPort();
            logger.info('Looking at %s:%s...', fromHost, fromPort);
            try {
              const node = new Contacter(fromHost, fromPort, { timeout: 10000 });
              const requirements = await node.getRequirementsPending(program.minsig || 5);
              await req2fwd(requirements, toHost, toPort, logger)
            } catch (e) {
              logger.error(e);
            }
          }
          await server.disconnect();
        } catch(e) {
          logger.error(e);
          throw Error("Exiting");
        }
      }
    }, {
      name: 'fwd-pending-ms',
      desc: 'Forwards all the local pending memberships to target node',
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const logger = server.logger;
        try {
          const pendingMSS = await server.dal.msDAL.getPendingIN()
          const targetPeer = new Contacter('g1.cgeek.fr', 80, { timeout: 5000 });
          // Membership
          let rawMS
          for (const theMS of pendingMSS) {
            console.log('New membership pending for %s', theMS.userid);
            try {
              rawMS = rawer.getMembership({
                currency: 'g1',
                issuer: theMS.issuer,
                block: theMS.block,
                membership: theMS.membership,
                userid: theMS.userid,
                certts: theMS.certts,
                signature: theMS.signature
              });
              await targetPeer.postRenew(rawMS);
              logger.info('Success ms idty %s', theMS.userid);
            } catch (e) {
              logger.warn(e);
            }
          }
          await server.disconnect();
        } catch(e) {
          logger.error(e);
          throw Error("Exiting");
        }
      }
    }]
  }
}
