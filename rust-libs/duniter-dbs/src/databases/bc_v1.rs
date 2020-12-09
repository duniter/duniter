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
        ["level_blockchain", MainBlocks, BlockNumberKeyV1, BlockDbV1],
        [
            "level_blockchain/idty",
            MbIdty,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/certs",
            MbCerts,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/joiners",
            MbJoiners,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/actives",
            MbActives,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/leavers",
            MbLeavers,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/excluded",
            MbExcluded,
            PubKeyKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/revoked",
            MbRevoked,
            PubKeyAndSigV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/dividends",
            MbDividends,
            AllKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/transactions",
            MbTransactions,
            AllKeyV1,
            BlockNumberArrayV1
        ],
        [
            "level_blockchain/forks",
            ForkBlocks,
            BlockstampKeyV1,
            BlockDbV1
        ],
        ["level_bindex", Bindex, BlockNumberKeyV1, BlockHeadDbV1],
        ["level_iindex", Iindex, PubKeyKeyV1, IIndexDbV1],
        [
            "level_iindex/hash",
            IindexHash,
            HashKeyV1,
            PublicKeySingletonDbV1
        ],
        ["level_iindex/kick", IindexKick, PubKeyKeyV1, KickDbV1],
        [
            "level_iindex/writtenOn",
            IindexWrittenOn,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        ["level_iindex/uid", Uids, UidKeyV1, PublicKeySingletonDbV1],
        ["level_mindex", Mindex, PubKeyKeyV1, MIndexDbV1],
        [
            "level_mindex/expiresOn",
            MindexExpiresOn,
            TimestampKeyV1,
            PublicKeyArrayDbV1
        ],
        [
            "level_mindex/revokesOn",
            MindexRevokesOn,
            TimestampKeyV1,
            PublicKeyArrayDbV1
        ],
        [
            "level_mindex/writtenOn",
            MindexWrittenOn,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        ["level_cindex", Cindex, PubKeyKeyV1, CIndexDbV1],
        [
            "level_cindex/expiresOn",
            CindexExpiresOn,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        [
            "level_cindex/writtenOn",
            CindexWrittenOn,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        ["level_wallet", Wallet, WalletConditionsV1, WalletDbV1],
        ["level_dividend", Uds, PubKeyKeyV1, UdEntryDbV1],
        [
            "level_dividend/level_dividend_trim_index",
            UdsTrim,
            BlockNumberKeyV1,
            PublicKeyArrayDbV1
        ],
        ["level_sindex", Sindex, SourceKeyV1, SIndexDBV1],
        [
            "level_sindex/written_on",
            SindexWrittenOn,
            BlockNumberKeyV1,
            SourceKeyArrayDbV1
        ],
        [
            "level_sindex/consumed_on",
            SindexConsumedOn,
            BlockNumberKeyV1,
            SourceKeyArrayDbV1
        ],
        [
            "level_sindex/conditions",
            SindexConditions,
            WalletConditionsV1,
            SourceKeyArrayDbV1
        ],
    ]
);
