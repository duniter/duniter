import {SQLiteDriver} from "../dal/drivers/SQLiteDriver"
import {CFSCore} from "../dal/fileDALs/CFSCore"
import {WoTBObject} from "../wot"

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

const dir = module.exports = {

  INSTANCE_NAME: getDomain(opts.mdb),
  INSTANCE_HOME: getHomePath(opts.mdb, opts.home),
  INSTANCE_HOMELOG_FILE: getLogsPath(opts.mdb, opts.home),
  DUNITER_DB_NAME: 'duniter',
  WOTB_FILE: 'wotb.bin',

  getHome: (profile:string|null = null, directory:string|null = null) => getHomePath(profile, directory),

  getHomeFS: async (isMemory:boolean, theHome:string, makeTree = true) => {
    const home = theHome || dir.getHome();
    const params:any = {
      home: home
    };
    if (isMemory) {
      params.fs = require('q-io/fs-mock')({});
    } else {
      params.fs = qfs;
    }
    if (makeTree) {
      await params.fs.makeTree(home)
    }
    return params;
  },

  getHomeParams: async (isMemory:boolean, theHome:string) => {
    const params:any = await dir.getHomeFS(isMemory, theHome)
    const home = params.home;
    if (isMemory) {
      params.dbf = () => new SQLiteDriver(':memory:');
      params.wotb = WoTBObject.memoryInstance();
    } else {
      const sqlitePath = path.join(home, dir.DUNITER_DB_NAME + '.db');
      params.dbf = () => new SQLiteDriver(sqlitePath);
      const wotbFilePath = path.join(home, dir.WOTB_FILE);
      let existsFile = await qfs.exists(wotbFilePath)
      if (!existsFile) {
        fs.closeSync(fs.openSync(wotbFilePath, 'w'));
      }
      params.wotb = WoTBObject.fileInstance(wotbFilePath);
    }
    return params;
  },

  createHomeIfNotExists: async (fileSystem:any, theHome:string) => {
    const fsHandler = new CFSCore(theHome, fileSystem);
    return fsHandler.makeTree('');
  }
}
