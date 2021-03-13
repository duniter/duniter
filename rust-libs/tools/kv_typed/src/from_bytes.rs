use crate::*;

#[derive(Clone, Copy, Debug, Error)]
#[error("Corrupted DB: {0} bytes are wrong aligned or have invalid length")]
pub struct LayoutVerifiedErr(pub &'static str);

pub trait FromBytes: Sized {
    type Err: Error + Send + Sync + 'static;

    /// Create Self from bytes.
    fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err>;
}

impl FromBytes for () {
    type Err = std::convert::Infallible;

    fn from_bytes(_: &[u8]) -> Result<Self, Self::Err> {
        Ok(())
    }
}

macro_rules! impl_from_bytes_for_numbers {
    ($($T:ty),*) => {$(
        impl FromBytes for $T {
            type Err = std::array::TryFromSliceError;

            fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
                Ok(<$T>::from_le_bytes(bytes.try_into()?))
            }
        }
    )*};
}
impl_from_bytes_for_numbers!(
    usize, u8, u16, u32, u64, u128, isize, i8, i16, i32, i64, i128, f32, f64
);

macro_rules! impl_from_bytes_for_be_numbers {
    ($(($T:ty, $INT:ty)),*) => {$(
        impl FromBytes for $T {
            type Err = std::array::TryFromSliceError;

            fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
                Ok(Self(<$INT>::from_be_bytes(bytes.try_into()?)))
            }
        }
    )*};
}
impl_from_bytes_for_be_numbers!((U32BE, u32), (U64BE, u64));

impl FromBytes for String {
    type Err = std::str::Utf8Error;

    fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
        Ok(std::str::from_utf8(bytes)?.to_owned())
    }
}

macro_rules! impl_from_bytes_for_smallvec {
    ($($N:literal),*) => {$(
        impl<T> FromBytes for SmallVec<[T; $N]>
        where
            T: Copy + zerocopy::FromBytes,
        {
            type Err = LayoutVerifiedErr;

            fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
                let layout_verified = zerocopy::LayoutVerified::<_, [T]>::new_slice(bytes)
                    .ok_or_else(|| LayoutVerifiedErr(stringify!(T)).into())?;
                Ok(SmallVec::from_slice(layout_verified.into_slice()))
            }
        }
    )*};
}
impl_from_bytes_for_smallvec!(1, 2, 4, 8, 16, 32, 64);

impl<T> FromBytes for Vec<T>
where
    T: Copy + Default + zerocopy::FromBytes,
{
    type Err = LayoutVerifiedErr;

    fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
        let layout_verified = zerocopy::LayoutVerified::<_, [T]>::new_slice(bytes)
            .ok_or(LayoutVerifiedErr(stringify!(Vec<T>)))?;
        let slice = layout_verified.into_slice();
        let mut vec = Vec::with_capacity(slice.len());
        vec.resize_with(slice.len(), Default::default);
        vec.copy_from_slice(slice);
        Ok(vec)
    }
}

impl<T> FromBytes for BTreeSet<T>
where
    T: Copy + zerocopy::FromBytes + Ord,
{
    type Err = LayoutVerifiedErr;

    fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
        let layout_verified = zerocopy::LayoutVerified::<_, [T]>::new_slice(bytes)
            .ok_or(LayoutVerifiedErr(stringify!(BTreeSet<T>)))?;
        let slice = layout_verified.into_slice();
        Ok(slice.iter().copied().collect())
    }
}

impl<T> FromBytes for HashSet<T>
where
    T: Copy + Eq + zerocopy::FromBytes + std::hash::Hash,
{
    type Err = LayoutVerifiedErr;

    fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
        let layout_verified = zerocopy::LayoutVerified::<_, [T]>::new_slice(bytes)
            .ok_or(LayoutVerifiedErr(stringify!(HashSet<T>)))?;
        let slice = layout_verified.into_slice();
        Ok(slice.iter().copied().collect())
    }
}

impl FromBytes for IVec {
    type Err = std::convert::Infallible;

    fn from_bytes(bytes: &[u8]) -> Result<Self, Self::Err> {
        Ok(Self::from(bytes))
    }
}
