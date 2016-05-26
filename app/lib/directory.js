"use strict";

var co   = require('co');
var opts = require('optimist').argv;
var path = require('path');
var cfs  = require('./cfs');
var Q    = require('q');
var qfs  = require('q-io/fs');
var sqlite3 = require("sqlite3").verbose();

const DEFAULT_DOMAIN = "duniter_default";
const DEFAULT_HOME = (process.platform == 'win32' ? process.env.USERPROFILE : process.env.HOME) + '/.config/duniter/';

let dir = module.exports = {

  INSTANCE_NAME: getDomain(opts.mdb),
  INSTANCE_HOME: getHomePath(opts.mdb, opts.home),
  INSTANCE_HOMELOG_FILE: getLogsPath(opts.mdb, opts.home),
  UCOIN_DB_NAME: 'duniter',
  WOTB_FILE: 'wotb.bin',

  getHome: (profile, dir) => getHomePath(profile, dir),

  getHomeFS: (isMemory, theHome) => co(function *() {
    let home = theHome || dir.getHome();
    yield someDelayFix();
    let params = {
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
    let params = yield dir.getHomeFS(isMemory, theHome);
    let home = params.home;
    yield someDelayFix();
    if (isMemory) {
      params.dbf = () => new sqlite3.Database(':memory:');
      params.wotb = require('./wot').memoryInstance();
    } else {
      let sqlitePath = path.join(home, dir.UCOIN_DB_NAME + '.db');
      params.dbf = () => new sqlite3.Database(sqlitePath);
      params.wotb = require('./wot').fileInstance(path.join(home, dir.WOTB_FILE));
    }
    return params;
  }),

  createHomeIfNotExists: (fs, theHome) => co(function *() {
    let fsHandler = cfs(theHome, fs);
    return fsHandler.makeTree('');
  })
};

function someDelayFix() {
  return Q.Promise(function(resolve){
    setTimeout(resolve, 100);
  });
}

function getLogsPath(profile, dir) {
  return path.join(getHomePath(profile, dir), 'duniter.log');
}

function getHomePath(profile, dir) {
  return path.normalize(getUserHome(dir) + '/') + getDomain(profile);
}

function getUserHome(dir) {
  return dir || DEFAULT_HOME;
}

function getDomain(profile) {
  return profile || DEFAULT_DOMAIN;
}
