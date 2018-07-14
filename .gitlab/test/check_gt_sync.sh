#!/usr/bin/env bash

GT_TARGET_BLOCK=210000 # This is a fixed block# which determines to the sha1 hashes
GT_IINDEX_CS=dfd2dfc3d4d0ced4c101badb4d4a1ab85de8cbde
GT_MINDEX_CS=9d8f665f5fcf1f21082278c4787bb3df085ff109
GT_CINDEX_CS=b141361fb40f4c13f03f4640151c7674e190a4dd
GT_SINDEX_CS=7c6801027e39b9fea9be973d8773ac77d2c9a1f9

.gitlab/test/check_indexes.sh /tmp/duniter_ci_dump/ gt ${GT_TARGET_BLOCK} ${GT_IINDEX_CS} ${GT_MINDEX_CS} ${GT_CINDEX_CS} ${GT_SINDEX_CS}
