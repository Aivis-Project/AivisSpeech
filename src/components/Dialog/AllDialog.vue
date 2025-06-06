<template>
  <AcceptRetrieveTelemetryDialog
    v-model:dialogOpened="isAcceptRetrieveTelemetryDialogOpenComputed"
  />
  <AcceptTermsDialog v-model:dialogOpened="isAcceptTermsDialogOpenComputed" />
  <SettingDialog v-model:dialogOpened="isSettingDialogOpenComputed" />
  <HotkeySettingDialog
    v-model:dialogOpened="isHotkeySettingDialogOpenComputed"
  />
  <ToolBarCustomDialog
    v-model:dialogOpened="isToolbarSettingDialogOpenComputed"
  />
  <CharacterOrderDialog
    v-if="orderedAllCharacterInfos.length > 0"
    v-model:dialogOpened="isCharacterOrderDialogOpenComputed"
    :characterInfos="orderedAllCharacterInfos"
  />
  <DefaultStyleListDialog
    v-if="orderedTalkCharacterInfos.length > 0"
    v-model:dialogOpened="isDefaultStyleSelectDialogOpenComputed"
    :characterInfos="orderedTalkCharacterInfos"
  />
  <DictionaryManageDialog
    v-model:dialogOpened="isDictionaryManageDialogOpenComputed"
  />
  <EngineManageDialog v-model:dialogOpened="isEngineManageDialogOpenComputed" />
  <UpdateNotificationDialogContainer
    :canOpenDialog="canOpenNotificationDialog"
  />
  <ExportSongAudioDialog v-model:dialogOpened="isExportSongAudioDialogOpen" />
  <ImportSongProjectDialog v-model="isImportSongProjectDialogOpenComputed" />
  <PresetManageDialog v-model:dialogOpened="isPresetManageDialogOpenComputed" />
  <ModelManageDialog v-model:dialogOpened="isModelManageDialogOpenComputed" />
  <HelpDialog v-model:dialogOpened="isHelpDialogOpenComputed" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import SettingDialog from "@/components/Dialog/SettingDialog/SettingDialog.vue";
import HotkeySettingDialog from "@/components/Dialog/HotkeySettingDialog.vue";
import ToolBarCustomDialog from "@/components/Dialog/ToolBarCustomDialog.vue";
import DefaultStyleListDialog from "@/components/Dialog/DefaultStyleListDialog.vue";
import ModelManageDialog from "@/components/Dialog/ModelManageDialog.vue";
import CharacterOrderDialog from "@/components/Dialog/CharacterOrderDialog.vue";
import AcceptRetrieveTelemetryDialog from "@/components/Dialog/AcceptRetrieveTelemetryDialog.vue";
import AcceptTermsDialog from "@/components/Dialog/AcceptTermsDialog.vue";
import DictionaryManageDialog from "@/components/Dialog/DictionaryManageDialog.vue";
import EngineManageDialog from "@/components/Dialog/EngineManageDialog.vue";
import UpdateNotificationDialogContainer from "@/components/Dialog/UpdateNotificationDialog/Container.vue";
import ImportSongProjectDialog from "@/components/Dialog/ImportSongProjectDialog.vue";
import ExportSongAudioDialog from "@/components/Dialog/ExportSongAudioDialog/Container.vue";
import PresetManageDialog from "@/components/Dialog/PresetManageDialog.vue";
import HelpDialog from "@/components/Dialog/HelpDialog/HelpDialog.vue";
import { useStore } from "@/store";
import { filterCharacterInfosByStyleType } from "@/store/utility";
import { useDialogAnalytics } from "@/composables/useDialogAnalytics";

const props = defineProps<{
  isEnginesReady: boolean;
}>();
const store = useStore();

// 設定
const isSettingDialogOpenComputed = computed({
  get: () => store.state.isSettingDialogOpen,
  set: (val) => store.actions.SET_DIALOG_OPEN({ isSettingDialogOpen: val }),
});
useDialogAnalytics("settings", isSettingDialogOpenComputed);

// ショートカットキー設定
const isHotkeySettingDialogOpenComputed = computed({
  get: () => store.state.isHotkeySettingDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isHotkeySettingDialogOpen: val,
    }),
});
useDialogAnalytics("hotkey_settings", isHotkeySettingDialogOpenComputed);

// ツールバーのカスタム設定
const isToolbarSettingDialogOpenComputed = computed({
  get: () => store.state.isToolbarSettingDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isToolbarSettingDialogOpen: val,
    }),
});
useDialogAnalytics("toolbar_settings", isToolbarSettingDialogOpenComputed);

