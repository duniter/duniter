//  Copyright (C) 2020 Éloïs SANCHEZ.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use dubp_common::crypto::keys::ed25519::PublicKey;
use dubp_common::crypto::keys::PublicKey as _;
use dubp_common::prelude::*;
use duniter_dbs::kv_typed::prelude::*;
use duniter_dbs::{
    BcV1Db, BcV1DbReadable, BcV1DbWritable, BlockDbV1, BlockNumberKeyV1, MainBlockEvent,
    PublicKeySingletonDbV1, Result, UidKeyV1,
};
use kv_typed::channel::TryRecvError;
use std::str::FromStr;
use tempdir::TempDir;
use unwrap::unwrap;

#[test]
fn write_read_delete_b0_leveldb() -> Result<()> {
    let tmp_dir = unwrap!(TempDir::new("write_read_delete_b0_leveldb"));

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(tmp_dir.path().to_owned()))?;

    write_read_delete_b0_test(&db)
}

#[test]
fn write_read_delete_b0_sled() -> Result<()> {
    let db = BcV1Db::<Sled>::open(SledConf::new().temporary(true))?;

    write_read_delete_b0_test(&db)
}

#[test]
fn iter_test_leveldb() -> Result<()> {
    let tmp_dir = unwrap!(TempDir::new("batch_test_leveldb"));

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(tmp_dir.path().to_owned()))?;

    write_some_entries_and_iter(&db)
}

#[test]
fn iter_test_mem() -> Result<()> {
    let db = BcV1Db::<Mem>::open(MemConf::default())?;

    write_some_entries_and_iter(&db)
}

#[test]
fn iter_test_sled() -> Result<()> {
    let db = BcV1Db::<Sled>::open(SledConf::new().temporary(true))?;

    write_some_entries_and_iter(&db)
}

#[test]
fn batch_test_leveldb() -> Result<()> {
    let tmp_dir = unwrap!(TempDir::new("batch_test_leveldb"));

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(tmp_dir.path().to_owned()))?;

    batch_test(&db)
}

#[test]
fn batch_test_mem() -> Result<()> {
    let db = BcV1Db::<Mem>::open(MemConf::default())?;

    batch_test(&db)
}

#[test]
fn batch_test_sled() -> Result<()> {
    let db = BcV1Db::<Sled>::open(SledConf::new().temporary(true))?;

    batch_test(&db)
}

fn write_read_delete_b0_test<B: Backend>(db: &BcV1Db<B>) -> Result<()> {
    let main_blocks_reader = db.main_blocks();

    let (subscriber, events_recv) = kv_typed::channel::unbounded();

    main_blocks_reader.subscribe(subscriber)?;

    // Empty db
    assert_eq!(
        main_blocks_reader.get(&BlockNumberKeyV1(BlockNumber(0)))?,
        None
    );
    assert_eq!(
        main_blocks_reader.get(&BlockNumberKeyV1(BlockNumber(1)))?,
        None
    );
    assert_eq!(main_blocks_reader.iter(..).keys().next_res()?, None);
    assert_eq!(main_blocks_reader.iter(..).values().next_res()?, None);
    if let Err(TryRecvError::Empty) = events_recv.try_recv() {
    } else {
        panic!("should not receive event");
    }

    // Insert b0
    let b0 = BlockDbV1::default();
    let main_blocks_writer = db.main_blocks_write();
    main_blocks_writer.upsert(BlockNumberKeyV1(BlockNumber(0)), b0.clone())?;
    assert_eq!(
        main_blocks_reader
            .get(&BlockNumberKeyV1(BlockNumber(0)))?
            .as_ref(),
        Some(&b0)
    );
    assert_eq!(
        main_blocks_reader.get(&BlockNumberKeyV1(BlockNumber(1)))?,
        None
    );
    let mut keys_iter = main_blocks_reader.iter(..).keys();
    assert_eq!(
        keys_iter.next_res()?,
        Some(BlockNumberKeyV1(BlockNumber(0)))
    );
    assert_eq!(keys_iter.next_res()?, None);
    let mut values_iter = main_blocks_reader.iter(..).values();
    assert_eq!(values_iter.next_res()?, Some(b0.clone()));
    assert_eq!(values_iter.next_res()?, None);
    if let Ok(events) = events_recv.try_recv() {
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(
            event,
            &MainBlockEvent::Upsert {
                key: BlockNumberKeyV1(BlockNumber(0)),
                value: b0,
            },
        );
    } else {
        panic!("should receive event");
    }

    // Delete b0
    main_blocks_writer.remove(BlockNumberKeyV1(BlockNumber(0)))?;
    assert_eq!(
        main_blocks_reader.get(&BlockNumberKeyV1(BlockNumber(0)))?,
        None
    );
    assert_eq!(
        main_blocks_reader.get(&BlockNumberKeyV1(BlockNumber(1)))?,
        None
    );
    assert_eq!(main_blocks_reader.iter(..).keys().next_res()?, None);
    assert_eq!(main_blocks_reader.iter(..).values().next_res()?, None);
    if let Ok(events) = events_recv.try_recv() {
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(
            event,
            &MainBlockEvent::Remove {
                key: BlockNumberKeyV1(BlockNumber(0)),
            },
        );
    } else {
        panic!("should receive event");
    }

    Ok(())
}

