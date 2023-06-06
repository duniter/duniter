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

import * as moment from "moment";
import { LOCAL_RULES_HELPERS } from "../../../lib/rules/local_rules";
import { hashf } from "../../../lib/common";
import { DBBlock } from "../../../lib/db/DBBlock";
import { ConfDTO } from "../../../lib/dto/ConfDTO";
import { ProverConstants } from "./constants";
import { Ed25519Signator, KeyPairBuilder } from "../../../../neon/lib";
import { dos2unix } from "../../../lib/common-libs/dos2unix";
import { rawer } from "../../../lib/common-libs/index";
import { ProcessCpuProfiler } from "../../../ProcessCpuProfiler";
import { PowDAL } from "../../../lib/dal/fileDALs/PowDAL";
import { Directory } from "../../../lib/system/directory";
import { ExitCodes } from "../../../lib/common-libs/exit-codes";

const querablep = require("querablep");

export function createPowWorker() {
  let powDAL: PowDAL | null = null;
  let computing = querablep(Promise.resolve(null));
  let askedStop = false;

  // By default, we do not prefix the PoW by any number
  let prefix = 0;

  let sigFuncSaved: (msg: string) => string;
  let lastSecret: any,
    lastVersion: number,
    currentCPU: number = 1;

  process.on("uncaughtException", (err: any) => {
    console.error(err.stack || Error(err));
    if (process.send) {
      process.send({ error: err });
    } else {
      throw Error("process.send() is not defined");
    }
  });

  process.on("unhandledRejection", () => {
    process.exit(ExitCodes.OK);
  });

  process.on("message", async (message: any) => {
    switch (message.command) {
      case "newPoW":
        (async () => {
          askedStop = true;

          // Very important: do not await if the computation is already done, to keep the lock on JS engine
          if (!computing.isFulfilled()) {
            await computing;
          }

          if (message.value.rootPath) {
            const params = await Directory.getHomeFS(
              false,
              message.value.rootPath,
              false
            );
            powDAL = new PowDAL(message.value.rootPath, params.fs);
          }

          const res = await beginNewProofOfWork(message.value);
          answer(message, res);
        })();
        break;

      case "cancel":
        if (!computing.isFulfilled()) {
          askedStop = true;
        }
        break;

      case "conf":
        if (message.value.cpu !== undefined) {
          currentCPU = message.value.cpu;
        }
        if (message.value.prefix !== undefined) {
          prefix = message.value.prefix;
        }
        answer(message, { currentCPU, prefix });
        break;
    }
  });

  function beginNewProofOfWork(stuff: any) {
    askedStop = false;
    computing = querablep(
      (async () => {
        /*****************
         * PREPARE POW STUFF
         ****************/

        let nonce = 0;
        const maxDuration = stuff.maxDuration || 1000;
        const conf = stuff.conf;
        const block = stuff.block;
        const nonceBeginning = stuff.nonceBeginning;
        const nbZeros = stuff.zeros;
        const pair = stuff.pair;
        const forcedTime = stuff.forcedTime;
        currentCPU = conf.cpu || ProverConstants.DEFAULT_CPU;
        prefix = parseInt(conf.prefix || prefix);
        if (prefix && prefix < ProverConstants.NONCE_RANGE) {
          prefix *= 100 * ProverConstants.NONCE_RANGE;
        }
        const highMark = stuff.highMark;

        // Define sigFunc
        const signator = KeyPairBuilder.fromSecretKey(pair.sec);
        let sigFunc = null;
        if (sigFuncSaved && lastSecret === pair.sec) {
          sigFunc = sigFuncSaved;
        } else {
          lastSecret = pair.sec;
          sigFunc = (msg: string) => signator.sign(msg);
        }

        /*****************
         * GO!
         ****************/

        let pow = "",
          sig = "",
          raw = "";
        let pausePeriod = 1;
        let testsCount = 0;
        let found = false;
        let turn = 0;
        const profiler = new ProcessCpuProfiler(100);
        let cpuUsage = profiler.cpuUsageOverLastMilliseconds(1);
        // We limit the number of tests according to CPU usage
        let testsPerRound = stuff.initialTestsPerRound || 1;
        let turnDuration = 20; // We initially goes quickly to the max speed = 50 reevaluations per second (1000 / 20)

        while (!found && !askedStop) {
          /*****************
           * A TURN ~ 100ms
           ****************/

          await Promise.race([
            // I. Stop the turn if it exceeds `turnDuration` ms
            countDown(turnDuration),

            // II. Process the turn's PoW
            (async () => {
              // Prove
              let i = 0;
              const thisTurn = turn;

              // Time is updated regularly during the proof
              block.time = getBlockTime(block, conf, forcedTime);
              if (block.number === 0) {
                block.medianTime = block.time;
              }
              block.inner_hash = getBlockInnerHash(block);

              /*****************
               * Iterations of a turn
               ****************/

              while (
                !found &&
                i < testsPerRound &&
                thisTurn === turn &&
                !askedStop
              ) {
                // Nonce change (what makes the PoW change if the time field remains the same)
                nonce++;

                /*****************
                 * A PROOF OF WORK
                 ****************/

                // The final nonce is composed of 3 parts
                block.nonce = prefix + nonceBeginning + nonce;
                raw = dos2unix(
                  "InnerHash: " +
                    block.inner_hash +
                    "\nNonce: " +
                    block.nonce +
                    "\n"
                );
                sig = dos2unix(sigFunc(raw));
                pow = hashf(
                  "InnerHash: " +
                    block.inner_hash +
                    "\nNonce: " +
                    block.nonce +
                    "\n" +
                    sig +
                    "\n"
                ).toUpperCase();

                /*****************
                 * Check the POW result
                 ****************/

                let j = 0,
                  charOK = true;
                while (j < nbZeros && charOK) {
                  charOK = pow[j] === "0";
                  j++;
                }
                if (charOK) {
                  found = !!pow[nbZeros].match(
                    new RegExp("[0-" + highMark + "]")
                  );
                }
                if (
                  !found &&
                  nbZeros > 0 &&
                  j - 1 >= ProverConstants.POW_MINIMAL_TO_SHOW
                ) {
                  pSend({ pow: { pow: pow, block: block, nbZeros: nbZeros } });
                }

                /*****************
                 * - Update local vars
                 * - Allow to receive stop signal
                 ****************/

                if (!found && !askedStop) {
                  i++;
                  testsCount++;
                  if (i % pausePeriod === 0) {
                    await countDown(1); // Very low pause, just the time to process eventual end of the turn
                  }
                }
              }

              /*****************
               * Check the POW result
               ****************/
              if (!found) {
                // CPU speed recording
                if (turn > 0) {
                  cpuUsage = profiler.cpuUsageOverLastMilliseconds(
                    turnDuration
                  );
                  if (
                    cpuUsage > currentCPU + 0.005 ||
                    cpuUsage < currentCPU - 0.005
                  ) {
                    let powVariationFactor;
                    // powVariationFactor = currentCPU / (cpuUsage || 0.01) / 5 // divide by 2 to avoid extreme responses
                    if (currentCPU > cpuUsage) {
                      powVariationFactor = 1.01;
                      testsPerRound = Math.max(
                        1,
                        Math.ceil(testsPerRound * powVariationFactor)
                      );
                    } else {
                      powVariationFactor = 0.99;
                      testsPerRound = Math.max(
                        1,
                        Math.floor(testsPerRound * powVariationFactor)
                      );
                    }
                    pausePeriod = Math.floor(
                      testsPerRound / ProverConstants.POW_NB_PAUSES_PER_ROUND
                    );
                  }
                }

                /*****************
                 * UNLOAD CPU CHARGE FOR THIS TURN
                 ****************/
                // We wait for a maximum time of `turnDuration`.
                // This will trigger the end of the turn by the concurrent race I. During that time, the proof.js script
                // just does nothing: this gives of a bit of breath to the CPU. Tthe amount of "breath" depends on the "cpu"
                // parameter.
                await countDown(turnDuration);
              }
            })(),
          ]);

          // console.log('W#%s.powDAL = ', process.pid, powDAL)

          if (powDAL && !conf.powNoSecurity) {
            const currentProofCheck = await powDAL.getCurrent();
            if (currentProofCheck !== null) {
              if (currentProofCheck === "") {
                askedStop = true;
              } else {
                const [currentNumber, currentHash] = currentProofCheck.split(
                  "-"
                );
                if (
                  block.number !== parseInt(currentNumber) + 1 ||
                  block.previousHash !== currentHash
                ) {
                  askedStop = true;
                }
              }
            }
          }

          // Next turn
          turn++;

          turnDuration += 1;
          turnDuration = Math.min(turnDuration, maxDuration); // Max 1 second per turn
        }

        /*****************
         * POW IS OVER
         * -----------
         *
         * We either have found a valid POW or a stop event has been detected.
         ****************/

        if (askedStop) {
          // PoW stopped
          askedStop = false;
          pSend({ canceled: true });
          return null;
        } else {
          // PoW success
          block.hash = pow;
          block.signature = sig;
          return {
            pow: {
              block: block,
              testsCount: testsCount,
              pow: pow,
            },
          };
        }
      })()
    );

    return computing;
  }

  function countDown(duration: number) {
    return new Promise((resolve) => setTimeout(resolve, duration));
  }

  function getBlockInnerHash(block: DBBlock) {
    const raw = rawer.getBlockInnerPart(block);
    return hashf(raw);
  }

  function getBlockTime(
    block: DBBlock,
    conf: ConfDTO,
    forcedTime: number | null
  ) {
    if (forcedTime) {
      return forcedTime;
    }
    const now = moment.utc().unix();
    const maxAcceleration = LOCAL_RULES_HELPERS.maxAcceleration(conf);
    const timeoffset =
      block.number >= conf.medianTimeBlocks ? 0 : conf.rootoffset || 0;
    const medianTime = block.medianTime;
    const upperBound =
      block.number === 0
        ? medianTime
        : Math.min(medianTime + maxAcceleration, now - timeoffset);
    return Math.max(medianTime, upperBound);
  }

  function answer(message: any, theAnswer: any) {
    return pSend({
      uuid: message.uuid,
      answer: theAnswer,
    });
  }

  function pSend(stuff: any) {
    return new Promise<void>(function (resolve, reject) {
      if (process.send) {
        process.send(stuff, function (error: any) {
          !error && resolve();
          error && reject();
        });
      } else {
        reject("process.send() is not defined");
      }
    });
  }
}
