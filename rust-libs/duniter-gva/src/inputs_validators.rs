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

/*struct MustBeZero {}

impl InputValueValidator for MustBeZero {
    fn is_valid(&self, value: &Value) -> Result<(), String> {
        if let Value::Int(n) = value {
            if n.as_i64().unwrap() != 0 {
                // Validation failed
                Err(format!(
                    "the value is {}, but must be zero",
                    n.as_i64().unwrap(),
                ))
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
}*/