fn write_some_entries_and_iter<B: Backend>(db: &BcV1Db<B>) -> Result<()> {
    let k1 = unwrap!(UidKeyV1::from_str("titi"));
    let p1 = PublicKeySingletonDbV1(unwrap!(PublicKey::from_base58(
        "42jMJtb8chXrpHMAMcreVdyPJK7LtWjEeRqkPw4eSEVp"
    )));
    let k2 = unwrap!(UidKeyV1::from_str("titu"));
    let p2 = PublicKeySingletonDbV1(unwrap!(PublicKey::from_base58(
        "D7CYHJXjaH4j7zRdWngUbsURPnSnjsCYtvo6f8dvW3C"
    )));
    let k3 = unwrap!(UidKeyV1::from_str("toto"));
    let p3 = PublicKeySingletonDbV1(unwrap!(PublicKey::from_base58(
        "8B5XCAHknsckCkMWeGF9FoGibSNZXF9HtAvzxzg3bSyp"
    )));
    let uids_writer = db.uids_write();
    uids_writer.upsert(k1, p1)?;
    uids_writer.upsert(k2, p2)?;
    uids_writer.upsert(k3, p3)?;

    let uids_reader = db.uids();
    {
        let mut values_iter_step_2 = uids_reader.iter(..).values().step_by(2);
        assert_eq!(Some(p1), values_iter_step_2.next_res()?);
        assert_eq!(Some(p3), values_iter_step_2.next_res()?);
        assert_eq!(None, values_iter_step_2.next_res()?);

        let mut entries_iter_step_2 = uids_reader.iter(..).step_by(2);
        assert_eq!(Some((k1, p1)), entries_iter_step_2.next_res()?);
        assert_eq!(Some((k3, p3)), entries_iter_step_2.next_res()?);
        assert_eq!(None, entries_iter_step_2.next_res()?);

        let mut entries_iter = uids_reader.iter(k2..);
        assert_eq!(Some((k2, p2)), entries_iter.next_res()?);
        assert_eq!(Some((k3, p3)), entries_iter.next_res()?);
        assert_eq!(None, entries_iter.next_res()?);

        let mut entries_iter = uids_reader.iter(..=k2);
        assert_eq!(Some((k1, p1)), entries_iter.next_res()?);
        assert_eq!(Some((k2, p2)), entries_iter.next_res()?);
        assert_eq!(None, entries_iter.next_res()?);

        let mut entries_iter_rev = uids_reader.iter(k2..).reverse();
        assert_eq!(Some((k3, p3)), entries_iter_rev.next_res()?);
        assert_eq!(Some((k2, p2)), entries_iter_rev.next_res()?);
        assert_eq!(None, entries_iter_rev.next_res()?);

        let mut entries_iter_rev = uids_reader.iter(..=k2).reverse();
        assert_eq!(Some((k2, p2)), entries_iter_rev.next_res()?);
        assert_eq!(Some((k1, p1)), entries_iter_rev.next_res()?);
        assert_eq!(None, entries_iter.next_res()?);

        let mut keys_iter_rev = uids_reader.iter(..=k2).keys().reverse();
        assert_eq!(Some(k2), keys_iter_rev.next_res()?);
        assert_eq!(Some(k1), keys_iter_rev.next_res()?);
        assert_eq!(None, keys_iter_rev.next_res()?);
    }

    uids_writer.remove(k3)?;

    let mut keys_iter_rev = uids_reader.iter(..).keys();
    assert_eq!(Some(k1), keys_iter_rev.next_res()?);
    assert_eq!(Some(k2), keys_iter_rev.next_res()?);
    assert_eq!(None, keys_iter_rev.next_res()?);

    Ok(())
}

