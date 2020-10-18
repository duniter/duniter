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

use dubp_common::crypto::bases::b58::ToBase58 as _;
use dubp_common::crypto::hashs::Hash;
use dubp_common::crypto::keys::PublicKey;
use dubp_common::prelude::*;
use duniter_dbs::kv_typed::prelude::*;
use duniter_dbs::*;
use duniter_dbs::{
    BcV1Db, BcV1DbReadable, BcV1DbWritable, BlockDbV1, BlockNumberKeyV1, PublicKeySingletonDbV1,
    Result, UidKeyV1,
};
use once_cell::sync::Lazy;
use std::{path::PathBuf, str::FromStr, sync::Mutex};
use unwrap::unwrap;

// Empty mutex used to ensure that only one test runs at a time
static MUTEX: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

//const DB_PATH: &str = "/home/elois/.config/duniter/duniter_default/data";
const DB_PATH: &str = "/home/elois/Documents/ml/leveldb-archives/g1-317499/leveldb";

#[test]
#[ignore]
fn db_v1_main_blocks__() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    //let block52 = db.get::<MainBlocksColV1>(&MainBlockKeyV1(52))?;
    //println!("{:#?}", block52);

    let current_block_number_opt = db
        .main_blocks()
        .iter(..)
        .keys()
        .reverse()
        .next()
        .transpose()?;
    if let Some(current_block_number) = current_block_number_opt {
        println!("current_block_number={:#?}", current_block_number);
        let current_block = db.main_blocks().get(&current_block_number)?;
        println!("current_block={:#?}", current_block);
    }

    /*// Collect all main blocks
    let entries = db
        .main_blocks()
        .iter(..)
        .collect::<KvResult<Vec<(BlockNumberKeyV1, BlockDbV1)>>>()?;
    println!("entries_len={}", entries.len());*/

    Ok(())
}

#[test]
#[ignore]
fn db_v1_main_blocks_idty() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let all = unwrap!(db.mb_idty().get(&PubKeyKeyV1::all())?);
    assert!(all.0.len() > 2);

    // Collect all main blocks idty
    let entries = db
        .mb_idty()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, BlockNumberArrayV1)>>>()?;
    println!("identities_count={}", entries.len() - 1);
    for (k, v) in &entries {
        if v.0.len() == 2 {
            println!("{:?}", k.0.as_ref());
        }
    }

    Ok(())
}

#[test]
#[ignore]
fn db_v1_main_blocks_certs() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all main blocks idty
    let entries = db
        .mb_certs()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, BlockNumberArrayV1)>>>()?;
    println!("certifications_count={}", entries.len() - 1);
    for (k, v) in &entries[..10] {
        if v.0.len() > 1 {
            println!("{}={:?}", k.0, v.0);
        }
    }

    Ok(())
}

#[test]
#[ignore]
fn db_v1_main_blocks_joiners() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let all = unwrap!(db.mb_joiners().get(&PubKeyKeyV1::all())?);
    assert!(all.0.len() > 100);

    // Collect all main blocks joiners
    let entries = db
        .mb_joiners()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, BlockNumberArrayV1)>>>()?;
    println!("joiners_count={}", entries.len() - 1);

    Ok(())
}

#[test]
#[ignore]
fn db_v1_main_blocks_actives() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let all = unwrap!(db.mb_actives().get(&PubKeyKeyV1::all())?);
    assert!(all.0.len() > 100);

    // Collect all main blocks actives
    let entries = db
        .mb_actives()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, BlockNumberArrayV1)>>>()?;
    println!("actives_count={}", entries.len() - 1);

    Ok(())
}

#[test]
#[ignore]
fn db_v1_main_blocks_leavers() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let all = unwrap!(db.mb_leavers().get(&PubKeyKeyV1::all())?);
    assert!(all.0.len() >= 3);

    // Collect all main blocks with leavers
    let entries = db
        .mb_leavers()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, BlockNumberArrayV1)>>>()?;
    println!("leavers_count={}", entries.len() - 1);
    for (k, v) in entries {
        println!("{}={:?}", k.0, v.0);
    }

    Ok(())
}

