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

//! Sled backend for KV Typed,

/*use crate::*;
use sled::transaction::{ConflictableTransactionError, Transactional, TransactionalTree};

enum AbortType<A> {
    User(A),
    Kv(KvError),
}

#[allow(missing_copy_implementations)]
pub struct SledTxCol(&'static TransactionalTree);

impl Debug for SledTxCol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SledTxCol")
            .field("0", &"TransactionalTree")
            .finish()
    }
}

impl<DbReader: From<Vec<SledTxCol>>, DbWriter> TransactionalBackend<DbReader, DbWriter> for Sled {
    type Err = sled::Error;
    type TxCol = SledTxCol;

    fn read<A: Debug, D, F: Fn(&DbReader) -> TransactionResult<D, A, Self::Err>>(
        &self,
        f: F,
    ) -> TransactionResult<D, A, Self::Err> {
        match self
            .trees
            .transaction::<_, D>(|tx_trees: &Vec<TransactionalTree>| {
                let reader = DbReader::from(
                    tx_trees
                        .iter()
                        .map(|tx_tree| SledTxCol(unsafe { to_static_ref(tx_tree) }))
                        .collect(),
                );
                f(&reader).map_err(|e| match e {
                    TransactionError::Abort(a) => {
                        ConflictableTransactionError::Abort(AbortType::User(a))
                    }
                    TransactionError::BackendErr(e) => ConflictableTransactionError::Storage(e),
                    TransactionError::KvError(e) => {
                        ConflictableTransactionError::Abort(AbortType::Kv(e))
                    }
                })
            }) {
            Ok(t) => Ok(t),
            Err(e) => match e {
                sled::transaction::TransactionError::Abort(a) => match a {
                    AbortType::User(a) => Err(TransactionError::Abort(a)),
                    AbortType::Kv(e) => Err(TransactionError::KvError(e)),
                },
                sled::transaction::TransactionError::Storage(e) => {
                    Err(TransactionError::BackendErr(e))
                }
            },
        }
    }

    fn write<A: Debug, F: Fn(&DbWriter) -> TransactionResult<(), A, Self::Err>>(
        &self,
        _f: F,
    ) -> TransactionResult<(), A, Self::Err> {
        todo!()
    }
}*/
