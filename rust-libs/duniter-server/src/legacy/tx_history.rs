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

impl DuniterServer {
    pub fn get_transactions_history(&self, pubkey: PublicKey) -> KvResult<TxsHistoryForBma> {
        get_transactions_history_for_bma(&self.dbs_pool, self.profile_path_opt.as_deref(), pubkey)
    }

    pub fn get_tx_by_hash(
        &self,
        hash: Hash,
    ) -> KvResult<Option<(TransactionDocumentV10, Option<BlockNumber>)>> {
        get_tx_by_hash(&self.dbs_pool, hash, self.profile_path_opt.as_deref())
    }
}
