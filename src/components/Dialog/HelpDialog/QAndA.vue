<template>
  <QPage class="relative-absolute-wrapper scroller bg-background">
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div class="q-pa-md markdown markdown-body" v-html="qAndA"></div>
  </QPage>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useStore } from "@/store";
import { useMarkdownIt } from "@/plugins/markdownItPlugin";

const store = useStore();
const qAndA = ref("");

const md = useMarkdownIt();

onMounted(async () => {
  qAndA.value = md.render(await store.actions.GET_Q_AND_A_TEXT());
});
</script>

<style scoped lang="scss">
.root {
  .scroller {
    width: 100%;
    overflow: auto;
  }
}
</style>
