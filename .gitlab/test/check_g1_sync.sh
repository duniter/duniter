#!/usr/bin/env bash

G1_TARGET_BLOCK=132446 # This is a fixed block# which determines to the sha1 hashes
G1_BINDEX_CS=a8c653572688bcb9887dfe080c1aaab17f6d8b7e
G1_IINDEX_CS=26393b64cdb9abb8e4012d6914f475635cba4c60
G1_MINDEX_CS=7c5f07c7705647365b8965fcfc5a084c2f82a388
G1_CINDEX_CS=3803c1ed8d3dd8f31558666d8dfd30272a6d0b74
G1_SINDEX_CS=551bdba1855d5c49cd503fcb8ad787b2a24c2c42

.gitlab/test/check_indexes.sh /tmp/duniter_ci_dump/ g1 ${G1_TARGET_BLOCK} ${G1_BINDEX_CS} ${G1_IINDEX_CS} ${G1_MINDEX_CS} ${G1_CINDEX_CS} ${G1_SINDEX_CS}
