/** Knowledge-base topics: the hubs articles are filed under. Order = display order. */
export const GUIDE_TOPICS = [
  { slug: "grading", name: "Grading & authentication", short: "Grading", description: "How CGC and CBCS grade comics, what the labels and numbers mean, and how to read a slab before you buy." },
  { slug: "collecting", name: "Collecting & the comic ages", short: "Collecting", description: "The Golden, Silver, Bronze, Copper and Modern Ages, key issues, first printings, variants and how a collection is built." },
  { slug: "values", name: "Values & selling", short: "Values", description: "What decides a comic's price, how to find real sales data, and how to sell or consign a graded book." },
  { slug: "characters", name: "Characters & first appearances", short: "Characters", description: "Where the major characters first appeared, with the issue, date and creators behind each debut." },
  { slug: "titles", name: "Key issues & titles", short: "Key issues", description: "The individual books collectors chase: why they matter, what to check, and what the census says." },
  { slug: "publishers", name: "Publishers & history", short: "History", description: "Marvel, DC, EC, Timely, Fawcett, Image and the events that shaped the industry." },
  { slug: "care", name: "Storage, care & shipping", short: "Care", description: "Bags, boards, boxes, humidity, and how to pack a slab so it arrives the way it left." },
  { slug: "news", name: "Record sales & industry news", short: "News", description: "Documented record sales and industry events from 2012 to today, with dates." },
  { slug: "faq", name: "Quick answers", short: "FAQ", description: "Short, direct answers to the questions collectors search for most." },
] as const;

export type GuideTopic = (typeof GUIDE_TOPICS)[number]["slug"];
export const GUIDE_TOPIC_SLUGS = GUIDE_TOPICS.map((t) => t.slug) as readonly string[];
export const topicBySlug = (slug: string) => GUIDE_TOPICS.find((t) => t.slug === slug) ?? null;
export const isGuideTopic = (slug: string): slug is GuideTopic => GUIDE_TOPIC_SLUGS.includes(slug);
