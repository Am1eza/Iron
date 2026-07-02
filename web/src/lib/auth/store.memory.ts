/**
 * In-memory auth store — the dev/mock-mode implementation (no DATABASE_URL).
 * Resets per cold start; production uses store.pg.ts behind the same facade.
 */
import type { AuthUser, Role } from './types';
import type { AuthStore, OtpRecord, RateRecord, RefreshRecord, UserPatch, ListUsersQuery } from './store.types';

const usersById = new Map<string, AuthUser>();
const userIdByMobile = new Map<string, string>();
let seq = 0;

function seedAdmin() {
  // A dev staff account so the admin area is reachable locally.
  const mobile = process.env.DEV_ADMIN_MOBILE ?? '09120000000';
  if (userIdByMobile.has(mobile)) return;
  const id = 'u-admin';
  const user: AuthUser = {
    id,
    mobile,
    name: 'مدیر سیستم',
    role: 'admin',
    createdAt: new Date(0).toISOString(),
  };
  usersById.set(id, user);
  userIdByMobile.set(mobile, id);
}
seedAdmin();

type RefreshMap = Map<string, RefreshRecord>;
const refreshByHash: RefreshMap = new Map();
const otpByMobile = new Map<string, OtpRecord>();
const rateByMobile = new Map<string, RateRecord>();

export const memoryStore: AuthStore = {
  async userByMobile(mobile: string) {
    const id = userIdByMobile.get(mobile);
    return id ? (usersById.get(id) ?? null) : null;
  },

  async userById(id: string) {
    return usersById.get(id) ?? null;
  },

  async createUser(input: { mobile: string; name?: string; role?: Role }) {
    const id = `u${Date.now().toString(36)}${++seq}`;
    const user: AuthUser = {
      id,
      mobile: input.mobile,
      name: input.name,
      role: input.role ?? 'customer',
      createdAt: new Date().toISOString(),
    };
    usersById.set(id, user);
    userIdByMobile.set(input.mobile, id);
    return user;
  },

  async updateUser(id: string, patch: UserPatch) {
    const user = usersById.get(id);
    if (!user) return null;
    const next = { ...user, ...patch };
    usersById.set(id, next);
    return next;
  },

  async listUsers(query: ListUsersQuery = {}) {
    let all = [...usersById.values()];
    if (query.role) all = all.filter((u) => u.role === query.role);
    if (query.q) all = all.filter((u) => u.mobile.includes(query.q!) || (u.name ?? '').includes(query.q!));
    const total = all.length;
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 50;
    return { users: all.slice((page - 1) * perPage, page * perPage), total };
  },

  async saveRefresh(hash: string, record: RefreshRecord) {
    refreshByHash.set(hash, record);
  },

  async findRefresh(hash: string) {
    const rec = refreshByHash.get(hash);
    if (!rec) return null;
    if (rec.expiresAt < Date.now()) {
      refreshByHash.delete(hash);
      return null;
    }
    return rec;
  },

  async revokeRefresh(hash: string) {
    refreshByHash.delete(hash);
  },

  async revokeAllForUser(userId: string) {
    for (const [hash, rec] of refreshByHash) {
      if (rec.userId === userId) refreshByHash.delete(hash);
    }
  },

  async setOtp(mobile: string, record: OtpRecord) {
    otpByMobile.set(mobile, record);
  },
  async getOtp(mobile: string) {
    return otpByMobile.get(mobile) ?? null;
  },
  async clearOtp(mobile: string) {
    otpByMobile.delete(mobile);
  },

  async getRate(mobile: string) {
    return rateByMobile.get(mobile) ?? { sends: [] };
  },
  async setRate(mobile: string, record: RateRecord) {
    rateByMobile.set(mobile, record);
  },
  async clearRate(mobile: string) {
    rateByMobile.delete(mobile);
  },

  async cleanupExpired() {
    const now = Date.now();
    for (const [m, rec] of otpByMobile) if (rec.expiresAt < now) otpByMobile.delete(m);
    for (const [h, rec] of refreshByHash) if (rec.expiresAt < now) refreshByHash.delete(h);
    for (const [m, rec] of rateByMobile) {
      const sends = rec.sends.filter((t) => now - t < 60 * 60 * 1000);
      if (sends.length === 0 && (!rec.lockedUntil || rec.lockedUntil < now)) rateByMobile.delete(m);
    }
  },
};

/** Test-only: wipe everything and re-seed the dev admin. */
export function resetMemoryStore(): void {
  usersById.clear();
  userIdByMobile.clear();
  refreshByHash.clear();
  otpByMobile.clear();
  rateByMobile.clear();
  seedAdmin();
}
