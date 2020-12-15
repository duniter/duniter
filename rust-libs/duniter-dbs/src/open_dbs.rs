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

use crate::databases::bc_v2::BcV2DbWritable as _;
use crate::databases::cm_v1::CmV1DbWritable as _;
use crate::databases::dunp_v1::DunpV1DbWritable as _;
use crate::databases::txs_mp_v2::TxsMpV2DbWritable as _;
use crate::*;

pub fn open_dbs<B: BackendConf>(
    profile_path_opt: Option<&Path>,
) -> KvResult<(crate::databases::bc_v2::BcV2Db<B>, SharedDbs<B>)> {
    let bc_db = crate::databases::bc_v2::BcV2Db::<B>::open(B::gen_backend_conf(
        crate::databases::bc_v2::BcV2Db::<B>::NAME,
        profile_path_opt,
    ))?;
    let dbs = SharedDbs {
        bc_db_ro: bc_db.get_ro_handler(),
        cm_db: crate::databases::cm_v1::CmV1Db::<MemSingleton>::open(MemSingletonConf::default())
            .expect("fail to open CmV1 DB"),
        dunp_db: crate::databases::dunp_v1::DunpV1Db::<B>::open(B::gen_backend_conf(
            "dunp_v1",
            profile_path_opt,
        ))?,
        txs_mp_db: crate::databases::txs_mp_v2::TxsMpV2Db::<B>::open(B::gen_backend_conf(
            crate::databases::txs_mp_v2::TxsMpV2Db::<B>::NAME,
            profile_path_opt,
        ))?,
    };
    Ok((bc_db, dbs))
}

pub trait BackendConf: Backend {
    fn gen_backend_conf(
        db_name: &'static str,
        profile_path_opt: Option<&Path>,
    ) -> <Self as Backend>::Conf;
}

impl BackendConf for Mem {
    #[inline(always)]
    fn gen_backend_conf(_db_name: &'static str, _profile_path_opt: Option<&Path>) -> MemConf {
        MemConf::default()
    }
}

/*impl BackendConf for Lmdb {
    #[inline(always)]
    fn gen_backend_conf(db_name: &'static str, profile_path_opt: Option<&Path>) -> LmdbConf {
        let conf = LmdbConf::default();
        if let Some(data_path) = profile_path_opt {
            conf.folder_path(data_path.join(format!("data/{}_lmdb", db_name)))
        } else {
            let random = rand::random::<u128>();
            conf.folder_path(PathBuf::from(format!(
                "/dev/shm/duniter/_{}/{}_lmdb",
                random, db_name
            )))
            .temporary(true)
        }
    }
}*/

impl BackendConf for Sled {
    #[inline(always)]
    fn gen_backend_conf(db_name: &'static str, profile_path_opt: Option<&Path>) -> SledConf {
        let mut conf = SledConf::default().flush_every_ms(Some(10_000));
        conf = match db_name {
            "bc_v2" => {
                if let Ok(compression_level) = std::env::var("DUNITER_BC_DB_COMPRESSION") {
                    conf.use_compression(true)
                        .compression_factor(i32::from_str(&compression_level).expect(
                        "Env var DUNITER_BC_DB_COMPRESSION must be a number beetween 1 and 22 !",
                    ))
                } else {
                    conf.use_compression(false)
                }
            }
            "gva_v1" => {
                if let Ok(compression_level) = std::env::var("DUNITER_GVA_DB_COMPRESSION") {
                    conf.use_compression(true)
                        .compression_factor(i32::from_str(&compression_level).expect(
                        "Env var DUNITER_GVA_DB_COMPRESSION must be a number beetween 1 and 22 !",
                    ))
                } else {
                    conf.use_compression(false)
                }
            }
            _ => conf.use_compression(false),
        };
        if let Some(data_path) = profile_path_opt {
            conf.path(data_path.join(format!("data/{}_sled", db_name)))
        } else {
            conf.temporary(true)
        }
    }
}