fn batch_test<B: Backend>(db: &BcV1Db<B>) -> Result<()> {
    let main_blocks_reader = db.main_blocks();

    let mut batch = db.new_batch();

    let (subscriber, events_recv) = kv_typed::channel::unbounded();

    main_blocks_reader.subscribe(subscriber)?;

    // Empty db
    assert_eq!(
        main_blocks_reader.get(&BlockNumberKeyV1(BlockNumber(0)))?,
        None
    );
    assert_eq!(
        main_blocks_reader.get(&BlockNumberKeyV1(BlockNumber(1)))?,
        None
    );
    assert_eq!(main_blocks_reader.iter(..).keys().next_res()?, None);
    assert_eq!(main_blocks_reader.iter(..).values().next_res()?, None);
    if let Err(TryRecvError::Empty) = events_recv.try_recv() {
    } else {
        panic!("should not receive event");
    }

    // Insert b0 in batch
    let b0 = BlockDbV1::default();
    batch
        .main_blocks()
        .upsert(BlockNumberKeyV1(BlockNumber(0)), b0.clone());

    // bo should written in batch
    assert_eq!(
        batch.main_blocks().get(&BlockNumberKeyV1(BlockNumber(0))),
        Some(&b0)
    );

    // bo should not written in db
    assert_eq!(
        db.main_blocks().get(&BlockNumberKeyV1(BlockNumber(0)))?,
        None
    );

    if let Err(TryRecvError::Empty) = events_recv.try_recv() {
    } else {
        panic!("should not receive event");
    }

    // Insert b1 in batch
    let b1 = BlockDbV1 {
        number: 1,
        ..Default::default()
    };
    batch
        .main_blocks()
        .upsert(BlockNumberKeyV1(BlockNumber(1)), b1.clone());

    // Write batch in db
    db.write_batch(batch)?;

    // bo should written in db
    assert_eq!(
        db.main_blocks()
            .get(&BlockNumberKeyV1(BlockNumber(0)))?
            .as_ref(),
        Some(&b0)
    );
    let mut keys_iter = db.main_blocks().iter(..).keys();
    assert_eq!(
        keys_iter.next_res()?,
        Some(BlockNumberKeyV1(BlockNumber(0)))
    );
    assert_eq!(
        keys_iter.next_res()?,
        Some(BlockNumberKeyV1(BlockNumber(1)))
    );
    assert_eq!(keys_iter.next_res()?, None);
    let mut values_iter = db.main_blocks().iter(..).values();
    assert_eq!(values_iter.next_res()?.as_ref(), Some(&b0));
    assert_eq!(values_iter.next_res()?.as_ref(), Some(&b1));
    assert_eq!(values_iter.next_res()?, None);
    if let Ok(events) = events_recv.try_recv() {
        assert_eq!(events.len(), 2);
        assert!(assert_eq_pairs(
            [&events[0], &events[1]],
            [
                &MainBlockEvent::Upsert {
                    key: BlockNumberKeyV1(BlockNumber(0)),
                    value: b0,
                },
                &MainBlockEvent::Upsert {
                    key: BlockNumberKeyV1(BlockNumber(1)),
                    value: b1,
                }
            ]
        ));
    } else {
        panic!("should receive event");
    }

    Ok(())
}

fn assert_eq_pairs<T: PartialEq>(a: [T; 2], b: [T; 2]) -> bool {
    (a[0] == b[0] && a[1] == b[1]) || (a[1] == b[0] && a[0] == b[1])
}
