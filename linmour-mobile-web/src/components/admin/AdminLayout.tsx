import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock,
  UtensilsCrossed,
  Layers,
  QrCode,
  Settings,
  CreditCard,
  BarChart3,
  PlusCircle,
  LogOut,
  ChefHat,
  ChevronDown,
  Building2,
  AlertCircle,
  AlertTriangle,
  Shield,
} from 'lucide-react';
import {
  logout,
  getAdminShopId,
  setAdminShopId,
  getShopList,
  setToken,
  Shop,
  getShopSecurityNotice,
  ShopSecurityNotice,
} from '../../services/api';

export interface AdminLayoutProps {
  children?: React.ReactNode;
  wsStatus?: 'connected' | 'reconnecting' | 'disconnected';
  onShopChange?: (shopId: number) => Promise<void> | void;
}

interface StoredUserInfo {
  id: number;
  phone: string;
  realName?: string;
  avatar?: string;
}

export interface AdminNavItem {
  id: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string | number;
  isComingSoon?: boolean;
}

export interface AdminNavGroup {
  group: string;
  items: AdminNavItem[];
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  wsStatus = 'connected',
  onShopChange,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [userInfo, setUserInfo] = useState<StoredUserInfo | null>(null);
  const [currentShop, setCurrentShop] = useState<Shop | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [isShopDropdownOpen, setIsShopDropdownOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Security notice for PayOS changes in last 24h (Sprint 9 K3)
  const [securityNotice, setSecurityNotice] = useState<ShopSecurityNotice | null>(null);
  const [showPayosNotice, setShowPayosNotice] = useState<boolean>(false);

  useEffect(() => {
    try {
      const isDismissed = sessionStorage.getItem('payos_notice_dismissed') === 'true';
      if (isDismissed) {
        setShowPayosNotice(false);
        return;
      }
    } catch {
      // Ignore
    }

    getShopSecurityNotice()
      .then((res) => {
        if (res && res.payosChangedWithin24h) {
          setSecurityNotice(res);
          setShowPayosNotice(true);
        } else {
          setShowPayosNotice(false);
        }
      })
      .catch((err) => {
        console.warn('Lỗi kiểm tra thông báo bảo mật PayOS:', err);
      });
  }, [currentShop?.id]);

  const handleDismissPayosNotice = () => {
    try {
      sessionStorage.setItem('payos_notice_dismissed', 'true');
    } catch {
      // Ignore
    }
    setShowPayosNotice(false);
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('merchant_user_info');
      if (stored) {
        setUserInfo(JSON.parse(stored));
      }
    } catch {
      // Ignore
    }

    // Load shops list to display current shop name
    getShopList({ pageNo: 1, pageSize: 20 })
      .then((res) => {
        if (res && Array.isArray(res.list) && res.list.length > 0) {
          setShops(res.list);
          const activeId = getAdminShopId();
          let activeShop = res.list.find((s: Shop) => String(s.id) === String(activeId));
          if (!activeShop) {
            activeShop = res.list[0];
            if (activeShop.id) {
              setAdminShopId(activeShop.id);
            }
          }
          setCurrentShop(activeShop);
        }
      })
      .catch((err) => {
        console.warn('Lỗi nạp danh sách quán trong layout:', err);
      });
  }, []);

  // Auto clear toast after 3.5 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleSelectShop = async (targetShop: Shop) => {
    setIsShopDropdownOpen(false);
    if (!targetShop.id || targetShop.id === currentShop?.id) return;

    const previousShop = currentShop;
    const previousShopId = previousShop?.id;

    try {
      setAdminShopId(targetShop.id);
      setCurrentShop(targetShop);
      if (onShopChange) {
        await onShopChange(targetShop.id);
      }
    } catch (err: unknown) {
      const errorObj = err as { code?: number; status?: number; message?: string };
      if (errorObj?.code === 403 || errorObj?.status === 403 || errorObj?.message?.includes('403')) {
        setToastMessage('Bạn không có quyền với quán này');
        // Rollback and keep previous shop
        if (previousShop) {
          setCurrentShop(previousShop);
          if (previousShopId !== undefined) setAdminShopId(previousShopId);
        }
      } else {
        console.error('Lỗi khi đổi quán:', err);
      }
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout(userInfo?.id || 1);
    } catch (err) {
      console.warn('Lỗi gọi API đăng xuất:', err);
    } finally {
      setToken(null);
      try {
        localStorage.removeItem('merchant_user_info');
      } catch {
        // Ignore
      }
      setIsLoggingOut(false);
      navigate('/admin/login', { replace: true });
    }
  };

  const navItems: AdminNavGroup[] = [
    {
      group: 'Vận hành quán',
      items: [
        { id: 'dashboard', path: '/admin/dashboard', icon: LayoutDashboard, label: 'Tổng quan' },
        { id: 'orders', path: '/admin/orders', icon: Clock, label: 'Đơn thời gian thực' },
        { id: 'kitchen', path: '/admin/kitchen', icon: ChefHat, label: 'Màn hình bếp' },
      ],
    },
    {
      group: 'Thực đơn & Bàn',
      items: [
        { id: 'products', path: '/admin/products', icon: UtensilsCrossed, label: 'Món ăn & Thực đơn' },
        { id: 'categories', path: '/admin/categories', icon: Layers, label: 'Danh mục món' },
        { id: 'tables', path: '/admin/tables', icon: QrCode, label: 'Bàn ăn & Mã QR' },
      ],
    },
    {
      group: 'Tài chính & Cấu hình',
      items: [
        { id: 'settings', path: '/admin/settings', icon: Settings, label: 'Cài đặt quán' },
        { id: 'security', path: '/admin/security', icon: Shield, label: 'Bảo mật' },
        { id: 'payments', path: '/admin/payments', icon: CreditCard, label: 'Đối soát giao dịch' },
        { id: 'reports', path: '/admin/reports', icon: BarChart3, label: 'Báo cáo doanh thu' },
        { id: 'create-shop', path: '/admin/create-shop', icon: PlusCircle, label: 'Tạo quán mới' },
      ],
    },
  ];

  const currentPath = location.pathname;

  return (
    <div
      data-testid="admin-layout"
      className="w-full h-screen overflow-hidden bg-slate-50 text-slate-900 flex font-sans relative"
    >
      {/* Toast Notification for 403 or alerts */}
      {toastMessage && (
        <div
          data-testid="admin-toast-message"
          role="alert"
          className="fixed top-5 right-5 z-50 bg-red-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-red-500 animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-white/80 hover:text-white font-bold p-1"
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {/* LEFT SIDEBAR (w-64 = 256px) */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between shrink-0 z-20 h-full border-r border-slate-800">
        <div className="flex flex-col min-h-0 overflow-y-auto">
          {/* Logo & Brand Header */}
          <div className="p-4 border-b border-slate-800 flex items-center gap-3 shrink-0">
            <span className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-base shadow-md tracking-wider">
              QL
            </span>
            <div>
              <div className="font-extrabold text-white text-sm tracking-wide">QUANLYNHAHANG</div>
              <div className="text-xs text-slate-400">Hệ thống quản lý quán</div>
            </div>
          </div>

          {/* Active Shop Selector */}
          <div className="p-3 border-b border-slate-800/60 relative shrink-0">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1 mb-1">
              Quán đang quản lý
            </div>
            <button
              type="button"
              data-testid="admin-shop-selector-btn"
              onClick={() => setIsShopDropdownOpen(!isShopDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700/60 transition group text-left"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span data-testid="current-shop-name" className="truncate font-bold text-white">
                  {currentShop?.name || 'Đang tải...'}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white shrink-0" />
            </button>

            {/* Shop dropdown menu */}
            {isShopDropdownOpen && (
              <div
                data-testid="admin-shop-dropdown"
                className="absolute top-full left-3 right-3 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-30 py-1 max-h-48 overflow-y-auto"
              >
                {shops.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`admin-shop-item-${s.id}`}
                    onClick={() => handleSelectShop(s)}
                    className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 transition ${
                      String(s.id) === String(currentShop?.id)
                        ? 'bg-slate-700 text-white font-bold'
                        : 'text-slate-200 hover:bg-slate-700/70 hover:text-white'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Navigation Links (10 items) */}
          <nav className="p-3 space-y-1 text-xs">
            {navItems.map((group) => (
              <div key={group.group} className="space-y-1">
                <div className="px-3 pt-3 pb-1 text-slate-500 font-bold uppercase tracking-wider text-xs">
                  {group.group}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    currentPath === item.path ||
                    (item.id === 'dashboard' && currentPath === '/admin');

                  if (item.isComingSoon) {
                    return (
                      <div
                        key={item.id}
                        data-testid={`nav-item-${item.id}`}
                        className="flex items-center justify-between px-3 py-2 text-slate-500 opacity-60 rounded-xl cursor-not-allowed select-none"
                        title="Chức năng đang phát triển"
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4" />
                          <span className="font-medium">{item.label}</span>
                        </div>
                        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-normal">
                          Sắp có
                        </span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`nav-item-${item.id}`}
                      onClick={() => navigate(item.path)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition font-medium text-left ${
                        isActive
                          ? 'bg-red-600 text-white font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`ml-auto px-2 py-0.5 rounded-full text-xs font-bold ${
                            isActive ? 'bg-white text-red-600' : 'bg-red-600 text-white'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* User Profile & Logout Footer */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs shrink-0">
              {userInfo?.realName ? userInfo.realName.slice(0, 2).toUpperCase() : 'NV'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {userInfo?.realName || 'Chủ Quán (Dev)'}
              </div>
              <div className="text-xs text-slate-400 truncate">
                {userInfo?.phone || '0912 345 678'}
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid="admin-logout-btn"
            onClick={handleLogout}
            className="min-w-[40px] min-h-[40px] p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition flex items-center justify-center cursor-pointer"
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* RIGHT MAIN CONTENT (Header + Dynamic Page Area) */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-slate-50">
        {/* Top Bar (64px) */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-10 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span data-testid="header-shop-name">{currentShop?.name || 'Đang tải...'}</span>
            </div>
          </div>

          {/* WebSocket connection status indicator */}
          <div className="flex items-center gap-3">
            {wsStatus === 'connected' ? (
              <span
                data-testid="admin-ws-status-connected"
                className="text-xs font-semibold text-green-700 flex items-center gap-1.5 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full"
              >
                <span className="w-2 h-2 rounded-full bg-green-600" />
                <span>Trực tuyến</span>
              </span>
            ) : (
              <span
                data-testid="admin-ws-status-reconnecting"
                className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full animate-pulse"
              >
                <span className="w-2 h-2 rounded-full bg-amber-600" />
                <span>Mất kết nối – đang thử lại</span>
              </span>
            )}
          </div>
        </header>

        {/* 24h PayOS Change Warning Banner (Sprint 9 K3) */}
        {showPayosNotice && securityNotice?.payosChangedWithin24h && (
          <div
            data-testid="payos-changed-banner"
            role="alert"
            className="bg-amber-500 text-white px-6 py-3 flex items-center justify-between text-xs font-semibold shadow-xs shrink-0"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
              <span>
                Cảnh báo bảo mật: Cấu hình cổng thanh toán PayOS đã bị thay đổi trong vòng 24 giờ qua
                {securityNotice.changedByName ? ` bởi ${securityNotice.changedByName}` : ''}
                {securityNotice.changedAt ? ` (${securityNotice.changedAt})` : ''}
                {securityNotice.changedIp ? ` từ IP ${securityNotice.changedIp}` : ''}.
                Vui lòng kiểm tra lại nếu bạn không thực hiện thay đổi này.
              </span>
            </div>
            <button
              type="button"
              data-testid="dismiss-payos-banner-btn"
              onClick={handleDismissPayosNotice}
              className="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 text-white font-bold rounded-lg text-xs transition shrink-0 cursor-pointer"
            >
              Tôi đã biết
            </button>
          </div>
        )}

        {/* Main Content Area (Scrolls inside) */}
        <main className="flex-1 overflow-y-auto p-6 min-h-0">{children}</main>
      </div>
    </div>
  );
};
