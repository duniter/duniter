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

import {SQLiteDriver} from "../dal/drivers/SQLiteDriver"
import {CFSCore} from "../dal/fileDALs/CFSCore"
import {WoTBInstance, WoTBObject} from "../wot"
import {FileDALParams} from "../dal/fileDAL"

const opts = require('optimist').argv;
const path = require('path');
const qfs  = require('q-io/fs');
const fs   = require('fs');

const DEFAULT_DOMAIN = "duniter_default";
const DEFAULT_HOME = (process.platform == 'win32' ? process.env.USERPROFILE : process.env.HOME) + '/.config/duniter/';

const getLogsPath = (profile:string, directory:string|null = null) => path.join(getHomePath(profile, directory), 'duniter.log');

const getHomePath = (profile:string|null, directory:string|null = null) => path.normalize(getUserHome(directory) + '/') + getDomain(profile);

const getUserHome = (directory:string|null = null) => (directory || DEFAULT_HOME);

const getDomain = (profile:string|null = null) => (profile || DEFAULT_DOMAIN);

export interface FileSystem {
  fsExists(file:string): Promise<boolean>
  fsReadFile(file:string): Promise<string>
  fsUnlink(file:string): Promise<boolean>
  fsList(dir:string): Promise<string[]>
  fsWrite(file:string, content:string): Promise<void>
  fsMakeDirectory(dir:string): Promise<void>
  fsRemoveTree(dir:string): Promise<void>
}

class QioFileSystem implements FileSystem {

  constructor(private qio:any) {}

  async fsExists(file:string) {
    return this.qio.exists(file)
  }

  async fsReadFile(file:string) {
    return this.qio.read(file)
  }

  async fsUnlink(file:string) {
    return this.qio.remove(file)
  }

  async fsList(dir: string) {
    return this.qio.list(dir)
  }

  fsWrite(file: string, content: string): Promise<void> {
    return this.qio.write(file, content)
  }

  fsMakeDirectory(dir: string): Promise<void> {
    return this.qio.makeTree(dir)
  }

  async fsRemoveTree(dir: string): Promise<void> {
    return this.qio.removeTree(dir)
  }
}

export const RealFS = (): FileSystem => {
  return new QioFileSystem(qfs)
}

export const MockFS = (initialTree:{ [folder:string]: { [file:string]: string }} = {}): FileSystem => {
  return new QioFileSystem(require('q-io/fs-mock')(initialTree))
}

export const Directory = {

  INSTANCE_NAME: getDomain(opts.mdb),
  INSTANCE_HOME: getHomePath(opts.mdb, opts.home),
  INSTANCE_HOMELOG_FILE: getLogsPath(opts.mdb, opts.home),
  DUNITER_DB_NAME: 'duniter',
  WOTB_FILE: 'wotb.bin',

  getHome: (profile:string|null = null, directory:string|null = null) => getHomePath(profile, directory),

  getHomeFS: async (isMemory:boolean, theHome:string, makeTree = true) => {
    const home = theHome || Directory.getHome()
    const params = {
      home: home,
      fs: isMemory ? MockFS() : RealFS()
    }
    if (makeTree) {
      await params.fs.fsMakeDirectory(home)
    }
    return params;
  },

  getHomeParams: async (isMemory:boolean, theHome:string): Promise<FileDALParams> => {
    const params = await Directory.getHomeFS(isMemory, theHome)
    const home = params.home;
    let dbf: () => SQLiteDriver
    let wotb: WoTBInstance
    if (isMemory) {
      dbf = () => new SQLiteDriver(':memory:');
      wotb = WoTBObject.memoryInstance();
    } else {
      const sqlitePath = path.join(home, Directory.DUNITER_DB_NAME + '.db');
      dbf = () => new SQLiteDriver(sqlitePath);
      const wotbFilePath = path.join(home, Directory.WOTB_FILE);
      let existsFile = await qfs.exists(wotbFilePath)
      if (!existsFile) {
        fs.closeSync(fs.openSync(wotbFilePath, 'w'));
      }
      wotb = WoTBObject.fileInstance(wotbFilePath);
    }
    return {
      home: params.home,
      fs: params.fs,
      dbf,
      wotb
    }
  },

  createHomeIfNotExists: async (fileSystem:any, theHome:string) => {
    const fsHandler = new CFSCore(theHome, fileSystem);
    return fsHandler.makeTree('');
  }
}
