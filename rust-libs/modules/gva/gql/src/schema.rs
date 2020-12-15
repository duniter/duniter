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

pub type GvaSchema = async_graphql::Schema<
    crate::queries::QueryRoot,
    crate::mutations::MutationRoot,
    crate::subscriptions::SubscriptionRoot,
>;

pub fn build_schema(logger: bool) -> GvaSchema {
    let mut builder = async_graphql::Schema::build(
        queries::QueryRoot::default(),
        mutations::MutationRoot::default(),
        subscriptions::SubscriptionRoot::default(),
    );
    if logger {
        builder = builder.extension(async_graphql::extensions::Logger);
    }
    builder.finish()
}

pub fn build_schema_with_data(data: GvaSchemaData, logger: bool) -> GvaSchema {
    let mut builder = async_graphql::Schema::build(
        queries::QueryRoot::default(),
        mutations::MutationRoot::default(),
        subscriptions::SubscriptionRoot::default(),
    )
    .data(data);
    if logger {
        builder = builder.extension(async_graphql::extensions::Logger);
    }
    builder.finish()
}

pub struct GvaSchemaData {
    pub dbs_pool: fast_threadpool::ThreadPoolAsyncHandler<SharedDbs<FileBackend>>,
    pub dbs_reader: DbsReader,
    pub server_meta_data: ServerMetaData,
    pub txs_mempool: TxsMempool,
}

#[cfg(not(test))]
impl GvaSchemaData {
    #[inline(always)]
    pub fn dbs_reader(&self) -> DbsReader {
        self.dbs_reader
    }
}
#[cfg(test)]
impl GvaSchemaData {
    pub fn dbs_reader(&self) -> DbsReader {
        self.dbs_reader.clone()
    }
}
