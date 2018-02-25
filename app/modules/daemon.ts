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

import {ConfDTO} from "../lib/dto/ConfDTO"
import {Server} from "../../server"

"use strict";

const qfs       = require('q-io/fs');
const directory = require('../lib/system/directory');
const constants = require('../lib/constants');
const path      = require('path');
const Tail      = require("tail").Tail

module.exports = {
  duniter: {

    cliOptions: [
      { value: '--loglevel <level>', desc: 'Logs level, either [error,warning,info,debug,trace]. default to `info`.' }
    ],

    service: {
      process: (server:Server) => ServerService(server)
    },

    config: {

      /*****
       * Tries to load a specific parameter `conf.loglevel`
       */
      onLoading: async (conf:ConfDTO, program:any) => {
        conf.loglevel = program.loglevel || conf.loglevel || 'info'
      }
    },

    cli: [{

      name: 'start',
      desc: 'Starts Duniter as a daemon (background task).',
      logs: false,
      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        await server.checkConfig()
        const daemon = server.getDaemon('direct_start', 'start')
        await startDaemon(daemon)
      }
    }, {

      name: 'stop',
      desc: 'Stops Duniter daemon if it is running.',
      logs: false,
      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        const daemon = server.getDaemon()
        await stopDaemon(daemon)
      }
    }, {

      name: 'restart',
      desc: 'Stops Duniter daemon and restart it.',
      logs: false,
      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        await server.checkConfig()
        const daemon = server.getDaemon('direct_start', 'restart')
        await stopDaemon(daemon)
        await startDaemon(daemon)
      }
    }, {

      name: 'status',
      desc: 'Get Duniter daemon status.',
      logs: false,
      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        await server.checkConfig()
        const pid = server.getDaemon().status()
        if (pid) {
          console.log('Duniter is running using PID %s.', pid)
          process.exit(0)
        } else {
          console.log('Duniter is not running.')
          process.exit(2)
        }
      }
    }, {

      name: 'logs',
      desc: 'Follow duniter logs.',
      logs: false,
      onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
        printTailAndWatchFile(directory.INSTANCE_HOMELOG_FILE, constants.NB_INITIAL_LINES_TO_SHOW)
        // Never ending command
        return new Promise(res => null)
      }
    }, {

      name: 'direct_start',
      desc: 'Start Duniter node with direct output, non-daemonized.',
      onDatabaseExecute: async (server:Server, conf:ConfDTO, program:any, params:any, startServices:any) => {
        const logger = server.logger;

        logger.info(">> Server starting...");

        // Log NodeJS version
        logger.info('NodeJS version: ' + process.version);

        await server.checkConfig();
        // Add signing & public key functions to PeeringService
        logger.info('Node version: ' + server.version);
        logger.info('Node pubkey: ' + server.conf.pair.pub);

        // Services
        await startServices();

        logger.info('>> Server ready!');

        return new Promise(() => null); // Never ending
      }
    }]
  }
};

function ServerService(server:Server) {
  server.startService = () => Promise.resolve();
  server.stopService = () => Promise.resolve();
  return server;
}

function startDaemon(daemon:any) {
  return new Promise((resolve, reject) => daemon.start((err:any) => {
    if (err) return reject(err)
    resolve()
  }))
}

function stopDaemon(daemon:any) {
  return new Promise((resolve, reject) => daemon.stop((err:any) => {
    err && console.error(err);
    if (err) return reject(err)
    resolve()
  }))
}

async function printTailAndWatchFile(file:any, tailSize:number) {
    if (await qfs.exists(file)) {
      const content = await qfs.read(file)
      const lines = content.split('\n')
      const from = Math.max(0, lines.length - tailSize)
      const lastLines = lines.slice(from).join('\n')
      console.log(lastLines)
    }
    watchFile(file)
}

function watchFile(file:any) {
  const tail = new Tail(file);

  // Specific errors handling
  process.on('uncaughtException', (err:any) => {
    if (err.code === "ENOENT") {
      console.error('EXCEPTION: ', err.message);
      setTimeout(() => watchFile(file), 1000) // Wait a second
    }
  });

  // On new line
  tail.on("line", function(data:any) {
    console.log(data);
  });

  tail.on("error", function(error:any) {
    console.error('ERROR: ', error);
  });
}
