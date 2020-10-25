use crate::*;
use parking_lot::RwLockWriteGuard as WriteGuard;

pub trait DbCollectionRw {
    type K: Key;
    type V: Value;
    type Event: EventTrait<K = Self::K, V = Self::V>;

    fn clear(&self) -> KvResult<()>;
    fn remove(&self, k: Self::K) -> KvResult<()>;
    fn save(&self) -> KvResult<()>;
    fn upsert(&self, k: Self::K, v: Self::V) -> KvResult<()>;
}

#[derive(Debug)]
pub struct ColRw<BC: BackendCol, E: EventTrait> {
    pub(crate) inner: ColRo<BC, E>,
}

impl<BC: BackendCol, E: EventTrait> Clone for ColRw<BC, E> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

impl<BC: BackendCol, E: EventTrait> DbCollectionRw for ColRw<BC, E> {
    type K = E::K;
    type V = E::V;
    type Event = E;

    fn clear(&self) -> KvResult<()> {
        let mut w = self.inner.inner.write();
        w.backend_col.clear()?;
        let events = smallvec::smallvec![E::clear()];
        w.notify_subscribers(events);
        Ok(())
    }
    fn remove(&self, k: Self::K) -> KvResult<()> {
        let mut w = self.inner.inner.write();
        w.backend_col.delete(&k)?;
        let events = smallvec::smallvec![E::remove(k)];
        w.notify_subscribers(events);
        Ok(())
    }
    fn save(&self) -> KvResult<()> {
        let w = self.inner.inner.write();
        w.backend_col.save()?;
        Ok(())
    }
    fn upsert(&self, k: Self::K, v: Self::V) -> KvResult<()> {
        let mut w = self.inner.inner.write();
        w.backend_col.put(&k, &v)?;
        let events = smallvec::smallvec![E::upsert(k, v)];
        w.notify_subscribers(events);
        Ok(())
    }
}

impl<BC: BackendCol, E: EventTrait> ColRw<BC, E> {
    pub fn new(backend_col: BC) -> Self {
        let (col_inner, subscription_sender) = ColInner::new(backend_col);
        Self {
            inner: ColRo {
                inner: Arc::new(parking_lot::RwLock::new(col_inner)),
                subscription_sender,
            },
        }
    }
    pub fn to_ro(&self) -> &ColRo<BC, E> {
        &self.inner
    }
    pub fn write_batch(&self, batch: Batch<BC, Self>) -> KvResult<()> {
        let (backend_batch, events) = batch.into_backend_batch_and_events();
        let mut w = self.inner.inner.write();
        w.backend_col.write_batch(backend_batch)?;
        w.notify_subscribers(events);
        Ok(())
    }
    pub(crate) fn write_backend_batch(
        &self,
        backend_batch: BC::Batch,
        events: Events<E>,
        write_guard: &mut WriteGuard<ColInner<BC, E>>,
    ) -> KvResult<()> {
        write_guard.backend_col.write_batch(backend_batch)?;
        write_guard.notify_subscribers(events);
        Ok(())
    }
}
