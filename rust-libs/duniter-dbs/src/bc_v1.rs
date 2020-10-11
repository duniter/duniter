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

db_schema!(
    BcV1,
    [
        ["level_blockchain", main_blocks, BlockNumberKeyV1, BlockDbV1,],
        [
            "level_blockchain/idty",
            mb_idty,
            PubKeyKeyV1,
            BlockNumberArrayV1,
        ],
        [
            "level_blockchain/certs",
            mb_certs,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/joiners",
            mb_joiners,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/actives",
            mb_actives,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/leavers",
            mb_leavers,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/excluded",
            mb_excluded,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/revoked",
            mb_revoked,
            PubKeyAndSigV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/dividends",
            mb_dividends,
            AllKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/transactions",
            mb_transactions,
            AllKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/forks",
            fork_blocks,
            BlockstampKeyV1,
            BlockDbV1
        ],
        ["level_bindex", bindex, BlockNumberKeyV1, BlockHeadDbV1],
        ["level_iindex", iindex, PubKeyKeyV1, IIndexDbV1],
        [
            "level_iindex/hash",
            iindex_hash,
            HashKeyV1,
            PublicKeySingletonDbV1
        ],
        ["level_iindex/kick", iindex_kick, PubKeyKeyV1, KickDbV1],
        [
            "level_iindex/writtenOn",
            iindex_written_on,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        ["level_iindex/uid", uids, UidKeyV1, PublicKeySingletonDbV1],
        ["level_mindex", mindex, PubKeyKeyV1, MIndexDbV1],
        [
            "level_mindex/expiresOn",
            mindex_expires_on,
            TimestampKeyV1,
            PublicKeyArrayDbV1
        ],
        [
            "level_mindex/revokesOn",
            mindex_revokes_on,
            TimestampKeyV1,
            PublicKeyArrayDbV1
        ],
        [
            "level_mindex/writtenOn",
            mindex_written_on,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        ["level_cindex", cindex, PubKeyKeyV1, CIndexDbV1],
        [
            "level_cindex/expiresOn",
            cindex_expires_on,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        [
            "level_cindex/writtenOn",
            cindex_written_on,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        ["level_wallet", Wallet, WalletConditionsV1, WalletDbV1],
        ["level_dividend", uds, PubKeyKeyV1, UdEntryDbV1],
        [
            "level_dividend/level_dividend_trim_index",
            uds_trim,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        ["level_sindex", sindex, SourceKeyV1, SIndexDBV1],
        [
            "level_sindex/written_on",
            sindex_written_on,
            BlockNumberKeyV1,
            SourceKeyArrayDbV1
        ],
        [
            "level_sindex/consumed_on",
            sindex_consumed_on,
            BlockNumberKeyV1,
            SourceKeyArrayDbV1
        ],
        [
            "level_sindex/conditions",
            sindex_conditions,
            WalletConditionsV1,
            SourceKeyArrayDbV1
        ],
    ]
);
