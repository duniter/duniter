"use strict";

const co   = require('co');
const opts = require('optimist').argv;
const path = require('path');
const cfs  = require('../cfs');
const Q    = require('q');
const qfs  = require('q-io/fs');
const fs   = require('fs');
const driver = require("../dal/drivers/sqlite");

const DEFAULT_DOMAIN = "duniter_default";
const DEFAULT_HOME = (process.platform == 'win32' ? process.env.USERPROFILE : process.env.HOME) + '/.config/duniter/';

const getLogsPath = (profile, dir) => path.join(getHomePath(profile, dir), 'duniter.log');

const getHomePath = (profile, dir) => path.normalize(getUserHome(dir) + '/') + getDomain(profile);

const getUserHome = (dir) => (dir || DEFAULT_HOME);

const getDomain = (profile) => (profile || DEFAULT_DOMAIN);

const dir = module.exports = {

  INSTANCE_NAME: getDomain(opts.mdb),
  INSTANCE_HOME: getHomePath(opts.mdb, opts.home),
  INSTANCE_HOMELOG_FILE: getLogsPath(opts.mdb, opts.home),
  DUNITER_DB_NAME: 'duniter',
  WOTB_FILE: 'wotb.bin',

  getHome: (profile, dir) => getHomePath(profile, dir),

  getHomeFS: (isMemory, theHome) => co(function *() {
    const home = theHome || dir.getHome();
    yield someDelayFix();
    const params = {
      home: home
    };
    if (isMemory) {
      params.fs = require('q-io/fs-mock')({});
    } else {
      params.fs = qfs;
    }
    yield params.fs.makeTree(home);
    return params;
  }),

  getHomeParams: (isMemory, theHome) => co(function *() {
    const params = yield dir.getHomeFS(isMemory, theHome);
    const home = params.home;
    yield someDelayFix();
    if (isMemory) {
      params.dbf = () => driver(':memory:');
      params.wotb = require('../wot').memoryInstance();
    } else {
      const sqlitePath = path.join(home, dir.DUNITER_DB_NAME + '.db');
      params.dbf = () => driver(sqlitePath);
      const wotbFilePath = path.join(home, dir.WOTB_FILE);
      let existsFile = yield qfs.exists(wotbFilePath);
      if (!existsFile) {
        fs.closeSync(fs.openSync(wotbFilePath, 'w'));
      }
      params.wotb = require('../wot').fileInstance(wotbFilePath);
    }
    return params;
  }),

  createHomeIfNotExists: (fs, theHome) => co(function *() {
    const fsHandler = cfs(theHome, fs);
    return fsHandler.makeTree('');
  })
};

const someDelayFix = () => Q.Promise((resolve) => {
  setTimeout(resolve, 100);
});

