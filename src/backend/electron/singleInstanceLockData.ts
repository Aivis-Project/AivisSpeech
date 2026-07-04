type SingleInstanceLockData = {
  filePath: string | undefined;
};

/**
 * `requestSingleInstanceLock` から受け取ったデータを安全な形へ変換する
 * @param rawData Electron が `second-instance` に渡した追加データ
 * @returns ファイルパスだけを持つ起動データ
 */
export function normalizeSingleInstanceLockData(
  rawData: unknown,
): SingleInstanceLockData {
  // OS や起動経路によっては null が渡るため、ファイル指定なしの起動として扱う
  if (rawData == undefined || typeof rawData !== "object") {
    return { filePath: undefined };
  }

  const filePath = (rawData as { filePath?: unknown }).filePath;

  // 想定外の型は通常起動扱いに留め、プロジェクト読み込みや VVPP インストールへ進めない
  if (typeof filePath !== "string" || filePath === "") {
    return { filePath: undefined };
  }

  return { filePath };
}