// 利用規約表示
const isAcceptTermsDialogOpenComputed = computed({
  get: () => store.state.isAcceptTermsDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isAcceptTermsDialogOpen: val,
    }),
});
useDialogAnalytics("accept_terms", isAcceptTermsDialogOpenComputed);

// キャラクター並び替え
const orderedAllCharacterInfos = computed(
  () => store.getters.GET_ORDERED_ALL_CHARACTER_INFOS,
);
const isCharacterOrderDialogOpenComputed = computed({
  get: () =>
    !store.state.isAcceptTermsDialogOpen &&
    store.state.isCharacterOrderDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isCharacterOrderDialogOpen: val,
    }),
});
useDialogAnalytics("character_order", isCharacterOrderDialogOpenComputed);

// デフォルトスタイル選択(トーク)
const orderedTalkCharacterInfos = computed(() => {
  return filterCharacterInfosByStyleType(
    store.getters.GET_ORDERED_ALL_CHARACTER_INFOS,
    "talk",
  );
});
const isDefaultStyleSelectDialogOpenComputed = computed({
  get: () =>
    !store.state.isAcceptTermsDialogOpen &&
    !store.state.isCharacterOrderDialogOpen &&
    store.state.isDefaultStyleSelectDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isDefaultStyleSelectDialogOpen: val,
    }),
});
useDialogAnalytics("default_style_select", isDefaultStyleSelectDialogOpenComputed);

// エンジン管理
const isEngineManageDialogOpenComputed = computed({
  get: () => store.state.isEngineManageDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isEngineManageDialogOpen: val,
    }),
});
useDialogAnalytics("engine_management", isEngineManageDialogOpenComputed);

// 読み方＆アクセント辞書
const isDictionaryManageDialogOpenComputed = computed({
  get: () => store.state.isDictionaryManageDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isDictionaryManageDialogOpen: val,
    }),
});
useDialogAnalytics("dictionary_management", isDictionaryManageDialogOpenComputed);

const isAcceptRetrieveTelemetryDialogOpenComputed = computed({
  get: () =>
    !store.state.isAcceptTermsDialogOpen &&
    !store.state.isCharacterOrderDialogOpen &&
    !store.state.isDefaultStyleSelectDialogOpen &&
    store.state.isAcceptRetrieveTelemetryDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isAcceptRetrieveTelemetryDialogOpen: val,
    }),
});
useDialogAnalytics("accept_telemetry", isAcceptRetrieveTelemetryDialogOpenComputed);

// エディタのアップデート確認ダイアログ
const canOpenNotificationDialog = computed(() => {
  return (
    !store.state.isAcceptTermsDialogOpen &&
    !store.state.isCharacterOrderDialogOpen &&
    !store.state.isDefaultStyleSelectDialogOpen &&
    !store.state.isAcceptRetrieveTelemetryDialogOpen &&
    props.isEnginesReady
  );
});

// ソングのオーディオエクスポート時の設定ダイアログ
const isExportSongAudioDialogOpen = computed({
  get: () => store.state.isExportSongAudioDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isExportSongAudioDialogOpen: val,
    }),
});
useDialogAnalytics("export_song_audio", isExportSongAudioDialogOpen);

// ソングのプロジェクトファイルのインポート時の設定ダイアログ
const isImportSongProjectDialogOpenComputed = computed({
  get: () => store.state.isImportSongProjectDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isImportSongProjectDialogOpen: val,
    }),
});
useDialogAnalytics("import_song_project", isImportSongProjectDialogOpenComputed);

// プリセット編集ダイアログ
const isPresetManageDialogOpenComputed = computed({
  get: () => store.state.isPresetManageDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isPresetManageDialogOpen: val,
    }),
});
useDialogAnalytics("preset_management", isPresetManageDialogOpenComputed);

// 音声合成モデル管理
const isModelManageDialogOpenComputed = computed({
  get: () => store.state.isModelManageDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isModelManageDialogOpen: val,
    }),
});
useDialogAnalytics("model_management", isModelManageDialogOpenComputed);

// ヘルプダイアログ
const isHelpDialogOpenComputed = computed({
  get: () => store.state.isHelpDialogOpen,
  set: (val) =>
    store.actions.SET_DIALOG_OPEN({
      isHelpDialogOpen: val,
    }),
});
useDialogAnalytics("help", isHelpDialogOpenComputed);
</script>
