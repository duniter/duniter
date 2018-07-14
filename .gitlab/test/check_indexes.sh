#!/usr/bin/env bash

ORIGIN_DIR=`pwd`
mkdir -p $1
DUMP_DIR=`cd $1 && pwd`
ARCHIVES="$DUMP_DIR/archives"
CURRENCY=$2
DB_TEST="gitlab_ci_sync_test_$CURRENCY"
G1_TARGET_BLOCK=$3 # This is a fixed block# which determines to the sha1 hashes
G1_IINDEX_CS=$4
G1_MINDEX_CS=$5
G1_CINDEX_CS=$6
G1_SINDEX_CS=$7

checksum_test() {
  local table=$1
  local correct_hash=$2
  local db=$3
  echo "Checking $table's checksum..."
  bin/duniter --mdb ${db} dump table "$table" > "$DUMP_DIR/$table"
  result_hash=`sha1sum "$DUMP_DIR/$table" | grep -Po ".* " | grep -Po "[a-f0-9]+"`
#  rm -f "$DUMP_DIR/$table"
  if [ "$result_hash" == "$correct_hash" ]; then
    echo "OK";
  else
    echo "Error! Wrong hash detected. ($result_hash != $correct_hash)"
    exit 1
  fi
}

sync_data() {
  local db=$1
  local target=$2
  local target_block=$3
  local reset_data="bin/duniter --mdb ${db} reset all"
  local sync="bin/duniter --mdb ${db} sync ${target} --nointeractive ${target_block}"
  echo "$reset_data"
  ${reset_data}
  echo "$sync"
  ${sync}
}

if [ -d ${ARCHIVES} ]; then
  echo "Updating archives..."
  cd ${ARCHIVES}
  git checkout master
  git pull origin master
else
  echo "Cloning archives..."
  git clone https://git.duniter.org/c-geek/blockchain-archives.git ${ARCHIVES}
fi

echo "Positionnement dans $ORIGIN_DIR"

cd ${ORIGIN_DIR}

sync_data ${DB_TEST} "$ARCHIVES/$CURRENCY" ${G1_TARGET_BLOCK}
checksum_test i_index ${G1_IINDEX_CS} ${DB_TEST}
checksum_test m_index ${G1_MINDEX_CS} ${DB_TEST}
checksum_test c_index ${G1_CINDEX_CS} ${DB_TEST}
checksum_test s_index ${G1_SINDEX_CS} ${DB_TEST}
