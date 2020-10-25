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

use crate::*;

#[derive(Clone, Debug)]
pub struct DuniterServerConf {
    pub gva: Option<GvaConf>,
    pub server_pubkey: PublicKey,
    pub txs_mempool_size: usize,
}

pub fn open_dbs(home_path_opt: Option<&Path>) -> DuniterDbs {
    DuniterDbs {
        gva_db: GvaV1Db::<DbsBackend>::open(DbsBackend::gen_backend_conf("gva_v1", home_path_opt))
            .expect("fail to open GVA DB"),
        txs_mp_db: TxsMpV2Db::<DbsBackend>::open(DbsBackend::gen_backend_conf(
            "txs_mp_v2",
            home_path_opt,
        ))
        .expect("fail to open TxsMp DB"),
    }
}

pub trait BackendConf: Backend {
    fn gen_backend_conf(
        db_name: &'static str,
        home_path_opt: Option<&Path>,
    ) -> <Self as Backend>::Conf;
}

impl BackendConf for Mem {
    #[inline(always)]
    fn gen_backend_conf(_db_name: &'static str, _home_path_opt: Option<&Path>) -> MemConf {
        MemConf::default()
    }
}

impl BackendConf for Lmdb {
    #[inline(always)]
    fn gen_backend_conf(db_name: &'static str, home_path_opt: Option<&Path>) -> LmdbConf {
        let conf = LmdbConf::default();
        if let Some(data_path) = home_path_opt {
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
}

impl BackendConf for Sled {
    #[inline(always)]
    fn gen_backend_conf(db_name: &'static str, home_path_opt: Option<&Path>) -> SledConf {
        let conf = SledConf::default().flush_every_ms(Some(10_000));
        if let Some(data_path) = home_path_opt {
            conf.path(data_path.join(format!("data/{}_sled", db_name)))
        } else {
            conf.temporary(true)
        }
    }
}
