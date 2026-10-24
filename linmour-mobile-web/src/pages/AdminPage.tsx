import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';
import { ProductManage } from '../components/admin/ProductManage';
import { CategoryManage } from '../components/admin/CategoryManage';
import { TableManage } from '../components/admin/TableManage';
import { OrderMonitor } from '../components/admin/OrderMonitor';
import { ShopManage } from '../components/admin/ShopManage';
import { DashboardOverview } from '../components/admin/DashboardOverview';
import { KitchenDisplay } from '../components/admin/KitchenDisplay';
import { ShopCreate } from '../components/admin/ShopCreate';
import { ShopReport } from '../components/admin/ShopReport';
import { PaymentReconcile } from '../components/admin/PaymentReconcile';
import { ChangePassword } from '../components/admin/ChangePassword';
import { SecurityManage } from '../components/admin/SecurityManage';
import { getToken, getAdminShopId } from '../services/api';

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [, setActiveShopId] = useState<number | string | null>(() => getAdminShopId() || 1);

  useEffect(() => {
    // A1 Rule: if unauthenticated, redirect to login
    if (!getToken()) {
      navigate('/admin/login', { replace: true });
      return;
    }

    // Sprint 9 S2 & S4: Redirect guard when user is forced to change password or setup OTP
    try {
      const stored = localStorage.getItem('merchant_user_info');
      if (stored) {
        const userInfo = JSON.parse(stored);
        if (
          (userInfo.mustChangePassword === 1 || userInfo.mustChangePassword === true) &&
          !location.pathname.startsWith('/admin/change-password')
        ) {
          navigate('/admin/change-password', { replace: true });
          return;
        }
        if (
          (userInfo.mustSetupOtp === 1 || userInfo.mustSetupOtp === true) &&
          !location.pathname.startsWith('/admin/security')
        ) {
          navigate('/admin/security', { replace: true });
          return;
        }
      }
    } catch {
      // Ignore
    }
  }, [navigate, location.pathname]);

  if (!getToken()) {
    return null;
  }

  const handleShopChange = (shopId: number) => {
    setActiveShopId(shopId);
  };

  const isChangePasswordPage = location.pathname.startsWith('/admin/change-password');
  const isSecurityPage = location.pathname.startsWith('/admin/security');
  const isProductsPage = location.pathname.startsWith('/admin/products');
  const isCategoriesPage = location.pathname.startsWith('/admin/categories');
  const isTablesPage = location.pathname.startsWith('/admin/tables');
  const isOrdersPage = location.pathname.startsWith('/admin/orders');
  const isKitchenPage = location.pathname.startsWith('/admin/kitchen');
  const isSettingsPage = location.pathname.startsWith('/admin/settings');
  const isPaymentsPage = location.pathname.startsWith('/admin/payments');
  const isCreateShopPage = location.pathname.startsWith('/admin/create-shop');
  const isReportsPage = location.pathname.startsWith('/admin/reports');

  return (
    <AdminLayout onShopChange={handleShopChange}>
      {isSecurityPage ? (
        <SecurityManage />
      ) : isChangePasswordPage ? (
        <ChangePassword />
      ) : isProductsPage ? (
        <ProductManage />
      ) : isCategoriesPage ? (
        <CategoryManage />
      ) : isTablesPage ? (
        <TableManage />
      ) : isOrdersPage ? (
        <OrderMonitor />
      ) : isKitchenPage ? (
        <KitchenDisplay />
      ) : isSettingsPage ? (
        <ShopManage />
      ) : isPaymentsPage ? (
        <PaymentReconcile />
      ) : isCreateShopPage ? (
        <ShopCreate />
      ) : isReportsPage ? (
        <ShopReport />
      ) : (
        <div data-testid="admin-page-content">
          <DashboardOverview />
        </div>
      )}
    </AdminLayout>
  );
};
