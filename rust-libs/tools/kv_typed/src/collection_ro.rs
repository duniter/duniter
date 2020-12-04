use crate::*;

pub trait DbCollectionRo: Sized {
    type BackendCol: BackendCol;
    type K: Key;
    type V: Value;
    type Event: EventTrait<K = Self::K, V = Self::V>;

    fn contains_key(&self, k: &Self::K) -> KvResult<bool>;
    fn count(&self) -> KvResult<usize>;
    fn get(&self, k: &Self::K) -> KvResult<Option<Self::V>>;
    /// Don't worry about complex iter type. Use it like an `impl Iterator<Item=KvResult<(K, V)>>`.
    fn iter<
        D: Send + Sync,
        R: 'static + RangeBounds<Self::K>,
        F: FnOnce(
            KvIter<
                Self::BackendCol,
                <Self::BackendCol as BackendCol>::KeyBytes,
                <Self::BackendCol as BackendCol>::ValueBytes,
                <Self::BackendCol as BackendCol>::Iter,
                Self::K,
                Self::V,
            >,
        ) -> D,
    >(
        &self,
        range: R,
        f: F,
    ) -> D;
    fn subscribe(&self, subscriber_sender: Subscriber<Self::Event>) -> KvResult<()>;
}

#[cfg(feature = "mock")]
mockall::mock! {
    pub ColRo<E: EventTrait> {}
    trait DbCollectionRo {
        type BackendCol = MockBackendCol;
        type K = E::K;
        type V = E::V;
        type Event = E;

        fn count(&self) -> KvResult<usize>;
        fn get(&self, k: &E::K) -> KvResult<Option<E::V>>;
        fn iter<R: 'static + RangeBounds<E::K>>(&self, range: R)
        -> KvIter<MockBackendCol, MockBackendIter, E::K, E::V>;
        fn subscribe(&self, subscriber_sender: Subscriber<E>) -> KvResult<()>;
    }
}

#[derive(Debug)]
pub struct ColRo<BC: BackendCol, E: EventTrait> {
    pub(crate) inner: Arc<parking_lot::RwLock<ColInner<BC, E>>>,
    pub(crate) subscription_sender: SubscriptionsSender<E>,
}

impl<BC: BackendCol, E: EventTrait> Clone for ColRo<BC, E> {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
            subscription_sender: self.subscription_sender.clone(),
        }
    }
}
impl<BC: BackendCol, E: EventTrait> DbCollectionRo for ColRo<BC, E> {
    type BackendCol = BC;
    type K = E::K;
    type V = E::V;
    type Event = E;

    #[inline(always)]
    fn contains_key(&self, k: &Self::K) -> KvResult<bool> {
        let r = self.inner.read();
        r.backend_col.contains_key(k)
    }
    #[inline(always)]
    fn count(&self) -> KvResult<usize> {
        let r = self.inner.read();
        r.backend_col.count()
    }
    #[inline(always)]
    fn get(&self, k: &Self::K) -> KvResult<Option<Self::V>> {
        let r = self.inner.read();
        r.backend_col.get(k)
    }
    #[inline(always)]
    fn iter<
        D: Send + Sync,
        R: 'static + RangeBounds<Self::K>,
        F: FnOnce(
            KvIter<
                Self::BackendCol,
                <Self::BackendCol as BackendCol>::KeyBytes,
                <Self::BackendCol as BackendCol>::ValueBytes,
                <Self::BackendCol as BackendCol>::Iter,
                Self::K,
                Self::V,
            >,
        ) -> D,
    >(
        &self,
        range: R,
        f: F,
    ) -> D {
        let range: RangeBytes = crate::iter::convert_range::<Self::K, R>(range);
        let r = self.inner.read();
        let iter = r.backend_col.iter::<Self::K, Self::V>(range.clone());
        f(KvIter::new(iter, range))
    }
    #[inline(always)]
    fn subscribe(&self, subscriber_sender: Subscriber<Self::Event>) -> KvResult<()> {
        self.subscription_sender
            .try_send(subscriber_sender)
            .map_err(|_| KvError::FailToSubscribe)
    }
}

pub trait DbCollectionRoGetRef<V: ValueZc>: DbCollectionRo<V = V> {
    fn get_ref<D, F: Fn(&V::Ref) -> KvResult<D>>(
        &self,
        k: &<Self as DbCollectionRo>::K,
        f: F,
    ) -> KvResult<Option<D>>;
}

impl<V: ValueZc, BC: BackendCol, E: EventTrait<V = V>> DbCollectionRoGetRef<V> for ColRo<BC, E> {
    fn get_ref<D, F: Fn(&V::Ref) -> KvResult<D>>(&self, k: &E::K, f: F) -> KvResult<Option<D>> {
        let r = self.inner.read();
        r.backend_col.get_ref::<E::K, V, D, F>(k, f)
    }
}

pub trait DbCollectionRoGetRefSlice<V: ValueSliceZc>: DbCollectionRo<V = V> {
    fn get_ref_slice<D, F: Fn(&[V::Elem]) -> KvResult<D>>(
        &self,
        k: &<Self as DbCollectionRo>::K,
        f: F,
    ) -> KvResult<Option<D>>;
}

impl<V: ValueSliceZc, BC: BackendCol, E: EventTrait<V = V>> DbCollectionRoGetRefSlice<V>
    for ColRo<BC, E>
{
    fn get_ref_slice<D, F: Fn(&[V::Elem]) -> KvResult<D>>(
        &self,
        k: &E::K,
        f: F,
    ) -> KvResult<Option<D>> {
        let r = self.inner.read();
        r.backend_col.get_ref_slice::<E::K, V, D, F>(k, f)
    }
}
