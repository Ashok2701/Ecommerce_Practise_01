import { source, http } from '@/lib/api/httpClient';
import { getDb, commit, uid } from '@/lib/data/mockDb';
import type { User, Role, UserStatus } from '@/types/domain';

export interface Session { user: User; token: string; }
export const DEMO_PASSWORD = 'demo123';

export const authService = {
  /** Mock login. Backend will return a JWT + user profile. */
  login: (email: string, password: string) =>
    source<Session>(() => {
      const user = getDb().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || password !== DEMO_PASSWORD) throw new Error('errors.auth.invalidCredentials');
      if (user.status === 'pending') throw new Error('errors.auth.pendingApproval');
      if (user.status === 'inactive') throw new Error('errors.auth.inactive');
      user.lastLoginAt = new Date().toISOString();
      commit();
      return { user, token: `mock.${user.id}.${Date.now()}` };
    }, () => http.post('/auth/login', { email, password })),
  demoAccounts: () => {
    const db = getDb();
    const pickRole = (r: Role, id?: string) => db.users.find((u) => u.role === r && (!id || u.id === id))!;
    return [pickRole('ADMIN'), pickRole('SUPERVISOR', 'usr_mgr_1'), pickRole('SALES_REP', 'usr_rep_1'), pickRole('SUPPLIER'), pickRole('CUSTOMER_B2B', 'usr_cus_1'), pickRole('CUSTOMER_B2C')];
  },
};

export const userService = {
  list: (q: { search?: string; role?: Role | 'all'; status?: UserStatus | 'all' } = {}) =>
    source<User[]>(() => {
      const s = q.search?.toLowerCase() ?? '';
      return getDb().users.filter((u) =>
        (!s || [u.name, u.email, u.title].some((v) => v.toLowerCase().includes(s))) &&
        (!q.role || q.role === 'all' || u.role === q.role) && (!q.status || q.status === 'all' || u.status === q.status));
    }, () => http.get('/users', q)),
  setStatus: (id: string, status: UserStatus) =>
    source(() => { const u = getDb().users.find((x) => x.id === id)!; u.status = status; commit(); return u; }, () => http.patch(`/users/${id}`, { status })),
  /**
   * Set which sites a user may work in. Backend: PUT /users/:id/sites { allowedSites, defaultSite } (ADMIN only, audited).
   * The backend must reject an empty list and a default outside the list.
   */
  setSites: (id: string, allowedSites: string[], defaultSite: string, actor: Pick<User, 'name'>) =>
    source<User>(() => {
      if (!allowedSites.length) throw new Error('errors.sites.atLeastOne');
      const db = getDb();
      const u = db.users.find((x) => x.id === id)!;
      u.allowedSites = [...allowedSites];
      u.defaultSite = allowedSites.includes(defaultSite) ? defaultSite : allowedSites[0];
      db.activity.unshift({ id: uid('act'), at: new Date().toISOString(), actor: actor.name, text: `set sites for ${u.name}: ${u.allowedSites.join(', ')}`, kind: 'user' });
      commit();
      return u;
    }, () => http.put(`/users/${id}/sites`, { allowedSites, defaultSite })),
  get: (id: string) => source<User>(() => { const u = getDb().users.find((x) => x.id === id); if (!u) throw new Error('errors.notFound'); return u; }, () => http.get(`/users/${id}`)),
  getSalesReps: () => source<User[]>(() => getDb().users.filter((u) => u.role === 'SALES_REP'), () => http.get('/users', { role: 'SALES_REP' })),
};
