// Client-side demo auth — localStorage only. NOT for production.
// Wire to NextAuth / Clerk / Supabase before any real launch.

export interface AuthUser {
  id: string; name: string; email: string; joinedAt: string; isSeller: boolean;
}

const USERS_KEY = "rcc_users";
const SESSION_KEY = "rcc_session";

// Demo accounts matching catalog.ts SELLERS (password: demo123 for all)
const DEMO: (AuthUser & { _pw: string })[] = [
  { id:"s01", name:"GoldenAgeGuru",     email:"goldenageguru@demo.com",     joinedAt:"2016-04-12", isSeller:true, _pw:"17pex1y" },
  { id:"s02", name:"SilverStacker42",   email:"silverstacker42@demo.com",   joinedAt:"2017-09-03", isSeller:true, _pw:"17pex1y" },
  { id:"s03", name:"BronzeAgeBooks",    email:"bronzeagebooks@demo.com",    joinedAt:"2018-02-18", isSeller:true, _pw:"17pex1y" },
  { id:"s04", name:"KeyIssueKing",      email:"keyissueking@demo.com",      joinedAt:"2015-11-07", isSeller:true, _pw:"17pex1y" },
  { id:"s05", name:"CGCCollector",      email:"cgccollector@demo.com",      joinedAt:"2019-06-25", isSeller:true, _pw:"17pex1y" },
  { id:"s07", name:"MarvelMaven",       email:"marvelmaven@demo.com",       joinedAt:"2017-07-30", isSeller:true, _pw:"17pex1y" },
  { id:"s09", name:"SlabCity",          email:"slabcity@demo.com",          joinedAt:"2016-12-10", isSeller:true, _pw:"17pex1y" },
  { id:"s18", name:"PriceGuidePatrick", email:"priceguidepatrick@demo.com", joinedAt:"2015-04-17", isSeller:true, _pw:"17pex1y" },
];

function sh(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/** Strip the password hash before a record leaves this module. */
function publicUser(u: AuthUser & { _pw: string }): AuthUser {
  const { _pw, ...safe } = u;
  void _pw;
  return safe;
}

function stored(): (AuthUser & { _pw: string })[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]"); } catch { return []; }
}

export function register(name: string, email: string, password: string): AuthUser | null {
  const all = [...stored(), ...DEMO];
  if (all.some(u => u.email.toLowerCase() === email.toLowerCase())) return null;
  const u: AuthUser & { _pw: string } = {
    id: "u" + Date.now(), name: name.trim(),
    email: email.trim().toLowerCase(),
    joinedAt: new Date().toISOString().slice(0, 10),
    isSeller: true, _pw: sh(password),
  };
  localStorage.setItem(USERS_KEY, JSON.stringify([...stored(), u]));
  localStorage.setItem(SESSION_KEY, u.id);
  return publicUser(u);
}

export function login(email: string, password: string): AuthUser | null {
  const all = [...stored(), ...DEMO];
  const u = all.find(x => x.email.toLowerCase() === email.toLowerCase() && x._pw === sh(password));
  if (!u) return null;
  localStorage.setItem(SESSION_KEY, u.id);
  return publicUser(u);
}

export function logout(): void {
  if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
}

export function getSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const all = [...stored(), ...DEMO];
  const u = all.find(x => x.id === id);
  if (!u) return null;
  return publicUser(u);
}

// User-submitted listings (saved to localStorage)
export interface UserListing {
  id: string; sellerId: string; title: string; issue: string;
  publisher: string; year: number; grade: string; grader: string;
  price: number; description: string; createdAt: string;
  /** data-URL of the user-uplo­aded cover photo (stored inline, not on disk). */
  coverImage?: string;
  /** Optional collector details */
  keyIssue?: string;
  writer?: string;
  artist?: string;
  certNumber?: string;
  label?: string;
  notes?: string;
}

const LISTINGS_KEY = "rcc_listings";

export function getMyListings(sellerId: string): UserListing[] {
  if (typeof window === "undefined") return [];
  try {
    const all: UserListing[] = JSON.parse(localStorage.getItem(LISTINGS_KEY) ?? "[]");
    return all.filter(l => l.sellerId === sellerId);
  } catch { return []; }
}

export function addListing(listing: Omit<UserListing, "id" | "createdAt">): UserListing {
  const item: UserListing = { ...listing, id: "lst-" + Date.now(), createdAt: new Date().toISOString().slice(0, 10) };
  const all: UserListing[] = JSON.parse(localStorage.getItem(LISTINGS_KEY) ?? "[]");
  localStorage.setItem(LISTINGS_KEY, JSON.stringify([...all, item]));
  return item;
}

export function deleteListing(id: string): void {
  const all: UserListing[] = JSON.parse(localStorage.getItem(LISTINGS_KEY) ?? "[]");
  localStorage.setItem(LISTINGS_KEY, JSON.stringify(all.filter(l => l.id !== id)));
}
