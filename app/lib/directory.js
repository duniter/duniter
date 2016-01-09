"use strict";

var opts = require('optimist').argv;
var path = require('path');

const DEFAULT_DOMAIN = "ucoin_default";
const DEFAULT_HOME = ((process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.config/ucoin/');

module.exports = {

  INSTANCE_NAME: getDomain(opts.mdb),
  INSTANCE_HOME: getHomePath(opts.mdb, opts.home),
  INSTANCE_HOMELOG_FILE: getLogsPath(opts.mdb, opts.home),

  getHome: (profile, dir) => getHomePath(profile, dir)
};

function getLogsPath(profile, dir) {
  return path.join(getHomePath(profile, dir), 'ucoin.log');
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
