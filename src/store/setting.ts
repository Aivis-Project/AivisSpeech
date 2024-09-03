import { Dark, setCssVar, colors } from "quasar";
import { SettingStoreState, SettingStoreTypes } from "./type";
import { createDotNotationUILockAction as createUILockAction } from "./ui";
import { createDotNotationPartialStore as createPartialStore } from "./vuex";
import {
  HotkeySettingType,
  SavingSetting,
  ExperimentalSettingType,
  ThemeColorType,
  ThemeConf,
  ToolbarSettingType,
  EngineId,
  ConfirmedTips,
  RootMiscSettingType,
} from "@/type/preload";
import { IsEqual } from "@/type/utility";

export const settingStoreState: SettingStoreState = {
  savingSetting: {
    fileEncoding: "UTF-8",
    fileNamePattern: "",
    fixedExportEnabled: false,
    fixedExportDir: "",
    avoidOverwrite: false,
    exportLab: false,
    exportText: false,
    outputStereo: false,
    audioOutputDevice: "default",
  },
  hotkeySettings: [],
  toolbarSetting: [],
  engineIds: [],
  engineInfos: {},
  engineManifests: {},
  themeSetting: {
    currentTheme: "Default",
    availableThemes: [],
  },
  editorFont: "default",
  showTextLineNumber: false,
  showAddAudioItemButton: true,
  acceptTerms: "Unconfirmed",
  acceptRetrieveTelemetry: "Unconfirmed",
  experimentalSetting: {
    enablePreset: true,
    shouldApplyDefaultPresetOnVoiceChanged: false,
    enableInterrogativeUpspeak: false,
    enableMorphing: true,
    enableMultiSelect: true,
    shouldKeepTuningOnTextChange: true,
    enablePitchEditInSongEditor: false,
  },
  splitTextWhenPaste: "PERIOD_AND_NEW_LINE",
  splitterPosition: {
    audioDetailPaneHeight: undefined,
    audioInfoPaneWidth: undefined,
    portraitPaneWidth: undefined,
  },
  confirmedTips: {
    tweakableSliderByScroll: false,
    engineStartedOnAltPort: false,
    notifyOnGenerate: false,
  },
  engineSettings: {},
  enableMultiEngine: true,
  enableMemoNotation: false,
  enableRubyNotation: false,
};

