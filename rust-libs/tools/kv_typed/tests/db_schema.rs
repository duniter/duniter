#[cfg(feature = "memory_backend")]
mod tests {
    use kv_typed::prelude::*;
    use smallvec::SmallVec;
    use std::fmt::Debug;

    #[derive(Debug, PartialEq)]
    pub struct VecU128(Vec<u128>);
    kv_typed::impl_value_for_vec_zc!(VecU128, u128);

    #[derive(Debug, PartialEq)]
    pub struct SVecU128(SmallVec<[u128; 4]>);
    kv_typed::impl_value_for_smallvec_zc!(SVecU128, u128, 4);

    use std::collections::BTreeSet;
    #[derive(Debug, PartialEq)]
    pub struct BTSetU128(BTreeSet<u128>);
    kv_typed::impl_value_for_btreeset_zc!(BTSetU128, u128);

    use std::collections::HashSet;
    #[derive(Debug, PartialEq)]
    pub struct HashSetU128(HashSet<u128>);
    kv_typed::impl_value_for_hashset_zc!(HashSetU128, u128);

    db_schema!(
        TestV1,
        [
            ["c1", col_1, i32, String,],
            ["c2", col_2, usize, i128,],
            ["c3", col_3, u64, VecU128],
            ["c4", col_4, u64, BTSetU128],
        ]
    );

    #[maybe_async::test(not(feature = "async"), async(feature = "async", async_std::test))]
    async fn test_db_schema() -> KvResult<()> {
        let db = TestV1Db::<Mem>::open(MemConf::default())?;

        #[cfg(feature = "subscription")]
        let (sender, recv) = kv_typed::channel::unbounded();
        #[cfg(feature = "subscription")]
        db.col_1().subscribe(sender)?;

        let db2 = db.clone();

        let handler = std::thread::spawn(move || db2.col_1_write().upsert(3, "toto".to_owned()));
        handler.join().expect("thread panic")?;

        #[cfg(feature = "subscription")]
        {
            let expected_events: Events<Col1Event> = smallvec::smallvec![Col1Event::Upsert {
                key: 3,
                value: "toto".to_owned(),
            }];
            #[allow(unused_parens)]
            if let Ok(msg) = recv.recv().await {
                assert_eq!(msg.as_ref(), &expected_events,)
            } else {
                panic!("must be receive event")
            }
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

        db.col_1_write().upsert(5, "tutu".to_owned())?;

        {
            let mut iter = db.col_1().iter(..);

            assert_eq!(iter.next_res()?, Some((3, "toto".to_owned())));
            assert_eq!(iter.next_res()?, Some((5, "tutu".to_owned())));
            assert_eq!(iter.next_res()?, None);

            let mut iter = db.col_1().iter(..).values().reverse();

            assert_eq!(iter.next_res()?, Some("tutu".to_owned()));
            assert_eq!(iter.next_res()?, Some("toto".to_owned()));
            assert_eq!(iter.next_res()?, None);
        }

        db.col_1_write().upsert(7, "titi".to_owned())?;

        let mut iter = db.col_1().iter(..).values().reverse().step_by(2);

        assert_eq!(iter.next_res()?, Some("titi".to_owned()));
        assert_eq!(iter.next_res()?, Some("toto".to_owned()));
        assert_eq!(iter.next_res()?, None);

        db.col_3_write().upsert(4, VecU128(vec![1, 2, 3]))?;
        db.col_3().get_ref_slice(&4, |numbers| {
            assert_eq!(numbers, &[1, 2, 3]);
            Ok(())
        })?;

        use std::iter::FromIterator as _;
        db.col_4_write().upsert(
            4,
            BTSetU128(BTreeSet::from_iter((&[3, 2, 4, 1]).iter().copied())),
        )?;
        db.col_4().get_ref_slice(&4, |numbers| {
            assert_eq!(numbers, &[1, 2, 3, 4]);
            Ok(())
        })?;

        Ok(())
    }
}
