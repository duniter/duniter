import {BlockGeneratorWhichProves} from "./blockGenerator"
import {ConfDTO} from "../../../lib/dto/ConfDTO"
import {BlockProver} from "./blockProver"
import {Constants} from "./constants"
import {DBBlock} from "../../../lib/db/DBBlock"
import {dos2unix} from "../../../lib/common-libs/dos2unix"
import {parsers} from "../../../lib/common-libs/parsers/index"

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
  private pullingResolveCallback:any = null
  private timeoutPullingCallback:any = null
  private pullingFinishedPromise:Querable<any>|null = null
  private timeoutPulling:any = null

  constructor(private server:any) {
    this.logger = server.logger;
    this.conf = server.conf;
    this.prover = new BlockProver(server)
    this.generator = new BlockGeneratorWhichProves(server, this.prover)

    // Promises triggering the prooving lopp
    this.resolveContinuePromise = null;
    this.continuePromise = new Promise((resolve) => this.resolveContinuePromise = resolve);
    this.pullingResolveCallback = null
    this.timeoutPullingCallback = null
    this.pullingFinishedPromise = querablep(Promise.resolve());

    this.loops = 0;


  }

  allowedToStart() {
    if (!this.permanencePromise || !this.permanencePromise.isFulfilled()) {
      this.startPermanence()
    }
    this.resolveContinuePromise(true);
  }

  // When we detected a pulling, we stop the PoW loop
  pullingDetected() {
    if (this.pullingFinishedPromise && this.pullingFinishedPromise.isResolved()) {
      this.pullingFinishedPromise = querablep(Promise.race([
        // We wait for end of pulling signal
        new Promise((res) => this.pullingResolveCallback = res),
        // Security: if the end of pulling signal is not emitted after some, we automatically trigger it
        new Promise((res) => this.timeoutPullingCallback = () => {
          this.logger.warn('Pulling not finished after %s ms, continue PoW', Constants.PULLING_MAX_DURATION);
          res();
        })
      ]));
    }
    // Delay the triggering of pulling timeout
    if (this.timeoutPulling) {
      clearTimeout(this.timeoutPulling);
    }
    this.timeoutPulling = setTimeout(this.timeoutPullingCallback, Constants.PULLING_MAX_DURATION);
  }

  pullingFinished() {
    return this.pullingResolveCallback && this.pullingResolveCallback()
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
          if (this.pullingFinishedPromise && !this.pullingFinishedPromise.isFulfilled()) {
            this.logger.warn('Waiting for the end of pulling...');
            await this.pullingFinishedPromise;
            this.logger.warn('Pulling done. Continue proof-of-work loop.');
          }
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
          await Promise.race([

            // We still listen at eventual blockchain change
            (async () => {
              // If the blockchain changes
              await new Promise((resolve) => this.blockchainChangedResolver = resolve);
              // Then cancel the generation
              await this.prover.cancel();
            })(),

            // The generation
            (async () => {
              try {
                const current = await this.server.dal.getCurrentBlockOrNull();
                const selfPubkey = this.server.keyPair.publicKey;
                const trial2 = await this.server.getBcContext().getIssuerPersonalizedDifficulty(selfPubkey);
                this.checkTrialIsNotTooHigh(trial2, current, selfPubkey);
                this.lastComputedBlock = await this.generator.makeNextBlock(null, trial2);
                try {
                  const obj = parsers.parseBlock.syncWrite(dos2unix(this.lastComputedBlock.getRawSigned()));
                  await this.server.writeBlock(obj)
                  await new Promise(res => {
                    this.server.once('bcEvent', () => res())
                  })
                } catch (err) {
                  this.logger.warn('Proof-of-work self-submission: %s', err.message || err);
                }
              } catch (e) {
                this.logger.warn('The proof-of-work generation was canceled: %s', (e && e.message) || e || 'unkonwn reason');
              }
            })()
          ])
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
    this.continuePromise = new Promise((resolve) => this.resolveContinuePromise = resolve);
    // Second: stop any started proof
    await this.prover.cancel();
    // If we were waiting, stop it and process the continuous generation
    this.blockchainChangedResolver && this.blockchainChangedResolver();
  }

  private checkTrialIsNotTooHigh(trial:number, current:DBBlock, selfPubkey:string) {
    if (trial > (current.powMin + this.conf.powMaxHandicap)) {
      this.logger.debug('Trial = %s, powMin = %s, pubkey = %s', trial, current.powMin, selfPubkey.slice(0, 6));
      throw 'Too high difficulty: waiting for other members to write next block';
    }
  }
}

