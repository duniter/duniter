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

import * as stream from "stream"
import {parsers} from "../../../app/lib/common-libs/parsers/index"
import {Server} from "../../../server"
import {ConfDTO} from "../../../app/lib/dto/ConfDTO"
import {KeypairDependency} from "../../../app/modules/keypair/index"
import {BmaDependency} from "../../../app/modules/bma/index"
import {Statics} from "../../../index"

const should  = require('should');
const util    = require('util');
const path    = require('path');
const querablep = require('querablep');

describe("v1.0 Module API", () => {

  it('should be able to execute `hello` command with quickRun', async () => {
    Statics.setOnRunDone(() => { /* Do not exit the process */ })
    const absolutePath = path.join(__dirname, '../scenarios/hello-plugin.js')
    process.argv = ['', absolutePath, 'hello-world', '--memory']
    const res = await Statics.quickRun(absolutePath)
    res.should.equal('Hello world! from within Duniter.')
  })

  it('should be able to execute `hello` command', async () => {

    const sStack = Statics.simpleStack();
    const aStack = Statics.autoStack();

    const helloDependency = {
      duniter: {
        cliOptions: [
          { value: '--opt1', desc: 'The option 1. Enabled or not' },
          { value: '--option2 <value>', desc: 'The option 2. Requires an argument, parsed as integer.', parser: parseInt }
        ],
        cli: [{
          name: 'hello',
          desc: 'Returns an "Hello, world" string after configuration phase.',
          onConfiguredExecute: async (server:Server, conf:ConfDTO, program:any, params:any) => {
            return "Hello, " + params[0] + ". You successfully sent arg '" + params[1] + "' along with opt1 = " + program.opt1 + " and option2 = " + program.option2 + ".";
          }
        }]
      }
    };

    sStack.registerDependency(helloDependency, 'duniter-hello');
    sStack.registerDependency(helloDependency, 'duniter-hello'); // Try to load it 2 times, should not throw an error
    sStack.registerDependency(KeypairDependency, 'duniter-keypair');
    aStack.registerDependency(helloDependency, 'duniter-hello');

    (await sStack.executeStack(['node', 'index.js', '--memory', 'hello', 'World', 'TEST', '--opt1', '--option2', '5'])).should.equal('Hello, World. You successfully sent arg \'TEST\' along with opt1 = true and option2 = 5.');
    (await aStack.executeStack(['node', 'index.js', '--memory', 'hello', 'Zorld', 'ESSE', '--option2', 'd'])).should.equal('Hello, Zorld. You successfully sent arg \'ESSE\' along with opt1 = undefined and option2 = NaN.');
  })

  /***********************
   * CONFIGURATION HOOKS
   **********************/

  describe("Configuration hooks", () => {

    let stack:any
    function run(...args:string[]) {
      return stack.executeStack(['node', 'index.js', '--mdb', 'modules_api_tests'].concat(args));
    }

    before(async () => {

      stack = Statics.simpleStack();
      const configurationDependency = {
        duniter: {
          cliOptions: [
            { value: '--supersalt <salt>', desc: 'A crypto salt.' },
            { value: '--superpasswd <passwd>', desc: 'A crypto password.' }
          ],
          config: {
            onLoading: async (conf:any, program:any) => {

              // Always adds a parameter named "superkey"
              conf.superkey = { pub: 'publicPart', sec: 'secretPart' };
              // Eventually adds a supersalt if given as option
              if (program.supersalt) {
                conf.supersalt = program.supersalt;
              }
              // Eventually adds a superpasswd if given as option
              if (program.superpasswd) {
                conf.superpasswd = program.superpasswd;
              }
            },
            beforeSave: async (conf:any) => {
              // We never want to store "superpasswd"
              delete conf.superpasswd;
            }
          }
        }
      };
      const returnConfDependency = {
        duniter: {
          cli: [{
            name: 'gimme-conf',
            desc: 'Returns the configuration object.',
            onConfiguredExecute: async (server:Server, conf:any) => {
              // Gimme the conf!
              return conf;
            }
          }]
        }
      };

      stack.registerDependency(KeypairDependency, 'duniter-keypair');
      stack.registerDependency(configurationDependency, 'duniter-configuration');
      stack.registerDependency(returnConfDependency, 'duniter-gimme-conf');
    })

    it('verify that we get the CLI options', async () => {
      const conf = await run('gimme-conf', '--supersalt', 'NaCl');
      conf.should.have.property('supersalt').equal('NaCl');
    })

    it('verify that we get the saved options', async () => {
      let conf;

      // We make an initial reset
      await run('reset', 'config');
      conf = await run('gimme-conf');
      conf.should.have.property('superkey'); // Always loaded
      conf.should.not.have.property('supersalt');

      // Nothing should have changed
      conf = await run('gimme-conf');
      conf.should.have.property('superkey'); // Always loaded
      conf.should.not.have.property('supersalt');

      // Now we try to save the parameters
      await run('config', '--supersalt', 'NaCl2', '--superpasswd', 'megapasswd');
      conf = await run('gimme-conf');
      conf.should.have.property('superkey'); // Always loaded
      conf.should.have.property('supersalt').equal('NaCl2');
      conf.should.not.have.property('superpasswd');

      // Yet we can have all options by giving them explicitely using options
      conf = await run('gimme-conf', '--superpasswd', 'megapasswd2');
      conf.should.have.property('superkey');
      conf.should.have.property('supersalt').equal('NaCl2');
      conf.should.have.property('superpasswd').equal('megapasswd2');
    })
  })

  /***********************
   *  SERVICE START/STOP
   **********************/

  describe("Service triggers", () => {

    let stack:any
    let fakeI:FakeStream
    let fakeP:FakeStream
    let fakeO:FakeStream

    function run(...args:string[]) {
      return stack.executeStack(['node', 'index.js', '--memory', '--ws2p-noupnp'].concat(args));
    }

    before(async () => {

      stack = Statics.simpleStack();
      fakeI = new FakeStream((that:any, data:any) => {
        // Note: we never pass here
        if (typeof data == "string") {
          that.push(data);
        }
      });
      fakeP = new FakeStream((that:any, data:any) => {
        if (typeof data == "object" && data.type == "transaction") {
          const tx = parsers.parseTransaction.syncWrite(data.doc);
          that.push(tx);
        }
      });
      fakeO = new FakeStream((that:any, data:any, enc:any, done:any) => {
        if (data.issuers) {
          that.resolveData();
        }
        done && done();
      });
      // Fake output has a special promise of data receival, for our tests
      fakeO.outputed = querablep(new Promise((res) => fakeO.resolveData = res));
      const dummyStartServiceDependency = {
        duniter: {
          cli: [{
            name: 'hello-service',
            desc: 'Says hello to the world, at service phase. And feed INPUT with a transaction.',
            onDatabaseExecute: async (duniterServer:Server, conf:any, program:any, programArgs:any, startServices:any) => {
              await startServices();
              fakeI.push("Version: 10\n" +
                "Type: Transaction\n" +
                "Currency: test_net\n" +
                "Blockstamp: 3-2A27BD040B16B7AF59DDD88890E616987F4DD28AA47B9ABDBBEE46257B88E945\n" +
                "Locktime: 0\n" +
                "Issuers:\n" +
                "HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk\n" +
                "Inputs:\n" +
                "100000:0:D:HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk:3428\n" +
                "Unlocks:\n" +
                "0:SIG(0)\n" +
                "Outputs:\n" +
                "1000:0:SIG(yGKRRB18B4eaZQdksWBZubea4VJKFSSpii2okemP7x1)\n" +
                "99000:0:SIG(HnFcSms8jzwngtVomTTnzudZx7SHUQY8sVE1y8yBmULk)\n" +
                "Comment: reessai\n" +
                "P6MxJ/2SdkvNDyIyWuOkTz3MUwsgsfo70j+rpWeQWcm6GdvKQsbplB8482Ar1HMz2q0h5V3tfMqjCuAeWVQ+Ag==\n");
              await fakeO.outputed;
              return fakeO.outputed;
            }
          }],
          service: {
            input: () => fakeI,
            process: () => fakeP,
            output: () => fakeO
          }
        }
      };
      const dummyStopServiceDependency = {
        duniter: {
          cli: [{
            name: 'bye-service',
            desc: 'Says goodbye to the world, at service phase.',
            onDatabaseExecute: async (duniterServer:any, conf:any, program:any, programArgs:any, startServices:any, stopServices:any) => {
              await stopServices();
              return Promise.resolve();
            }
          }],
          service: {
            input: () => fakeI,
            process: () => fakeP,
            output: () => fakeO
          }
        }
      };

      stack.registerDependency(KeypairDependency, 'duniter-keypair');
      stack.registerDependency(BmaDependency, 'duniter-bma');
      stack.registerDependency(dummyStartServiceDependency, 'duniter-dummy-start');
      stack.registerDependency(dummyStopServiceDependency, 'duniter-dummy-stop');
    })

    it('verify that services are started', async () => {
      fakeI.started.isResolved().should.equal(false);
      fakeP.started.isResolved().should.equal(false);
      fakeO.started.isResolved().should.equal(false);
      fakeI.stopped.isResolved().should.equal(false);
      fakeP.stopped.isResolved().should.equal(false);
      fakeO.stopped.isResolved().should.equal(false);
      await run('hello-service');
      fakeO.outputed.isResolved().should.equal(true); // The transaction has successfully gone through the whole stream
      fakeI.started.isResolved().should.equal(true);
      fakeP.started.isResolved().should.equal(true);
      fakeO.started.isResolved().should.equal(true);
      fakeI.stopped.isResolved().should.equal(false);
      fakeP.stopped.isResolved().should.equal(false);
      fakeO.stopped.isResolved().should.equal(false);
    })

    it('verify that services are stopped', async () => {
      fakeI.stopped.isResolved().should.equal(false);
      fakeP.stopped.isResolved().should.equal(false);
      fakeO.stopped.isResolved().should.equal(false);
      fakeI.started.isResolved().should.equal(true);
      fakeP.started.isResolved().should.equal(true);
      fakeO.started.isResolved().should.equal(true);
      await run('bye-service');
      fakeI.started.isResolved().should.equal(false);
      fakeP.started.isResolved().should.equal(false);
      fakeO.started.isResolved().should.equal(false);
      fakeI.stopped.isResolved().should.equal(true);
      fakeP.stopped.isResolved().should.equal(true);
      fakeO.stopped.isResolved().should.equal(true);
    })
  })

})


class FakeStream extends stream.Transform {

  private resolveStart:any = () => null;
  private resolveStop:any  = () => null;
  public resolveData:any
  public started:any
  public stopped:any
  public outputed:any

  constructor(private onWrite:any) {
    super({ objectMode: true })

    this.started = querablep(new Promise(res => this.resolveStart = res));
    this.stopped = querablep(new Promise(res => this.resolveStop  = res));
  }

  _write(obj:any, enc:any, done:any) {
    this.onWrite(this, obj, enc, done)
  }

  async startService() {
    this.resolveStart();
    this.stopped = querablep(new Promise(res => this.resolveStop = res));
  }

  async stopService() {
    this.resolveStop();
    this.started = querablep(new Promise(res => this.resolveStart = res));
  }
}

util.inherits(FakeStream, stream.Transform);
