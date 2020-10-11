#[cfg(feature = "mock")]
mod tests {

    use kv_typed::prelude::*;
    use mockall::predicate::*;
    use std::fmt::Debug;
    use std::ops::{Bound, RangeFull};

    db_schema!(
        Test,
        [["c1", col_1, u32, String], ["c2", col_2, String, u64],]
    );

    fn use_readable_db<DB: TestDbReadable>(db: &DB) -> KvResult<()> {
        let col1_reader = db.col_1();
        assert_eq!(col1_reader.count()?, 899);
        assert_eq!(col1_reader.get(&42)?, Some("toto".to_owned()));
        let mut iter = col1_reader.iter(..);
        assert_eq!(iter.next_res()?, Some((42, "toto".to_owned())));
        assert_eq!(iter.next_res()?, None);
        Ok(())
    }

    #[test]
    fn test_mock_db() -> KvResult<()> {
        let mut db = MockTestDbReadable::new();
        db.expect_col_1().times(1).returning(|| {
            let mut col_1 = MockColRo::<Col1Event>::new();
            col_1.expect_count().times(1).returning(|| Ok(899));
            col_1
                .expect_get()
                .times(1)
                .returning(|_| Ok(Some("toto".to_owned())));
            col_1.expect_iter::<RangeFull>().times(1).returning(|_| {
                let mut b_iter = MockBackendIter::new();
                #[allow(clippy::string_lit_as_bytes)]
                let mut items = vec![
                    None,
                    Some(Ok((vec![0u8, 0, 0, 42], "toto".as_bytes().to_vec()))),
                ];
                b_iter
                    .expect_next()
                    .times(2)
                    .returning(move || items.pop().unwrap_or(None));
                KvIter::new(b_iter, (Bound::Unbounded, Bound::Unbounded))
            });
            col_1
        });

        use_readable_db(&db)?;

        Ok(())
    }
}
