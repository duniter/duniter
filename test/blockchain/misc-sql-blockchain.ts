"use strict";
import {MiscIndexedBlockchain} from "../../app/lib/blockchain/MiscIndexedBlockchain"
import {ArrayBlockchain} from "./lib/ArrayBlockchain"
import {SQLiteDriver} from "../../app/lib/dal/drivers/SQLiteDriver"
import {MIndexDAL} from "../../app/lib/dal/sqliteDAL/index/MIndexDAL";
import {IIndexDAL} from "../../app/lib/dal/sqliteDAL/index/IIndexDAL";
import {SIndexDAL} from "../../app/lib/dal/sqliteDAL/index/SIndexDAL";
import {CIndexDAL} from "../../app/lib/dal/sqliteDAL/index/CIndexDAL";
import {MetaDAL} from "../../app/lib/dal/sqliteDAL/MetaDAL";
import {ConfDTO} from "../../app/lib/dto/ConfDTO";

const assert = require('assert')

describe('MISC SQL Blockchain', () => {

  let blockchain:any

  before(async () => {

    const db = new SQLiteDriver(':memory:')

    const mindexDAL = new MIndexDAL(db)
    const iindexDAL = new IIndexDAL(db)
    const sindexDAL = new SIndexDAL(db)
    const cindexDAL = new CIndexDAL(db)
    const metaDAL = new MetaDAL(db)

    await iindexDAL.init()
    await mindexDAL.init()
    await sindexDAL.init()
    await cindexDAL.init()
    await metaDAL.init()
    // Ghost tables required for DB upgrade
    await metaDAL.exec('CREATE TABLE txs (id INTEGER null);')
    await metaDAL.exec('CREATE TABLE idty (id INTEGER null);')
    await metaDAL.exec('CREATE TABLE cert (id INTEGER null);')
    await metaDAL.exec('CREATE TABLE membership (id INTEGER null);')
    await metaDAL.exec('CREATE TABLE block (fork INTEGER null);')
    await metaDAL.exec('CREATE TABLE b_index (id INTEGER null);')
    await metaDAL.upgradeDatabase(ConfDTO.mock());

    blockchain = new MiscIndexedBlockchain(new ArrayBlockchain(), mindexDAL, iindexDAL, sindexDAL, cindexDAL)
  })

  describe('MINDEX', () => {

    it('should be able to index data', async () => {
      await blockchain.recordIndex({
        m_index: [
          { op: 'CREATE', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', writtenOn: 0, expires_on: 1520544727, expired_on: null, revokes_on: 1552102327, revoked_on: null, leaving: false, revocation: null, chainable_on: null },
          { op: 'UPDATE', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '3-0000611A1018A322624853A8AE10D0EBFF3C6AEE37BF4DE5354C720049C22BD1', writtenOn: 3, expires_on: 1520544728, expired_on: null, revokes_on: 1520544728, revoked_on: null, leaving: false, revocation: null, chainable_on: null },
          { op: 'UPDATE', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '4-0000090B7059E7BF5DD2CCA5E4F0330C1DA42C5DCBD2D1364B99B3FF89DE6744', writtenOn: 4, expires_on: 1520544729, expired_on: null, revokes_on: 1520544729, revoked_on: null, leaving: false, revocation: null, chainable_on: null }
        ]
      })
    })

    it('should be able to reduce data', async () => {
      const reducedG5 = await blockchain.indexReduce('m_index', { pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT' })
      assert.deepEqual(reducedG5, { op: 'UPDATE', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '4-0000090B7059E7BF5DD2CCA5E4F0330C1DA42C5DCBD2D1364B99B3FF89DE6744', writtenOn: 4, expires_on: 1520544729, revokes_on: 1520544729, leaving: false })
    })

    it('should be able to count data', async () => {
      const countG5 = await blockchain.indexCount('m_index', { pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT' })
      assert.equal(countG5, 3)
    })

    it('should be able to reduce grouped data', async () => {
      const reducedBy = await blockchain.indexReduceGroupBy('m_index', { created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855' }, ['op', 'pub'])
      assert.deepEqual(reducedBy, [
        { op: 'CREATE', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', writtenOn: 0, expires_on: 1520544727, revokes_on: 1552102327, leaving: false },
        { op: 'UPDATE', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '4-0000090B7059E7BF5DD2CCA5E4F0330C1DA42C5DCBD2D1364B99B3FF89DE6744', writtenOn: 4, expires_on: 1520544729, revokes_on: 1520544729, leaving: false }
      ])
    })

    it('should be able to trim data', async () => {
      // The number of records should decrease
      await blockchain.indexTrim(4)
      const countG5 = await blockchain.indexCount('m_index', { pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT' })
      assert.equal(countG5, 2)
      const reducedG5 = await blockchain.indexReduce('m_index', { pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT' })
      assert.deepEqual(reducedG5, { op: 'UPDATE', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '4-0000090B7059E7BF5DD2CCA5E4F0330C1DA42C5DCBD2D1364B99B3FF89DE6744', writtenOn: 4, expires_on: 1520544729, revokes_on: 1520544729, leaving: false })
    })
  })

  describe('IINDEX', () => {

    it('should be able to index data', async () => {
      await blockchain.recordIndex({
        i_index: [
          { op: 'CREATE', uid: 'pseudo', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', hash: '1505A45A5EEBFC3AFAD1475A4739C8447A79420A83340559CE5A49F9891167BB', sig: '2vfmih7xhW/QLJ85PZH1Tc6j5fooIXca+yr/esnt0yvdk5LhEKrOB32JFqCctAoRNwpRjBdZ2Q8l15+In1rrDg==', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',     writtenOn: 0,     member: true,  wasMember: true, kick: false, wotb_id: 164 },
          { op: 'UPDATE', uid: 'pseudo', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', hash: '1505A45A5EEBFC3AFAD1475A4739C8447A79420A83340559CE5A49F9891167BB', sig: '2vfmih7xhW/QLJ85PZH1Tc6j5fooIXca+yr/esnt0yvdk5LhEKrOB32JFqCctAoRNwpRjBdZ2Q8l15+In1rrDg==', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '33396-000009C936CD6F7C5672C1E6D36159E0BEA2B394F386CA0EBA7E73662A09BB43', writtenOn: 33396, member: false, wasMember: true, kick: false, wotb_id: 164 },
          { op: 'UPDATE', uid: 'pseudo', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', hash: '1505A45A5EEBFC3AFAD1475A4739C8447A79420A83340559CE5A49F9891167BB', sig: '2vfmih7xhW/QLJ85PZH1Tc6j5fooIXca+yr/esnt0yvdk5LhEKrOB32JFqCctAoRNwpRjBdZ2Q8l15+In1rrDg==', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '40000-000006C311D2677D101116287718395A2CBB7B94389004D19B0E4AC6DCE2DE5F', writtenOn: 40000, member: true,  wasMember: true, kick: false, wotb_id: 164 }
        ]
      })
    })

    it('should be able to reduce data', async () => {
      const reducedG5 = await blockchain.indexReduce('i_index', { pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT' })
      assert.deepEqual(reducedG5, { op: 'UPDATE', uid: 'pseudo', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', hash: '1505A45A5EEBFC3AFAD1475A4739C8447A79420A83340559CE5A49F9891167BB', sig: '2vfmih7xhW/QLJ85PZH1Tc6j5fooIXca+yr/esnt0yvdk5LhEKrOB32JFqCctAoRNwpRjBdZ2Q8l15+In1rrDg==', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '40000-000006C311D2677D101116287718395A2CBB7B94389004D19B0E4AC6DCE2DE5F', writtenOn: 40000, member: true,  wasMember: true, kick: false, wotb_id: 164 })
    })

    it('should be able to count data', async () => {
      const countG5 = await blockchain.indexCount('i_index', { pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT' })
      assert.equal(countG5, 3)
    })

    it('should be able to reduce grouped data', async () => {
      const reducedBy = await blockchain.indexReduceGroupBy('i_index', { created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855' }, ['op', 'pub'])
      assert.deepEqual(reducedBy, [
        { op: 'CREATE', uid: 'pseudo', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', hash: '1505A45A5EEBFC3AFAD1475A4739C8447A79420A83340559CE5A49F9891167BB', sig: '2vfmih7xhW/QLJ85PZH1Tc6j5fooIXca+yr/esnt0yvdk5LhEKrOB32JFqCctAoRNwpRjBdZ2Q8l15+In1rrDg==', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',     writtenOn: 0,     member: true,  wasMember: true, kick: false, wotb_id: 164 },
        { op: 'UPDATE', uid: 'pseudo', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', hash: '1505A45A5EEBFC3AFAD1475A4739C8447A79420A83340559CE5A49F9891167BB', sig: '2vfmih7xhW/QLJ85PZH1Tc6j5fooIXca+yr/esnt0yvdk5LhEKrOB32JFqCctAoRNwpRjBdZ2Q8l15+In1rrDg==', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '40000-000006C311D2677D101116287718395A2CBB7B94389004D19B0E4AC6DCE2DE5F', writtenOn: 40000, member: true,  wasMember: true, kick: false, wotb_id: 164 }
      ])
    })

    it('should be able to trim data', async () => {
      // The number of records should decrease
      await blockchain.indexTrim(40000)
      const countG5 = await blockchain.indexCount('i_index', { pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT' })
      assert.equal(countG5, 2)
      const reducedG5 = await blockchain.indexReduce('i_index', { pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT' })
      assert.deepEqual(reducedG5, { op: 'UPDATE', uid: 'pseudo', pub: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', hash: '1505A45A5EEBFC3AFAD1475A4739C8447A79420A83340559CE5A49F9891167BB', sig: '2vfmih7xhW/QLJ85PZH1Tc6j5fooIXca+yr/esnt0yvdk5LhEKrOB32JFqCctAoRNwpRjBdZ2Q8l15+In1rrDg==', created_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', written_on: '40000-000006C311D2677D101116287718395A2CBB7B94389004D19B0E4AC6DCE2DE5F', writtenOn: 40000, member: true,  wasMember: true, kick: false, wotb_id: 164 })
    })
  })

  describe('SINDEX', () => {

    it('should be able to index data', async () => {
      await blockchain.recordIndex({
        s_index: [
          // Dividend
          { op: 'CREATE', tx: null, identifier: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', pos: 35820, created_on: null, written_on: '35820-00000B363BC8F761EB5343660592D50B872FE1140B350C9780EF5BC6F9DD000B', writtenOn: 35820, written_time: 1500000000, amount: 500, base: 0, locktime: 0, consumed: false, conditions: 'SIG(CPEaW4BGNaBdx6FbAxjNQ9Po2apnX2bDvBXJT9yaZUMc)' },
          { op: 'UPDATE', tx: null, identifier: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', pos: 35820, created_on: null, written_on: '35821-0000053C7B54AEFAEC4FCFB2763202ECD8382A635340BD622EDBC0CCC553F763', writtenOn: 35821, written_time: 1500000001, amount: 500, base: 0, locktime: 0, consumed: true,  conditions: 'SIG(CPEaW4BGNaBdx6FbAxjNQ9Po2apnX2bDvBXJT9yaZUMc)' },
          // Transaction
          { op: 'CREATE', tx: 'D01432C6D7D078CB566C08886FD92CA5D158433D7A8D971124973625BFAB78D9', identifier: 'D01432C6D7D078CB566C08886FD92CA5D158433D7A8D971124973625BFAB78D9', pos: 1, created_on: '33958-0000009CEC38916882EF46C40069EF227F1D7CB4B34EAD5298D84B6658FBB9FB', written_on: '30196-00000A8ABF13284452CD56C9DEC68124D4A31CE1BDD06819EB22E070EBDE1D2D', writtenOn: 30196, written_time: 1499000000, amount: 301, base: 0, locktime: 0, consumed: false, conditions: 'SIG(CPEaW4BGNaBdx6FbAxjNQ9Po2apnX2bDvBXJT9yaZUMc)' },
          { op: 'UPDATE', tx: '3926D234037264654D9C4A2D44CDDC18998DC48262F3677F23DA5BA81BD530EA', identifier: 'D01432C6D7D078CB566C08886FD92CA5D158433D7A8D971124973625BFAB78D9', pos: 1, created_on: '33958-0000009CEC38916882EF46C40069EF227F1D7CB4B34EAD5298D84B6658FBB9FB', written_on: '30197-0000009CEC38916882EF46C40069EF227F1D7CB4B34EAD5298D84B6658FBB9FB', writtenOn: 30197, written_time: 1499000001, amount: 301, base: 0, locktime: 0, consumed: true,  conditions: 'SIG(CPEaW4BGNaBdx6FbAxjNQ9Po2apnX2bDvBXJT9yaZUMc)' }
        ]
      })
    })

    it('should be able to reduce data', async () => {
      const reducedUD = await blockchain.indexReduce('s_index', { identifier: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', pos: 35820 })
      const reducedTX = await blockchain.indexReduce('s_index', { identifier: 'D01432C6D7D078CB566C08886FD92CA5D158433D7A8D971124973625BFAB78D9', pos: 1 })
      assert.deepEqual(reducedUD, { op: 'UPDATE', identifier: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', pos: 35820, written_on: '35821-0000053C7B54AEFAEC4FCFB2763202ECD8382A635340BD622EDBC0CCC553F763', writtenOn: 35821, written_time: 1500000001, amount: 500, base: 0, locktime: 0, consumed: true,  conditions: 'SIG(CPEaW4BGNaBdx6FbAxjNQ9Po2apnX2bDvBXJT9yaZUMc)' })
      assert.deepEqual(reducedTX, { op: 'UPDATE', tx: '3926D234037264654D9C4A2D44CDDC18998DC48262F3677F23DA5BA81BD530EA', identifier: 'D01432C6D7D078CB566C08886FD92CA5D158433D7A8D971124973625BFAB78D9', pos: 1, created_on: '33958-0000009CEC38916882EF46C40069EF227F1D7CB4B34EAD5298D84B6658FBB9FB', written_on: '30197-0000009CEC38916882EF46C40069EF227F1D7CB4B34EAD5298D84B6658FBB9FB', writtenOn: 30197, written_time: 1499000001, amount: 301, base: 0, locktime: 0, consumed: true,  conditions: 'SIG(CPEaW4BGNaBdx6FbAxjNQ9Po2apnX2bDvBXJT9yaZUMc)' })
    })

    it('should be able to count data', async () => {
      const countUD = await blockchain.indexCount('s_index', { identifier: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', pos: 35820 })
      const countTX = await blockchain.indexCount('s_index', { identifier: 'D01432C6D7D078CB566C08886FD92CA5D158433D7A8D971124973625BFAB78D9', pos: 1 })
      assert.equal(countUD, 2)
      assert.equal(countTX, 2)
    })

    it('should be able to reduce grouped data', async () => {
      const reducedBy = await blockchain.indexReduceGroupBy('s_index', { pos: { $gt: 0 } }, ['identifier', 'pos'])
      assert.deepEqual(reducedBy, [
        { op: 'UPDATE', tx: '3926D234037264654D9C4A2D44CDDC18998DC48262F3677F23DA5BA81BD530EA', identifier: 'D01432C6D7D078CB566C08886FD92CA5D158433D7A8D971124973625BFAB78D9', pos: 1, created_on: '33958-0000009CEC38916882EF46C40069EF227F1D7CB4B34EAD5298D84B6658FBB9FB', written_on: '30197-0000009CEC38916882EF46C40069EF227F1D7CB4B34EAD5298D84B6658FBB9FB', writtenOn: 30197, written_time: 1499000001, amount: 301, base: 0, locktime: 0, consumed: true,  conditions: 'SIG(CPEaW4BGNaBdx6FbAxjNQ9Po2apnX2bDvBXJT9yaZUMc)' },
        { op: 'UPDATE', identifier: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', pos: 35820, written_on: '35821-0000053C7B54AEFAEC4FCFB2763202ECD8382A635340BD622EDBC0CCC553F763', writtenOn: 35821, written_time: 1500000001, amount: 500, base: 0, locktime: 0, consumed: true,  conditions: 'SIG(CPEaW4BGNaBdx6FbAxjNQ9Po2apnX2bDvBXJT9yaZUMc)' }
      ])
    })

    it('should be able to trim data', async () => {
      // The number of records should decrease
      await blockchain.indexTrim(35000)
      const countUD = await blockchain.indexCount('s_index', { identifier: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', pos: 35820 })
      const countTX = await blockchain.indexCount('s_index', { identifier: 'D01432C6D7D078CB566C08886FD92CA5D158433D7A8D971124973625BFAB78D9', pos: 1 })
      assert.equal(countUD, 2)
      assert.equal(countTX, 0) // This index removes the lines marked `consumed`
      const reducedUD = await blockchain.indexReduce('s_index', { identifier: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', pos: 35820 })
      assert.deepEqual(reducedUD, { op: 'UPDATE', identifier: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', pos: 35820, written_on: '35821-0000053C7B54AEFAEC4FCFB2763202ECD8382A635340BD622EDBC0CCC553F763', writtenOn: 35821, written_time: 1500000001, amount: 500, base: 0, locktime: 0, consumed: true,  conditions: 'SIG(CPEaW4BGNaBdx6FbAxjNQ9Po2apnX2bDvBXJT9yaZUMc)' })
    })
  })

  describe('CINDEX', () => {

    it('should be able to index data', async () => {
      await blockchain.recordIndex({
        c_index: [
          { op: 'CREATE', issuer: 'D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 0,  written_on: '0-E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',  writtenOn: 0,  sig: 'MYWlBd2Hw3T/59BDz9HZECBuZ984C23F5lqUGluIUXsvXjsY4xKNqcN2x75s9rn++u4GEzZov6OznLZiHtbAAQ==', expires_on: 1552102327, expired_on: 0,          chainable_on: 1489419127 },
          { op: 'UPDATE', issuer: 'D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 0,  written_on: '9-0000092C94D0257C61A2504092440600487B2C8BEE73F9C8763C9F351543887D',  writtenOn: 9,  sig: 'MYWlBd2Hw3T/59BDz9HZECBuZ984C23F5lqUGluIUXsvXjsY4xKNqcN2x75s9rn++u4GEzZov6OznLZiHtbAAQ==', expires_on: 1552102327, expired_on: 1552102400, chainable_on: 1489419127 },
          { op: 'CREATE', issuer: 'EV4yZXAgmDd9rMsRCSH2MK7RHWty7CDB9tmHku3iRnEB', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 11, written_on: '11-000019EC1161FC9FB1848A58A3137B9CD9A919E86B2394B9682BBC3FADB1AF1F', writtenOn: 11, sig: 'plFuA1vgXJh0CQ9MVCmOgfTfFb5u3qICMfgxVJEsyco+lmZTxaKuruSsRdhw3YZgJgfU6YwC+ta/RcgLF6DvDA==', expires_on: 1556866334, expired_on: 0,          chainable_on: 1494184082}
        ]
      })
    })

    it('should be able to reduce data', async () => {
      const reducedC1 = await blockchain.indexReduce('c_index', { issuer: 'D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 0 })
      const reducedC2 = await blockchain.indexReduce('c_index', { issuer: 'EV4yZXAgmDd9rMsRCSH2MK7RHWty7CDB9tmHku3iRnEB', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 11 })
      assert.deepEqual(reducedC1, { op: 'UPDATE', issuer: 'D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 0,  written_on: '9-0000092C94D0257C61A2504092440600487B2C8BEE73F9C8763C9F351543887D',  writtenOn: 9,  sig: 'MYWlBd2Hw3T/59BDz9HZECBuZ984C23F5lqUGluIUXsvXjsY4xKNqcN2x75s9rn++u4GEzZov6OznLZiHtbAAQ==', expires_on: 1552102327, expired_on: 1552102400, chainable_on: 1489419127 })
      assert.deepEqual(reducedC2, { op: 'CREATE', issuer: 'EV4yZXAgmDd9rMsRCSH2MK7RHWty7CDB9tmHku3iRnEB', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 11, written_on: '11-000019EC1161FC9FB1848A58A3137B9CD9A919E86B2394B9682BBC3FADB1AF1F', writtenOn: 11, sig: 'plFuA1vgXJh0CQ9MVCmOgfTfFb5u3qICMfgxVJEsyco+lmZTxaKuruSsRdhw3YZgJgfU6YwC+ta/RcgLF6DvDA==', expires_on: 1556866334, expired_on: 0,          chainable_on: 1494184082})
    })

    it('should be able to count data', async () => {
      const countC1 = await blockchain.indexCount('c_index', { issuer: 'D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 0 })
      const countC2 = await blockchain.indexCount('c_index', { issuer: 'EV4yZXAgmDd9rMsRCSH2MK7RHWty7CDB9tmHku3iRnEB', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 11 })
      assert.equal(countC1, 2)
      assert.equal(countC2, 1)
    })

    it('should be able to reduce grouped data', async () => {
      const reducedBy = await blockchain.indexReduceGroupBy('c_index', { created_on: { $gte: 0 } }, ['issuer', 'receiver', 'created_on'])
      assert.deepEqual(reducedBy, [
        { op: 'UPDATE', issuer: 'D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 0,  written_on: '9-0000092C94D0257C61A2504092440600487B2C8BEE73F9C8763C9F351543887D',  writtenOn: 9,  sig: 'MYWlBd2Hw3T/59BDz9HZECBuZ984C23F5lqUGluIUXsvXjsY4xKNqcN2x75s9rn++u4GEzZov6OznLZiHtbAAQ==', expires_on: 1552102327, expired_on: 1552102400, chainable_on: 1489419127 },
        { op: 'CREATE', issuer: 'EV4yZXAgmDd9rMsRCSH2MK7RHWty7CDB9tmHku3iRnEB', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 11, written_on: '11-000019EC1161FC9FB1848A58A3137B9CD9A919E86B2394B9682BBC3FADB1AF1F', writtenOn: 11, sig: 'plFuA1vgXJh0CQ9MVCmOgfTfFb5u3qICMfgxVJEsyco+lmZTxaKuruSsRdhw3YZgJgfU6YwC+ta/RcgLF6DvDA==', expires_on: 1556866334, expired_on: 0,          chainable_on: 1494184082}
      ])
    })

    it('should be able to trim data', async () => {
      // The number of records should decrease
      await blockchain.indexTrim(10)
      const countC1 = await blockchain.indexCount('c_index', { issuer: 'D9D2zaJoWYWveii1JRYLVK3J4Z7ZH3QczoKrnQeiM6mx', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 0 })
      const countC2 = await blockchain.indexCount('c_index', { issuer: 'EV4yZXAgmDd9rMsRCSH2MK7RHWty7CDB9tmHku3iRnEB', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 11 })
      assert.equal(countC1, 0) // This index removes the lines marked `expired_on`
      assert.equal(countC2, 1)
      const reducedC2 = await blockchain.indexReduce('c_index', { issuer: 'EV4yZXAgmDd9rMsRCSH2MK7RHWty7CDB9tmHku3iRnEB', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 11 })
      assert.deepEqual(reducedC2, { op: 'CREATE', issuer: 'EV4yZXAgmDd9rMsRCSH2MK7RHWty7CDB9tmHku3iRnEB', receiver: 'G5P7k5t764ybGfFGLnEAwwMDz6y2U4afagAmyJXgKFyT', created_on: 11, written_on: '11-000019EC1161FC9FB1848A58A3137B9CD9A919E86B2394B9682BBC3FADB1AF1F', writtenOn: 11, sig: 'plFuA1vgXJh0CQ9MVCmOgfTfFb5u3qICMfgxVJEsyco+lmZTxaKuruSsRdhw3YZgJgfU6YwC+ta/RcgLF6DvDA==', expires_on: 1556866334, expired_on: 0,          chainable_on: 1494184082})
    })
  })

})
