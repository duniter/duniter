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

#[cfg(feature = "explorer")]
mod explorer {
    use dubp::common::crypto::keys::ed25519::PublicKey;
    use dubp::common::crypto::keys::PublicKey as _;
    //use dubp::common::prelude::*;
    use duniter_dbs::kv_typed::prelude::*;
    use duniter_dbs::kv_typed::regex;
    use duniter_dbs::prelude::*;
    use duniter_dbs::smallvec::smallvec;
    use duniter_dbs::{
        databases::bc_v1::{BcV1Db, BcV1DbWritable},
        PublicKeySingletonDbV1, UidKeyV1,
    };
    use std::{num::NonZeroUsize, str::FromStr};
    use tempdir::TempDir;
    use unwrap::unwrap;

    const COLLECTION_NAME: &str = "uids";

    fn stringify_json_value_test(v: serde_json::Value) -> serde_json::Value {
        v
    }

    #[test]
    fn explorer_test_leveldb() -> anyhow::Result<()> {
        let tmp_dir = unwrap!(TempDir::new("explorer_test_leveldb"));

        let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(tmp_dir.path().to_owned()))?;

        explorer_test(&db)
    }

    #[test]
    fn explorer_test_sled() -> anyhow::Result<()> {
        let db = BcV1Db::<Sled>::open(SledConf::new().temporary(true))?;

        explorer_test(&db)
    }

    fn explorer_test<B: Backend>(db: &BcV1Db<B>) -> anyhow::Result<()> {
        // Defines test data
        let k1 = unwrap!(UidKeyV1::from_str("toto"));
        let k2 = unwrap!(UidKeyV1::from_str("titi"));
        let v1 = PublicKeySingletonDbV1(unwrap!(PublicKey::from_base58(
            "ByE9TU6qhktHYYVAqeTcWcaULBx151siQLyL3TrKvY85"
        )));
        let v2 = PublicKeySingletonDbV1(unwrap!(PublicKey::from_base58(
            "8B5XCAHknsckCkMWeGF9FoGibSNZXF9HtAvzxzg3bSyp"
        )));

        // Insert test data
        db.uids_write().upsert(k1, v1)?;
        db.uids_write().upsert(k2, v2)?;

        // Test action count
        let res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Count,
            stringify_json_value_test,
        )??;
        assert_eq!(ExplorerActionResponse::Count(2), res);

        // Test action get
        let res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Get { key: "unexist" },
            stringify_json_value_test,
        )??;
        assert_eq!(ExplorerActionResponse::Get(None), res);
        let res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Get { key: "toto" },
            stringify_json_value_test,
        )??;
        assert_eq!(
            ExplorerActionResponse::Get(Some(serde_json::Value::String(
                "ByE9TU6qhktHYYVAqeTcWcaULBx151siQLyL3TrKvY85".to_owned()
            ))),
            res
        );

        // Test action put
        let res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Put {
                key: "titu",
                value: "Bi6ECSc352gdfEvVzGiQuuDQyaTptHkcxooMGTJk14Tr",
            },
            stringify_json_value_test,
        )??;
        assert_eq!(ExplorerActionResponse::PutOk, res);
        let res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Get { key: "titu" },
            stringify_json_value_test,
        )??;
        assert_eq!(
            ExplorerActionResponse::Get(Some(serde_json::Value::String(
                "Bi6ECSc352gdfEvVzGiQuuDQyaTptHkcxooMGTJk14Tr".to_owned()
            ))),
            res
        );
        let res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Count,
            stringify_json_value_test,
        )??;
        assert_eq!(ExplorerActionResponse::Count(3), res);

        // Test action find
        let range_res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Find {
                key_min: Some("ti00".to_owned()),
                key_max: Some("tizz".to_owned()),
                key_regex: None,
                value_regex: None,
                limit: Some(10),
                reverse: false,
                step: unsafe { NonZeroUsize::new_unchecked(1) },
            },
            stringify_json_value_test,
        )??;
        assert_eq!(
            ExplorerActionResponse::Find(vec![
                EntryFound {
                    key: "titi".to_owned(),
                    value: serde_json::Value::String(
                        "8B5XCAHknsckCkMWeGF9FoGibSNZXF9HtAvzxzg3bSyp".to_owned()
                    ),
                    captures: None,
                },
                EntryFound {
                    key: "titu".to_owned(),
                    value: serde_json::Value::String(
                        "Bi6ECSc352gdfEvVzGiQuuDQyaTptHkcxooMGTJk14Tr".to_owned()
                    ),
                    captures: None,
                },
            ]),
            range_res
        );

        // Test action find with limit
        let range_res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Find {
                key_min: Some("ti00".to_owned()),
                key_max: Some("tizz".to_owned()),
                key_regex: None,
                value_regex: None,
                limit: Some(1),
                reverse: false,
                step: unsafe { NonZeroUsize::new_unchecked(1) },
            },
            stringify_json_value_test,
        )??;
        assert_eq!(
            ExplorerActionResponse::Find(vec![EntryFound {
                key: "titi".to_owned(),
                value: serde_json::Value::String(
                    "8B5XCAHknsckCkMWeGF9FoGibSNZXF9HtAvzxzg3bSyp".to_owned()
                ),
                captures: None,
            }]),
            range_res
        );

        // Test action find with limit and reverse
        let range_res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Find {
                key_min: Some("ti00".to_owned()),
                key_max: Some("tizz".to_owned()),
                key_regex: None,
                value_regex: None,
                limit: Some(1),
                reverse: true,
                step: unsafe { NonZeroUsize::new_unchecked(1) },
            },
            stringify_json_value_test,
        )??;
        assert_eq!(
            ExplorerActionResponse::Find(vec![EntryFound {
                key: "titu".to_owned(),
                value: serde_json::Value::String(
                    "Bi6ECSc352gdfEvVzGiQuuDQyaTptHkcxooMGTJk14Tr".to_owned()
                ),
                captures: None,
            }]),
            range_res
        );

        // Test action find with regex capture
        let range_res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Find {
                key_min: Some("ti00".to_owned()),
                key_max: Some("tizz".to_owned()),
                key_regex: None,
                value_regex: Some(regex::Regex::new("(E[Cv])[A-Z]").expect("wrong regex")),
                limit: Some(10),
                reverse: false,
                step: unsafe { NonZeroUsize::new_unchecked(1) },
            },
            stringify_json_value_test,
        )??;
        assert_eq!(
            ExplorerActionResponse::Find(vec![EntryFound {
                key: "titu".to_owned(),
                value: serde_json::Value::String(
                    "Bi6ECSc352gdfEvVzGiQuuDQyaTptHkcxooMGTJk14Tr".to_owned()
                ),
                captures: Some(ValueCaptures(smallvec![
                    smallvec![Some("EC".to_owned())],
                    smallvec![Some("Ev".to_owned())]
                ])),
            }]),
            range_res
        );

        // Test action delete
        let res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Delete { key: "toto" },
            stringify_json_value_test,
        )??;
        assert_eq!(ExplorerActionResponse::DeleteOk, res);
        let res = db.explore(
            COLLECTION_NAME,
            ExplorerAction::Get { key: "toto" },
            stringify_json_value_test,
        )??;
        assert_eq!(ExplorerActionResponse::Get(None), res);

        Ok(())
    }
}
