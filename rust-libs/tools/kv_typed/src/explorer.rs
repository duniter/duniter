use crate::*;
use rayon::{iter::ParallelBridge, prelude::*};
use std::num::NonZeroUsize;

pub trait DbExplorable {
    fn explore<'a>(
        &self,
        collection_name: &str,
        action: ExplorerAction<'a>,
        stringify_json_value: fn(serde_json::Value) -> serde_json::Value,
    ) -> KvResult<Result<ExplorerActionResponse, StringErr>>;
    fn list_collections() -> Vec<(&'static str, &'static str, &'static str)>;
}

pub trait ExplorableKey: Sized {
    fn from_explorer_str(source: &str) -> Result<Self, StringErr>;
    fn to_explorer_string(&self) -> KvResult<String>;
}

impl ExplorableKey for () {
    fn from_explorer_str(_: &str) -> Result<Self, StringErr> {
        Ok(())
    }

    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(String::with_capacity(0))
    }
}

impl ExplorableKey for String {
    fn from_explorer_str(source: &str) -> Result<Self, StringErr> {
        Ok(source.to_owned())
    }

    fn to_explorer_string(&self) -> KvResult<String> {
        Ok(self.clone())
    }
}

macro_rules! impl_explorable_key_for_numbers {
    ($($T:ty),*) => {$(
        impl ExplorableKey for $T {
            fn from_explorer_str(source: &str) -> Result<Self, StringErr> {
                source.parse().map_err(|e| StringErr(format!("{}", e)))
            }

            fn to_explorer_string(&self) -> KvResult<String> {
                Ok(format!("{}", self))
            }
        }
    )*};
}

impl_explorable_key_for_numbers!(usize, u8, u16, u32, u64, u128, i8, i16, i32, i64, i128, f32, f64);

pub trait ExplorableValue: Sized {
    fn from_explorer_str(source: &str) -> Result<Self, StringErr>;
    fn to_explorer_json(&self) -> KvResult<serde_json::Value>;
}

impl ExplorableValue for () {
    fn from_explorer_str(_: &str) -> Result<Self, StringErr> {
        Ok(())
    }

    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::String(String::with_capacity(0)))
    }
}

impl ExplorableValue for String {
    fn from_explorer_str(source: &str) -> Result<Self, StringErr> {
        Ok(source.to_owned())
    }

    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::String(self.clone()))
    }
}

macro_rules! impl_explorable_value_for_numbers {
    ($($T:ty),*) => {$(
        impl ExplorableValue for $T {
            fn from_explorer_str(source: &str) -> Result<Self, StringErr> {
                source.parse().map_err(|e| StringErr(format!("{}", e)))
            }

            #[allow(trivial_numeric_casts)]
            fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
                Ok(serde_json::Value::Number(serde_json::Number::from_f64(*self as f64).expect("too large number")))
            }
        }
    )*};
}

impl_explorable_value_for_numbers!(
    usize, u8, u16, u32, u64, u128, isize, i8, i16, i32, i64, i128, f32, f64
);

impl<T, E> ExplorableValue for Vec<T>
where
    T: Display + FromStr<Err = E>,
    E: Display,
{
    fn from_explorer_str(source: &str) -> Result<Vec<T>, StringErr> {
        if let serde_json::Value::Array(json_array) =
            serde_json::Value::from_str(source).map_err(|e| StringErr(format!("{}", e)))?
        {
            let mut vec = Vec::with_capacity(json_array.len());
            for value in json_array {
                if let serde_json::Value::String(string) = value {
                    vec.push(<T>::from_str(&string).map_err(|e| StringErr(format!("{}", e)))?);
                } else {
                    return Err(StringErr(format!("Expected array of {}.", stringify!(T))));
                }
            }
            Ok(vec)
        } else {
            Err(StringErr(format!("Expected array of {}.", stringify!(T))))
        }
    }

    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::Array(
            self.iter()
                .map(|elem| serde_json::Value::String(format!("{}", elem)))
                .collect(),
        ))
    }
}

macro_rules! impl_explorable_value_for_smallvec {
    ($($N:literal),*) => {$(
        impl<T, E> ExplorableValue for SmallVec<[T; $N]>
        where
            T: Display + FromStr<Err = E>,
            E: Display,
        {
            fn from_explorer_str(source: &str) -> Result<SmallVec<[T; $N]>, StringErr> {
                if let serde_json::Value::Array(json_array) =
                    serde_json::Value::from_str(source).map_err(|e| StringErr(format!("{}", e)))?
                {
                    let mut svec = SmallVec::with_capacity(json_array.len());
                    for value in json_array {
                        if let serde_json::Value::String(string) = value {
                            svec.push(<T>::from_str(&string).map_err(|e| StringErr(format!("{}", e)))?);
                        } else {
                            return Err(StringErr(format!("Expected array of {}.", stringify!(T))));
                        }
                    }
                    Ok(svec)
                } else {
                    Err(StringErr(format!("Expected array of {}.", stringify!(T))))
                }
            }

            fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
                Ok(serde_json::Value::Array(
                    self.iter()
                        .map(|elem| serde_json::Value::String(format!("{}", elem)))
                        .collect(),
                ))
            }
        }
    )*};
}
impl_explorable_value_for_smallvec!(2, 4, 8, 16, 32, 64);

