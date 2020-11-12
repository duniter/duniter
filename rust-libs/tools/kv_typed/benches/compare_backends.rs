use criterion::{criterion_group, criterion_main, Criterion, /*, AxisScale, PlotConfiguration*/};
use kv_typed::prelude::*;
use std::{fmt::Debug, path::PathBuf};

kv_typed::db_schema!(Test, [["c1", Col1, u32, String],]);
//const LEVELDB_DIR_PATH: &str = "/dev/shm/kv_typed/benches/compare_backends/leveldb";
//const LMDB_DIR_PATH: &str = "/dev/shm/kv_typed/benches/compare_backends/lmdb";
const LEVELDB_DIR_PATH: &str = "/home/elois/tmp/kv_typed/benches/compare_backends/leveldb";
const LMDB_DIR_PATH: &str = "/home/elois/tmp/kv_typed/benches/compare_backends/lmdb";
const SLED_DIR_PATH: &str = "/home/elois/tmp/kv_typed/benches/compare_backends/sled";
static SMALL_VAL: &str = "abcdefghijklmnopqrst";
static LARGE_VAL: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

fn read_n_entries<B: Backend>(db: &TestDb<B>, n: u32, val: String) {
    for i in 0..n {
        assert_eq!(db.col1().get(&i).expect("db err"), Some(val.clone()));
    }
    /*db.col1().iter(.., |iter| {
        let mut iter = iter.values();
        for _ in 0..n {
            assert_eq!(iter.next_res().expect(""), Some(val.clone()));
            //assert_eq!(db.col1().get(&i).expect(""), Some(val.clone()));
        }
        assert_eq!(iter.next_res().expect(""), None);
    });*/
}
fn remove_and_write_n_entries<B: Backend>(db: &TestDb<B>, n: u32, val: String) {
    for i in 0..n {
        db.col1_write().remove(i).expect("fail to write");
        db.col1_write()
            .upsert(i, val.clone())
            .expect("fail to write");
    }
}
fn write_n_entries<B: Backend>(db: &TestDb<B>, n: u32, val: String) {
    for i in 0..n {
        db.col1_write()
            .upsert(i, val.clone())
            .expect("fail to write");
    }
}

pub fn benchmark(c: &mut Criterion) {
    // Read chart config
    //let read_chart_config = PlotConfiguration::default().summary_scale(AxisScale::Logarithmic);

    // Create DBs
    std::fs::create_dir_all(LEVELDB_DIR_PATH).expect("fail to create leveldb dir");
    let leveldb_db = TestDb::<LevelDb>::open(LevelDbConf {
        db_path: PathBuf::from(LEVELDB_DIR_PATH),
        ..Default::default()
    })
    .expect("fail to open db");
    /*let lmdb_db =
    TestDb::<Lmdb>::open(LmdbConf::default().folder_path(PathBuf::from(LMDB_DIR_PATH)))
        .expect("fail to open db");*/
    //let mem_db = TestDb::<Mem>::open(MemConf::default()).expect("fail to open db");
    let sled_db =
        TestDb::<Sled>::open(SledConf::default().path(SLED_DIR_PATH)).expect("fail to open db");

    // Test write small values
    let mut group = c.benchmark_group("write small values");
    /*group.bench_function("lmdb", |b| {
        b.iter(|| remove_and_write_n_entries(&lmdb_db, 100, String::from(SMALL_VAL)))
    });*/
    group.bench_function("leveldb", |b| {
        b.iter(|| remove_and_write_n_entries(&leveldb_db, 100, String::from(SMALL_VAL)))
    });
    /*group.bench_function("mem", |b| {
        b.iter(|| remove_and_write_n_entries(&mem_db, 100, String::from(SMALL_VAL)))
    });*/
    group.bench_function("sled", |b| {
        b.iter(|| remove_and_write_n_entries(&sled_db, 100, String::from(SMALL_VAL)))
    });
    group.finish();

    // Prepare read test
    //write_n_entries(&lmdb_db, 100, String::from(SMALL_VAL));
    write_n_entries(&leveldb_db, 100, String::from(SMALL_VAL));
    //write_n_entries(&mem_db, 100, String::from(SMALL_VAL));
    write_n_entries(&sled_db, 100, String::from(SMALL_VAL));

    // Test read small values
    let mut group = c.benchmark_group("read small values");
    //group.plot_config(read_chart_config.clone());
    /*group.bench_function("lmdb", |b| {
        b.iter(|| read_n_entries(&lmdb_db, 100, String::from(SMALL_VAL)))
    });*/
    group.bench_function("leveldb", |b| {
        b.iter(|| read_n_entries(&leveldb_db, 100, String::from(SMALL_VAL)))
    });
    /*group.bench_function("mem", |b| {
        b.iter(|| read_n_entries(&mem_db, 100, String::from(SMALL_VAL)))
    });*/
    group.bench_function("sled", |b| {
        b.iter(|| read_n_entries(&sled_db, 100, String::from(SMALL_VAL)))
    });
    group.finish();

    // Test write large values
    let mut group = c.benchmark_group("write large values");
    /*group.bench_function("lmdb", |b| {
        b.iter(|| remove_and_write_n_entries(&lmdb_db, 100, String::from(LARGE_VAL)))
    });*/
    group.bench_function("leveldb", |b| {
        b.iter(|| remove_and_write_n_entries(&leveldb_db, 100, String::from(LARGE_VAL)))
    });
    /*group.bench_function("mem", |b| {
        b.iter(|| remove_and_write_n_entries(&mem_db, 100, String::from(LARGE_VAL)))
    });*/
    group.bench_function("sled", |b| {
        b.iter(|| remove_and_write_n_entries(&sled_db, 100, String::from(LARGE_VAL)))
    });
    group.finish();

    // Prepare read test
    //write_n_entries(&lmdb_db, 100, String::from(LARGE_VAL));
    write_n_entries(&leveldb_db, 100, String::from(LARGE_VAL));
    //write_n_entries(&mem_db, 100, String::from(LARGE_VAL));
    write_n_entries(&sled_db, 100, String::from(LARGE_VAL));

    // Test read large values
    let mut group = c.benchmark_group("read large values");
    //group.plot_config(read_chart_config);
    /*group.bench_function("lmdb", |b| {
        b.iter(|| read_n_entries(&lmdb_db, 100, String::from(LARGE_VAL)))
    });*/
    group.bench_function("leveldb", |b| {
        b.iter(|| read_n_entries(&leveldb_db, 100, String::from(LARGE_VAL)))
    });
    /*group.bench_function("mem", |b| {
        b.iter(|| read_n_entries(&mem_db, 100, String::from(LARGE_VAL)))
    });*/
    group.bench_function("sled", |b| {
        b.iter(|| read_n_entries(&sled_db, 100, String::from(LARGE_VAL)))
    });
    group.finish();

    // Close DBs
    std::fs::remove_dir_all(LEVELDB_DIR_PATH).expect("fail to remove leveldb dir");
    std::fs::remove_dir_all(LMDB_DIR_PATH).expect("fail to remove lmdb dir");
    std::fs::remove_dir_all(SLED_DIR_PATH).expect("fail to remove sled dir");
}

criterion_group!(benches, benchmark);
criterion_main!(benches);
