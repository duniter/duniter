"use strict";

const co      = require('co');
const _       = require('underscore');
const should  = require('should');
const duniter = require('../../index');

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

  // TODO: test serviceStart
  // TODO: test serviceStop
  // TODO: test streaming
});
