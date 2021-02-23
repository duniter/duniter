//  Copyright (C) 2021 Pascal Engélibert
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

impl DbsReader {
    pub fn block(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        number: U32BE,
    ) -> KvResult<Option<duniter_dbs::BlockMetaV2>> {
        bc_db.blocks_meta().get(&number)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_dbs::databases::bc_v2::BcV2DbWritable;
    use duniter_gva_db::GvaV1DbWritable;

    #[test]
    fn test_block() -> KvResult<()> {
        let bc_db = duniter_dbs::databases::bc_v2::BcV2Db::<Mem>::open(MemConf::default())?;
        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())?;
        let bc_db_ro = bc_db.get_ro_handler();
        let db_reader = create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) });

        bc_db
            .blocks_meta_write()
            .upsert(U32BE(0), duniter_dbs::BlockMetaV2::default())?;

        assert_eq!(
            db_reader.block(&bc_db_ro, U32BE(0))?,
            Some(duniter_dbs::BlockMetaV2::default())
        );

        Ok(())
    }
}
