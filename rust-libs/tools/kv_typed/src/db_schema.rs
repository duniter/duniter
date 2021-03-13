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

#[macro_export]
macro_rules! db_schema {
    ($db_name:ident, [ $([$col_path:literal, $col_name:ident, $K:ty, $V:ty]),*, ]) => {
        paste::paste! {
            $(
                // Define each collection event type
                #[derive(Debug, PartialEq)]
                pub enum [<$col_name Event>] {
                    Upsert { key: $K, value: $V },
                    Remove { key: $K },
                    RemoveAll,
                }
                impl kv_typed::prelude::EventTrait for [<$col_name Event>] {
                    type K = $K;
                    type V = $V;

                    fn clear() -> Self { Self::RemoveAll }
                    fn upsert(k: Self::K, v: Self::V) -> Self { Self::Upsert { key: k, value: v, } }
                    fn remove(k: Self::K) -> Self { Self::Remove { key: k } }
                }
            )*
            // Inner module used to hide internals types that must not be exposed on public api
            pub use __inner::{[<$db_name Db>], [<$db_name DbRo>], [<$db_name DbWritable>], [<$db_name DbReadable>], [<$db_name DbTxRw>]};
            mod __inner {
                use super::*;
                use kv_typed::prelude::*;
                // DbCollections
                #[derive(Clone, Debug)]
                pub struct [<$db_name ColsRo>]<BC: BackendCol> {
                    $([<$col_name:snake>]: ColRo<BC, [<$col_name Event>]>,)*
                }
                #[derive(Clone, Debug)]
                pub struct [<$db_name ColsRw>]<BC: BackendCol> {
                    $([<$col_name:snake>]: ColRw<BC, [<$col_name Event>]>,)*
                }
                impl<BC: BackendCol> [<$db_name ColsRw>]<BC> {
                    fn to_ro(&self) -> [<$db_name ColsRo>]<BC> {
                        [<$db_name ColsRo>] {
                            $([<$col_name:snake>]: self.[<$col_name:snake>].to_ro().clone(),)*
                        }
                    }
                }
                // Db
                #[derive(Debug)]
                pub struct [<$db_name Db>]<B: Backend> {
                    collections: [<$db_name ColsRw>]<B::Col>,
                }
                impl<B: Backend> [<$db_name Db>]<B> {
                    pub const NAME: &'static str = stringify!([<$db_name:snake>]);
                }
                impl<B: Backend> Clone for [<$db_name Db>]<B> {
                    fn clone(&self) -> Self {
                        [<$db_name Db>] {
                            collections: self.collections.clone(),
                        }
                    }
                }
                #[cfg(feature = "explorer")]
                impl<B: Backend> kv_typed::explorer::DbExplorable for [<$db_name Db>]<B> {
                    fn explore<'a>(
                        &self,
                        collection_name: &str,
                        action: kv_typed::explorer::ExplorerAction<'a>,
                        stringify_json_value: fn(serde_json::Value) -> serde_json::Value,
                    ) -> KvResult<std::result::Result<kv_typed::explorer::ExplorerActionResponse, ExplorerActionErr>> {
                        $( if stringify!([<$col_name:snake>]) == collection_name {
                            return action.exec(&self.collections.[<$col_name:snake>], stringify_json_value);
                        } )*
                        Ok(Err(ExplorerActionErr(format!("collection '{}' not exist in database '{}'.", collection_name, stringify!([<$db_name Db>])).into())))
                    }
                    fn list_collections() -> Vec<(&'static str, &'static str, &'static str)> {
                        vec![
                            $((stringify!([<$col_name:snake>]), stringify!($K), stringify!($V)),)*
                        ]
                    }
                }
                // Batch
                pub struct [<$db_name DbBatch>]<B: Backend> {
                    $([<$col_name:snake>]: Batch<B::Col, ColRw<B::Col, [<$col_name Event>]>>,)*
                }
                impl<B: Backend> Default for [<$db_name DbBatch>]<B> {
                    fn default() -> Self {
                        [<$db_name DbBatch>] {
                            $([<$col_name:snake>]: Batch::default(),)*
                        }
                    }
                }
                impl<B: Backend> [<$db_name DbBatch>]<B> {
                    $(pub fn [<$col_name:snake>](&mut self) -> &mut Batch<B::Col, ColRw<B::Col, [<$col_name Event>]>> { &mut self.[<$col_name:snake>] })*
                }
                // impl TransactionalWrite for Db
                #[derive(Debug)]
                pub struct [<$db_name DbTxRw>]<'tx, BC: BackendCol> {
                    $(pub [<$col_name:snake>]: TxColRw<'tx, BC, [<$col_name Event>]>,)*
                }
                impl<'tx, B: Backend> TransactionalWrite<'tx, B::Col> for &'tx [<$db_name Db>]<B> {
                    type TxCols = [<$db_name DbTxRw>]<'tx, B::Col>;

                    fn write<D, F: FnOnce(Self::TxCols) -> KvResult<D>>(&'tx self, f: F) -> KvResult<D> {
                        $(let [<$col_name:snake _upgradable_guard>] = self.collections.[<$col_name:snake>].upgradable_read();)*

                        $(let mut [<$col_name:snake _batch>] =  Batch::<B::Col, ColRw<B::Col, [<$col_name Event>]>>::default();)*

                        let db_tx = [<$db_name DbTxRw>] {
                            $([<$col_name:snake>]: TxColRw::new(
                                unsafe { std::mem::transmute(&mut [<$col_name:snake _batch>]) },
                                unsafe { std::mem::transmute(&[<$col_name:snake _upgradable_guard>]) },
                            ),)*
                        };

                        let data = f(db_tx)?;

                        // Prepare commit
                        $(let ([<$col_name:snake _backend_batch>], [<$col_name:snake _events>]) = [<$col_name:snake _batch>].into_backend_batch_and_events();)*

                        // Acquire exclusive lock
                        $(let mut [<$col_name:snake _write_guard>] = parking_lot::RwLockUpgradableReadGuard::upgrade([<$col_name:snake _upgradable_guard>]);)*;

                        // Commit
                        $(self.collections.[<$col_name:snake>].write_backend_batch(
                            [<$col_name:snake _backend_batch>],
                            [<$col_name:snake _events>],
                            &mut [<$col_name:snake _write_guard>],
                        )?;)*

                        Ok(data)
                    }
                }
                // DbRo
                #[derive(Debug)]
                pub struct [<$db_name DbRo>]<B: Backend> {
                    collections: [<$db_name ColsRo>]<B::Col>,
                }
                impl<B: Backend> [<$db_name DbRo>]<B> {
                    pub const NAME: &'static str = stringify!([<$db_name:snake>]);
                }
                impl<B: Backend> Clone for [<$db_name DbRo>]<B> {
                    fn clone(&self) -> Self {
                        [<$db_name DbRo>] {
                            collections: self.collections.clone(),
                        }
                    }
                }
                // Read operations
                pub trait [<$db_name DbReadable>]: Sized {
                    type Backend: Backend;

                    $(fn [<$col_name:snake>](&self) -> &ColRo<<Self::Backend as Backend>::Col, [<$col_name Event>]>;)*
                }
                impl<B: Backend> [<$db_name DbReadable>] for [<$db_name Db>]<B> {
                    type Backend = B;

                    $(fn [<$col_name:snake>](&self) -> &ColRo<B::Col, [<$col_name Event>]> { &self.collections.[<$col_name:snake>].to_ro() })*
                }
                impl<B: Backend> [<$db_name DbReadable>] for [<$db_name DbRo>]<B>{
                    type Backend = B;

                    $(fn [<$col_name:snake>](&self) -> &ColRo<B::Col, [<$col_name Event>]> { &self.collections.[<$col_name:snake>] })*
                }
                // Write operations
                pub trait [<$db_name DbWritable>]: [<$db_name DbReadable>] {
                    type Backend: Backend;
                    type Batch;
                    $(type [<$col_name ColRw>]: DbCollectionRw;)*
                    type DbRo: Sized;

                    fn clear(&self) -> KvResult<()>;
                    fn get_ro_handler(&self) -> Self::DbRo;
                    fn open(
                        backend_conf: <<Self as [<$db_name DbWritable>]>::Backend as kv_typed::backend::Backend>::Conf,
                    ) -> KvResult <Self>;
                    fn new_batch(&self) -> Self::Batch;
                    fn save(&self) -> KvResult<()>;
                    fn write_batch(&self, batch: Self::Batch) -> KvResult<()>;
                    $(fn [<$col_name:snake _write>](&self) -> &Self::[<$col_name ColRw>];)*
                }
                impl<B: Backend> [<$db_name DbWritable>] for [<$db_name Db>]<B> {
                    type Backend = B;
                    type Batch = [<$db_name DbBatch>]<B>;
                    $(type [<$col_name ColRw>] = ColRw<B::Col, [<$col_name Event>]>;)*
                    type DbRo = [<$db_name DbRo>]<B>;

                    #[inline(always)]
                    fn clear(&self) -> KvResult<()> {
                        $(self.collections.[<$col_name:snake>].clear()?;)*
                        Ok(())
                    }
                    #[inline(always)]
                    fn get_ro_handler(&self) -> Self::DbRo {
                        [<$db_name DbRo>] {
                            collections: self.collections.to_ro(),
                        }
                    }
                    #[inline(always)]
                    fn new_batch(&self) -> Self::Batch {
                        <[<$db_name DbBatch>]::<B>>::default()
                    }
                    fn write_batch(&self, batch: Self::Batch) -> KvResult<()> {
                        $(self.collections.[<$col_name:snake>].write_batch(batch.[<$col_name:snake>])?;)*
                        Ok(())
                    }
                    fn open(
                        backend_conf: <<Self as [<$db_name DbWritable>]>::Backend as kv_typed::backend::Backend>::Conf,
                    ) -> KvResult <Self> {
                        let mut db = B::open(&backend_conf)?;
                        Ok([<$db_name Db>] {
                            collections: [<$db_name ColsRw>] {
                                $([<$col_name:snake>]: <ColRw<B::Col, [<$col_name Event>]>>::new(
                                    db.open_col(&backend_conf, $col_path)?
                                ),)*
                            },
                        })
                    }
                    #[inline(always)]
                    fn save(&self) -> KvResult<()> {
                        $(self.collections.[<$col_name:snake>].save()?;)*
                        Ok(())
                    }
                    $(
                        #[inline(always)]
                        fn [<$col_name:snake _write>](&self) -> &ColRw<B::Col, [<$col_name Event>]> { &self.collections.[<$col_name:snake>] }
                    )*
                }
            }
        }
    };
}
