'use client';
import { useUser } from '@/lib/auth/AuthProvider';
import { AdminDashboard } from '@/features/dashboard/AdminDashboard';
import { ManagerDashboard } from '@/features/dashboard/ManagerDashboard';
import { SalesDashboard } from '@/features/dashboard/SalesDashboard';
import { CustomerDashboard } from '@/features/dashboard/CustomerDashboard';

export default function DashboardPage() {
  const user = useUser();
  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'manager') return <ManagerDashboard />;
  if (user.role === 'sales') return <SalesDashboard />;
  return <CustomerDashboard />;
}
