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

import { BlockGeneratorWhichProves } from "./blockGenerator";
import { ConfDTO } from "../../../lib/dto/ConfDTO";
import { BlockProver } from "./blockProver";
import { DBBlock } from "../../../lib/db/DBBlock";
import { dos2unix } from "../../../lib/common-libs/dos2unix";
import { parsers } from "../../../lib/common-libs/parsers/index";

import { Server } from "../../../../server";
import { Querable, querablep } from "../../../lib/common-libs/querable";
import { BlockDTO } from "../../../lib/dto/BlockDTO";

export class PermanentProver {
  logger: any;
  conf: ConfDTO;
  prover: BlockProver;
  generator: BlockGeneratorWhichProves;
  loops: number;

  private permanencePromise: Querable<void> | null = null;
  private blockchainChangedResolver: ((value: void) => void) | null = null;
  private promiseOfWaitingBetween2BlocksOfOurs: Promise<void> | null = null;
  private lastComputedBlock: BlockDTO | null = null;
  private resolveContinuePromise: ((value: boolean) => void) | null = null;
  private continuePromise: Promise<boolean> | null = null;

  constructor(private server: Server) {
    this.logger = server.logger;
    this.conf = server.conf;
    this.prover = new BlockProver(server);
    this.generator = new BlockGeneratorWhichProves(server, this.prover);

    // Promises triggering the prooving lopp
    this.resolveContinuePromise = null;
    this.continuePromise = new Promise<boolean>(
      (resolve) => (this.resolveContinuePromise = resolve)
    );

    this.loops = 0;
  }

  allowedToStart() {
    if (!this.permanencePromise || this.permanencePromise.isFulfilled()) {
      this.startPermanence();
    }
    this.resolveContinuePromise && this.resolveContinuePromise(true);
  }

