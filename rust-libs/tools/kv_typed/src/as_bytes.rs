use crate::*;

pub trait AsBytes {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, f: F) -> T;
}

impl AsBytes for () {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(&[])
    }
}

impl AsBytes for String {
    fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
        f(self.as_bytes())
    }
}

impl<T> AsBytes for Vec<T>
where
    T: zerocopy::AsBytes,
{
    fn as_bytes<D, F: FnMut(&[u8]) -> D>(&self, mut f: F) -> D {
        use zerocopy::AsBytes as _;
        f((&self[..]).as_bytes())
    }
}

macro_rules! impl_as_bytes_for_smallvec {
    ($($N:literal),*) => {$(
        impl<T> AsBytes for SmallVec<[T; $N]>
        where
            T: zerocopy::AsBytes,
        {
            fn as_bytes<D, F: FnMut(&[u8]) -> D>(&self, mut f: F) -> D {
                use zerocopy::AsBytes as _;
                f((&self[..]).as_bytes())
            }
        }
    )*};
}
impl_as_bytes_for_smallvec!(1, 2, 4, 8, 16, 32, 64);

impl<T> AsBytes for BTreeSet<T>
where
    T: zerocopy::AsBytes + Copy,
{
    fn as_bytes<D, F: FnMut(&[u8]) -> D>(&self, mut f: F) -> D {
        use zerocopy::AsBytes as _;
        f((&self.iter().copied().collect::<SmallVec<[T; 32]>>()[..]).as_bytes())
    }
}

impl<T> AsBytes for HashSet<T>
where
    T: zerocopy::AsBytes + Copy,
{
    fn as_bytes<D, F: FnMut(&[u8]) -> D>(&self, mut f: F) -> D {
        use zerocopy::AsBytes as _;
        f((&self.iter().copied().collect::<SmallVec<[T; 32]>>()[..]).as_bytes())
    }
}

macro_rules! impl_as_bytes_for_le_numbers {
    ($($T:ty),*) => {$(
        impl AsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
                f(&self.to_le_bytes()[..])
            }
        }
    )*};
}
impl_as_bytes_for_le_numbers!(
    usize, u8, u16, u32, u64, u128, isize, i8, i16, i32, i64, i128, f32, f64
);

macro_rules! impl_as_bytes_for_be_numbers {
    ($($T:ty),*) => {$(
        impl AsBytes for $T {
            fn as_bytes<T, F: FnMut(&[u8]) -> T>(&self, mut f: F) -> T {
                f(&self.0.to_be_bytes()[..])
            }
        }
    )*};
}
impl_as_bytes_for_be_numbers!(U32BE);
