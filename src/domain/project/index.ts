/**
 * プロジェクトファイル関連のコード
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import semver from "semver";

import { LatestProjectType, projectSchema } from "./schema";
import { uuid4 } from "@/helpers/random";
import { AccentPhrase } from "@/openapi";
import {
  DEFAULT_BEATS,
  DEFAULT_BEAT_TYPE,
  DEFAULT_BPM,
  DEFAULT_TPQN,
  DEFAULT_TRACK_NAME,
} from "@/sing/domain";
import { EngineId, StyleId, TrackId, Voice } from "@/type/preload";

// const DEFAULT_SAMPLING_RATE = 44100;

/**
 * プロジェクトファイルのフォーマットエラー
 * FIXME: Result型にする
 */
export class ProjectFileFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFileFormatError";
  }
}

const validateTalkProject = (talkProject: LatestProjectType["talk"]) => {
  if (
    !talkProject.audioKeys.every(
      (audioKey) => audioKey in talkProject.audioItems,
    )
  ) {
    throw new Error(
      "Every audioKey in audioKeys should be a key of audioItems",
    );
  }
  if (
    !talkProject.audioKeys.every(
      (audioKey) => talkProject.audioItems[audioKey]?.voice != undefined,
    )
  ) {
    throw new Error('Every audioItem should have a "voice" attribute.');
  }
  if (
    !talkProject.audioKeys.every(
      (audioKey) =>
        talkProject.audioItems[audioKey]?.voice.engineId != undefined,
    )
  ) {
    throw new Error('Every voice should have a "engineId" attribute.');
  }
  // FIXME: assert engineId is registered
  if (
    !talkProject.audioKeys.every(
      (audioKey) =>
        talkProject.audioItems[audioKey]?.voice.speakerId != undefined,
    )
  ) {
    throw new Error('Every voice should have a "speakerId" attribute.');
  }
  if (
    !talkProject.audioKeys.every(
      (audioKey) =>
        talkProject.audioItems[audioKey]?.voice.styleId != undefined,
    )
  ) {
    throw new Error('Every voice should have a "styleId" attribute.');
  }
};

// TODO: マイグレーション（とファイルの最初のeslint-disable）を別ファイルに移す
/**
 * プロジェクトファイルのマイグレーション
 */
