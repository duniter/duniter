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
const BasicBlockchain_1 = require("../../app/lib/blockchain/BasicBlockchain");
const ArrayBlockchain_1 = require("./lib/ArrayBlockchain");
const SqlBlockchain_1 = require("../../app/lib/blockchain/SqlBlockchain");
const assert = require('assert');
const BIndexDAL = require('../../app/lib/dal/sqliteDAL/index/BIndexDAL');
const MetaDAL = require('../../app/lib/dal/sqliteDAL/MetaDAL');
const sqlite = require('../../app/lib/dal/drivers/sqlite');
let blockchain, emptyBlockchain;
describe('Basic Memory Blockchain', () => {
    before(() => {
        blockchain = new BasicBlockchain_1.BasicBlockchain(new ArrayBlockchain_1.ArrayBlockchain());
        emptyBlockchain = new BasicBlockchain_1.BasicBlockchain(new ArrayBlockchain_1.ArrayBlockchain());
    });
    it('should be able to push 3 blocks and read them', () => __awaiter(this, void 0, void 0, function* () {
        yield blockchain.pushBlock({ name: 'A' });
        yield blockchain.pushBlock({ name: 'B' });
        yield blockchain.pushBlock({ name: 'C' });
        const HEAD0 = yield blockchain.head();
        const HEAD1 = yield blockchain.head(1);
        const HEAD2 = yield blockchain.head(2);
        const BLOCK0 = yield blockchain.getBlock(0);
        const BLOCK1 = yield blockchain.getBlock(1);
        const BLOCK2 = yield blockchain.getBlock(2);
        assert.equal(HEAD0.name, 'C');
        assert.equal(HEAD1.name, 'B');
        assert.equal(HEAD2.name, 'A');
        assert.deepEqual(HEAD2, BLOCK0);
        assert.deepEqual(HEAD1, BLOCK1);
        assert.deepEqual(HEAD0, BLOCK2);
    }));
    it('should be able to read a range', () => __awaiter(this, void 0, void 0, function* () {
        const range1 = yield blockchain.headRange(2);
        assert.equal(range1.length, 2);
        assert.equal(range1[0].name, 'C');
        assert.equal(range1[1].name, 'B');
        const range2 = yield blockchain.headRange(6);
        assert.equal(range2.length, 3);
        assert.equal(range2[0].name, 'C');
        assert.equal(range2[1].name, 'B');
        assert.equal(range2[2].name, 'A');
    }));
    it('should have a good height', () => __awaiter(this, void 0, void 0, function* () {
        const height1 = yield blockchain.height();
        yield blockchain.pushBlock({ name: 'D' });
        const height2 = yield blockchain.height();
        const height3 = yield emptyBlockchain.height();
        assert.equal(height1, 3);
        assert.equal(height2, 4);
        assert.equal(height3, 0);
    }));
    it('should be able to revert blocks', () => __awaiter(this, void 0, void 0, function* () {
        const reverted = yield blockchain.revertHead();
        const height2 = yield blockchain.height();
        assert.equal(height2, 3);
        assert.equal(reverted.name, 'D');
    }));
});
describe('Basic SQL Blockchain', () => {
    before(() => __awaiter(this, void 0, void 0, function* () {
        {
            const db = new sqlite(':memory:');
            const bindexDAL = new BIndexDAL(db);
            const metaDAL = new MetaDAL(db);
            yield bindexDAL.init();
            yield metaDAL.init();
            yield metaDAL.exec('CREATE TABLE txs (id INTEGER null);');
            yield metaDAL.exec('CREATE TABLE idty (id INTEGER null);');
            yield metaDAL.exec('CREATE TABLE cert (id INTEGER null);');
            yield metaDAL.exec('CREATE TABLE membership (id INTEGER null);');
            yield metaDAL.exec('CREATE TABLE block (fork INTEGER null);');
            yield metaDAL.upgradeDatabase({});
            const dal = { bindexDAL };
            blockchain = new BasicBlockchain_1.BasicBlockchain(new SqlBlockchain_1.SQLBlockchain(dal));
        }
        {
            const db = new sqlite(':memory:');
            const bindexDAL = new BIndexDAL(db);
            const metaDAL = new MetaDAL(db);
            yield bindexDAL.init();
            yield metaDAL.init();
            yield metaDAL.exec('CREATE TABLE txs (id INTEGER null);');
            yield metaDAL.exec('CREATE TABLE idty (id INTEGER null);');
            yield metaDAL.exec('CREATE TABLE cert (id INTEGER null);');
            yield metaDAL.exec('CREATE TABLE membership (id INTEGER null);');
            yield metaDAL.exec('CREATE TABLE block (fork INTEGER null);');
            yield metaDAL.upgradeDatabase({});
            const dal = { bindexDAL };
            emptyBlockchain = new BasicBlockchain_1.BasicBlockchain(new SqlBlockchain_1.SQLBlockchain(dal));
        }
    }));
    it('should be able to push 3 blocks and read them', () => __awaiter(this, void 0, void 0, function* () {
        yield blockchain.pushBlock({ number: 0, version: 1, bsize: 0, hash: 'H', issuer: 'I', time: 1, membersCount: 1, issuersCount: 1, issuersFrame: 1, issuersFrameVar: 1, avgBlockSize: 0, medianTime: 1, dividend: 10, mass: 100, unitBase: 0, powMin: 0, udTime: 0, udReevalTime: 0, diffNumber: 1, speed: 1, massReeval: 1 });
        yield blockchain.pushBlock({ number: 1, version: 1, bsize: 0, hash: 'H', issuer: 'I', time: 1, membersCount: 1, issuersCount: 1, issuersFrame: 1, issuersFrameVar: 1, avgBlockSize: 0, medianTime: 1, dividend: 10, mass: 100, unitBase: 0, powMin: 0, udTime: 0, udReevalTime: 0, diffNumber: 1, speed: 1, massReeval: 1 });
        yield blockchain.pushBlock({ number: 2, version: 1, bsize: 0, hash: 'H', issuer: 'I', time: 1, membersCount: 1, issuersCount: 1, issuersFrame: 1, issuersFrameVar: 1, avgBlockSize: 0, medianTime: 1, dividend: 10, mass: 100, unitBase: 0, powMin: 0, udTime: 0, udReevalTime: 0, diffNumber: 1, speed: 1, massReeval: 1 });
        const HEAD0 = yield blockchain.head();
        const HEAD1 = yield blockchain.head(1);
        const HEAD2 = yield blockchain.head(2);
        const BLOCK0 = yield blockchain.getBlock(0);
        const BLOCK1 = yield blockchain.getBlock(1);
        const BLOCK2 = yield blockchain.getBlock(2);
        assert.equal(HEAD0.number, 2);
        assert.equal(HEAD1.number, 1);
        assert.equal(HEAD2.number, 0);
        assert.deepEqual(HEAD2, BLOCK0);
        assert.deepEqual(HEAD1, BLOCK1);
        assert.deepEqual(HEAD0, BLOCK2);
    }));
    it('should be able to read a range', () => __awaiter(this, void 0, void 0, function* () {
        const range1 = yield blockchain.headRange(2);
        assert.equal(range1.length, 2);
        assert.equal(range1[0].number, 2);
        assert.equal(range1[1].number, 1);
        const range2 = yield blockchain.headRange(6);
        assert.equal(range2.length, 3);
        assert.equal(range2[0].number, 2);
        assert.equal(range2[1].number, 1);
        assert.equal(range2[2].number, 0);
    }));
    it('should have a good height', () => __awaiter(this, void 0, void 0, function* () {
        const height1 = yield blockchain.height();
        yield blockchain.pushBlock({ number: 3, version: 1, bsize: 0, hash: 'H', issuer: 'I', time: 1, membersCount: 1, issuersCount: 1, issuersFrame: 1, issuersFrameVar: 1, avgBlockSize: 0, medianTime: 1, dividend: 10, mass: 100, unitBase: 0, powMin: 0, udTime: 0, udReevalTime: 0, diffNumber: 1, speed: 1, massReeval: 1 });
        const height2 = yield blockchain.height();
        const height3 = yield emptyBlockchain.height();
        assert.equal(height1, 3);
        assert.equal(height2, 4);
        assert.equal(height3, 0);
    }));
    it('should be able to revert blocks', () => __awaiter(this, void 0, void 0, function* () {
        const reverted = yield blockchain.revertHead();
        const height2 = yield blockchain.height();
        assert.equal(height2, 3);
        assert.equal(reverted.number, 3);
    }));
});
//# sourceMappingURL=basic-blockchain.js.map