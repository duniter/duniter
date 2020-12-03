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

pub(crate) struct TxCommentValidator;

impl async_graphql::validators::InputValueValidator for TxCommentValidator {
    fn is_valid(&self, value: &async_graphql::Value) -> Result<(), String> {
        if let async_graphql::Value::String(comment) = value {
            if !TransactionDocumentV10::verify_comment(&comment) {
                // Validation failed
                Err("invalid comment".to_owned())
            } else {
                // Validation succeeded
                Ok(())
            }
        } else {
            // If the type does not match we can return None and built-in validations
            // will pick up on the error
            Ok(())
        }
    }
}