export const settingStore = createPartialStore<SettingStoreTypes>({
  HYDRATE_SETTING_STORE: {
    async action({ mutations, actions }) {
      window.backend.hotkeySettings().then((hotkeys) => {
        hotkeys.forEach((hotkey) => {
          actions.SET_HOTKEY_SETTINGS({
            data: hotkey,
          });
        });
      });

      const theme = await window.backend.theme();
      if (theme) {
        mutations.SET_THEME_SETTING({
          currentTheme: theme.currentTheme,
          themes: theme.availableThemes,
        });
        actions.SET_THEME_SETTING({
          currentTheme: theme.currentTheme,
        });
      }

      actions.SET_ACCEPT_RETRIEVE_TELEMETRY({
        acceptRetrieveTelemetry: await window.backend.getSetting(
          "acceptRetrieveTelemetry",
        ),
      });

      actions.SET_ACCEPT_TERMS({
        acceptTerms: await window.backend.getSetting("acceptTerms"),
      });

      mutations.SET_SAVING_SETTING({
        savingSetting: await window.backend.getSetting("savingSetting"),
      });

      mutations.SET_TOOLBAR_SETTING({
        toolbarSetting: await window.backend.getSetting("toolbarSetting"),
      });

      mutations.SET_EXPERIMENTAL_SETTING({
        experimentalSetting: await window.backend.getSetting(
          "experimentalSetting",
        ),
      });

      mutations.SET_CONFIRMED_TIPS({
        confirmedTips: await window.backend.getSetting("confirmedTips"),
      });

      // FIXME: engineSettingsをMapにする
      for (const [engineIdStr, engineSetting] of Object.entries(
        await window.backend.getSetting("engineSettings"),
      )) {
        if (engineSetting == undefined)
          throw new Error(
            `engineSetting is undefined. engineIdStr: ${engineIdStr}`,
          );
        mutations.SET_ENGINE_SETTING({
          engineId: EngineId(engineIdStr),
          engineSetting,
        });
      }

      const rootMiscSettingKeys = [
        "editorFont",
        "showTextLineNumber",
        "showAddAudioItemButton",
        "splitTextWhenPaste",
        "splitterPosition",
        "enableMultiEngine",
        "enableRubyNotation",
        "enableMemoNotation",
        "skipUpdateVersion",
      ] as const;

      // rootMiscSettingKeysに値を足し忘れていたときに型エラーを出す検出用コード
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _: IsEqual<
        keyof RootMiscSettingType,
        (typeof rootMiscSettingKeys)[number]
      > = true;

      for (const key of rootMiscSettingKeys) {
        mutations.SET_ROOT_MISC_SETTING({
          // Vuexの型処理でUnionが解かれてしまうのを迂回している
          // FIXME: このワークアラウンドをなくす
          key: key as never,
          value: await window.backend.getSetting(key),
        });
      }
    },
  },

  SET_SAVING_SETTING: {
    mutation(state, { savingSetting }: { savingSetting: SavingSetting }) {
      state.savingSetting = savingSetting;
    },
    action({ mutations }, { data }: { data: SavingSetting }) {
      const newData = window.backend.setSetting("savingSetting", data);
      newData.then((savingSetting) => {
        mutations.SET_SAVING_SETTING({ savingSetting });
      });
    },
  },

  SET_HOTKEY_SETTINGS: {
    mutation(state, { newHotkey }: { newHotkey: HotkeySettingType }) {
      let flag = true;
      state.hotkeySettings.forEach((hotkey) => {
        if (hotkey.action == newHotkey.action) {
          hotkey.combination = newHotkey.combination;
          flag = false;
        }
      });
      if (flag) state.hotkeySettings.push(newHotkey);
    },
    action({ mutations }, { data }: { data: HotkeySettingType }) {
      window.backend.hotkeySettings(data);
      mutations.SET_HOTKEY_SETTINGS({
        newHotkey: data,
      });
    },
  },

  SET_TOOLBAR_SETTING: {
    mutation(
      state,
      { toolbarSetting }: { toolbarSetting: ToolbarSettingType },
    ) {
      state.toolbarSetting = toolbarSetting;
    },
    action({ mutations }, { data }: { data: ToolbarSettingType }) {
      const newData = window.backend.setSetting("toolbarSetting", data);
      newData.then((toolbarSetting) => {
        mutations.SET_TOOLBAR_SETTING({ toolbarSetting });
      });
    },
  },

  SET_ROOT_MISC_SETTING: {
    mutation(state, { key, value }) {
      // Vuexの型処理でUnionが解かれてしまうのを迂回している
      // FIXME: このワークアラウンドをなくす
      state[key as never] = value;
    },
    action({ mutations }, { key, value }) {
      window.backend.setSetting(key, value);
      // Vuexの型処理でUnionが解かれてしまうのを迂回している
      // FIXME: このワークアラウンドをなくす
      mutations.SET_ROOT_MISC_SETTING({ key: key as never, value });
    },
  },

  SET_THEME_SETTING: {
    mutation(
      state,
      { currentTheme, themes }: { currentTheme: string; themes?: ThemeConf[] },
    ) {
      if (themes) {
        state.themeSetting.availableThemes = themes;
      }
      state.themeSetting.currentTheme = currentTheme;
    },
    action({ state, mutations }, { currentTheme }: { currentTheme: string }) {
      window.backend.theme(currentTheme);
      const theme = state.themeSetting.availableThemes.find((value) => {
        return value.name == currentTheme;
      });

      if (theme == undefined) {
        throw Error("Theme not found");
      }

      for (const key in theme.colors) {
        const color = theme.colors[key as ThemeColorType];
        const { r, g, b } = colors.hexToRgb(color);
        document.documentElement.style.setProperty(`--color-${key}`, color);
        document.documentElement.style.setProperty(
          `--color-${key}-rgb`,
          `${r}, ${g}, ${b}`,
        );
      }
      const mixColors: ThemeColorType[][] = [
        ["primary", "background"],
        ["warning", "background"],
      ];
      for (const [color1, color2] of mixColors) {
        const color1Rgb = colors.hexToRgb(theme.colors[color1]);
        const color2Rgb = colors.hexToRgb(theme.colors[color2]);
        const r = Math.trunc((color1Rgb.r + color2Rgb.r) / 2);
        const g = Math.trunc((color1Rgb.g + color2Rgb.g) / 2);
        const b = Math.trunc((color1Rgb.b + color2Rgb.b) / 2);
        const propertyName = `--color-mix-${color1}-${color2}-rgb`;
        const cssColor = `${r}, ${g}, ${b}`;
        document.documentElement.style.setProperty(propertyName, cssColor);
      }
      Dark.set(theme.isDark);
      setCssVar("primary", theme.colors["primary"]);
      setCssVar("warning", theme.colors["warning"]);

      document.documentElement.setAttribute(
        "is-dark-theme",
        theme.isDark ? "true" : "false",
      );

      window.backend.setNativeTheme(theme.isDark ? "dark" : "light");

      mutations.SET_THEME_SETTING({
        currentTheme: currentTheme,
      });
    },
  },

  SET_ACCEPT_RETRIEVE_TELEMETRY: {
    mutation(state, { acceptRetrieveTelemetry }) {
      state.acceptRetrieveTelemetry = acceptRetrieveTelemetry;
    },
    action({ mutations }, { acceptRetrieveTelemetry }) {
      window.dataLayer?.push({
        event: "updateAcceptRetrieveTelemetry",
        acceptRetrieveTelemetry: acceptRetrieveTelemetry == "Accepted",
      });
      window.backend.setSetting(
        "acceptRetrieveTelemetry",
        acceptRetrieveTelemetry,
      );
      mutations.SET_ACCEPT_RETRIEVE_TELEMETRY({ acceptRetrieveTelemetry });
    },
  },

  SET_ACCEPT_TERMS: {
    mutation(state, { acceptTerms }) {
      state.acceptTerms = acceptTerms;
    },
    action({ mutations }, { acceptTerms }) {
      window.dataLayer?.push({
        event: "updateAcceptTerms",
        acceptTerms: acceptTerms == "Accepted",
      });
      window.backend.setSetting("acceptTerms", acceptTerms);
      mutations.SET_ACCEPT_TERMS({ acceptTerms });
    },
  },

  SET_EXPERIMENTAL_SETTING: {
    mutation(
      state,
      { experimentalSetting }: { experimentalSetting: ExperimentalSettingType },
    ) {
      state.experimentalSetting = experimentalSetting;
    },
    action({ mutations }, { experimentalSetting }) {
      window.backend.setSetting("experimentalSetting", experimentalSetting);
      mutations.SET_EXPERIMENTAL_SETTING({ experimentalSetting });
    },
  },

  SET_CONFIRMED_TIPS: {
    mutation(state, { confirmedTips }) {
      state.confirmedTips = confirmedTips;
    },
    action({ mutations }, { confirmedTips }) {
      window.backend.setSetting("confirmedTips", confirmedTips);
      mutations.SET_CONFIRMED_TIPS({ confirmedTips });
    },
  },

  SET_CONFIRMED_TIP: {
    action({ state, actions }, { confirmedTip }) {
      const confirmedTips = {
        ...state.confirmedTips,
        ...confirmedTip,
      };

      actions.SET_CONFIRMED_TIPS({
        confirmedTips: confirmedTips as ConfirmedTips,
      });
    },
  },

  RESET_CONFIRMED_TIPS: {
    async action({ state, actions }) {
      const confirmedTips: { [key: string]: boolean } = {
        ...state.confirmedTips,
      };

      // 全てのヒントを未確認にする
      for (const key in confirmedTips) {
        confirmedTips[key] = false;
      }

      actions.SET_CONFIRMED_TIPS({
        confirmedTips: confirmedTips as ConfirmedTips,
      });
    },
  },

  SET_ENGINE_SETTING: {
    mutation(state, { engineSetting, engineId }) {
      state.engineSettings[engineId] = engineSetting;
    },
    async action({ mutations }, { engineSetting, engineId }) {
      await window.backend.setEngineSetting(engineId, engineSetting);
      mutations.SET_ENGINE_SETTING({ engineSetting, engineId });
    },
  },

  CHANGE_USE_GPU: {
    /**
     * CPU/GPUモードを切り替えようとする。
     * GPUモードでエンジン起動に失敗した場合はCPUモードに戻す。
     */
    action: createUILockAction(
      async ({ state, actions }, { useGpu, engineId }) => {
        const isAvailableGPUMode = await window.backend.isAvailableGPUMode();

        // 対応するGPUがない場合に変更を続行するか問う
        if (useGpu && !isAvailableGPUMode) {
          const result = await window.backend.showQuestionDialog({
            type: "warning",
            title: "対応する GPU デバイスが見つかりません",
            message:
              "GPU モードの利用には対応する GPU デバイスが必要です。\n" +
              "このまま GPU モードに変更すると音声合成エンジンエラーが発生する可能性があります。本当に変更しますか？",
            buttons: ["変更する", "変更しない"],
            cancelId: 1,
          });
          if (result == 1) {
            return;
          }
        }

        actions.SET_ENGINE_SETTING({
          engineSetting: { ...state.engineSettings[engineId], useGpu },
          engineId,
        });
        const result = await actions.RESTART_ENGINES({
          engineIds: [engineId],
        });

        // GPUモードに変更できなかった場合はCPUモードに戻す
        // FIXME: useGpu設定を保存してからエンジン起動を試すのではなく、逆にしたい
        if (!result.success && useGpu) {
          await window.backend.showMessageDialog({
            type: "error",
            title: "GPU モードに変更できませんでした",
            message:
              "GPU モードで音声合成エンジンを起動できなかったため、CPU モードに戻します。",
          });
          await actions.CHANGE_USE_GPU({ useGpu: false, engineId });
          return;
        }
      },
    ),
  },

  GET_RECENTLY_USED_PROJECTS: {
    async action() {
      return await window.backend.getSetting("recentlyUsedProjects");
    },
  },

  APPEND_RECENTLY_USED_PROJECT: {
    async action({ actions }, { filePath }) {
      const recentlyUsedProjects = await actions.GET_RECENTLY_USED_PROJECTS();
      const newRecentlyUsedProjects = [
        filePath,
        ...recentlyUsedProjects.filter((value) => value != filePath),
      ].slice(0, 10);
      await window.backend.setSetting(
        "recentlyUsedProjects",
        newRecentlyUsedProjects,
      );
    },
  },
});