  async startPermanence() {
    let permanenceResolve: (value: void) => void = () => {};
    this.permanencePromise = querablep(
      new Promise<void>((res) => {
        permanenceResolve = res;
      })
    );

    /******************
     * Main proof loop
     *****************/

    while (await this.continuePromise) {
      try {
        const waitingRaces = [];

        // By default, we do not make a new proof
        let doProof = false;

        try {
          const selfPubkey = this.server.keyPair.publicKey;
          const dal = this.server.dal;
          const theConf = this.server.conf;
          if (!selfPubkey) {
            throw "No self pubkey found.";
          }
          let current;
          const isMember = await dal.isMember(selfPubkey);
          if (!isMember) {
            throw "Local node is not a member. Waiting to be a member before computing a block.";
          }
          current = await dal.getCurrentBlockOrNull();
          if (!current) {
            throw "Waiting for a root block before computing new blocks";
          }
          const trial = await this.server
            .getBcContext()
            .getIssuerPersonalizedDifficulty(selfPubkey);
          this.checkTrialIsNotTooHigh(trial, current, selfPubkey);
          const lastIssuedByUs = current.issuer == selfPubkey;
          if (lastIssuedByUs && !this.promiseOfWaitingBetween2BlocksOfOurs) {
            this.promiseOfWaitingBetween2BlocksOfOurs = new Promise<void>(
              (resolve) => setTimeout(resolve, theConf.powDelay)
            );
            this.logger.warn(
              "Waiting " +
                theConf.powDelay +
                "ms before starting to compute next block..."
            );
          } else {
            // We have waited enough
            this.promiseOfWaitingBetween2BlocksOfOurs = null;
            // But under some conditions, we can make one
            doProof = true;
          }
        } catch (e) {
          this.logger.warn(e);
        }

        if (doProof) {
          /*******************
           * COMPUTING A BLOCK
           ******************/

          try {
            let cancelAlreadyTriggered = false;

            // The canceller
            setTimeout(async () => {
              // If the blockchain changes
              await new Promise<void>(
                (resolve) => (this.blockchainChangedResolver = resolve)
              );
              cancelAlreadyTriggered = true;
              // Then cancel the generation
              await this.prover.cancel();
            });

            let unsignedBlock = null,
              trial2 = 0;
            if (!cancelAlreadyTriggered) {
              // The pushFIFO is here to get the difficulty level while excluding any new block to be resolved.
              // Without it, a new block could be added meanwhile and would make the difficulty wrongly computed.
              await this.server.BlockchainService.pushFIFO(
                "generatingNextBlock",
                async () => {
                  const current = (await this.server.dal.getCurrentBlockOrNull()) as DBBlock;
                  const selfPubkey = this.server.keyPair.publicKey;
                  if (!cancelAlreadyTriggered) {
                    trial2 = await this.server
                      .getBcContext()
                      .getIssuerPersonalizedDifficulty(selfPubkey);
                  }
                  this.checkTrialIsNotTooHigh(trial2, current, selfPubkey);
                  if (!cancelAlreadyTriggered) {
                    unsignedBlock = await this.generator.nextBlock();
                  }
                }
              );
              if (!cancelAlreadyTriggered) {
                this.lastComputedBlock = await this.prover.prove(
                  unsignedBlock,
                  trial2,
                  null
                );
              }
              try {
                const obj =
                  this.lastComputedBlock &&
                  parsers.parseBlock.syncWrite(
                    dos2unix(this.lastComputedBlock.getRawSigned())
                  );
                await this.server.writeBlock(obj);
                await new Promise<void>((res) => {
                  this.server.once("bcEvent", () => res());
                });
              } catch (err) {
                this.logger.warn(
                  "Proof-of-work self-submission: %s",
                  err.message || err
                );
              }
            }
          } catch (e) {
            this.logger.warn(
              "The proof-of-work generation was canceled: %s",
              (e && e.message) ||
                (e && e.uerr && e.uerr.message) ||
                e ||
                "unkonwn reason"
            );
          }
        } else {
          /*******************
           * OR WAITING PHASE
           ******************/
          if (this.promiseOfWaitingBetween2BlocksOfOurs) {
            waitingRaces.push(this.promiseOfWaitingBetween2BlocksOfOurs);
          }

          let raceDone = false;

          await Promise.race(
            waitingRaces.concat([
              // The blockchain has changed! We or someone else found a proof, we must make a gnu one
              new Promise<void>(
                (resolve) =>
                  (this.blockchainChangedResolver = () => {
                    this.logger.warn("Blockchain changed!");
                    resolve();
                  })
              ),

              // Security: if nothing happens for a while, trigger the whole process again
              new Promise<void>((resolve) =>
                setTimeout(() => {
                  if (!raceDone) {
                    this.logger.warn(
                      "Security trigger: proof-of-work process seems stuck"
                    );
                    resolve();
                  }
                }, this.conf.powSecurityRetryDelay)
              ),
            ])
          );

          raceDone = true;
        }
      } catch (e) {
        this.logger.warn(e);
      }

      this.loops++;
      // Informative variable
      this.logger.trace("PoW loops = %s", this.loops);
    }

    permanenceResolve();
  }

  async blockchainChanged(gottenBlock?: any) {
    if (
      this.server &&
      (!gottenBlock ||
        !this.lastComputedBlock ||
        gottenBlock.hash !== this.lastComputedBlock.hash)
    ) {
      // Cancel any processing proof
      await this.prover.cancel();
      // If we were waiting, stop it and process the continuous generation
      this.blockchainChangedResolver && this.blockchainChangedResolver();
    }
  }

  async stopEverything() {
    // First: avoid continuing the main loop
    this.resolveContinuePromise && this.resolveContinuePromise(true);
    this.continuePromise = new Promise<boolean>(
      (resolve) => (this.resolveContinuePromise = resolve)
    );
    // Second: stop any started proof
    await this.prover.cancel();
    // If we were waiting, stop it and process the continuous generation
    this.blockchainChangedResolver && this.blockchainChangedResolver();
    const farm = await this.prover.getWorker();
    await farm.shutDownEngine();
  }

  private checkTrialIsNotTooHigh(
    trial: number,
    current: DBBlock,
    selfPubkey: string
  ) {
    if (trial > current.powMin + this.conf.powMaxHandicap) {
      this.logger.debug(
        "Trial = %s, powMin = %s, pubkey = %s",
        trial,
        current.powMin,
        selfPubkey.slice(0, 6)
      );
      throw "Too high difficulty: waiting for other members to write next block";
    }
  }
}
