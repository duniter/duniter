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

impl DbsReaderImpl {
    pub(super) fn idty_(
        &self,
        bc_db: &BcV2DbRo<FileBackend>,
        pubkey: PublicKey,
    ) -> KvResult<Option<duniter_dbs::IdtyDbV2>> {
        bc_db.identities().get(
            &duniter_dbs::PubKeyKeyV2::from_bytes(pubkey.as_ref())
                .map_err(|e| KvError::DeserError(Box::new(e)))?,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_dbs::databases::bc_v2::BcV2DbWritable;

    #[test]
    fn test_idty() -> KvResult<()> {
        let bc_db = duniter_dbs::databases::bc_v2::BcV2Db::<Mem>::open(MemConf::default())?;
        let bc_db_ro = bc_db.get_ro_handler();
        let db_reader = DbsReaderImpl::mem();
        let pk = PublicKey::default();

        bc_db
            .identities_write()
            .upsert(PubKeyKeyV2(pk), duniter_dbs::IdtyDbV2::default())?;

        assert_eq!(
            db_reader.idty(&bc_db_ro, pk)?,
            Some(duniter_dbs::IdtyDbV2::default())
        );

        bc_db.identities_write().upsert(
            PubKeyKeyV2(pk),
            duniter_dbs::IdtyDbV2 {
                is_member: true,
                username: String::from("JohnDoe"),
            },
        )?;

        assert_eq!(
            db_reader.idty(&bc_db_ro, pk)?,
            Some(duniter_dbs::IdtyDbV2 {
                is_member: true,
                username: String::from("JohnDoe"),
            })
        );

        Ok(())
    }
}