export const migrateProjectFileObject = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectData: any,
  DI: {
    fetchMoraData: (payload: {
      accentPhrases: AccentPhrase[];
      engineId: EngineId;
      styleId: StyleId;
    }) => Promise<AccentPhrase[]>;
    voices: Voice[];
  },
) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { fetchMoraData, voices } = DI;

  // appVersion Validation check
  if (
    !("appVersion" in projectData && typeof projectData.appVersion === "string")
  ) {
    throw new ProjectFileFormatError(
      "The appVersion of the project file should be string",
    );
  }
  const projectAppVersion: string = projectData.appVersion;
  if (!semver.valid(projectAppVersion)) {
    throw new ProjectFileFormatError(
      `The app version of the project file "${projectAppVersion}" is invalid. The app version should be a string in semver format.`,
    );
  }

  const semverSatisfiesOptions: semver.RangeOptions = {
    includePrerelease: true,
  };

  // Migration
  /*
  const engineId = EngineId("074fc39e-678b-4c13-8916-ffca8d505d1d");

  if (semver.satisfies(projectAppVersion, "<0.4", semverSatisfiesOptions)) {
    for (const audioItemsKey in projectData.audioItems) {
      if ("charactorIndex" in projectData.audioItems[audioItemsKey]) {
        projectData.audioItems[audioItemsKey].characterIndex =
          projectData.audioItems[audioItemsKey].charactorIndex;
        delete projectData.audioItems[audioItemsKey].charactorIndex;
      }
    }
    for (const audioItemsKey in projectData.audioItems) {
      if (projectData.audioItems[audioItemsKey].query != null) {
        projectData.audioItems[audioItemsKey].query.volumeScale = 1;
        projectData.audioItems[audioItemsKey].query.pauseLengthScale = 1;
        projectData.audioItems[audioItemsKey].query.prePhonemeLength = 0.1;
        projectData.audioItems[audioItemsKey].query.postPhonemeLength = 0.1;
        projectData.audioItems[audioItemsKey].query.outputSamplingRate =
          DEFAULT_SAMPLING_RATE;
      }
    }
  }

  if (semver.satisfies(projectAppVersion, "<0.5", semverSatisfiesOptions)) {
    for (const audioItemsKey in projectData.audioItems) {
      const audioItem = projectData.audioItems[audioItemsKey];
      if (audioItem.query != null) {
        audioItem.query.outputStereo = false;
        for (const accentPhrase of audioItem.query.accentPhrases) {
          if (accentPhrase.pauseMora) {
            accentPhrase.pauseMora.vowelLength = 0;
          }
          for (const mora of accentPhrase.moras) {
            if (mora.consonant) {
              mora.consonantLength = 0;
            }
            mora.vowelLength = 0;
          }
        }

        // set phoneme length
        // 0.7 未満のプロジェクトファイルは styleId ではなく characterIndex なので、ここだけ characterIndex とした
        if (audioItem.characterIndex == undefined)
          throw new Error("audioItem.characterIndex === undefined");
        await fetchMoraData({
          accentPhrases: audioItem.query.accentPhrases,
          engineId,
          styleId: audioItem.characterIndex,
        }).then((accentPhrases: AccentPhrase[]) => {
          accentPhrases.forEach((newAccentPhrase, i) => {
            const oldAccentPhrase = audioItem.query.accentPhrases[i];
            if (newAccentPhrase.pauseMora) {
              oldAccentPhrase.pauseMora.vowelLength =
                newAccentPhrase.pauseMora.vowelLength;
            }
            newAccentPhrase.moras.forEach((mora, j) => {
              if (mora.consonant) {
                oldAccentPhrase.moras[j].consonantLength = mora.consonantLength;
              }
              oldAccentPhrase.moras[j].vowelLength = mora.vowelLength;
            });
          });
        });
      }
    }
  }

  if (semver.satisfies(projectAppVersion, "<0.7", semverSatisfiesOptions)) {
    for (const audioItemsKey in projectData.audioItems) {
      const audioItem = projectData.audioItems[audioItemsKey];
      if (audioItem.characterIndex != null) {
        if (audioItem.characterIndex == 0) {
          // 四国めたん 0 -> 四国めたん（あまあま） 0
          audioItem.speaker = 0;
        }
        if (audioItem.characterIndex == 1) {
          // ずんだもん 1 -> ずんだもん（あまあま） 1
          audioItem.speaker = 1;
        }
        delete audioItem.characterIndex;
      }
    }
  }

  if (semver.satisfies(projectAppVersion, "<0.8", semverSatisfiesOptions)) {
    for (const audioItemsKey in projectData.audioItems) {
      const audioItem = projectData.audioItems[audioItemsKey];
      if (audioItem.speaker != null) {
        audioItem.styleId = audioItem.speaker;
        delete audioItem.speaker;
      }
    }
  }

  if (semver.satisfies(projectAppVersion, "<0.14", semverSatisfiesOptions)) {
    for (const audioItemsKey in projectData.audioItems) {
      const audioItem = projectData.audioItems[audioItemsKey];
      if (audioItem.engineId == undefined) {
        audioItem.engineId = engineId;
      }
    }
  }

  if (semver.satisfies(projectAppVersion, "<0.15", semverSatisfiesOptions)) {
    for (const audioItemsKey in projectData.audioItems) {
      const audioItem = projectData.audioItems[audioItemsKey];
      if (audioItem.voice == undefined) {
        const oldEngineId = audioItem.engineId;
        const oldStyleId = audioItem.styleId;
        const voice = voices.find(
          (voice) =>
            voice.engineId === audioItem.engineId &&
            voice.styleId === audioItem.styleId,
        );
        if (voice == undefined)
          throw new Error(`voice == undefined: ${oldEngineId}, ${oldStyleId}`);
        audioItem.voice = voice;

        delete audioItem.engineId;
        delete audioItem.styleId;
      }
    }
  }

  if (semver.satisfies(projectAppVersion, "<0.17", semverSatisfiesOptions)) {
    // 0.17 未満のプロジェクトファイルはトークの情報のみ
    // なので全情報(audioKeys/audioItems)をtalkに移動する
    projectData.talk = {
      audioKeys: projectData.audioKeys,
      audioItems: projectData.audioItems,
    };

    // ソングの情報を初期化
    // generateSingingStoreInitialScoreが今後変わることがあるかもしれないので、
    // 0.17時点のスコア情報を直接書く
    projectData.song = {
      tpqn: DEFAULT_TPQN,
      tempos: [
        {
          position: 0,
          bpm: DEFAULT_BPM,
        },
      ],
      timeSignatures: [
        {
          measureNumber: 1,
          beats: DEFAULT_BEATS,
          beatType: DEFAULT_BEAT_TYPE,
        },
      ],
      tracks: [
        {
          singer: undefined,
          keyRangeAdjustment: 0,
          notes: [],
        },
      ],
    };

    delete projectData.audioKeys;
    delete projectData.audioItems;
  }

  if (semver.satisfies(projectAppVersion, "<0.17.1", semverSatisfiesOptions)) {
    // 声量調整値の追加
    for (const track of projectData.song.tracks) {
      track.volumeRangeAdjustment = 0;
    }
  }

  if (semver.satisfies(projectAppVersion, "<0.19.0", semverSatisfiesOptions)) {
    // ピッチ編集値の追加
    for (const track of projectData.song.tracks) {
      track.pitchEditData = [];
    }
  }

  if (semver.satisfies(projectAppVersion, "<0.20.0", semverSatisfiesOptions)) {
    // tracks: Track[] -> tracks: Record<TrackId, Track> + trackOrder: TrackId[]
    const newTracks: Record<TrackId, unknown> = {};
    for (const track of projectData.song.tracks) {
      track.name = DEFAULT_TRACK_NAME;
      track.solo = false;
      track.mute = false;
      track.gain = 1;
      track.pan = 0;
      newTracks[TrackId(uuid4())] = track;
    }
    projectData.song.tracks = newTracks;
    projectData.song.trackOrder = Object.keys(newTracks);
  }

  if (semver.satisfies(projectAppVersion, "<0.22.0", semverSatisfiesOptions)) {
    // 文内無音倍率の追加
    for (const audioItemsKey in projectData.talk.audioItems) {
      projectData.talk.audioItems[audioItemsKey].query.pauseLengthScale = 1;
    }
  }
  */

  // ----- 以下は AivisSpeech 固有のマイグレーション処理 -----

  // 1.1.0 未満 -> 1.1.0-dev 以上へのマイグレーション (開発版のみ常にマイグレーションを実行する)
  if (
    semver.satisfies(
      projectAppVersion,
      "<1.1.0-dev",
      semverSatisfiesOptions,
    ) ||
    projectAppVersion === "999.999.999"
  ) {

    // 古いトーク専用 project は root 直下に audioKeys / audioItems を持つ
    if (projectData.talk == undefined) {
      projectData.talk = {
        audioKeys: projectData.audioKeys,
        audioItems: projectData.audioItems,
      };
      delete projectData.audioKeys;
      delete projectData.audioItems;
    }

    // 0.15 未満のトーク音声は voice ではなく engineId / styleId を直接持つ
    // AivisSpeech では upstream 側の旧マイグレーションをコメントアウトしているため、固有ブロックでも補完する
    for (const audioItemsKey in projectData.talk.audioItems) {
      const audioItem = projectData.talk.audioItems[audioItemsKey];
      if (audioItem.voice != undefined) continue;

      const oldEngineId = audioItem.engineId;
      const oldStyleId = audioItem.styleId;
      const voice = voices.find(
        (voice) =>
          voice.engineId === oldEngineId && voice.styleId === oldStyleId,
      );
      if (voice == undefined) {
        throw new Error(`voice == undefined: ${oldEngineId}, ${oldStyleId}`);
      }

      audioItem.voice = voice;
      delete audioItem.engineId;
      delete audioItem.styleId;
    }

    // AivisSpeech ではソング機能は封印されているが、実装上の都合で一応マイグレーションしている
    // tracks: Track[] -> tracks: Record<TrackId, Track> + trackOrder: TrackId[]
    if (projectData.song == undefined) {
      const trackId = TrackId(uuid4());
      projectData.song = {
        tpqn: DEFAULT_TPQN,
        tempos: [{ position: 0, bpm: DEFAULT_BPM }],
        timeSignatures: [
          { measureNumber: 1, beats: DEFAULT_BEATS, beatType: DEFAULT_BEAT_TYPE },
        ],
        tracks: {
          [trackId]: {
            name: DEFAULT_TRACK_NAME,
            notes: [],
            pitchEditData: [],
            solo: false,
            mute: false,
            gain: 1,
            pan: 0,
            keyRangeAdjustment: 0,
            volumeRangeAdjustment: 0,
          },
        },
        trackOrder: [trackId],
      };
    } else if (Array.isArray(projectData.song.tracks)) {
      // 旧形式の tracks 配列を、現在の ID 付き tracks 辞書へ変換する
      const newTracks: Record<TrackId, unknown> = {};
      for (const track of projectData.song.tracks) {
        track.name = DEFAULT_TRACK_NAME;
        track.solo = false;
        track.mute = false;
        track.gain = 1;
        track.pan = 0;
        newTracks[TrackId(uuid4())] = track;
      }
      projectData.song.tracks = newTracks;
      projectData.song.trackOrder = Object.keys(newTracks);
    }

    // 文内無音倍率の追加
    for (const audioItemsKey in projectData.talk.audioItems) {
      const query = projectData.talk.audioItems[audioItemsKey].query;
      if (query != undefined && !("pauseLengthScale" in query)) {
        query.pauseLengthScale = 1;
      }
    }

    // プリセット内の文内無音倍率の追加
    if (projectData.presets?.items) {
      for (const presetKey in projectData.presets.items) {
        if (!("pauseLengthScale" in projectData.presets.items[presetKey])) {
          projectData.presets.items[presetKey].pauseLengthScale = 1;
        }
      }
    }
  }

  // Validation check
  // トークはvalidateTalkProjectで検証する
  // ソングはSET_SCOREの中の`isValidScore`関数で検証される
  const parsedProjectData = projectSchema.parse(projectData);
  validateTalkProject(parsedProjectData.talk);

  return parsedProjectData;
};
