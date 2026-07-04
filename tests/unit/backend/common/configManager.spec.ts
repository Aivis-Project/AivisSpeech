import { vi, it, expect, afterEach } from "vitest";
import pastConfigs from "./pastConfigs";
import configBugDefaultPreset1996 from "./pastConfigs/0.19.1-bug_default_preset.json";
import { BaseConfigManager } from "@/backend/common/ConfigManager";
import { getConfigSchema } from "@/type/preload";
import type { ConfigType, PresetKey, VoiceId } from "@/type/preload";

const configBase = {
  ...getConfigSchema({ isMac: false }).parse({}),
  __internal__: {
    migrations: {
      version: "999.999.999",
    },
  },
};

class TestConfigManager extends BaseConfigManager {
  constructor() {
    super({ isMac: false });
  }

  getAppVersion() {
    return "999.999.999";
  }

  async exists() {
    throw new Error("mockで実装してください");

    // Unreachableだが、一応booleanを返さないとモックできないので返しておく。
    return false;
  }

  async load() {
    throw new Error("mockで実装してください");

    return {} as ReturnType<BaseConfigManager["load"]>;
  }

  // VitestのmockFn.mock.callsの型のために引数を受け取るようにしている。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async save(config: Parameters<BaseConfigManager["save"]>[0]) {
    throw new Error("mockで実装してください");
  }
}

afterEach(() => {
  vi.resetAllMocks();
});

it("新規作成できる", async () => {
  vi.spyOn(TestConfigManager.prototype, "exists").mockImplementation(
    async () => false,
  );
  vi.spyOn(TestConfigManager.prototype, "save").mockImplementation(
    async () => undefined,
  );

  const configManager = new TestConfigManager();
  await configManager.initialize();
  expect(configManager).toBeTruthy();
});

it("バージョンが保存される", async () => {
  vi.spyOn(TestConfigManager.prototype, "exists").mockImplementation(
    async () => false,
  );
  const saveSpy = vi
    .spyOn(TestConfigManager.prototype, "save")
    .mockImplementation(async () => undefined);

  const configManager = new TestConfigManager();
  await configManager.initialize();
  await configManager.ensureSaved();
  expect(saveSpy).toHaveBeenCalled();
  const savedData = saveSpy.mock.calls[0][0];
  expect(savedData.__internal__.migrations.version).toBe("999.999.999");
});

for (const [version, data] of pastConfigs) {
  it(`${version}からマイグレーションできる`, async () => {
    vi.spyOn(TestConfigManager.prototype, "exists").mockImplementation(
      async () => true,
    );
    vi.spyOn(TestConfigManager.prototype, "save").mockImplementation(
      async () => undefined,
    );
    vi.spyOn(TestConfigManager.prototype, "load").mockImplementation(
      async () => data,
    );

    const configManager = new TestConfigManager();
    await configManager.initialize();
    expect(configManager).toBeTruthy();

    // マイグレーション後のデータが正しいことをスナップショットで確認
    expect(configManager.getAll()).toMatchSnapshot();
  });
}

it("0.19.1からのマイグレーション時にハミング・ソングスタイル由来のデフォルトプリセットを削除できている", async () => {
  const data = configBugDefaultPreset1996;
  vi.spyOn(TestConfigManager.prototype, "exists").mockImplementation(
    async () => true,
  );
  vi.spyOn(TestConfigManager.prototype, "save").mockImplementation(
    async () => undefined,
  );
  vi.spyOn(TestConfigManager.prototype, "load").mockImplementation(
    async () => data,
  );

  // VoiceIdからスタイルIDを取得する。VoiceIdの3番目がスタイルID。
  function getStyleIdFromVoiceId(voiceId: string): number {
    const splited = voiceId.split(":");
    const styleId = parseInt(splited[2]);
    return styleId;
  }

  // ソング・ハミングスタイルかどうかを判定する
  function isSingerLikeStyle(styleId: number): boolean {
    // スタイルIDが3000以上3085以下または6000のものをソング・ハミングスタイルとみなす
    return (styleId >= 3000 && styleId <= 3085) || styleId === 6000;
  }

  // マイグレーション前のデフォルトプリセットのスタイルID
  const beforeDefaultPresetStyleIds = Object.keys(
    configBugDefaultPreset1996.defaultPresetKeys,
  ).map((key) => getStyleIdFromVoiceId(key));

  // マイグレーション
  const configManager = new TestConfigManager();
  await configManager.initialize();
  const presets = configManager.get("presets");
  const defaultPresetKeys = configManager.get("defaultPresetKeys");

  // ソング・ハミングスタイルのデフォルトプリセットが削除されていることを確認
  const afterDefaultPresetStyleIds = Object.keys(defaultPresetKeys).map((key) =>
    getStyleIdFromVoiceId(key),
  );
  const deletedStyleIds = beforeDefaultPresetStyleIds.filter(
    (styleId) => !afterDefaultPresetStyleIds.includes(styleId),
  );
  expect(deletedStyleIds.length).toBe(86 - 5 + 1);
  expect(deletedStyleIds.every(isSingerLikeStyle)).toBeTruthy();

  // 残っているデフォルトプリセットはトークスタイルなことを確認
  const remainingStyleIds = afterDefaultPresetStyleIds.filter(
    (styleId) => !deletedStyleIds.includes(styleId),
  );
  expect(
    remainingStyleIds.every((styleId) => !isSingerLikeStyle(styleId)),
  ).toBeTruthy();

  // プリセットが削除されていることを確認
  expect(remainingStyleIds.length).toBe(presets.keys.length);
  expect(remainingStyleIds.length).toBe(Object.keys(presets.items).length);
});

