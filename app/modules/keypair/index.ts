import {randomKey} from "../../lib/common-libs/crypto/keyring"
import {ConfDTO, KeypairConfDTO} from "../../lib/dto/ConfDTO"
import {Scrypt} from "./lib/scrypt"

const inquirer = require('inquirer');
const fs = require('fs');
const yaml = require('js-yaml');

export const KeypairDependency = {

  duniter: {

    methods: {
      scrypt: Scrypt
    },

    cliOptions: [
      { value: '--salt <salt>', desc: 'Salt to generate the keypair' },
      { value: '--passwd <password>', desc: 'Password to generate the keypair' },
      { value: '--keyN <N>', desc: 'Scrypt `N` parameter. Defaults to 4096.', parser: parseInt },
      { value: '--keyr <r>', desc: 'Scrypt `N` parameter. Defaults to 16.', parser: parseInt },
      { value: '--keyp <p>', desc: 'Scrypt `N` parameter. Defaults to 1.', parser: parseInt },
      { value: '--keyprompt', desc: 'Force to use the keypair given by user prompt.' },
      { value: '--keyfile <filepath>', desc: 'Force to use the keypair of the given YAML file. File must contain `pub:` and `sec:` fields.' }
    ],

    wizard: {

      'key': promptKey

    },

    onReset: {
      config: (conf:ConfDTO, program:any, logger:any, confDAL:any) => confDAL.coreFS.remove('keyring.yml')
    },

    config: {

      /*****
       * Tries to load a specific parameter `conf.pair`
       */
      onLoading: async (conf:KeypairConfDTO, program:any, logger:any, confDAL:any) => {

        if ((program.keyN || program.keyr || program.keyp) && !(program.salt && program.passwd)) {
          throw Error('Missing --salt and --passwd options along with --keyN|keyr|keyp option');
        }

        // If we have salt and password, convert it to keypair
        if (program.salt || program.passwd) {
          const salt = program.salt || '';
          const key  = program.passwd || '';
          conf.pair = await Scrypt(salt, key);
        }

        // If no keypair has been loaded, try the default .yml file
        if (!conf.pair || !conf.pair.pub || !conf.pair.sec) {
          const ymlContent = await confDAL.coreFS.read('keyring.yml')
          conf.pair = yaml.safeLoad(ymlContent);
        }

        // If no keypair has been loaded or derived from salt/key, generate a random one
        if (!conf.pair || !conf.pair.pub || !conf.pair.sec) {
          conf.pair = randomKey().json()
        }

        // With the --keyprompt option, temporarily use a keypair given from CLI prompt (it won't be stored)
        if (program.keyprompt) {
          // Backup of the current pair
          conf.oldPair = {
            pub: conf.pair.pub,
            sec: conf.pair.sec
          };
          // Ask the for the session key
          await promptKey(conf, program);
        }

        // With the --keyfile option, temporarily use a keypair given from file system (content won't be stored)
        if (program.keyfile) {
          // Backup of the current pair
          conf.oldPair = {
            pub: conf.pair.pub,
            sec: conf.pair.sec
          };
          // Load file content
          const doc = yaml.safeLoad(fs.readFileSync(program.keyfile, 'utf8'));
          if (!doc || !doc.pub || !doc.sec) {
            throw 'Could not load full keyring from file';
          }
          conf.pair = {
            pub: doc.pub,
            sec: doc.sec
          }
        }

      },

      beforeSave: async (conf:KeypairConfDTO, program:any, logger:any, confDAL:any) => {

        if ((program.keyprompt || program.keyfile) && conf.oldPair) {
          // Don't store the given key, but only the default/saved one
          conf.pair = {
            pub: conf.oldPair.pub,
            sec: conf.oldPair.sec
          };
        }
        delete conf.oldPair;

        // We save the key in a separate file
        const keyring = 'pub: "' + conf.pair.pub + '"\n' +
          'sec: "' + conf.pair.sec + '"'
        await confDAL.coreFS.write('keyring.yml', keyring)

        // We never want to store salt, password or keypair in the conf.json file
        delete conf.salt;
        delete conf.passwd;
        delete conf.pair;
      }
    }
  }
};

async function promptKey (conf:KeypairConfDTO, program:any) {

  const changeKeypair = !conf.pair || !conf.pair.pub || !conf.pair.sec;

  const answersWantToChange = await inquirer.prompt([{
    type: "confirm",
    name: "change",
    message: "Modify your keypair?",
    default: changeKeypair
  }]);

  if (answersWantToChange.change) {
    const obfuscatedSalt = (program.salt || "").replace(/./g, '*');
    const answersSalt = await inquirer.prompt([{
      type: "password",
      name: "salt",
      message: "Key's salt",
      default: obfuscatedSalt || undefined
    }]);
    const obfuscatedPasswd = (program.passwd || "").replace(/./g, '*');
    const answersPasswd = await inquirer.prompt([{
      type: "password",
      name: "passwd",
      message: "Key\'s password",
      default: obfuscatedPasswd || undefined
    }]);

    const keepOldSalt = obfuscatedSalt.length > 0 && obfuscatedSalt == answersSalt.salt;
    const keepOldPasswd = obfuscatedPasswd.length > 0 && obfuscatedPasswd == answersPasswd.passwd;
    const salt   = keepOldSalt ? program.salt : answersSalt.salt;
    const passwd = keepOldPasswd ? program.passwd : answersPasswd.passwd;
    conf.pair = await Scrypt(salt, passwd)
  }
}
