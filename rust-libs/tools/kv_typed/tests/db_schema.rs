#[cfg(feature = "memory_backend")]
mod tests {
    use kv_typed::prelude::*;
    use std::fmt::Debug;

    db_schema!(
        TestV1,
        [
            ["c1", col_1, i32, String],
            ["c2", col_2, usize, i128],
            ["c2", col_3, u64, u128],
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

        Ok(())
    }
}
