import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/composables/useAnalytics", () => ({
  useAnalytics: () => ({
    trackEvent: vi.fn(),
  }),
}));

import { store } from "@/store";
import { cloneWithUnwrapProxy } from "@/helpers/cloneWithUnwrapProxy";
import { resetMockMode, uuid4 } from "@/helpers/random";
import { AudioKey, EngineId, SpeakerId, StyleId } from "@/type/preload";

const initialState = cloneWithUnwrapProxy(store.state);

beforeEach(() => {
  store.replaceState(cloneWithUnwrapProxy(initialState));
  resetMockMode();
});

describe("Sentryで見つかった状態不整合の回帰テスト", () => {
  test("空セルの voice が古い Engine を指していてもデフォルトスタイルを更新できる", () => {
    const audioKey = AudioKey(uuid4());
    const oldEngineId = EngineId("old-engine");
    const newEngineId = EngineId("new-engine");
    const speakerId = SpeakerId("speaker-id");
    const defaultStyleId = StyleId(1);

    store.replaceState({
      ...cloneWithUnwrapProxy(initialState),
      audioKeys: [audioKey],
      audioItems: {
        [audioKey]: {
          text: "",
          voice: {
            engineId: oldEngineId,
            speakerId,
            styleId: StyleId(999),
          },
        },
      },
      audioStates: {
        [audioKey]: {
          nowGenerating: false,
        },
      },
      characterInfos: {},
    });

    store.commit("SET_DEFAULT_STYLE_IDS", {
      defaultStyleIds: [
        {
          engineId: newEngineId,
          speakerUuid: speakerId,
          defaultStyleId,
        },
      ],
    });

    expect(store.state.audioItems[audioKey].voice).toEqual({
      engineId: newEngineId,
      speakerId,
      styleId: defaultStyleId,
    });
  });

  test("Engine manifest が消えているときはモーフィング候補の取得を行わない", async () => {
    const engineId = EngineId("missing-engine");

    await expect(
      store.dispatch("LOAD_MORPHABLE_TARGETS", {
        engineId,
        baseStyleId: StyleId(1),
      }),
    ).resolves.toBeUndefined();
  });
});
