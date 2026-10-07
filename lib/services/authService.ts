import { source, http } from '@/lib/api/httpClient';
import { getDb, commit } from '@/lib/data/mockDb';
import type { User, Role, UserStatus } from '@/types/domain';

export interface Session { user: User; token: string; }
export const DEMO_PASSWORD = 'demo123';

export const authService = {
  /** Mock login. Backend will return a JWT + user profile. */
  login: (email: string, password: string) =>
    source<Session>(() => {
      const user = getDb().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || password !== DEMO_PASSWORD) throw new Error('Invalid email or password');
      if (user.status === 'pending') throw new Error('Your account is awaiting administrator approval');
      if (user.status === 'inactive') throw new Error('Your account has been deactivated');
      user.lastLoginAt = new Date().toISOString();
      commit();
      return { user, token: `mock.${user.id}.${Date.now()}` };
    }, () => http.post('/auth/login', { email, password })),
  demoAccounts: () => {
    const db = getDb();
    const pickRole = (r: Role, id?: string) => db.users.find((u) => u.role === r && (!id || u.id === id))!;
    return [pickRole('admin'), pickRole('manager', 'usr_mgr_1'), pickRole('sales', 'usr_rep_1'), pickRole('customer', 'usr_cus_1')];
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
  getSalesReps: () => source<User[]>(() => getDb().users.filter((u) => u.role === 'sales'), () => http.get('/users', { role: 'sales' })),
};
