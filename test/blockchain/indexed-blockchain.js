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
const ArrayBlockchain_1 = require("./lib/ArrayBlockchain");
const IndexedBlockchain_1 = require("../../app/lib/blockchain/IndexedBlockchain");
const MemoryIndex_1 = require("./lib/MemoryIndex");
const SqlIndex_1 = require("../../app/lib/blockchain/SqlIndex");
const assert = require('assert');
const sqlite = require('../../app/lib/dal/drivers/sqlite');
describe('Indexed Blockchain', () => {
    describe('MemoryIndex', () => {
        let blockchain;
        describe('PK on one field', () => {
            before(() => {
                blockchain = new IndexedBlockchain_1.IndexedBlockchain(new ArrayBlockchain_1.ArrayBlockchain(), new MemoryIndex_1.MemoryIndex(), 'writtenOn', {
                    iindex: {
                        pk: 'name',
                        remove: 'expired'
                    },
                    zindex: {
                        pk: 'name'
                    }
                });
            });
            it('should be able to index data', () => __awaiter(this, void 0, void 0, function* () {
                yield blockchain.recordIndex({
                    iindex: [
                        { name: 'A', status: 'OK', writtenOn: 23000, events: 0, member: false },
                        { name: 'A', status: 'OK', writtenOn: 23000, events: 4 },
                        { name: 'A', status: 'OK', writtenOn: 23000, events: 5, member: true },
                        { name: 'A', status: 'OK', writtenOn: 23601 },
                        { name: 'A', status: 'OK', writtenOn: 23888 },
                        { name: 'A', status: 'OK', writtenOn: 23889 },
                        { name: 'B', status: 'OK', writtenOn: 23000, events: 1, member: false },
                        { name: 'B', status: 'KO', writtenOn: 23000, events: null },
                        { name: 'C', status: 'KO', writtenOn: 23500 },
                        { name: 'D', status: 'KO', writtenOn: 23500 },
                        { name: 'D', status: 'KO', writtenOn: 23521, expired: true }
                    ]
                });
            }));
            it('should be able to reduce data', () => __awaiter(this, void 0, void 0, function* () {
                const reducedA = yield blockchain.indexReduce('iindex', { name: 'A' });
                const reducedB = yield blockchain.indexReduce('iindex', { name: 'B' });
                assert.deepEqual(reducedA, { name: 'A', status: 'OK', writtenOn: 23889, events: 5, member: true });
                assert.deepEqual(reducedB, { name: 'B', status: 'KO', writtenOn: 23000, events: 1, member: false });
            }));
            it('should be able to count data', () => __awaiter(this, void 0, void 0, function* () {
                const countAi = yield blockchain.indexCount('iindex', { name: 'A' });
                const countBi = yield blockchain.indexCount('iindex', { name: 'B' });
                const countCi = yield blockchain.indexCount('iindex', { name: 'C' });
                const countDi = yield blockchain.indexCount('iindex', { name: 'D' });
                const countBz = yield blockchain.indexCount('zindex', { name: 'B' });
                assert.equal(countAi, 6);
                assert.equal(countBi, 2);
                assert.equal(countCi, 1);
                assert.equal(countDi, 2);
                assert.equal(countBz, 0);
            }));
            it('should be able to reduce grouped data', () => __awaiter(this, void 0, void 0, function* () {
                const reducedBy = yield blockchain.indexReduceGroupBy('iindex', { writtenOn: 23000 }, ['name']);
                assert.deepEqual(reducedBy, [
                    { name: 'A', status: 'OK', writtenOn: 23000, events: 5, member: true },
                    { name: 'B', status: 'KO', writtenOn: 23000, events: 1, member: false }
                ]);
            }));
            it('should be able to trim data', () => __awaiter(this, void 0, void 0, function* () {
                // The number of records should decrease
                yield blockchain.indexTrim(23601);
                const countAi = yield blockchain.indexCount('iindex', { name: 'A' });
                const countBi = yield blockchain.indexCount('iindex', { name: 'B' });
                const countCi = yield blockchain.indexCount('iindex', { name: 'C' });
                const countDi = yield blockchain.indexCount('iindex', { name: 'D' });
                const countBz = yield blockchain.indexCount('zindex', { name: 'B' });
                assert.equal(countAi, 4);
                assert.equal(countBi, 1);
                assert.equal(countCi, 1);
                assert.equal(countDi, 0); // Expired = remove rows on trim
                assert.equal(countBz, 0);
                const reducedAi = yield blockchain.indexReduce('iindex', { name: 'A' });
                const reducedBi = yield blockchain.indexReduce('iindex', { name: 'B' });
                const reducedCi = yield blockchain.indexReduce('iindex', { name: 'C' });
                const reducedDi = yield blockchain.indexReduce('iindex', { name: 'D' });
                const reducedBz = yield blockchain.indexReduce('zindex', { name: 'B' });
                assert.deepEqual(reducedAi, { name: 'A', status: 'OK', writtenOn: 23889, events: 5, member: true });
                assert.deepEqual(reducedBi, { name: 'B', status: 'KO', writtenOn: 23000, events: 1, member: false });
                assert.deepEqual(reducedCi, { name: 'C', status: 'KO', writtenOn: 23500 });
                assert.deepEqual(reducedDi, {});
                assert.deepEqual(reducedBz, {});
            }));
        });
        describe('PK on two fields', () => {
            before(() => {
                blockchain = new IndexedBlockchain_1.IndexedBlockchain(new ArrayBlockchain_1.ArrayBlockchain(), new MemoryIndex_1.MemoryIndex(), 'writtenOn', {
                    iindex: {
                        pk: ['id', 'pos'],
                        remove: 'expired'
                    },
                    zindex: {
                        pk: 'name'
                    }
                });
            });
            it('should be able to index data', () => __awaiter(this, void 0, void 0, function* () {
                yield blockchain.recordIndex({
                    iindex: [
                        { id: 'A', pos: 0, status: 'OK', writtenOn: 23000, events: 0, member: false },
                        { id: 'A', pos: 0, status: 'OK', writtenOn: 23000, events: 4 },
                        { id: 'A', pos: 0, status: 'OK', writtenOn: 23000, events: 5, member: true },
                        { id: 'A', pos: 0, status: 'OK', writtenOn: 23601 },
                        { id: 'A', pos: 1, status: 'OK', writtenOn: 23888 },
                        { id: 'A', pos: 2, status: 'OK', writtenOn: 23889 },
                        { id: 'B', pos: 0, status: 'OK', writtenOn: 23000, events: 1, member: false },
                        { id: 'B', pos: 0, status: 'KO', writtenOn: 23000, events: null },
                        { id: 'C', pos: 0, status: 'KO', writtenOn: 23500 },
                        { id: 'D', pos: 0, status: 'KO', writtenOn: 23500 },
                        { id: 'D', pos: 1, status: 'KO', writtenOn: 23521, expired: true }
                    ]
                });
            }));
            it('should be able to reduce data', () => __awaiter(this, void 0, void 0, function* () {
                const reducedA = yield blockchain.indexReduce('iindex', { id: 'A', pos: 0 });
                const reducedB = yield blockchain.indexReduce('iindex', { id: 'B', pos: 0 });
                assert.deepEqual(reducedA, { id: 'A', pos: 0, status: 'OK', writtenOn: 23601, events: 5, member: true });
                assert.deepEqual(reducedB, { id: 'B', pos: 0, status: 'KO', writtenOn: 23000, events: 1, member: false });
            }));
            it('should be able to count data', () => __awaiter(this, void 0, void 0, function* () {
                const countAi = yield blockchain.indexCount('iindex', { id: 'A', pos: 0 });
                const countBi = yield blockchain.indexCount('iindex', { id: 'B', pos: 0 });
                const countCi = yield blockchain.indexCount('iindex', { id: 'C', pos: 0 });
                const countDi = yield blockchain.indexCount('iindex', { id: 'D', pos: 0 });
                const countBz = yield blockchain.indexCount('zindex', { id: 'B', pos: 0 });
                assert.equal(countAi, 4);
                assert.equal(countBi, 2);
                assert.equal(countCi, 1);
                assert.equal(countDi, 1);
                assert.equal(countBz, 0);
            }));
            it('should be able to reduce grouped data', () => __awaiter(this, void 0, void 0, function* () {
                const reducedBy = yield blockchain.indexReduceGroupBy('iindex', { writtenOn: 23000 }, ['id', 'pos']);
                assert.deepEqual(reducedBy, [
                    { id: 'A', pos: 0, status: 'OK', writtenOn: 23000, events: 5, member: true },
                    { id: 'B', pos: 0, status: 'KO', writtenOn: 23000, events: 1, member: false }
                ]);
            }));
            it('should be able to trim data', () => __awaiter(this, void 0, void 0, function* () {
                // The number of records should decrease
                yield blockchain.indexTrim(23601);
                const countAi = yield blockchain.indexCount('iindex', { id: 'A', pos: 0 });
                const countBi = yield blockchain.indexCount('iindex', { id: 'B', pos: 0 });
                const countCi = yield blockchain.indexCount('iindex', { id: 'C', pos: 0 });
                const countDi = yield blockchain.indexCount('iindex', { id: 'D', pos: 0 });
                const countBz = yield blockchain.indexCount('zindex', { id: 'B', pos: 0 });
                assert.equal(countAi, 2);
                assert.equal(countBi, 1);
                assert.equal(countCi, 1);
                assert.equal(countDi, 1); // Not expired!
                assert.equal(countBz, 0);
                const reducedAi = yield blockchain.indexReduce('iindex', { id: 'A', pos: 0 });
                const reducedBi = yield blockchain.indexReduce('iindex', { id: 'B', pos: 0 });
                const reducedCi = yield blockchain.indexReduce('iindex', { id: 'C', pos: 0 });
                const reducedDi = yield blockchain.indexReduce('iindex', { id: 'D', pos: 0 });
                const reducedBz = yield blockchain.indexReduce('zindex', { id: 'B', pos: 0 });
                assert.deepEqual(reducedAi, { id: 'A', pos: 0, status: 'OK', writtenOn: 23601, events: 5, member: true });
                assert.deepEqual(reducedBi, { id: 'B', pos: 0, status: 'KO', writtenOn: 23000, events: 1, member: false });
                assert.deepEqual(reducedCi, { id: 'C', pos: 0, status: 'KO', writtenOn: 23500 });
                assert.deepEqual(reducedDi, { id: 'D', pos: 0, status: 'KO', writtenOn: 23500 });
                assert.deepEqual(reducedBz, {});
            }));
        });
    });
    describe('SqlIndex', () => {
        let blockchain;
        describe('PK on one field', () => {
            before(() => {
                const db = new sqlite(':memory:');
                blockchain = new IndexedBlockchain_1.IndexedBlockchain(new ArrayBlockchain_1.ArrayBlockchain(), new SqlIndex_1.SQLIndex(db, {
                    iindex: {
                        sqlFields: [
                            'name CHAR(1) NULL',
                            'status CHAR(2) NULL',
                            'writtenOn INTEGER NULL',
                            'events INTEGER NULL',
                            'member INTEGER NULL',
                            'expired INTEGER NULL'
                        ],
                        fields: [
                            'name',
                            'status',
                            'writtenOn',
                            'events',
                            'member',
                            'expired'
                        ],
                        booleans: ['member', 'expired']
                    },
                    zindex: {
                        sqlFields: [
                            'name CHAR(1) NULL',
                            'status CHAR(2) NULL',
                            'writtenOn INTEGER NULL',
                            'events INTEGER NULL',
                            'member INTEGER NULL',
                            'expired INTEGER NULL'
                        ],
                        fields: [
                            'name',
                            'status',
                            'writtenOn',
                            'events',
                            'member',
                            'expired'
                        ],
                        booleans: ['member', 'expired']
                    }
                }), 'writtenOn', {
                    iindex: {
                        pk: 'name',
                        remove: 'expired'
                    },
                    zindex: {
                        pk: 'name'
                    }
                });
            });
            it('should be able to index data', () => __awaiter(this, void 0, void 0, function* () {
                yield blockchain.recordIndex({
                    iindex: [
                        { name: 'A', status: 'OK', writtenOn: 23000, events: 0, member: false },
                        { name: 'A', status: 'OK', writtenOn: 23000, events: 4 },
                        { name: 'A', status: 'OK', writtenOn: 23000, events: 5, member: true },
                        { name: 'A', status: 'OK', writtenOn: 23601 },
                        { name: 'A', status: 'OK', writtenOn: 23888 },
                        { name: 'A', status: 'OK', writtenOn: 23889 },
                        { name: 'B', status: 'OK', writtenOn: 23000, events: 1, member: false },
                        { name: 'B', status: 'KO', writtenOn: 23000, events: null },
                        { name: 'C', status: 'KO', writtenOn: 23500 },
                        { name: 'D', status: 'KO', writtenOn: 23500 },
                        { name: 'D', status: 'KO', writtenOn: 23521, expired: true }
                    ]
                });
            }));
            it('should be able to reduce data', () => __awaiter(this, void 0, void 0, function* () {
                const reducedA = yield blockchain.indexReduce('iindex', { name: 'A' });
                const reducedB = yield blockchain.indexReduce('iindex', { name: 'B' });
                assert.deepEqual(reducedA, { name: 'A', status: 'OK', writtenOn: 23889, events: 5, member: true });
                assert.deepEqual(reducedB, { name: 'B', status: 'KO', writtenOn: 23000, events: 1, member: false });
            }));
            it('should be able to count data', () => __awaiter(this, void 0, void 0, function* () {
                const countAi = yield blockchain.indexCount('iindex', { name: 'A' });
                const countBi = yield blockchain.indexCount('iindex', { name: 'B' });
                const countCi = yield blockchain.indexCount('iindex', { name: 'C' });
                const countDi = yield blockchain.indexCount('iindex', { name: 'D' });
                const countBz = yield blockchain.indexCount('zindex', { name: 'B' });
                assert.equal(countAi, 6);
                assert.equal(countBi, 2);
                assert.equal(countCi, 1);
                assert.equal(countDi, 2);
                assert.equal(countBz, 0);
            }));
            it('should be able to reduce grouped data', () => __awaiter(this, void 0, void 0, function* () {
                const reducedBy = yield blockchain.indexReduceGroupBy('iindex', { writtenOn: 23000 }, ['name']);
                assert.deepEqual(reducedBy, [
                    { name: 'A', status: 'OK', writtenOn: 23000, events: 5, member: true },
                    { name: 'B', status: 'KO', writtenOn: 23000, events: 1, member: false }
                ]);
            }));
            it('should be able to trim data', () => __awaiter(this, void 0, void 0, function* () {
                // The number of records should decrease
                yield blockchain.indexTrim(23601);
                const countAi = yield blockchain.indexCount('iindex', { name: 'A' });
                const countBi = yield blockchain.indexCount('iindex', { name: 'B' });
                const countCi = yield blockchain.indexCount('iindex', { name: 'C' });
                const countDi = yield blockchain.indexCount('iindex', { name: 'D' });
                const countBz = yield blockchain.indexCount('zindex', { name: 'B' });
                assert.equal(countAi, 4);
                assert.equal(countBi, 1);
                assert.equal(countCi, 1);
                assert.equal(countDi, 0); // Expired = remove rows on trim
                assert.equal(countBz, 0);
                const reducedAi = yield blockchain.indexReduce('iindex', { name: 'A' });
                const reducedBi = yield blockchain.indexReduce('iindex', { name: 'B' });
                const reducedCi = yield blockchain.indexReduce('iindex', { name: 'C' });
                const reducedDi = yield blockchain.indexReduce('iindex', { name: 'D' });
                const reducedBz = yield blockchain.indexReduce('zindex', { name: 'B' });
                assert.deepEqual(reducedAi, { name: 'A', status: 'OK', writtenOn: 23889, events: 5, member: true });
                assert.deepEqual(reducedBi, { name: 'B', status: 'KO', writtenOn: 23000, events: 1, member: false });
                assert.deepEqual(reducedCi, { name: 'C', status: 'KO', writtenOn: 23500 });
                assert.deepEqual(reducedDi, {});
                assert.deepEqual(reducedBz, {});
            }));
        });
        describe('PK on two fields', () => {
            before(() => {
                const db = new sqlite(':memory:');
                blockchain = new IndexedBlockchain_1.IndexedBlockchain(new ArrayBlockchain_1.ArrayBlockchain(), new SqlIndex_1.SQLIndex(db, {
                    iindex: {
                        sqlFields: [
                            'id INTEGER NULL',
                            'pos INTEGER NULL',
                            'name CHAR(1) NULL',
                            'status CHAR(2) NULL',
                            'writtenOn INTEGER NULL',
                            'events INTEGER NULL',
                            'member INTEGER NULL',
                            'expired INTEGER NULL'
                        ],
                        fields: [
                            'id',
                            'pos',
                            'name',
                            'status',
                            'writtenOn',
                            'events',
                            'member',
                            'expired'
                        ],
                        booleans: ['member', 'expired']
                    },
                    zindex: {
                        sqlFields: [
                            'id INTEGER NULL',
                            'pos INTEGER NULL',
                            'name CHAR(1) NULL',
                            'status CHAR(2) NULL',
                            'writtenOn INTEGER NULL',
                            'events INTEGER NULL',
                            'member INTEGER NULL',
                            'expired INTEGER NULL'
                        ],
                        fields: [
                            'id',
                            'pos',
                            'name',
                            'status',
                            'writtenOn',
                            'events',
                            'member',
                            'expired'
                        ],
                        booleans: ['member', 'expired']
                    }
                }), 'writtenOn', {
                    iindex: {
                        pk: ['id', 'pos'],
                        remove: 'expired'
                    },
                    zindex: {
                        pk: 'name'
                    }
                });
            });
            it('should be able to index data', () => __awaiter(this, void 0, void 0, function* () {
                yield blockchain.recordIndex({
                    iindex: [
                        { id: 'A', pos: 0, status: 'OK', writtenOn: 23000, events: 0, member: false },
                        { id: 'A', pos: 0, status: 'OK', writtenOn: 23000, events: 4 },
                        { id: 'A', pos: 0, status: 'OK', writtenOn: 23000, events: 5, member: true },
                        { id: 'A', pos: 0, status: 'OK', writtenOn: 23601 },
                        { id: 'A', pos: 1, status: 'OK', writtenOn: 23888 },
                        { id: 'A', pos: 2, status: 'OK', writtenOn: 23889 },
                        { id: 'B', pos: 0, status: 'OK', writtenOn: 23000, events: 1, member: false },
                        { id: 'B', pos: 0, status: 'KO', writtenOn: 23000, events: null },
                        { id: 'C', pos: 0, status: 'KO', writtenOn: 23500 },
                        { id: 'D', pos: 0, status: 'KO', writtenOn: 23500 },
                        { id: 'D', pos: 1, status: 'KO', writtenOn: 23521, expired: true }
                    ]
                });
            }));
            it('should be able to reduce data', () => __awaiter(this, void 0, void 0, function* () {
                const reducedA = yield blockchain.indexReduce('iindex', { id: 'A', pos: 0 });
                const reducedB = yield blockchain.indexReduce('iindex', { id: 'B', pos: 0 });
                assert.deepEqual(reducedA, { id: 'A', pos: 0, status: 'OK', writtenOn: 23601, events: 5, member: true });
                assert.deepEqual(reducedB, { id: 'B', pos: 0, status: 'KO', writtenOn: 23000, events: 1, member: false });
            }));
            it('should be able to count data', () => __awaiter(this, void 0, void 0, function* () {
                const countAi = yield blockchain.indexCount('iindex', { id: 'A', pos: 0 });
                const countBi = yield blockchain.indexCount('iindex', { id: 'B', pos: 0 });
                const countCi = yield blockchain.indexCount('iindex', { id: 'C', pos: 0 });
                const countDi = yield blockchain.indexCount('iindex', { id: 'D', pos: 0 });
                const countBz = yield blockchain.indexCount('zindex', { id: 'B', pos: 0 });
                assert.equal(countAi, 4);
                assert.equal(countBi, 2);
                assert.equal(countCi, 1);
                assert.equal(countDi, 1);
                assert.equal(countBz, 0);
            }));
            it('should be able to reduce grouped data', () => __awaiter(this, void 0, void 0, function* () {
                const reducedBy = yield blockchain.indexReduceGroupBy('iindex', { writtenOn: 23000 }, ['id', 'pos']);
                assert.deepEqual(reducedBy, [
                    { id: 'A', pos: 0, status: 'OK', writtenOn: 23000, events: 5, member: true },
                    { id: 'B', pos: 0, status: 'KO', writtenOn: 23000, events: 1, member: false }
                ]);
            }));
            it('should be able to trim data', () => __awaiter(this, void 0, void 0, function* () {
                // The number of records should decrease
                yield blockchain.indexTrim(23601);
                const countAi = yield blockchain.indexCount('iindex', { id: 'A', pos: 0 });
                const countBi = yield blockchain.indexCount('iindex', { id: 'B', pos: 0 });
                const countCi = yield blockchain.indexCount('iindex', { id: 'C', pos: 0 });
                const countDi = yield blockchain.indexCount('iindex', { id: 'D', pos: 0 });
                const countBz = yield blockchain.indexCount('zindex', { id: 'B', pos: 0 });
                assert.equal(countAi, 2);
                assert.equal(countBi, 1);
                assert.equal(countCi, 1);
                assert.equal(countDi, 1); // Not expired!
                assert.equal(countBz, 0);
                const reducedAi = yield blockchain.indexReduce('iindex', { id: 'A', pos: 0 });
                const reducedBi = yield blockchain.indexReduce('iindex', { id: 'B', pos: 0 });
                const reducedCi = yield blockchain.indexReduce('iindex', { id: 'C', pos: 0 });
                const reducedDi = yield blockchain.indexReduce('iindex', { id: 'D', pos: 0 });
                const reducedBz = yield blockchain.indexReduce('zindex', { id: 'B', pos: 0 });
                assert.deepEqual(reducedAi, { id: 'A', pos: 0, status: 'OK', writtenOn: 23601, events: 5, member: true });
                assert.deepEqual(reducedBi, { id: 'B', pos: 0, status: 'KO', writtenOn: 23000, events: 1, member: false });
                assert.deepEqual(reducedCi, { id: 'C', pos: 0, status: 'KO', writtenOn: 23500 });
                assert.deepEqual(reducedDi, { id: 'D', pos: 0, status: 'KO', writtenOn: 23500 });
                assert.deepEqual(reducedBz, {});
            }));
        });
    });
});
//# sourceMappingURL=indexed-blockchain.js.map