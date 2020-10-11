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

pub type Result<T> = std::result::Result<T, ErrorDb>;

#[derive(Debug, Error)]
pub enum ErrorDb {
    #[error("batch already consumed")]
    BatchConsumed,
    #[error("Collection '{collection_typename}' not exist on db '{db_version}'")]
    NonexistentCollection {
        collection_typename: &'static str,
        db_version: &'static str,
    },
    #[cfg(feature = "explorer")]
    #[error("Collection '{collection_name}' not exist on db '{db_version}'")]
    NonexistentCollectionName {
        collection_name: String,
        db_version: &'static str,
    },
    #[error("DbError: {0}")]
    DbError(String),
    #[error("DeserError: {0}")]
    DeserError(String),
    #[error("SerError: {0}")]
    Ser(String),
    #[error("Fail to create DB folder: {0}")]
    FailToCreateDbFolder(std::io::Error),
}

impl From<KvError> for ErrorDb {
    fn from(e: KvError) -> Self {
        ErrorDb::DbError(format!("{}", e))
    }
}
