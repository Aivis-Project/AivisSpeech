import { expect, test } from "vitest";
import { normalizeSingleInstanceLockData } from "@/backend/electron/singleInstanceLockData";

test("second-instanceの追加データがnullでもファイル指定なしとして扱える", () => {
  expect(normalizeSingleInstanceLockData(null)).toEqual({
    filePath: undefined,
  });
});

test("second-instanceの追加データからファイルパスだけを取り出せる", () => {
  expect(
    normalizeSingleInstanceLockData({
      filePath: "/tmp/project.aisp",
      unexpected: true,
    }),
  ).toEqual({
    filePath: "/tmp/project.aisp",
  });
});

test("second-instanceの追加データが想定外の型なら通常起動扱いにする", () => {
  expect(normalizeSingleInstanceLockData({ filePath: 1 })).toEqual({
    filePath: undefined,
  });
});
