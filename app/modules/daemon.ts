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

import { ConfDTO } from "../lib/dto/ConfDTO";
import { Server } from "../../server";
import { ExitCodes } from "../lib/common-libs/exit-codes";

module.exports = {
  duniter: {
    cliOptions: [
      {
        value: "--loglevel <level>",
        desc:
          "Logs level, either [error,warning,info,debug,trace]. default to `info`.",
      },
      {
        value: "--sql-traces",
        desc:
          "Will log every SQL query that is executed. Requires --loglevel 'trace'.",
      },
    ],

    service: {
      process: (server: Server) => ServerService(server),
    },

    config: {
      /*****
       * Tries to load a specific parameter `conf.loglevel`
       */
      onLoading: async (conf: ConfDTO, program: any) => {
        conf.loglevel = program.loglevel || conf.loglevel || "info";
      },
    },

    cli: [
      {
        name: "status",
        desc: "Get Duniter daemon status.",
        logs: false,
        onConfiguredExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any
        ) => {
          await server.checkConfig();
          const pid = server.getDaemon().status();
          if (pid) {
            console.log("Duniter is running using PID %s.", pid);
            process.exit(ExitCodes.OK);
          } else {
            console.log("Duniter is not running.");
            process.exit(ExitCodes.DUNITER_NOT_RUNNING);
          }
        },
      },
      {
        name: "direct_start",
        desc: "Start Duniter node with direct output, non-daemonized.",
        onDatabaseExecute: async (
          server: Server,
          conf: ConfDTO,
          program: any,
          params: any,
          startServices: any
        ) => {
          process.title = program.mdb || "duniter_default";
          const logger = server.logger;

          logger.info(">> Server starting...");

          // Log NodeJS version
          logger.info("NodeJS version: " + process.version);

          await server.checkConfig();
          // Add signing & public key functions to PeeringService
          logger.info("Node version: " + server.version);
          logger.info("Node pubkey: " + server.conf.pair.pub);

          // Services
          await startServices();

          logger.info(">> Server ready!");

          return new Promise(() => null); // Never ending
        },
      },
    ],
  },
};

function ServerService(server: Server) {
  server.startService = () => Promise.resolve();
  server.stopService = () => Promise.resolve();
  return server;
}
