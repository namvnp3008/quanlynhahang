import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Store,
  Users,
  BadgePercent,
  LogOut,
  AlertTriangle,
  History,
  ShieldAlert,
} from 'lucide-react';
import { logout, getToken, setToken, getShopList } from '../../services/api';

interface PlatformUserInfo {
  id: number;
  phone: string;
  realName?: string;
  type?: number | string;
}

export interface PlatformLayoutProps {
  children?: React.ReactNode;
}

export const PlatformLayout: React.FC<PlatformLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [userInfo, setUserInfo] = useState<PlatformUserInfo | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [mustSetupOtp, setMustSetupOtp] = useState<boolean>(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate('/admin/login', { replace: true });
      return;
    }

    try {
      const stored = localStorage.getItem('merchant_user_info');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserInfo(parsed);
        // Platform Admin requirement: userInfo.type === 1 (or '1')
        const isSuperAdmin = String(parsed.type) === '1';
        setIsAuthorized(isSuperAdmin);

        // Sprint 9 S4: Mandatory OTP check for platform admin
        if (parsed.mustSetupOtp === 1 || parsed.mustSetupOtp === true) {
          setMustSetupOtp(true);
        }
      } else {
        setIsAuthorized(false);
      }
    } catch {
      setIsAuthorized(false);
    }

    // Load pending shops count for badge
    getShopList({ auditStatus: 2, pageNo: 1, pageSize: 50 })
      .then((res) => {
        if (res && res.total !== undefined) {
          setPendingCount(res.total);
        } else if (res && Array.isArray(res.list)) {
          setPendingCount(res.list.length);
        }
      })
      .catch(() => {
        // Khi lỗi kết nối không đặt số lượng giả mạo
        setPendingCount(0);
      });
  }, [navigate]);

  const handleLogout = async () => {
    try {
      if (userInfo?.id) {
        await logout(userInfo.id);
      }
    } catch {
      // Ignore
    } finally {
      setToken(null);
      localStorage.removeItem('merchant_user_info');
      navigate('/admin/login', { replace: true });
    }
  };

  const navItems = [
    {
      id: 'shops',
      path: '/platform/shops',
      icon: Store,
      label: 'Duyệt quán ăn mới',
      badge: pendingCount > 0 ? String(pendingCount) : undefined,
    },
    {
      id: 'merchants',
      path: '/platform/merchants',
      icon: Users,
      label: 'Quản lý chủ quán',
    },
    {
      id: 'revenue',
      path: '/platform/revenue',
      icon: BadgePercent,
      label: 'Doanh thu & Hoa hồng',
    },
    {
      id: 'audit',
      path: '/platform/audit',
      icon: History,
      label: 'Nhật ký kiểm toán',
    },
  ];

  const currentPath = location.pathname;

  if (isAuthorized === false) {
    return (
      <div
        data-testid="platform-forbidden-screen"
        className="w-full h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 font-sans select-none"
      >
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-3xl border border-slate-700 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/30 flex items-center justify-center text-2xl mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-white">Từ Chối Quyền Truy Cập</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Khu vực này chỉ dành riêng cho <strong>Quản trị viên nền tảng (Platform SuperAdmin – type = 1)</strong>. Tài khoản của bạn không có đủ thẩm quyền quản lý.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/admin/dashboard')}
              className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition"
            >
              Về Cổng Quán
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
            >
              Đổi Tài Khoản
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mustSetupOtp) {
    return (
      <div
        data-testid="platform-otp-required-screen"
        className="w-full h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 font-sans select-none"
      >
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-3xl border border-slate-700 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center text-2xl mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-white">Yêu Cầu Kích Hoạt 2FA</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Chính sách bảo mật hệ thống bắt buộc <strong>Quản trị viên nền tảng (Platform SuperAdmin)</strong> phải kích hoạt xác thực hai lớp (TOTP 2FA) trước khi truy cập quản trị toàn sàn.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              data-testid="setup-otp-now-btn"
              onClick={() => navigate('/admin/security')}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
            >
              Thiết Lập 2FA Ngay
            </button>
            <button
              type="button"
              data-testid="platform-otp-logout-btn"
              onClick={handleLogout}
              className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Đăng Xuất
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="platform-layout"
      className="w-full h-screen overflow-hidden bg-slate-50 text-slate-900 flex font-sans select-none relative"
    >
      {/* LEFT SIDEBAR (PLATFORM ADMIN) */}
      <aside className="w-64 bg-slate-950 text-white flex flex-col justify-between shrink-0 z-20 border-r border-slate-800">
        <div>
          {/* Logo */}
          <div className="p-5 border-b border-slate-800 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-base shadow-md tracking-wider">
              QL
            </span>
            <div>
              <div className="font-extrabold text-white text-base tracking-wide">QUANLYNHAHANG</div>
              <div className="text-xs text-blue-400 font-bold">Quản Trị Nền Tảng</div>
            </div>
          </div>

          {/* Platform Navigation Links */}
          <nav className="p-3 space-y-1 text-xs">
            <div className="px-3 py-2 text-slate-500 font-bold uppercase tracking-wider text-[12px]">
              Hệ thống SaaS
            </div>

            {navItems.map((item) => {
              const isActive =
                item.path === '/platform/shops'
                  ? currentPath === '/platform' || currentPath.startsWith('/platform/shops')
                  : currentPath.startsWith(item.path);

              const Icon = item.icon;

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  data-testid={`platform-nav-${item.id}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-850'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span
                      data-testid={`badge-pending-${item.id}`}
                      className="ml-auto bg-white text-blue-700 font-black px-2 py-0.5 rounded-full text-xs"
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Super Admin Profile */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs">
              AD
            </div>
            <div>
              <div className="text-xs font-bold text-white">Platform SuperAdmin</div>
              <div className="text-xs text-slate-400">admin@quanlynhahang.vn</div>
            </div>
          </div>
          <button
            type="button"
            data-testid="platform-logout-btn"
            onClick={handleLogout}
            className="p-1.5 text-slate-400 hover:text-red-400 transition cursor-pointer"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* RIGHT MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
        {children}
      </div>
    </div>
  );
};