impl<T, E> ExplorableValue for BTreeSet<T>
where
    T: Display + FromStr<Err = E> + Ord,
    E: Display,
{
    fn from_explorer_str(source: &str) -> Result<BTreeSet<T>, StringErr> {
        if let serde_json::Value::Array(json_array) =
            serde_json::Value::from_str(source).map_err(|e| StringErr(format!("{}", e)))?
        {
            let mut bt_set = BTreeSet::new();
            for value in json_array {
                if let serde_json::Value::String(string) = value {
                    bt_set.insert(<T>::from_str(&string).map_err(|e| StringErr(format!("{}", e)))?);
                } else {
                    return Err(StringErr(format!("Expected array of {}.", stringify!(T))));
                }
            }
            Ok(bt_set)
        } else {
            Err(StringErr(format!("Expected array of {}.", stringify!(T))))
        }
    }

    fn to_explorer_json(&self) -> KvResult<serde_json::Value> {
        Ok(serde_json::Value::Array(
            self.iter()
                .map(|elem| serde_json::Value::String(format!("{}", elem)))
                .collect(),
        ))
    }
}

#[derive(Debug)]
pub enum ExplorerAction<'a> {
    Count,
    Get {
        key: &'a str,
    },
    Find {
        key_min: Option<String>,
        key_max: Option<String>,
        key_regex: Option<regex::Regex>,
        value_regex: Option<regex::Regex>,
        limit: Option<usize>,
        reverse: bool,
        step: NonZeroUsize,
    },
    Put {
        key: &'a str,
        value: &'a str,
    },
    Delete {
        key: &'a str,
    },
}

#[derive(Debug, PartialEq)]
pub struct EntryFound {
    pub key: String,
    pub value: serde_json::Value,
    pub captures: Option<ValueCaptures>,
}

#[derive(Debug, PartialEq)]
pub struct ValueCaptures(pub SmallVec<[SmallVec<[Option<String>; 8]>; 8]>);

#[derive(Debug, PartialEq)]
pub enum ExplorerActionResponse {
    Count(usize),
    Get(Option<serde_json::Value>),
    Find(Vec<EntryFound>),
    PutOk,
    DeleteOk,
}