#[test]
#[ignore]
fn db_v1_main_blocks_excluded() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let all = unwrap!(db.mb_excluded().get(&PubKeyKeyV1::all())?);
    assert!(all.0.len() >= 50);

    // Collect all main blocks with excluded
    let entries = db
        .mb_excluded()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, BlockNumberArrayV1)>>>()?;
    println!("excluded_count={}", entries.len() - 1);
    /*for (k, v) in entries {
        println!("{}={:?}", k.0, v.0);
    }*/

    Ok(())
}

#[test]
#[ignore]
fn db_v1_main_blocks_revoked() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let all = unwrap!(db.mb_revoked().get(&PubKeyAndSigV1::all())?);
    assert!(all.0.len() >= 20);

    // Collect all main blocks with revoked
    let entries = db
        .mb_revoked()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyAndSigV1, BlockNumberArrayV1)>>>()?;
    println!("revoked_count={}", entries.len() - 1);

    Ok(())
}

#[test]
#[ignore]
fn db_v1_main_blocks_dividend() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let all = unwrap!(db.mb_dividends().get(&AllKeyV1)?);
    assert!(all.0.len() >= 900);
    println!("blocks with dividend={}", all.0.len());
    println!("last block with dividend={:?}", all.0.last());

    // Collect all main blocks with dividends
    let entries = db
        .mb_dividends()
        .iter(..)
        .collect::<KvResult<Vec<(AllKeyV1, BlockNumberArrayV1)>>>()?;
    println!("dividends_keys={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_main_blocks_transactions() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let all = unwrap!(db.mb_transactions().get(&AllKeyV1)?);
    assert!(all.0.len() >= 900);
    println!("blocks with tx={}", all.0.len());
    println!("last block with tx={:?}", all.0.last());

    // Collect all main blocks with transactions
    let entries = db
        .mb_transactions()
        .iter(..)
        .collect::<KvResult<Vec<(AllKeyV1, BlockNumberArrayV1)>>>()?;
    println!("transactions_keys={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_fork_blocks() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    /*let fork_blocks_keys = db
        .keys_iter::<ForkBlocksColV1, _>(..)
        .take(1)
        .collect::<KvResult<Vec<BlockstampKeyV1>>>()?;
    let one_fork_block = unwrap!(db.get::<ForkBlocksColV1>(&fork_blocks_keys[0])?);

    println!("{:#?}", one_fork_block);*/

    // Collect all fork blocks
    let entries = db
        .fork_blocks()
        .iter(..)
        .collect::<KvResult<Vec<(BlockstampKeyV1, BlockDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_bindex() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all bindex entries
    let entries = db
        .bindex()
        .iter(..)
        .collect::<KvResult<Vec<(BlockNumberKeyV1, BlockHeadDbV1)>>>()?;
    println!("entries_len={}", entries.len());
    //println!("last_bindex={:?}", entries.last());
    //for (_k, v) in entries {}

    Ok(())
}

#[test]
#[ignore]
fn db_v1_iindex__() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let iindex_keys = db
        .iindex()
        .iter(..)
        .keys()
        .take(1)
        .collect::<KvResult<Vec<PubKeyKeyV1>>>()?;
    let one_iindex_db = unwrap!(db.iindex().get(&iindex_keys[0])?);
    assert_eq!(one_iindex_db.0[0].pubkey, iindex_keys[0].0.to_base58());

    //println!("{:#?}", one_iindex_db);

    if let Some(ref hash) = one_iindex_db.0[0].hash {
        let pubkey = unwrap!(db
            .iindex_hash()
            .get(&HashKeyV1(unwrap!(Hash::from_hex(hash))))?);
        assert_eq!(pubkey.0, iindex_keys[0].0);
    }

    // Count iindex entries
    let count = db.iindex().count()?;
    println!("iindex size={}", count);

    // Count members
    let count_members = db
        .iindex()
        .iter(..)
        .filter_map(KvResult::ok)
        .filter(|(_k, v)| v.0[0].member.is_some() && unwrap!(v.0[0].member))
        .count();
    println!("count_members={}", count_members);

    // Collect all iindex entries
    let entries = db
        .iindex()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, IIndexDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_iindex_hash() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let iindex_entries = db
        .iindex_hash()
        .iter(..)
        .take(3)
        .collect::<KvResult<Vec<(HashKeyV1, PublicKeySingletonDbV1)>>>()?;

    println!(
        "(hash, pub)=({:#?},{:#?})",
        iindex_entries[0].0, iindex_entries[0].1
    );

    // Collect all iindex/hash entries
    let entries = db
        .iindex_hash()
        .iter(..)
        .collect::<KvResult<Vec<(HashKeyV1, PublicKeySingletonDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_iindex_kick() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let entries = db
        .iindex_kick()
        .iter(..)
        .take(3)
        .collect::<KvResult<Vec<(PubKeyKeyV1, KickDbV1)>>>()?;

    println!("(pub, kick)=({:#?},{:#?})", entries[0].0, entries[0].1);

    // Collect all iindex/kick entries
    let entries = db
        .iindex_kick()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, KickDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_iindex_written_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all iindex/written_on entries
    let entries = db
        .iindex_written_on()
        .iter(..)
        .collect::<KvResult<Vec<(BlockNumberKeyV1, PublicKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());
    println!("entries={:?}", entries);

    Ok(())
}

#[test]
#[ignore]
fn db_v1_uid_col() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let uid_keys = db
        .uids()
        .iter(..)
        .keys()
        .take(1)
        .collect::<KvResult<Vec<UidKeyV1>>>()?;
    let one_pubkey_db = db.uids().get(&uid_keys[0])?;

    println!(
        "(uid, pubkey) = ({}, {:#?})",
        uid_keys[0].0.as_str(),
        one_pubkey_db
    );

    let start_key = unwrap!(UidKeyV1::from_str("1b"));
    let end_key = unwrap!(UidKeyV1::from_str("404_not_found"));
    let uid_index = db
        .uids()
        .iter(start_key..end_key)
        .collect::<KvResult<Vec<(UidKeyV1, PublicKeySingletonDbV1)>>>()?;
    assert_eq!(
        uid_index,
        vec![(
            unwrap!(UidKeyV1::from_str("1claude1")),
            PublicKeySingletonDbV1(unwrap!(PublicKey::from_base58(
                "8B5XCAHknsckCkMWeGF9FoGibSNZXF9HtAvzxzg3bSyp"
            )))
        )],
    );

    // Collect all iindex/uid entries
    let entries = db
        .uids()
        .iter(..)
        .collect::<KvResult<Vec<(UidKeyV1, PublicKeySingletonDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_mindex__() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    let mindex_keys = db
        .mindex()
        .iter(..)
        .keys()
        .take(1)
        .collect::<KvResult<Vec<PubKeyKeyV1>>>()?;
    let one_mindex_db = unwrap!(db.mindex().get(&mindex_keys[0])?);
    assert_eq!(one_mindex_db.0[0].pubkey, mindex_keys[0].0.to_base58());

    //println!("{:#?}", one_mindex_db);

    // Count mindex entries
    let count = db.mindex().count()?;
    println!("mindex size={}", count);

    // Collect all mindex entries
    let entries = db
        .mindex()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, MIndexDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_mindex_expires_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all mindex/expires_on entries
    let entries = db
        .mindex_expires_on()
        .iter(..)
        .collect::<KvResult<Vec<(TimestampKeyV1, PublicKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());
    /*for (k, v) in entries {
        if k.0 == BlockNumber(u32::MAX) {
            println!("{:?}", v.0)
        }
    }*/

    Ok(())
}

#[test]
#[ignore]
fn db_v1_mindex_revokes_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all mindex/revokes_on entries
    let entries = db
        .mindex_revokes_on()
        .iter(..)
        .collect::<KvResult<Vec<(TimestampKeyV1, PublicKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_mindex_written_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all mindex/written_on entries
    let entries = db
        .mindex_written_on()
        .iter(..)
        .collect::<KvResult<Vec<(BlockNumberKeyV1, PublicKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());
    for (k, v) in entries {
        if k.0 == BlockNumber(u32::MAX) {
            println!("{:?}", v.0)
        }
    }

    Ok(())
}

#[test]
#[ignore]
fn db_v1_cindex__() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all bindex entries
    let entries = db
        .cindex()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, CIndexDbV1)>>>()?;
    println!("entries_len={}", entries.len());
    //println!("last_bindex={:?}", entries.last());
    for (_k, v) in entries {
        for cindex_line in v.issued {
            if cindex_line.created_on_ref.is_some() {
                println!("cindex_line={:?}", cindex_line)
            }
        }
    }

    Ok(())
}

