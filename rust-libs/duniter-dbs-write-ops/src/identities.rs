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

pub(crate) fn update_identities<B: Backend>(
    _gva_db: &GvaV1Db<B>,
    block: &DubpBlockV10Stringified,
) -> KvResult<()> {
    for joiner in &block.joiners {
        let joiner_fields: SmallVec<[&str; 5]> = joiner.split(':').collect();
        let _pubkey = joiner_fields[0];
        let _username = joiner_fields[4];
    }
    // TODO
    Ok(())
}

pub(crate) fn revert_identities<B: Backend>(
    _gva_db: &GvaV1Db<B>,
    _block: &DubpBlockV10Stringified,
) -> KvResult<()> {
    // TODO
    Ok(())
}