impl<'a> ExplorerAction<'a> {
    pub fn exec<BC: BackendCol, E: EventTrait>(
        self,
        col: &ColRw<BC, E>,
        stringify_json_value: fn(serde_json::Value) -> serde_json::Value,
    ) -> KvResult<Result<ExplorerActionResponse, StringErr>> {
        Ok(match self {
            Self::Count => Ok(ExplorerActionResponse::Count(col.to_ro().count()?)),
            Self::Get { key } => match E::K::from_explorer_str(key) {
                Ok(k) => Ok(ExplorerActionResponse::Get(
                    col.to_ro()
                        .get(&k)?
                        .map(|v| v.to_explorer_json())
                        .transpose()?,
                )),
                Err(e) => Err(e),
            },
            Self::Find {
                key_min,
                key_max,
                key_regex,
                value_regex,
                limit,
                reverse,
                step,
            } => match define_range::<E::K>(key_min, key_max) {
                Ok(range) => Ok(ExplorerActionResponse::Find(match range {
                    Range::Full => Self::get_range_inner(
                        col.to_ro(),
                        ..,
                        key_regex,
                        value_regex,
                        limit,
                        reverse,
                        step,
                        stringify_json_value,
                    )?,
                    Range::From(range) => Self::get_range_inner(
                        col.to_ro(),
                        range,
                        key_regex,
                        value_regex,
                        limit,
                        reverse,
                        step,
                        stringify_json_value,
                    )?,
                    Range::FromTo(range) => Self::get_range_inner(
                        col.to_ro(),
                        range,
                        key_regex,
                        value_regex,
                        limit,
                        reverse,
                        step,
                        stringify_json_value,
                    )?,
                    Range::To(range) => Self::get_range_inner(
                        col.to_ro(),
                        range,
                        key_regex,
                        value_regex,
                        limit,
                        reverse,
                        step,
                        stringify_json_value,
                    )?,
                })),
                Err(e) => Err(e),
            },
            Self::Put { key, value } => match E::K::from_explorer_str(key) {
                Ok(k) => match E::V::from_explorer_str(value) {
                    Ok(v) => {
                        col.upsert(k, v)?;
                        Ok(ExplorerActionResponse::PutOk)
                    }
                    Err(e) => Err(e),
                },
                Err(e) => Err(e),
            },
            Self::Delete { key } => match E::K::from_explorer_str(key) {
                Ok(k) => {
                    col.remove(k)?;
                    Ok(ExplorerActionResponse::DeleteOk)
                }
                Err(e) => Err(e),
            },
        })
    }
    #[allow(clippy::too_many_arguments)]
    fn get_range_inner<BC: BackendCol, E: EventTrait, R: 'static + RangeBounds<E::K>>(
        col: &ColRo<BC, E>,
        range: R,
        key_regex: Option<regex::Regex>,
        value_regex: Option<regex::Regex>,
        limit: Option<usize>,
        reverse: bool,
        step: NonZeroUsize,
        stringify_json_value: fn(serde_json::Value) -> serde_json::Value,
    ) -> KvResult<Vec<EntryFound>> {
        let filter_map_closure = move |entry_res| {
            stringify_and_filter_entry_res::<E::K, E::V>(
                entry_res,
                key_regex.as_ref(),
                value_regex.as_ref(),
                stringify_json_value,
            )
        };

        if let Some(limit) = limit {
            col.iter(range, |iter| {
                if reverse {
                    iter.reverse()
                        .step_by(step.get())
                        .filter_map(filter_map_closure)
                        .take(limit)
                        .collect()
                } else {
                    iter.step_by(step.get())
                        .filter_map(filter_map_closure)
                        .take(limit)
                        .collect()
                }
            })
        } else {
            {
                let (send, recv) = unbounded();

                let handler = std::thread::spawn(move || {
                    let iter = recv.into_iter().step_by(step.get()).par_bridge();

                    iter.filter_map(filter_map_closure).collect()
                });

                col.iter(range, |iter| {
                    if reverse {
                        for entry_res in iter.reverse() {
                            if send.try_send(entry_res).is_err() {
                                return handler.join().expect("child thread panic");
                            }
                        }
                    } else {
                        for entry_res in iter {
                            if send.try_send(entry_res).is_err() {
                                return handler.join().expect("child thread panic");
                            }
                        }
                    }
                    drop(send);

                    handler.join().expect("child thread panic")
                })
            }
        }
    }
}

enum Range<K> {
    Full,
    From(core::ops::RangeFrom<K>),
    To(core::ops::RangeToInclusive<K>),
    FromTo(core::ops::RangeInclusive<K>),
}

fn define_range<K: Key>(
    key_min_opt: Option<String>,
    key_max_opt: Option<String>,
) -> Result<Range<K>, StringErr> {
    if let Some(key_min) = key_min_opt {
        let k_min = K::from_explorer_str(&key_min)?;
        if let Some(key_max) = key_max_opt {
            let k_max = K::from_explorer_str(&key_max)?;
            Ok(Range::FromTo(core::ops::RangeInclusive::new(k_min, k_max)))
        } else {
            Ok(Range::From(core::ops::RangeFrom { start: k_min }))
        }
    } else if let Some(key_max) = key_max_opt {
        let k_max = K::from_explorer_str(&key_max)?;
        Ok(Range::To(core::ops::RangeToInclusive { end: k_max }))
    } else {
        Ok(Range::Full)
    }
}

fn stringify_and_filter_entry_res<K: Key, V: Value>(
    entry_res: KvResult<(K, V)>,
    key_regex_opt: Option<&regex::Regex>,
    value_regex_opt: Option<&regex::Regex>,
    stringify_json_value: fn(serde_json::Value) -> serde_json::Value,
) -> Option<KvResult<EntryFound>> {
    match entry_res {
        Ok((k, v)) => match k.to_explorer_string() {
            Ok(key_string) => {
                if let Some(key_regex) = key_regex_opt {
                    if !key_regex.is_match(&key_string) {
                        return None;
                    }
                }
                match v.to_explorer_json() {
                    Ok(mut value_json) => {
                        value_json = stringify_json_value(value_json);
                        let captures = if let Some(value_regex) = value_regex_opt {
                            let value_string = value_json.to_string();
                            if !value_regex.is_match(&value_string) {
                                return None;
                            }
                            Some(ValueCaptures(
                                value_regex
                                    .captures_iter(&value_string)
                                    .map(|caps| {
                                        caps.iter()
                                            .skip(1)
                                            .map(|m_opt| m_opt.map(|m| m.as_str().to_owned()))
                                            .collect::<SmallVec<[Option<String>; 8]>>()
                                    })
                                    .collect(),
                            ))
                        } else {
                            None
                        };
                        Some(Ok(EntryFound {
                            key: key_string,
                            value: value_json,
                            captures,
                        }))
                    }
                    Err(e) => Some(Err(e)),
                }
            }
            Err(e) => Some(Err(e)),
        },
        Err(e) => Some(Err(e)),
    }
}
