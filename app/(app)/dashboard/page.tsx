'use client';
import { useUser } from '@/lib/auth/AuthProvider';
import { AdminDashboard } from '@/features/dashboard/AdminDashboard';
import { ManagerDashboard } from '@/features/dashboard/ManagerDashboard';
import { SalesDashboard } from '@/features/dashboard/SalesDashboard';
import { CustomerDashboard } from '@/features/dashboard/CustomerDashboard';
import { SupplierDashboard } from '@/features/dashboard/SupplierDashboard';

export default function DashboardPage() {
  const user = useUser();
  if (user.role === 'ADMIN') return <AdminDashboard />;
  if (user.role === 'SUPERVISOR') return <ManagerDashboard />;
  if (user.role === 'SALES_REP') return <SalesDashboard />;
  if (user.role === 'SUPPLIER') return <SupplierDashboard />;
  return <CustomerDashboard />;
}
