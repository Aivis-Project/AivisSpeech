import { Plugin, inject, InjectionKey } from "vue";
import MarkdownIt from "markdown-it";
import MarkdownItGitHubAlerts from "markdown-it-github-alerts";
import { UnreachableError } from "@/type/utility";
import "markdown-it-github-alerts/styles/github-base.css";

const markdownItKey: InjectionKey<MarkdownIt> = Symbol("_markdownIt_");

export const useMarkdownIt = (): MarkdownIt => {
  const maybeMarkdownIt = inject(markdownItKey);
  if (!maybeMarkdownIt) {
    throw new UnreachableError("markdownItKey is not provided");
  }
  return maybeMarkdownIt;
};

export const markdownItPlugin: Plugin = {
  install(app) {
    const md = new MarkdownIt({
      html: true,
      linkify: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    md.use(MarkdownItGitHubAlerts);

    // 全てのリンクに_blankを付ける
    // https://github.com/markdown-it/markdown-it/blob/master/docs/architecture.md#renderer
    const defaultRender =
      md.renderer.rules.link_open ??
      function (tokens, idx, options, _, self) {
        return self.renderToken(tokens, idx, options);
      };
    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
      const aIdx = tokens[idx].attrIndex("target");

      if (aIdx < 0) {
        tokens[idx].attrPush(["target", "_blank"]);
      } else {
        const attrs = tokens[idx].attrs;
        if (attrs) attrs[aIdx][1] = "_blank";
        tokens[idx].attrs = attrs;
      }

      return defaultRender(tokens, idx, options, env, self);
    };

    app.provide(markdownItKey, md);
  },
};