#[test]
#[ignore]
fn db_v1_cindex_expires_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all cindex/expires_on entries
    let entries = db
        .cindex_expires_on()
        .iter(..)
        .collect::<KvResult<Vec<(BlockNumberKeyV1, PublicKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_cindex_written_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all cindex/written_on entries
    let entries = db
        .cindex_written_on()
        .iter(..)
        .collect::<KvResult<Vec<(BlockNumberKeyV1, PublicKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_wallet() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all wallet entries
    let entries = db
        .wallet()
        .iter(..)
        .collect::<KvResult<Vec<(WalletConditionsV1, WalletDbV1)>>>()?;
    println!("entries_len={}", entries.len());
    let mut max_cond_len = 0;
    for (k, _v) in entries {
        if k.0.len() > max_cond_len {
            max_cond_len = k.0.len();
            println!("k={}", k.0.as_str());
        }
    }
    println!("max_cond_len={}", max_cond_len);

    Ok(())
}

#[test]
#[ignore]
fn db_v1_dividend() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all level_dividend entries
    let entries = db
        .uds()
        .iter(..)
        .collect::<KvResult<Vec<(PubKeyKeyV1, UdEntryDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    println!("entries[0]=({:?}, {:?})", entries[0].0, entries[0].1);

    Ok(())
}

#[test]
#[ignore]
fn db_v1_dividend_written_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all level_dividend/level_dividend_trim_index entries
    let entries = db
        .uds_trim()
        .iter(..)
        .collect::<KvResult<Vec<(BlockNumberKeyV1, PublicKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());

    Ok(())
}