it("ハミング・ソングスタイルとトークスタイルで共有されたプリセット本体を残せる", async () => {
  const sharedPresetKey = "shared-preset-key" as PresetKey;
  const singerOnlyPresetKey = "singer-only-preset-key" as PresetKey;
  const talkVoiceId =
    "engine-id:speaker-id:1" as VoiceId;
  const singerVoiceId =
    "engine-id:speaker-id:3000" as VoiceId;
  const singerOnlyVoiceId =
    "engine-id:speaker-id:6000" as VoiceId;
  const createPreset = (name: string): ConfigType["presets"]["items"][PresetKey] => ({
    name,
    speedScale: 1,
    intonationScale: 1,
    pitchScale: 0,
    volumeScale: 1,
    pauseLengthScale: 1,
    prePhonemeLength: 0.1,
    postPhonemeLength: 0.1,
  });
  const data = structuredClone(configBase);
  data.__internal__.migrations.version = "0.19.1";
  data.presets = {
    keys: [sharedPresetKey, singerOnlyPresetKey],
    items: {
      [sharedPresetKey]: createPreset("共有プリセット"),
      [singerOnlyPresetKey]: createPreset("ソング専用プリセット"),
    },
  };
  data.defaultPresetKeys = {
    [talkVoiceId]: sharedPresetKey,
    [singerVoiceId]: sharedPresetKey,
    [singerOnlyVoiceId]: singerOnlyPresetKey,
  };
  vi.spyOn(TestConfigManager.prototype, "exists").mockImplementation(
    async () => true,
  );
  vi.spyOn(TestConfigManager.prototype, "save").mockImplementation(
    async () => undefined,
  );
  vi.spyOn(TestConfigManager.prototype, "load").mockImplementation(
    async () => data,
  );

  const configManager = new TestConfigManager();
  await configManager.initialize();
  const presets = configManager.get("presets");
  const defaultPresetKeys = configManager.get("defaultPresetKeys");

  // ソング系 defaultPresetKeys だけを外し、トーク側が参照している共有プリセットは残す
  expect(defaultPresetKeys[talkVoiceId]).toBe(sharedPresetKey);
  expect(defaultPresetKeys[singerVoiceId]).toBeUndefined();
  expect(defaultPresetKeys[singerOnlyVoiceId]).toBeUndefined();
  expect(presets.items[sharedPresetKey]).toBeDefined();
  expect(presets.items[singerOnlyPresetKey]).toBeUndefined();
  expect(presets.keys).toEqual([sharedPresetKey]);
});

it("getできる", async () => {
  vi.spyOn(TestConfigManager.prototype, "exists").mockImplementation(
    async () => true,
  );
  vi.spyOn(TestConfigManager.prototype, "save").mockImplementation(
    async () => undefined,
  );
  vi.spyOn(TestConfigManager.prototype, "load").mockImplementation(
    async () => ({
      ...configBase,
      inheritAudioInfo: false,
    }),
  );

  const configManager = new TestConfigManager();
  await configManager.initialize();
  expect(configManager.get("inheritAudioInfo")).toBe(false);
});

it("setできる", async () => {
  vi.spyOn(TestConfigManager.prototype, "exists").mockImplementation(
    async () => true,
  );
  vi.spyOn(TestConfigManager.prototype, "save").mockImplementation(
    async () => undefined,
  );
  vi.spyOn(TestConfigManager.prototype, "load").mockImplementation(
    async () => ({
      ...configBase,
      inheritAudioInfo: false,
    }),
  );

  const configManager = new TestConfigManager();
  await configManager.initialize();
  configManager.set("inheritAudioInfo", true);
  expect(configManager.get("inheritAudioInfo")).toBe(true);
});

it("壊れた分割ペイン位置を未設定として読み込める", async () => {
  vi.spyOn(TestConfigManager.prototype, "exists").mockImplementation(
    async () => true,
  );
  vi.spyOn(TestConfigManager.prototype, "save").mockImplementation(
    async () => undefined,
  );
  vi.spyOn(TestConfigManager.prototype, "load").mockImplementation(
    async () => ({
      ...configBase,
      splitterPosition: {
        portraitPaneWidth: 240,
        audioInfoPaneWidth: NaN,
        audioDetailPaneHeight: Infinity,
      },
    }),
  );

  const configManager = new TestConfigManager();
  await configManager.initialize();

  expect(configManager.get("splitterPosition")).toEqual({
    portraitPaneWidth: 240,
    audioInfoPaneWidth: undefined,
    audioDetailPaneHeight: undefined,
  });
});
