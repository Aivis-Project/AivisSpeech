<template>
  <QPage
    ref="scroller"
    class="relative-absolute-wrapper scroller bg-background"
  >
    <div class="q-pa-md markdown markdown-body">
      <template v-if="props.isUpdateAvailable">
        <h3>最新バージョン {{ props.latestVersion }} が見つかりました</h3>
        <a :href="props.downloadLink" target="_blank">ダウンロードページ</a>
        <hr />
      </template>
      <h1>アップデート履歴</h1>
      <template v-for="(info, infoIndex) of props.updateInfos" :key="infoIndex">
        <h3>バージョン {{ info.version }}</h3>
        <ul>
          <template
            v-for="(item, descriptionIndex) of info.descriptions"
            :key="descriptionIndex"
          >
            <li>{{ item }}</li>
          </template>
        </ul>
        <h4>貢献者リスト</h4>
        <p>
          <template
            v-for="(item, contributorIndex) of info.contributors"
            :key="contributorIndex"
          >
            <span v-if="contributorIndex > 0"> / </span>
            <a :href="`https://github.com/${item}`" target="_blank">{{
              item
            }}</a>
          </template>
        </p>
      </template>
    </div>
  </QPage>
</template>

<script setup lang="ts">
import { UpdateInfo } from "@/type/preload";

const props = defineProps<{
  latestVersion?: string;
  downloadLink?: string;
  updateInfos: UpdateInfo[];
  isUpdateAvailable: boolean;
}>();
</script>

<style scoped lang="scss">
.root {
  .scroller {
    width: 100%;
    overflow: auto;
    /* :deep() {
      h3 {
        font-size: 1.3rem;
        font-weight: bold;
        margin: 0;
      }
      h4 {
        font-size: 1.1rem;
        font-weight: bold;
        margin: 0;
      }
    } */
  }
}
</style>
