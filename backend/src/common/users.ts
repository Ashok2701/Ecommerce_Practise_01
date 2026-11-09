import type { Knex } from 'knex';
import type { User } from '@/types/domain';

export interface UserRow {
  id: string; email: string; password_hash: string; name: string; phone: string | null; role: User['role']; status: User['status']; title: string | null; region: string | null;
  customer_id: string | null; supplier_id: string | null; erp_code: string | null; allowed_sites: string | null; default_site: string | null; monthly_target: number | null;
  created_at: string; last_login_at: string | null; failed_logins: number;
}

const u = <T,>(v: T | null) => (v === null ? undefined : v);

/** Users table row -> API User (never includes the password hash). */
export function toUser(r: UserRow): User {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone ?? '', role: r.role, status: r.status, title: r.title ?? '', region: u(r.region),
    customerId: u(r.customer_id), supplierId: u(r.supplier_id), erpCode: u(r.erp_code),
    allowedSites: r.allowed_sites ? JSON.parse(r.allowed_sites) : [], defaultSite: u(r.default_site),
    monthlyTarget: r.monthly_target === null ? undefined : Number(r.monthly_target), createdAt: r.created_at, lastLoginAt: u(r.last_login_at),
  };
}

export async function allUsers(k: Knex): Promise<User[]> {
  return (await k('users').select()).map(toUser);
}
