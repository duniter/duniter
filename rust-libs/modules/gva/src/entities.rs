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

pub mod block_gva;
pub mod tx_gva;
pub mod ud_gva;

use crate::*;

#[derive(Default, async_graphql::SimpleObject)]
pub(crate) struct AggregateSum {
    pub(crate) aggregate: Sum,
}

#[derive(Default, async_graphql::SimpleObject)]
pub(crate) struct AmountWithBase {
    pub(crate) amount: i32,
    pub(crate) base: i32,
}

#[derive(async_graphql::SimpleObject)]
pub(crate) struct EdgeTx {
    pub(crate) direction: TxDirection,
}

#[derive(Default, async_graphql::SimpleObject)]
#[graphql(name = "Peer")]
pub struct PeerCardGva {
    pub version: u32,
    pub currency: String,
    pub pubkey: String,
    pub blockstamp: String,
    pub endpoints: Vec<String>,
    pub status: String,
    pub signature: String,
}
impl From<duniter_dbs::PeerCardDbV1> for PeerCardGva {
    fn from(peer: duniter_dbs::PeerCardDbV1) -> Self {
        Self {
            version: peer.version,
            currency: peer.currency,
            pubkey: peer.pubkey,
            blockstamp: peer.blockstamp,
            endpoints: peer.endpoints,
            status: peer.status,
            signature: peer.signature,
        }
    }
}

pub(crate) enum RawTxOrChanges {
    FinalTx(String),
    Changes(Vec<String>),
}
#[async_graphql::Object]
impl RawTxOrChanges {
    /// Intermediate transactions documents for compacting sources (`null` if not needed)
    async fn changes(&self) -> Option<&Vec<String>> {
        if let Self::Changes(changes) = self {
            Some(changes)
        } else {
            None
        }
    }
    /// Transaction document that carries out the requested transfer (`null` if the amount to be sent requires too many sources)
    async fn tx(&self) -> Option<&str> {
        if let Self::FinalTx(raw_tx) = self {
            Some(raw_tx.as_str())
        } else {
            None
        }
    }
}

#[derive(Default, async_graphql::SimpleObject)]
pub(crate) struct Sum {
    pub(crate) sum: AmountWithBase,
}

#[derive(Clone, Copy, Eq, PartialEq, async_graphql::Enum)]
pub(crate) enum TxDirection {
    /// Received
    Received,
    /// Sent
    Sent,
}

#[derive(async_graphql::SimpleObject)]
pub(crate) struct TxsHistoryMempool {
    /// Transactions sending
    pub(crate) sending: Vec<TxGva>,
    /// Transactions receiving
    pub(crate) receiving: Vec<TxGva>,
}

#[derive(Clone, async_graphql::SimpleObject)]
pub(crate) struct UtxoGva {
    /// Source amount
    pub(crate) amount: i64,
    /// Source base
    pub(crate) base: i64,
    /// Hash of origin transaction
    pub(crate) tx_hash: String,
    /// Index of output in origin transaction
    pub(crate) output_index: u32,
    /// Written block
    pub(crate) written_block: u32,
    /// Written time
    pub(crate) written_time: u64,
}