#[test]
#[ignore]
fn db_v1_sindex() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all level_sindex entries
    let entries = db
        .sindex()
        .iter(..)
        .collect::<KvResult<Vec<(SourceKeyV1, SIndexDBV1)>>>()?;
    println!("entries_len={}", entries.len());

    println!("entries[0]=({:?}, {:?})", entries[0].0, entries[0].1);

    Ok(())
}

#[test]
#[ignore]
fn db_v1_sindex_written_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all mindex/written_on entries
    let entries = db
        .sindex_written_on()
        .iter(..)
        .collect::<KvResult<Vec<(BlockNumberKeyV1, SourceKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());
    for (k, v) in entries {
        if k.0 == BlockNumber(u32::MAX) {
            println!("{:?}", v.0)
        }
    }

    Ok(())
}

#[test]
#[ignore]
fn db_v1_sindex_consumed_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;
    // Collect all mindex/written_on entries
    let entries = db
        .sindex_consumed_on()
        .iter(..)
        .collect::<KvResult<Vec<(BlockNumberKeyV1, SourceKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());
    for (k, v) in entries {
        println!("{:?} => {:?}", k.0, v.0)
    }

    Ok(())
}

#[test]
#[ignore]
fn db_v1_sindex_conditions_on() -> Result<()> {
    let _lock = MUTEX.lock().expect("MUTEX poisoned");

    let db = BcV1Db::<LevelDb>::open(LevelDbConf::path(PathBuf::from(DB_PATH)))?;

    // Collect all mindex/written_on entries
    let entries = db
        .sindex_conditions()
        .iter(..)
        .collect::<KvResult<Vec<(WalletConditionsV1, SourceKeyArrayDbV1)>>>()?;
    println!("entries_len={}", entries.len());
    /*for (k, v) in entries {
        println!("{:?} => {:?}", k.0, v.0)
    }*/

    Ok(())
}
