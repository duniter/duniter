"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const SQLiteDriver_1 = require("../dal/drivers/SQLiteDriver");
const CFSCore_1 = require("../dal/fileDALs/CFSCore");
const opts = require('optimist').argv;
const path = require('path');
const qfs = require('q-io/fs');
const fs = require('fs');
const DEFAULT_DOMAIN = "duniter_default";
const DEFAULT_HOME = (process.platform == 'win32' ? process.env.USERPROFILE : process.env.HOME) + '/.config/duniter/';
const getLogsPath = (profile, directory = null) => path.join(getHomePath(profile, directory), 'duniter.log');
const getHomePath = (profile, directory = null) => path.normalize(getUserHome(directory) + '/') + getDomain(profile);
const getUserHome = (directory = null) => (directory || DEFAULT_HOME);
const getDomain = (profile = null) => (profile || DEFAULT_DOMAIN);
const dir = module.exports = {
    INSTANCE_NAME: getDomain(opts.mdb),
    INSTANCE_HOME: getHomePath(opts.mdb, opts.home),
    INSTANCE_HOMELOG_FILE: getLogsPath(opts.mdb, opts.home),
    DUNITER_DB_NAME: 'duniter',
    WOTB_FILE: 'wotb.bin',
    getHome: (profile = null, directory = null) => getHomePath(profile, directory),
    getHomeFS: (isMemory, theHome) => __awaiter(this, void 0, void 0, function* () {
        const home = theHome || dir.getHome();
        yield someDelayFix();
        const params = {
            home: home
        };
        if (isMemory) {
            params.fs = require('q-io/fs-mock')({});
        }
        else {
            params.fs = qfs;
        }
        yield params.fs.makeTree(home);
        return params;
    }),
    getHomeParams: (isMemory, theHome) => __awaiter(this, void 0, void 0, function* () {
        const params = yield dir.getHomeFS(isMemory, theHome);
        const home = params.home;
        yield someDelayFix();
        if (isMemory) {
            params.dbf = () => new SQLiteDriver_1.SQLiteDriver(':memory:');
            params.wotb = require('../wot').WoTBObject.memoryInstance();
        }
        else {
            const sqlitePath = path.join(home, dir.DUNITER_DB_NAME + '.db');
            params.dbf = () => new SQLiteDriver_1.SQLiteDriver(sqlitePath);
            const wotbFilePath = path.join(home, dir.WOTB_FILE);
            let existsFile = yield qfs.exists(wotbFilePath);
            if (!existsFile) {
                fs.closeSync(fs.openSync(wotbFilePath, 'w'));
            }
            params.wotb = require('../wot').WoTBObject.fileInstance(wotbFilePath);
        }
        return params;
    }),
    createHomeIfNotExists: (fileSystem, theHome) => __awaiter(this, void 0, void 0, function* () {
        const fsHandler = new CFSCore_1.CFSCore(theHome, fileSystem);
        return fsHandler.makeTree('');
    })
};
const someDelayFix = () => new Promise((resolve) => {
    setTimeout(resolve, 100);
});
//# sourceMappingURL=directory.js.map