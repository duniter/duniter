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

import { randomKey } from "../../lib/common-libs/crypto/keyring";
import { ConfDTO, KeypairConfDTO } from "../../lib/dto/ConfDTO";
import { Server } from "../../../server";
import { Scrypt } from "./lib/scrypt";

const inquirer = require("inquirer");
const fs = require("fs");
const yaml = require("js-yaml");

export const KeypairDependency = {
  duniter: {
    methods: {
      scrypt: Scrypt,
    },

    cliOptions: [
      { value: "--salt <salt>", desc: "Salt to generate the keypair" },
      {
        value: "--passwd <password>",
        desc: "Password to generate the keypair",
      },
      {
        value: "--keyN <N>",
        desc:
          "Scrypt `N` CPU/memory cost parameter. Must be a power of 2. Defaults to 4096.",
        parser: parseInt,
      },
      {
        value: "--keyr <r>",
        desc:
          "Scrypt `r` The blocksize parameter, which fine-tunes sequential memory read size and performance. Defaults to 16.",
        parser: parseInt,
      },
      {
        value: "--keyp <p>",
        desc: "Scrypt `p` Parallelization parameter. Defaults to 1.",
        parser: parseInt,
      },
      {
        value: "--keyprompt",
        desc: "Force to use the keypair given by user prompt.",
      },
      {
        value: "--keyfile <filepath>",
        desc:
          "Force to use the keypair of the given YAML file. File must contain `pub:` and `sec:` fields.",
      },
    ],

    wizard: {
      key: promptKey,
    },

    onReset: {
      config: (conf: ConfDTO, program: any, logger: any, confDAL: any) =>
        confDAL.coreFS.remove("keyring.yml"),
    },

    cli: [
      {
        name: "pub",
        desc: "Shows the node public key",
        logs: false,
        onConfiguredExecute: async (server: Server, conf: ConfDTO) => {
          console.log(conf.pair.pub);
        },
      },
      {
        name: "sec",
        desc: "Shows the node secret key",
        logs: false,
        onConfiguredExecute: async (server: Server, conf: ConfDTO) => {
          console.log(conf.pair.sec);
        },
      },
    ],

    config: {
      /*****
       * Tries to load a specific parameter `conf.pair`
       */
      onLoading: async (
        conf: KeypairConfDTO,
        program: any,
        logger: any,
        confDAL: any
      ) => {
        if (
          (program.keyN || program.keyr || program.keyp) &&
          !(program.salt && program.passwd)
        ) {
          throw Error(
            "Missing --salt and --passwd options along with --keyN|keyr|keyp option"
          );
        }

        // If we have salt and password, convert it to keypair
        if (program.salt || program.passwd) {
          const salt = program.salt || "";
          const key = program.passwd || "";
          conf.pair = await Scrypt(salt, key);
        }

        // If no keypair has been loaded, try the default .yml file
        if (!conf.pair || !conf.pair.pub || !conf.pair.sec) {
          const ymlContent = await confDAL.coreFS.read("keyring.yml");
          conf.pair = yaml.safeLoad(ymlContent);
        }

        // If no keypair has been loaded or derived from salt/key, generate a random one
        if (!conf.pair || !conf.pair.pub || !conf.pair.sec) {
          conf.pair = randomKey().json();
        }

        // With the --keyprompt option, temporarily use a keypair given from CLI prompt (it won't be stored)
        if (program.keyprompt) {
          // Backup of the current pair
          conf.oldPair = {
            pub: conf.pair.pub,
            sec: conf.pair.sec,
          };
          // Ask the for the session key
          await promptKey(conf, program);
        }

        // With the --keyfile option, temporarily use a keypair given from file system (content won't be stored)
        if (program.keyfile) {
          // Backup of the current pair
          conf.oldPair = {
            pub: conf.pair.pub,
            sec: conf.pair.sec,
          };
          // Load file content
          const doc = yaml.safeLoad(fs.readFileSync(program.keyfile, "utf8"));
          if (!doc || !doc.pub || !doc.sec) {
            throw "Could not load full keyring from file";
          }
          conf.pair = {
            pub: doc.pub,
            sec: doc.sec,
          };
        }
      },

      beforeSave: async (
        conf: Partial<KeypairConfDTO>,
        program: any,
        logger: any,
        confDAL: any
      ) => {
        if ((program.keyprompt || program.keyfile) && conf.oldPair) {
          // Don't store the given key, but only the default/saved one
          conf.pair = {
            pub: conf.oldPair.pub,
            sec: conf.oldPair.sec,
          };
        }
        delete conf.oldPair;

        // We save the key in a separate file
        const keyring =
          'pub: "' + conf.pair?.pub + '"\n' + 'sec: "' + conf.pair?.sec + '"';
        await confDAL.coreFS.write("keyring.yml", keyring);

        // We never want to store salt, password or keypair in the conf.json file
        delete conf.salt;
        delete conf.passwd;
        delete conf.pair;
      },
    },
  },
};

async function promptKey(conf: KeypairConfDTO, program: any) {
  const changeKeypair = !conf.pair || !conf.pair.pub || !conf.pair.sec;

  const answersWantToChange = await inquirer.prompt([
    {
      type: "confirm",
      name: "change",
      message: `This node's current public key is: ${conf.pair.pub} 
 Modify your keypair?`,
      default: changeKeypair,
    },
  ]);

  if (answersWantToChange.change) {
    const obfuscatedSalt = (program.salt || "").replace(/./g, "*");
    const answersSalt = await inquirer.prompt([
      {
        type: "password",
        name: "salt",
        message: "Key's salt",
        default: obfuscatedSalt || undefined,
      },
    ]);
    const obfuscatedPasswd = (program.passwd || "").replace(/./g, "*");
    const answersPasswd = await inquirer.prompt([
      {
        type: "password",
        name: "passwd",
        message: "Key's password",
        default: obfuscatedPasswd || undefined,
      },
    ]);

    const keepOldSalt =
      obfuscatedSalt.length > 0 && obfuscatedSalt == answersSalt.salt;
    const keepOldPasswd =
      obfuscatedPasswd.length > 0 && obfuscatedPasswd == answersPasswd.passwd;
    const salt = keepOldSalt ? program.salt : answersSalt.salt;
    const passwd = keepOldPasswd ? program.passwd : answersPasswd.passwd;
    conf.pair = await Scrypt(salt, passwd);
  }
}
