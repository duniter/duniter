"use strict";

const co      = require('co');
const _       = require('underscore');
const should  = require('should');
const util    = require('util');
const stream  = require('stream');
const duniter = require('../../index');
const parsers = require('../../app/lib/streams/parsers/index');
const querablep = require('../../app/lib/querablep');

describe("v1.0 Module API", () => {

  it('should be able to execute `hello` command', () => co(function*() {

    const sStack = duniter.statics.simpleStack();
    const aStack = duniter.statics.autoStack();

    const helloDependency = {
      duniter: {
        cliOptions: [
          { value: '--opt1', desc: 'The option 1. Enabled or not' },
          { value: '--option2 <value>', desc: 'The option 2. Requires an argument, parsed as integer.', parser: parseInt }
        ],
        cli: [{
          name: 'hello',
          desc: 'Returns an "Hello, world" string after configuration phase.',
          onConfiguredExecute: (server, conf, program, params) => co(function*(){
            return "Hello, " + params[0] + ". You successfully sent arg '" + params[1] + "' along with opt1 = " + program.opt1 + " and option2 = " + program.option2 + ".";
          })
        }]
      }
    };

    sStack.registerDependency(helloDependency);
    aStack.registerDependency(helloDependency);

    (yield sStack.executeStack(['node', 'index.js', 'hello', 'World', 'TEST', '--opt1', '--option2', '5'])).should.equal('Hello, World. You successfully sent arg \'TEST\' along with opt1 = true and option2 = 5.');
    (yield aStack.executeStack(['node', 'index.js', 'hello', 'Zorld', 'ESSE', '--option2', 'd'])).should.equal('Hello, Zorld. You successfully sent arg \'ESSE\' along with opt1 = undefined and option2 = NaN.');
  }));

  /***********************
   * CONFIGURATION HOOKS
   **********************/

  describe("Configuration hooks", () => {

    let stack;
    const run = (...args) => stack.executeStack(['node', 'index.js', '--mdb', 'modules_api_tests'].concat(args));

    before(() => co(function*() {

      stack = duniter.statics.simpleStack();
      const configurationDependency = {
        duniter: {
          cliOptions: [
            { value: '--supersalt <salt>', desc: 'A crypto salt.' },
            { value: '--superpasswd <passwd>', desc: 'A crypto password.' }
          ],
          config: {
            onLoading: (conf, program) => co(function*(){

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
            }),
            beforeSave: (conf, program) => co(function*(){

              // We never want to store "superpasswd"
              delete conf.superpasswd;
            })
          }
        }
      };
      const returnConfDependency = {
        duniter: {
          cli: [{
            name: 'gimme-conf',
            desc: 'Returns the configuration object.',
            onPluggedDALExecute: (server, conf, program, params, startServices, stopServices) => co(function*() {
              // Gimme the conf!
              return conf;
            })
          }],
        }
      };

      stack.registerDependency(configurationDependency);
      stack.registerDependency(returnConfDependency);
    }));

    it('verify that we get the CLI options', () => co(function*() {
      const conf = yield run('gimme-conf', '--supersalt', 'NaCl');
      conf.should.have.property('supersalt').equal('NaCl');
    }));

    it('verify that we get the saved options', () => co(function*() {
      let conf;

      // We make an initial reset
      yield run('reset', 'config');
      conf = yield run('gimme-conf');
      conf.should.have.property('superkey'); // Always loaded
      conf.should.not.have.property('supersalt');

      // Nothing should have changed
      conf = yield run('gimme-conf');
      conf.should.have.property('superkey'); // Always loaded
      conf.should.not.have.property('supersalt');

      // Now we try to save the parameters
      yield run('config', '--supersalt', 'NaCl2', '--superpasswd', 'megapasswd');
      conf = yield run('gimme-conf');
      conf.should.have.property('superkey'); // Always loaded
      conf.should.have.property('supersalt').equal('NaCl2');
      conf.should.not.have.property('superpasswd');

      // Yet we can have all options by giving them explicitely using options
      conf = yield run('gimme-conf', '--superpasswd', 'megapasswd2');
      conf.should.have.property('superkey');
      conf.should.have.property('supersalt').equal('NaCl2');
      conf.should.have.property('superpasswd').equal('megapasswd2');
    }));
  });

  /***********************
   *  SERVICE START/STOP
   **********************/

  describe("Service triggers", () => {

    let stack;
    let fakeI;
    let fakeP;
    let fakeO;
    const run = (...args) => stack.executeStack(['node', 'index.js', '--memory'].concat(args));

    before(() => co(function*() {

      stack = duniter.statics.simpleStack();
      fakeI = new FakeStream((that, data) => {
        // Note: we never pass here
        if (typeof data == "string") {
          that.push(data);
        }
      });
      fakeP = new FakeStream((that, data) => {
        if (typeof data == "object" && data.type == "transaction") {
          const tx = parsers.parseTransaction.syncWrite(data.doc);
          that.push(tx);
        }
      });
      fakeO = new FakeStream((that, data) => {
        if (data.issuers) {
          that.resolveData();
        }
      });
      // Fake output has a special promise of data receival, for our tests
      fakeO.outputed = querablep(new Promise((res) => fakeO.resolveData = res));
      const dummyStartServiceDependency = {
        duniter: {
          cli: [{
            name: 'hello-service',
            desc: 'Says hello to the world, at service phase. And feed INPUT with a transaction.',
            onPluggedDALExecute: (duniterServer, conf, program, programArgs, startServices, stopServices) => co(function*(){
              yield startServices();
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
              yield fakeO.outputed;
              return fakeO.outputed;
            })
          }],
          service: {
            input: fakeI,
            process: fakeP,
            output: fakeO
          }
        }
      };
      const dummyStopServiceDependency = {
        duniter: {
          cli: [{
            name: 'bye-service',
            desc: 'Says goodbye to the world, at service phase.',
            onPluggedDALExecute: (duniterServer, conf, program, programArgs, startServices, stopServices) => co(function*(){
              yield stopServices();
              return Promise.resolve();
            })
          }],
          service: {
            input: fakeI,
            process: fakeP,
            output: fakeO
          }
        }
      };

      stack.registerDependency(dummyStartServiceDependency);
      stack.registerDependency(dummyStopServiceDependency);
    }));

    it('verify that services are started', () => co(function*() {
      fakeI.started.isResolved().should.equal(false);
      fakeP.started.isResolved().should.equal(false);
      fakeO.started.isResolved().should.equal(false);
      fakeI.stopped.isResolved().should.equal(false);
      fakeP.stopped.isResolved().should.equal(false);
      fakeO.stopped.isResolved().should.equal(false);
      yield run('hello-service');
      fakeO.outputed.isResolved().should.equal(true); // The transaction has successfully gone through the whole stream
      fakeI.started.isResolved().should.equal(true);
      fakeP.started.isResolved().should.equal(true);
      fakeO.started.isResolved().should.equal(true);
      fakeI.stopped.isResolved().should.equal(false);
      fakeP.stopped.isResolved().should.equal(false);
      fakeO.stopped.isResolved().should.equal(false);
    }));

    it('verify that services are stopped', () => co(function*() {
      fakeI.stopped.isResolved().should.equal(false);
      fakeP.stopped.isResolved().should.equal(false);
      fakeO.stopped.isResolved().should.equal(false);
      fakeI.started.isResolved().should.equal(true);
      fakeP.started.isResolved().should.equal(true);
      fakeO.started.isResolved().should.equal(true);
      yield run('bye-service');
      fakeI.started.isResolved().should.equal(false);
      fakeP.started.isResolved().should.equal(false);
      fakeO.started.isResolved().should.equal(false);
      fakeI.stopped.isResolved().should.equal(true);
      fakeP.stopped.isResolved().should.equal(true);
      fakeO.stopped.isResolved().should.equal(true);
    }));
  });

});


function FakeStream(onWrite) {

  const that = this;
  stream.Transform.call(this, { objectMode: true });

  let resolveStart = () => null;
  let resolveStop  = () => null;

  this._write = onWrite.bind(this, that);

  this.started = querablep(new Promise(res => resolveStart = res));
  this.stopped = querablep(new Promise(res => resolveStop  = res));

  this.startService = () => co(function*() {
    resolveStart();
    that.stopped = querablep(new Promise(res => resolveStop = res));
  });

  this.stopService = () => co(function*() {
    resolveStop();
    that.started = querablep(new Promise(res => resolveStart = res));
  });
}

util.inherits(FakeStream, stream.Transform);
