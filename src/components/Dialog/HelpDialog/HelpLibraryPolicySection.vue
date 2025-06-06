<!-- eslint-disable vue/no-v-html -->
<template>
  <QPage
    ref="scroller"
    class="relative-absolute-wrapper scroller bg-background"
  >
    <div class="q-pa-md markdown markdown-body">
      <QList v-if="selectedInfo === undefined">
        <template
          v-for="(engineId, engineIndex) in sortedEngineInfos.map(
            (engineInfo) => engineInfo.uuid,
          )"
          :key="engineIndex"
        >
          <!-- エンジンが一つだけの場合は名前を表示しない -->
          <template v-if="engineInfos.size > 1">
            <QSeparator
              v-if="engineIndex > 0"
              style="margin-top: 20px !important"
              spaced
            />
            <QItemLabel header>{{ engineInfos.get(engineId)?.name }}</QItemLabel>
          </template>
          <template
            v-for="([, characterInfo], characterIndex) in getOrThrow(
              engineInfos,
              engineId,
            ).characterInfos"
            :key="characterIndex"
          >
            <QItem
              style="border-bottom: 2px solid var(--color-splitter)"
              clickable
              @click="
                selectCharacterInfo({
                  engine: engineId,
                  character: characterInfo.metas.speakerUuid,
                })
              "
            >
              <QItemSection>
                <b>{{ characterInfo.metas.speakerName }}</b>
              </QItemSection>
            </QItem>
          </template>
        </template>
      </QList>
      <div v-else>
        <div class="q-mb-md">
          <QBtn
            outline
            icon="sym_r_keyboard_arrow_left"
            label="戻る"
            @click="selectCharacterInfo(undefined)"
          />
        </div>
        <h3 style="margin-top: 24px !important">
          {{
            selectedInfo &&
            engineInfos
              .get(selectedInfo.engine)
              ?.characterInfos.get(selectedInfo.character)?.metas.speakerName
          }}
        </h3>
        <QCard flat bordered class="q-mt-lg">
          <div
            v-if="policy"
            class="markdown markdown-body q-pa-lg"
            v-html="policy"
          ></div>
        </QCard>
      </div>
    </div>
  </QPage>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "@/store";
import { useMarkdownIt } from "@/plugins/markdownItPlugin";
import { EngineId, SpeakerId } from "@/type/preload";
import { getOrThrow } from "@/helpers/mapHelper";

type DetailKey = { engine: EngineId; character: SpeakerId };

const store = useStore();
const md = useMarkdownIt();

const sortedEngineInfos = computed(() => store.getters.GET_SORTED_ENGINE_INFOS);

const engineInfos = computed(
  () =>
    new Map(
      Object.entries(store.state.characterInfos).map(
        ([engineIdStr, characterInfos]) => {
          const engineId = EngineId(engineIdStr);
          return [
            engineId,
            {
              engineId,
              name: store.state.engineManifests[engineId].name,
              characterInfos: new Map(
                characterInfos.map((ci) => [ci.metas.speakerUuid, ci]),
              ),
            },
          ];
        },
      ),
    ),
);

const policy = computed<string | undefined>(() => {
  if (selectedInfo.value == undefined) return undefined;

  const engineInfo = engineInfos.value.get(selectedInfo.value.engine);
  if (engineInfo == undefined) return undefined;

  const characterInfo = engineInfo.characterInfos.get(
    selectedInfo.value.character,
  );
  if (characterInfo == undefined) return undefined;

  return md.render(characterInfo.metas.policy);
});

const selectedInfo = ref<DetailKey | undefined>(undefined);

const scroller = ref<HTMLElement>();
const selectCharacterInfo = (index: DetailKey | undefined) => {
  if (scroller.value == undefined)
    throw new Error("scroller.value == undefined");
  scroller.value.scrollTop = 0;
  selectedInfo.value = index;
};
</script>

<style scoped lang="scss">
.root {
  .scroller {
    width: 100%;
    overflow: auto;
    > div {
      overflow-wrap: break-word;
    }
  }
}
</style>
