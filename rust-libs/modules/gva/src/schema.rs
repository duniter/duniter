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

pub(crate) type GraphQlSchema = async_graphql::Schema<
    crate::queries::QueryRoot,
    crate::mutations::MutationRoot,
    crate::subscriptions::SubscriptionRoot,
>;
pub(crate) struct SchemaData {
    pub(crate) dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
    pub(crate) dbs_reader: DbsReader,
    pub(crate) server_meta_data: ServerMetaData,
    pub(crate) txs_mempool: TxsMempool,
}

#[cfg(not(test))]
impl SchemaData {
    #[inline(always)]
    pub fn dbs_reader(&self) -> DbsReader {
        self.dbs_reader
    }
}
#[cfg(test)]
impl SchemaData {
    pub fn dbs_reader(&self) -> DbsReader {
        self.dbs_reader.clone()
    }
}
