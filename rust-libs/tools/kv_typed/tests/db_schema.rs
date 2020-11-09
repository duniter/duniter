mod tests {
    use kv_typed::prelude::*;
    use smallvec::SmallVec;
    use std::fmt::Debug;

    #[derive(Clone, Debug, PartialEq)]
    pub struct VecU128(Vec<u128>);
    kv_typed::impl_value_for_vec_zc!(VecU128, u128);

    #[derive(Clone, Debug, PartialEq)]
    pub struct SVecU128(SmallVec<[u128; 4]>);
    kv_typed::impl_value_for_smallvec_zc!(SVecU128, u128, 4);

    use std::collections::BTreeSet;
    #[derive(Clone, Debug, PartialEq)]
    pub struct BTSetU128(BTreeSet<u128>);
    kv_typed::impl_value_for_btreeset_zc!(BTSetU128, u128);

    use std::collections::HashSet;
    #[derive(Clone, Debug, PartialEq)]
    pub struct HashSetU128(HashSet<u128>);
    kv_typed::impl_value_for_hashset_zc!(HashSetU128, u128);

    db_schema!(
        TestV1,
        [
            ["c1", col_1, i32, String,],
            ["c2", col_2, usize, EmptyValue,],
            ["c3", col_3, u64, VecU128],
            ["c4", col_4, u64, BTSetU128],
        ]
    );

    #[cfg(feature = "lmdb_backend")]
    #[test]
    fn test_db_schema_lmdb() -> KvResult<()> {
        let tmp_dir = unwrap::unwrap!(tempdir::TempDir::new("kv_typed_lmdb"));
        let db = TestV1Db::<kv_typed::backend::lmdb::Lmdb>::open(
            kv_typed::backend::lmdb::LmdbConf::default().folder_path(tmp_dir.path().to_owned()),
        )?;

        test_db_schema(&db)
    }

    #[test]
    fn test_db_schema_mem() -> KvResult<()> {
        let db = TestV1Db::<kv_typed::backend::memory::Mem>::open(
            kv_typed::backend::memory::MemConf::default(),
        )?;

        test_db_schema(&db)
    }

    //#[cfg(feature = "sled_backend")]
    #[test]
    fn test_db_schema_sled() -> KvResult<()> {
        let db = TestV1Db::<Sled>::open(SledConf::default().temporary(true))?;

        test_db_schema(&db)
    }

    fn test_db_schema<B: Backend>(db: &TestV1Db<B>) -> KvResult<()> {
        let (sender, recv) = kv_typed::channel::unbounded();
        db.col_1().subscribe(sender)?;

        let db2 = db.clone();

        let handler = std::thread::spawn(move || db2.col_1_write().upsert(3, "toto".to_owned()));
        handler.join().expect("thread panic")?;

        let expected_events: Events<Col1Event> = smallvec::smallvec![Col1Event::Upsert {
            key: 3,
            value: "toto".to_owned(),
        }];
        if let Ok(msg) = recv.recv() {
            assert_eq!(msg.as_ref(), &expected_events,)
        } else {
            panic!("must be receive event")
        }

        assert_eq!(db.col_1().get(&3)?, Some("toto".to_owned()),);
        let d = db.col_1().get_ref_slice(&3, |bytes| {
            let str_ = unsafe { core::str::from_utf8_unchecked(bytes) };
            assert_eq!("toto", str_);
            assert_eq!(db.col_2().get(&3)?, None,);
            Ok(str_.to_owned())
        })?;
        assert_eq!(d, Some("toto".to_owned()));

        assert_eq!(db.col_2().get(&3)?, None,);
        db.col_2_write().upsert(3, EmptyValue)?;
        assert_eq!(db.col_2().get(&3)?, Some(EmptyValue),);

        db.col_1_write().upsert(5, "tutu".to_owned())?;

        db.col_1().iter(.., |mut iter| {
            assert_eq!(iter.next_res()?, Some((3, "toto".to_owned())));
            assert_eq!(iter.next_res()?, Some((5, "tutu".to_owned())));
            assert_eq!(iter.next_res()?, None);
            Ok::<(), KvError>(())
        })?;

        db.col_1().iter(.., |it| {
            let mut iter = it.values().reverse();

            assert_eq!(iter.next_res()?, Some("tutu".to_owned()));
            assert_eq!(iter.next_res()?, Some("toto".to_owned()));
            assert_eq!(iter.next_res()?, None);
            Ok::<(), KvError>(())
        })?;

        db.col_1_write().upsert(7, "titi".to_owned())?;

        db.col_1().iter(.., |it| {
            let mut iter = it.values().reverse().step_by(2);

            assert_eq!(iter.next_res()?, Some("titi".to_owned()));
            assert_eq!(iter.next_res()?, Some("toto".to_owned()));
            assert_eq!(iter.next_res()?, None);

            Ok::<(), KvError>(())
        })?;

        db.col_3_write().upsert(4, VecU128(vec![1, 2, 3]))?;
        db.col_3().get_ref_slice(&4, |numbers| {
            assert_eq!(numbers, &[1, 2, 3]);
            Ok(())
        })?;

        // Test get_ref_slice
        use std::iter::FromIterator as _;
        db.col_4_write().upsert(
            4,
            BTSetU128(BTreeSet::from_iter((&[3, 2, 4, 1]).iter().copied())),
        )?;
        db.col_4().get_ref_slice(&4, |numbers| {
            assert_eq!(numbers, &[1, 2, 3, 4]);
            Ok(())
        })?;

        // Test transactional
        // A read tx should be opened when write tx not commited
        let (s1, r1) = flume::bounded::<()>(0);
        let (s2, r2) = flume::bounded::<()>(0);
        let db_ro = db.get_ro_handler();
        let read_task = std::thread::spawn(move || {
            r1.recv().expect("disconnected");
            (db_ro.col_3(), db_ro.col_4(), db_ro.col_2()).read(|(c3, c4, _c2)| {
                c3.get_ref_slice(&4, |numbers| {
                    assert_eq!(numbers, &[1, 2, 3]);
                    Ok(())
                })?;
                c3.iter(.., |it| {
                    let iter = it.keys();
                    s2.send(()).expect("disconnected");
                    assert_eq!(iter.collect::<KvResult<Vec<_>>>()?, vec![4]);
                    Ok::<(), KvError>(())
                })?;
                c4.get_ref_slice(&4, |numbers| {
                    assert_eq!(numbers, &[1, 2, 3, 4]);
                    Ok(())
                })?;
                Ok(())
            })
        });

        let tres: KvResult<()> = (db.col_3_write(), db.col_4_write(), db.col_2_write()).write(
            |(mut c3, mut c4, _c2)| {
                s1.send(()).expect("disconnected");
                assert_eq!(
                    c3.iter(.., |it| it.keys().collect::<KvResult<Vec<_>>>())?,
                    vec![4]
                );
                assert_eq!(
                    c3.iter(.., |it| it.values().collect::<KvResult<Vec<_>>>())?,
                    vec![VecU128(vec![1, 2, 3])]
                );
                c3.upsert(42, VecU128(vec![5, 4, 6]));
                assert_eq!(
                    c3.iter(.., |it| it.keys().collect::<KvResult<Vec<_>>>())?,
                    vec![4, 42]
                );
                assert_eq!(
                    c3.iter(.., |it| it.reverse().keys().collect::<KvResult<Vec<_>>>())?,
                    vec![42, 4]
                );
                c3.upsert(8, VecU128(vec![11, 12, 13]));
                c3.remove(4);
                assert_eq!(
                    c3.iter(.., |it| it.keys().collect::<KvResult<Vec<_>>>())?,
                    vec![8, 42]
                );
                c3.iter(.., |it| {
                    let iter = it.reverse().keys();
                    r2.recv().expect("disconnected");
                    assert_eq!(iter.collect::<KvResult<Vec<_>>>()?, vec![42, 8]);

                    Ok::<(), KvError>(())
                })?;
                c4.upsert(
                    4,
                    BTSetU128(BTreeSet::from_iter((&[7, 8, 6, 5]).iter().copied())),
                );
                Ok(())
            },
        );
        tres?;
        read_task.join().expect("read task panic")?;

        // Test clear()
        db.col_4_write().clear()?;
        assert_eq!(db.col_4().count()?, 0);

        Ok(())
    }
}
