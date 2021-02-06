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

impl DbsReader {
    pub fn pubkey_is_member(&self, pubkey: PublicKey) -> KvResult<Option<bool>> {
        Ok(self
            .0
            .gva_identities()
            .get(&PubKeyKeyV2(pubkey))?
            .map(|identity| identity.is_member))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use duniter_gva_db::GvaV1DbWritable;

    #[test]
    fn test_pubkey_is_member() -> KvResult<()> {
        let gva_db = duniter_gva_db::GvaV1Db::<Mem>::open(MemConf::default())?;
        let db_reader = create_dbs_reader(unsafe { std::mem::transmute(&gva_db.get_ro_handler()) });

        let pk = PublicKey::default();

        // Write test data
        gva_db
            .gva_identities_write()
            .upsert(PubKeyKeyV2(pk), GvaIdtyDbV1::default())?;

        // Test

        assert_eq!(db_reader.pubkey_is_member(pk)?, Some(false));

        gva_db.gva_identities_write().upsert(
            PubKeyKeyV2(pk),
            GvaIdtyDbV1 {
                is_member: true,
                ..Default::default()
            },
        )?;

        assert_eq!(db_reader.pubkey_is_member(pk)?, Some(true));

        Ok(())
    }
}
