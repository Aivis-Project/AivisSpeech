#!/usr/bin/env node

const PROJECT_ID = "4508555292901376";
const ORG_SLUG = "aivis-project";
const PROJECT_SLUG = "aivisspeech";

const parseArgs = (args) => {
  const options = {
    query: "is:unresolved",
    statsPeriod: "90d",
    limit: "100",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = args[index + 1];

    if (arg === "--query" && nextValue != null) {
      options.query = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--stats-period" && nextValue != null) {
      options.statsPeriod = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--limit" && nextValue != null) {
      options.limit = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--help") {
      console.log(
        [
          "Usage: pnpm exec node .codex/skills/aivisspeech-sentry-triage/scripts/probe_sentry_filter.mjs [options]",
          "",
          "Options:",
          "  --query <query>              Sentry issue query. Default: is:unresolved",
          "  --stats-period <period>      Sentry statsPeriod. Default: 90d",
          "  --limit <number>             Page size for Sentry API requests. Default: 100",
        ].join("\n"),
      );
      process.exit(0);
    }

    throw new Error(`Unknown or incomplete option: ${arg}`);
  }

  return options;
};

const fetchJson = async (url, token) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.ok === false) {
    throw new Error(`Sentry API request failed: ${response.status} ${response.statusText}`);
  }

  return {
    data: await response.json(),
    nextPageUrl: getNextPageUrl(response.headers.get("link")),
  };
};

const getNextPageUrl = (linkHeader) => {
  if (linkHeader == null || linkHeader === "") {
    return null;
  }

  for (const linkPart of linkHeader.split(",")) {
    const urlMatch = linkPart.match(/<([^>]+)>/);

    // Sentry は最終ページでも `rel="next"` を返すことがあるため、`results="true"` も確認する
    if (
      urlMatch != null &&
      /\brel="next"/.test(linkPart) &&
      /\bresults="true"/.test(linkPart)
    ) {
      return urlMatch[1];
    }
  }

  return null;
};

const fetchIssues = async (initialUrl, token) => {
  const issues = [];
  let nextPageUrl = initialUrl;

  while (nextPageUrl != null) {
    const response = await fetchJson(nextPageUrl, token);

    // issue 一覧以外の応答を拾った場合は、後続処理で壊れた分類をしないように即時停止する
    if (Array.isArray(response.data) === false) {
      throw new Error("Sentry API response is not an issue list");
    }

    issues.push(...response.data);
    nextPageUrl = response.nextPageUrl;
  }

  return issues;
};

const main = async () => {
  const token = process.env.SENTRY_AUTH_TOKEN;

  if (token == null || token === "") {
    throw new Error("SENTRY_AUTH_TOKEN is not set");
  }

  const options = parseArgs(process.argv.slice(2));
  const params = new URLSearchParams({
    project: PROJECT_ID,
    query: options.query,
    limit: options.limit,
    statsPeriod: options.statsPeriod,
  });

  const issues = await fetchIssues(
    `https://sentry.io/api/0/organizations/${ORG_SLUG}/issues/?${params}`,
    token,
  );

  const sortedIssues = [...issues].sort(
    (leftIssue, rightIssue) => Number(rightIssue.count ?? 0) - Number(leftIssue.count ?? 0),
  );

  // タイトルだけで最終判断せず、次の詳細調査に進む issue を選ぶための一覧に留める
  const result = sortedIssues.map((issue) => ({
    shortId: issue.shortId,
    id: issue.id,
    title: issue.title,
    count: Number(issue.count ?? 0),
    userCount: Number(issue.userCount ?? 0),
    status: issue.status,
    substatus: issue.substatus,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    culprit: issue.culprit,
    eventDetailUrl:
      issue.id != null
        ? `https://sentry.io/api/0/organizations/${ORG_SLUG}/issues/${issue.id}/events/?per_page=1`
        : null,
  }));

  console.log(
    JSON.stringify(
      {
        org: ORG_SLUG,
        project: PROJECT_SLUG,
        projectId: PROJECT_ID,
        query: options.query,
        statsPeriod: options.statsPeriod,
        count: result.length,
        issues: result,
      },
      null,
      2,
    ),
  );
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
