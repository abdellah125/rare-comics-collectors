/**
 * robots.txt reader (RFC 9309), enough to answer two questions before a page is requested:
 * may this path be fetched by a client without its own group, and how long must it wait between
 * requests. Pure.
 */
export type RobotsRules = { allow: string[]; disallow: string[]; crawlDelay: number | null };

/** The rules of the group that applies to `agent`: its own group when one exists, else "*". */
export function robotsRules(text: string, agent: string): RobotsRules {
  const groups: { agents: string[]; rules: RobotsRules }[] = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: { allow: [], disallow: [], crawlDelay: null } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "disallow" && value) current.rules.disallow.push(value);
    else if (field === "allow" && value) current.rules.allow.push(value);
    else if (field === "crawl-delay" && Number.isFinite(Number(value))) current.rules.crawlDelay = Number(value);
  }
  const token = agent.toLowerCase();
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = own.length > 0 ? own : groups.filter((g) => g.agents.includes("*"));
  return chosen.reduce<RobotsRules>((all, g) => ({ allow: [...all.allow, ...g.rules.allow], disallow: [...all.disallow, ...g.rules.disallow], crawlDelay: g.rules.crawlDelay ?? all.crawlDelay }), { allow: [], disallow: [], crawlDelay: null });
}

const toRegex = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\?\$$/, "$")}`);

/** Longest matching rule wins; on a tie Allow wins. `path` is the path plus query string. */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  let best = { length: -1, allow: true };
  for (const [list, allow] of [[rules.disallow, false], [rules.allow, true]] as const) {
    for (const pattern of list) {
      if (!toRegex(pattern).test(path)) continue;
      if (pattern.length > best.length || (pattern.length === best.length && allow)) best = { length: pattern.length, allow };
    }
  }
  return best.allow;
}
