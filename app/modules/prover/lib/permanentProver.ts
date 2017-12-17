import {BlockGeneratorWhichProves} from "./blockGenerator"
import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {BlockProver} from "./blockProver"
import {DBBlock} from "../../../lib/db/DBBlock"
import {dos2unix} from "../../../lib/common-libs/dos2unix"
import {parsers} from "../../../lib/common-libs/parsers/index"

import {Server} from "../../../../server"

const querablep = require('querablep');

interface Querable<T> extends Promise<T> {
  isFulfilled(): boolean
  isResolved(): boolean
  isRejected(): boolean
}

export class PermanentProver {

  logger:any
  conf:ConfDTO
  prover:BlockProver
  generator:BlockGeneratorWhichProves
  loops:number

  private permanencePromise:Querable<any>|null = null

  private blockchainChangedResolver:any = null
  private promiseOfWaitingBetween2BlocksOfOurs:any = null
  private lastComputedBlock:any = null
  private resolveContinuePromise:any = null
  private continuePromise:any = null

  constructor(private server:Server) {
    this.logger = server.logger;
    this.conf = server.conf;
    this.prover = new BlockProver(server)
    this.generator = new BlockGeneratorWhichProves(server, this.prover)

    // Promises triggering the prooving lopp
    this.resolveContinuePromise = null;
    this.continuePromise = new Promise((resolve) => this.resolveContinuePromise = resolve);

    this.loops = 0;


  }

  allowedToStart() {
    if (!this.permanencePromise || this.permanencePromise.isFulfilled()) {
      this.startPermanence()
    }
    this.resolveContinuePromise(true);
  }

  async startPermanence() {

    let permanenceResolve = () => {}
    this.permanencePromise = querablep(new Promise(res => {
      permanenceResolve = res
    }))

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
            throw 'No self pubkey found.';
          }
          let current;
          const isMember = await dal.isMember(selfPubkey);
          if (!isMember) {
            throw 'Local node is not a member. Waiting to be a member before computing a block.';
          }
          current = await dal.getCurrentBlockOrNull();
          if (!current) {
            throw 'Waiting for a root block before computing new blocks';
          }
          const trial = await this.server.getBcContext().getIssuerPersonalizedDifficulty(selfPubkey);
          this.checkTrialIsNotTooHigh(trial, current, selfPubkey);
          const lastIssuedByUs = current.issuer == selfPubkey;
          if (lastIssuedByUs && !this.promiseOfWaitingBetween2BlocksOfOurs) {
            this.promiseOfWaitingBetween2BlocksOfOurs = new Promise((resolve) => setTimeout(resolve, theConf.powDelay));
            this.logger.warn('Waiting ' + theConf.powDelay + 'ms before starting to compute next block...');
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
            (async () => {
              // If the blockchain changes
              await new Promise((resolve) => this.blockchainChangedResolver = resolve);
              cancelAlreadyTriggered = true
              // Then cancel the generation
              await this.prover.cancel();
            })()

            let unsignedBlock = null, trial2 = 0
            if (!cancelAlreadyTriggered) {
              // The pushFIFO is here to get the difficulty level while excluding any new block to be resolved.
              // Without it, a new block could be added meanwhile and would make the difficulty wrongly computed.
              await this.server.BlockchainService.pushFIFO('generatingNextBlock', async () => {
                const current = await this.server.dal.getCurrentBlockOrNull();
                const selfPubkey = this.server.keyPair.publicKey;
                if (!cancelAlreadyTriggered) {
                  trial2 = await this.server.getBcContext().getIssuerPersonalizedDifficulty(selfPubkey)
                }
                this.checkTrialIsNotTooHigh(trial2, current, selfPubkey);
                if (!cancelAlreadyTriggered) {
                  unsignedBlock = await this.generator.nextBlock()
                }
              });
              if (!cancelAlreadyTriggered) {
                this.lastComputedBlock = await this.prover.prove(unsignedBlock, trial2, null)
              }
              try {
                const obj = parsers.parseBlock.syncWrite(dos2unix(this.lastComputedBlock.getRawSigned()));
                await this.server.writeBlock(obj)
                await new Promise(res => {
                  this.server.once('bcEvent', () => res())
                })
              } catch (err) {
                this.logger.warn('Proof-of-work self-submission: %s', err.message || err);
              }
            }
          } catch (e) {
            this.logger.warn('The proof-of-work generation was canceled: %s', (e && e.message) || (e && e.uerr && e.uerr.message) || e || 'unkonwn reason');
          }

        } else {

          /*******************
           * OR WAITING PHASE
           ******************/
          if (this.promiseOfWaitingBetween2BlocksOfOurs) {
            waitingRaces.push(this.promiseOfWaitingBetween2BlocksOfOurs);
          }

          let raceDone = false;

          await Promise.race(waitingRaces.concat([

            // The blockchain has changed! We or someone else found a proof, we must make a gnu one
            new Promise((resolve) => this.blockchainChangedResolver = () => {
              this.logger.warn('Blockchain changed!');
              resolve();
            }),

            // Security: if nothing happens for a while, trigger the whole process again
            new Promise((resolve) => setTimeout(() => {
              if (!raceDone) {
                this.logger.warn('Security trigger: proof-of-work process seems stuck');
                resolve();
              }
            }, this.conf.powSecurityRetryDelay))
          ]));

          raceDone = true;
        }
      } catch (e) {
        this.logger.warn(e);
      }

      this.loops++;
      // Informative variable
      this.logger.trace('PoW loops = %s', this.loops);
    }

    permanenceResolve()
  }

  async blockchainChanged(gottenBlock:any) {
    if (this.server && (!gottenBlock || !this.lastComputedBlock || gottenBlock.hash !== this.lastComputedBlock.hash)) {
      // Cancel any processing proof
      await this.prover.cancel()
      // If we were waiting, stop it and process the continuous generation
      this.blockchainChangedResolver && this.blockchainChangedResolver();
    }
  }

  async stopEveryting() {
    // First: avoid continuing the main loop
    this.resolveContinuePromise(true)
    this.continuePromise = new Promise((resolve) => this.resolveContinuePromise = resolve);
    // Second: stop any started proof
    await this.prover.cancel();
    // If we were waiting, stop it and process the continuous generation
    this.blockchainChangedResolver && this.blockchainChangedResolver();
    const farm = await this.prover.getWorker()
    await farm.shutDownEngine()
  }

  private checkTrialIsNotTooHigh(trial:number, current:DBBlock, selfPubkey:string) {
    if (trial > (current.powMin + this.conf.powMaxHandicap)) {
      this.logger.debug('Trial = %s, powMin = %s, pubkey = %s', trial, current.powMin, selfPubkey.slice(0, 6));
      throw 'Too high difficulty: waiting for other members to write next block';
    }
  }
}

