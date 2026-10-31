import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  setShopId,
  getClientShopInfo,
  getClientTableInfo,
  getMenu,
  getCurrentOrderInfo,
  resolveQrToken,
  getTableSession,
  setTableSession,
} from '../services/api';
import { getOrCreateClientWebSocket, WebSocketClient } from '../services/websocket';
import { AppShopInfo, AppTableInfo } from '../types/restaurant';
import { AppProductSort, ProductDetailDto } from '../types/product';
import { ApiError } from '../types/api';
import { ClientHeader } from '../components/client/ClientHeader';
import { InvalidQrScreen } from '../components/client/InvalidQrScreen';
import { CategoryNav } from '../components/client/CategoryNav';
import { ProductItem } from '../components/client/ProductItem';
import { MenuSkeleton } from '../components/client/MenuSkeleton';
import { EmptyMenu } from '../components/client/EmptyMenu';
import { ProductSheet } from '../components/client/ProductSheet';
import { FloatingCartBar } from '../components/client/FloatingCartBar';
import { CartView } from '../components/client/CartView';
import { TableOrderView } from '../components/client/TableOrderView';
import { ServiceCallModal } from '../components/client/ServiceCallModal';
import { PaymentView } from '../components/client/PaymentView';
import { ThankYouView } from '../components/client/ThankYouView';
import { CartProvider, useCart } from '../context/CartContext';
import { CartLineItem, generateLineId } from '../utils/productSelection';
import { OrderItem } from '../types/order';
import { Loader2, RefreshCw, WifiOff, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';

interface ClientPageContentProps {
  shopInfo: AppShopInfo;
  tableInfo: AppTableInfo;
  menu: AppProductSort[];
  menuLoading: boolean;
  menuError: boolean;
  loadMenu: () => void;
  isWsOnline: boolean;
  wsClient?: WebSocketClient | null;
  onRetryConnect: () => void;
  mockMode?: string | null;
  onTokenRevoked?: () => void;
}

const ClientPageContent: React.FC<ClientPageContentProps> = ({
  shopInfo,
  tableInfo,
  menu,
  menuLoading,
  menuError,
  loadMenu,
  isWsOnline,
  wsClient,
  onRetryConnect,
  mockMode,
  onTokenRevoked,
}) => {
  const [searchParams] = useSearchParams();
  const payosParam = searchParams.get('payos');
  const [showPayosCancelAlert, setShowPayosCancelAlert] = useState<boolean>(
    () => payosParam === 'cancel'
  );

  const [currentView, setCurrentView] = useState<'menu' | 'cart' | 'order' | 'payment' | 'paid'>(
    mockMode === 'payment' || payosParam === 'cancel'
      ? 'payment'
      : mockMode === 'paid'
      ? 'paid'
      : 'menu'
  );
  const [activeCategoryId, setActiveCategoryId] = useState<number>(0);
  const [selectedProductForSheet, setSelectedProductForSheet] = useState<ProductDetailDto | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // C8 Service call & Payment states
  const [isServiceModalOpen, setIsServiceModalOpen] = useState<boolean>(mockMode === 'service-call');
  const [currentOrderTotal, setCurrentOrderTotal] = useState<number>(
    mockMode === 'payment' || mockMode === 'paid' ? 145000 : 0
  );
  const [currentOrderId, setCurrentOrderId] = useState<string>(
    mockMode === 'payment' || mockMode === 'paid' ? 'ORD-102938' : ''
  );
  const [paidData, setPaidData] = useState<{
    orderNumber?: string;
    totalAmount?: number | string;
    payType?: number | string;
    shopName?: string;
    tableName?: string;
    paidAt?: string;
    orderItems?: OrderItem[];
  } | null>(
    mockMode === 'paid'
      ? {
          orderNumber: 'ORD-102938',
          totalAmount: 145000,
          payType: searchParams.get('payType') ? Number(searchParams.get('payType')) : 5,
        }
      : null
  );

  // C6 Order placement states
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
  const [otherPlacingOrder, setOtherPlacingOrder] = useState<boolean>(false);
  // OE-5: tăng mỗi lần nhận orderEdited để PaymentView bỏ mã PayOS cũ
  const [orderEditedVersion, setOrderEditedVersion] = useState(0);
  const [orderToast, setOrderToast] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(
    payosParam === 'cancel' ? { type: 'warning', message: 'Bạn đã huỷ thanh toán' } : null
  );
  const [lastOrderResult, setLastOrderResult] = useState<unknown>(null);
  const placeOrderTimeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { items, remark, totalAmount, addItem, clearCart, setCart, peerToast, recentPeerAdds } = useCart();

  const currentOrderIdRef = useRef(currentOrderId);
  currentOrderIdRef.current = currentOrderId;
  const currentOrderTotalRef = useRef(currentOrderTotal);
  currentOrderTotalRef.current = currentOrderTotal;
  const totalAmountRef = useRef(totalAmount);
  totalAmountRef.current = totalAmount;
  const isPlacingOrderRef = useRef(isPlacingOrder);
  isPlacingOrderRef.current = isPlacingOrder;

  // Subscribe to table WebSocket for cart synchronization and order result
  useEffect(() => {
    if (!wsClient || typeof wsClient.subscribe !== 'function') return;
    const unsubscribe = wsClient.subscribe((msg) => {
      if (msg.type === 'cartUpdated') {
        setCart(msg.cart, msg.source);
      } else if (msg.type === 'orderResult') {
        // Clear 15s fallback timer
        if (placeOrderTimeoutTimerRef.current) {
          clearTimeout(placeOrderTimeoutTimerRef.current);
          placeOrderTimeoutTimerRef.current = null;
        }
        setIsPlacingOrder(false);

        if (msg.success) {
          setOrderToast({ type: 'success', message: 'Đặt món thành công' });
          clearCart();
          setCurrentView('order');
          setLastOrderResult(msg);
        } else {
          if (msg.raw === '已有人提交订单，请稍后') {
            setOtherPlacingOrder(true);
            setTimeout(() => setOtherPlacingOrder(false), 5000);
            setOrderToast({ type: 'warning', message: 'Đang có người khác đặt món, vui lòng đợi' });
          } else {
            // A-9: Hiển thị NGUYÊN VĂN chuỗi lỗi từ server (ví dụ "Món Bánh Mì Thịt Nướng Giòn đã hết hàng")
            // GIỮ NGUYÊN GIỎ HÀNG (không gọi clearCart())
            setOrderToast({ type: 'error', message: msg.message || 'Đặt món thất bại, vui lòng thử lại' });
          }
        }
      } else if (msg.type === 'unknown' && typeof msg.raw === 'string' && msg.raw.trim().length > 0 && msg.raw.trim() !== '1') {
        // N1: Nhánh unknown chỉ bật toast lỗi khi đang đặt món (isPlacingOrder)
        if (isPlacingOrderRef.current || placeOrderTimeoutTimerRef.current) {
          if (placeOrderTimeoutTimerRef.current) {
            clearTimeout(placeOrderTimeoutTimerRef.current);
            placeOrderTimeoutTimerRef.current = null;
          }
          setIsPlacingOrder(false);
          setOrderToast({ type: 'error', message: msg.raw.trim() });
        }
      } else if (msg.type === 'paid') {
        clearCart();
        const data = (msg.data && typeof msg.data === 'object') ? (msg.data as Record<string, unknown>) : {};
        const incomingOrderId =
          (data.orderId ? String(data.orderId) : '') ||
          (data.orderNumber ? String(data.orderNumber) : '') ||
          (data.id ? String(data.id) : '') ||
          (typeof msg.data === 'string' ? msg.data : '') ||
          currentOrderIdRef.current ||
          '';

        const incomingAmount =
          data.payAmount != null
            ? Number(data.payAmount)
            : data.amount != null
            ? Number(data.amount)
            : currentOrderTotalRef.current || totalAmountRef.current || 0;

        const incomingPayType =
          data.payType != null
            ? (data.payType as number | string)
            : 1;

        const incomingShopName = (data.shopName as string) || '';
        const incomingTableName = (data.tableName as string) || '';
        const incomingPaidAt = (data.paidAt as string) || '';

        const rawItems = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
        const incomingItems: OrderItem[] = rawItems.map((it) => ({
          name: (it.name as string) || (it.productName as string) || 'Món ăn',
          quantity: Number(it.quantity) || 1,
          price: Number(it.price) || 0,
          propsText: (it.propsText as string) || undefined,
        }));

        const finalData = {
          orderNumber: incomingOrderId || '—',
          totalAmount: incomingAmount,
          payType: incomingPayType,
          shopName: incomingShopName || shopInfo?.name || '',
          tableName: incomingTableName || tableInfo.name || '—',
          paidAt: incomingPaidAt,
          orderItems: incomingItems.length > 0 ? incomingItems : undefined,
        };

        setPaidData(finalData);
        setCurrentView('paid');
        setOrderToast({ type: 'success', message: 'Thanh toán thành công!' });

        // Fallback: If orderItems or orderNumber is missing and tableId exists, fetch current order info
        if ((!finalData.orderItems || finalData.orderNumber === '—' || !finalData.totalAmount) && tableInfo.id) {
          getCurrentOrderInfo(tableInfo.id)
            .then((res) => {
              if (res) {
                const fetchedOrderInfo = res.orderInfo;
                setPaidData((prev) => ({
                  orderNumber:
                    prev?.orderNumber && prev.orderNumber !== '—'
                      ? prev.orderNumber
                      : fetchedOrderInfo?.id
                      ? String(fetchedOrderInfo.id)
                      : res.orderId || '—',
                  totalAmount: prev?.totalAmount || fetchedOrderInfo?.payAmount || res.payAmount || 0,
                  payType: prev?.payType || fetchedOrderInfo?.payType || 1,
                  shopName: prev?.shopName || shopInfo?.name || '',
                  tableName: prev?.tableName || tableInfo.name || '—',
                  paidAt: prev?.paidAt || fetchedOrderInfo?.createTime,
                  orderItems:
                    prev?.orderItems && prev.orderItems.length > 0
                      ? prev.orderItems
                      : res.orderItems?.map((it) => ({
                          name: it.name || (it as unknown as { productName?: string }).productName || 'Món ăn',
                          quantity: it.quantity || (it as unknown as { num?: number }).num || 1,
                          price: it.price || 0,
                          propsText: it.propsText,
                        })),
                }));
              }
            })
            .catch(() => {
              // Ignore fallback fetch error
            });
        }
      } else if (msg.type === 'orderEdited') {
        // OE-5: quán vừa sửa đơn của bàn → cập nhật tổng tiền, báo màn thanh toán bỏ mã PayOS cũ
        const newTotal = Number(msg.data?.payAmount);
        if (!Number.isNaN(newTotal)) setCurrentOrderTotal(newTotal);
        setOrderEditedVersion((v) => v + 1);
        setOrderToast({ type: 'warning', message: 'Quán vừa cập nhật đơn của bàn' });
      } else if (msg.type === 'tokenRevoked') {
        setOrderToast({ type: 'error', message: 'Mã QR đã được thay mới, vui lòng quét lại' });
        onTokenRevoked?.();
      }
    });
    return () => {
      unsubscribe();
    };
  }, [wsClient, setCart, clearCart, onTokenRevoked, shopInfo?.name, tableInfo.id, tableInfo.name]);

  useEffect(() => {
    return () => {
      if (placeOrderTimeoutTimerRef.current) {
        clearTimeout(placeOrderTimeoutTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!orderToast) return;
    const timer = setTimeout(() => setOrderToast(null), 3500);
    return () => clearTimeout(timer);
  }, [orderToast]);

  useEffect(() => {
    if (currentView === 'payment' && currentOrderTotal === 0 && tableInfo?.id) {
      getCurrentOrderInfo(tableInfo.id)
        .then((data) => {
          if (data?.orderInfo) {
            const amt = Number(data.orderInfo.payAmount) || 0;
            setCurrentOrderTotal(amt);
            if (data.orderInfo.orderNumber || data.orderInfo.id) {
              setCurrentOrderId(data.orderInfo.orderNumber || data.orderInfo.id);
            }
          } else if (Array.isArray(data?.orderItems) && data.orderItems.length > 0) {
            const amt = data.orderItems.reduce((s, it) => s + it.price * (it.quantity || 1), 0);
            setCurrentOrderTotal(amt);
          }
        })
        .catch(() => {});
    }
  }, [currentView, currentOrderTotal, tableInfo?.id]);

  const handlePlaceOrder = useCallback(() => {
    if (!isWsOnline) {
      setOrderToast({ type: 'warning', message: 'Mất kết nối máy chủ, đang thử lại...' });
      return;
    }
    if (items.length === 0) return;
    if (isPlacingOrder || otherPlacingOrder) return;

    setIsPlacingOrder(true);

    const cleanOrderItems: OrderItem[] = items.map((item) => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      propsText: item.propsText || '',
      picture: item.picture,
      sortId: item.sortId,
    }));

    const sent = wsClient?.sendCreateOrder({
      amount: totalAmount,
      remark: remark.trim() || undefined,
      orderItem: cleanOrderItems,
    });

    if (!sent) {
      setIsPlacingOrder(false);
      setOrderToast({ type: 'error', message: 'Không thể gửi đơn, vui lòng kiểm tra kết nối' });
      return;
    }

    if (placeOrderTimeoutTimerRef.current) {
      clearTimeout(placeOrderTimeoutTimerRef.current);
    }
    // A-9: Timeout 15s - nếu không nhận được phản hồi từ server thì mở khoá nút và báo lỗi
    placeOrderTimeoutTimerRef.current = setTimeout(() => {
      setIsPlacingOrder(false);
      if (wsClient && typeof wsClient.setPendingOrder === 'function') {
        wsClient.setPendingOrder(false);
      }
      setOrderToast({ type: 'error', message: 'Không nhận được phản hồi, vui lòng thử lại' });
      placeOrderTimeoutTimerRef.current = null;
    }, 15000);
  }, [isWsOnline, items, isPlacingOrder, otherPlacingOrder, wsClient, totalAmount, remark]);

  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!addedToast) return;
    const timer = setTimeout(() => setAddedToast(null), 2500);
    return () => clearTimeout(timer);
  }, [addedToast]);

  // Filter visible categories: only keep categories with active products (status === 1)
  const visibleCategories = useMemo(() => {
    return menu
      .map((cat) => ({
        ...cat,
        list: (cat.list || []).filter((item) => item.status === 1),
      }))
      .filter((cat) => cat.list.length > 0);
  }, [menu]);

  // Prepare tabs for CategoryNav
  const categoryTabs = useMemo(() => {
    return visibleCategories.map((cat) => ({
      id: cat.id,
      name: cat.sort,
    }));
  }, [visibleCategories]);

  // Keep active category in sync
  useEffect(() => {
    if (visibleCategories.length > 0) {
      if (!visibleCategories.some((c) => c.id === activeCategoryId)) {
        setActiveCategoryId(visibleCategories[0].id);
      }
    }
  }, [visibleCategories, activeCategoryId]);

  // IntersectionObserver for active category highlight on scroll
  useEffect(() => {
    if (typeof window === 'undefined' || !window.IntersectionObserver) return;
    if (visibleCategories.length === 0 || currentView !== 'menu') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScrollRef.current) return;
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          const catId = Number(intersecting[0].target.getAttribute('data-category-id'));
          if (catId && !isNaN(catId)) {
            setActiveCategoryId(catId);
          }
        }
      },
      {
        rootMargin: '-64px 0px -70% 0px',
        threshold: [0, 0.2, 0.5],
      }
    );

    visibleCategories.forEach((cat) => {
      const el = document.getElementById(`cat-${cat.id}`);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [visibleCategories, currentView]);

  const handleSelectCategory = (catId: number) => {
    setActiveCategoryId(catId);
    isProgrammaticScrollRef.current = true;
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 700);

    const targetEl = document.getElementById(`cat-${catId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleAddToCart = (item: CartLineItem) => {
    addItem(item);
    setAddedToast(`Đã thêm "${item.name}" vào giỏ hàng`);
  };

  const handleSelectProduct = (product: ProductDetailDto) => {
    const hasOptions = product.productSortAndOptions && product.productSortAndOptions.length > 0;
    if (hasOptions) {
      setSelectedProductForSheet(product);
      setIsSheetOpen(true);
    } else {
      // Món không có tuỳ chọn: thêm thẳng vào giỏ
      const lineItem: CartLineItem = {
        lineId: generateLineId(product.id, []),
        productId: product.id,
        name: product.name,
        price: product.price,
        unitPrice: product.price,
        quantity: 1,
        totalPrice: product.price,
        propsText: '',
        picture: product.picture,
        sortId: product.sortId,
      };
      handleAddToCart(lineItem);
    }
  };

  if (currentView === 'cart') {
    return (
      <div className="w-full md:max-w-[375px] md:mx-auto min-h-screen min-h-[100dvh] bg-white relative flex flex-col shadow-2xl border-x border-slate-200 overflow-x-clip">
        <CartView
          tableName={tableInfo.name}
          onBack={() => setCurrentView('menu')}
          onPlaceOrder={handlePlaceOrder}
          onRetry={() => {
            wsClient?.requestSync();
            onRetryConnect();
          }}
          isPlacingOrder={isPlacingOrder}
          isWsOnline={isWsOnline}
          otherPlacingOrder={otherPlacingOrder}
        />
        {orderToast && (
          <div
            data-testid="order-toast"
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-fade-in max-w-[340px] text-center ${
              orderToast.type === 'success'
                ? 'bg-green-600 text-white'
                : orderToast.type === 'warning'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-red-600 text-white'
            }`}
          >
            {orderToast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {orderToast.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {orderToast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{orderToast.message}</span>
          </div>
        )}
      </div>
    );
  }

  if (currentView === 'order') {
    return (
      <div className="w-full md:max-w-[375px] md:mx-auto min-h-screen min-h-[100dvh] bg-slate-50 relative flex flex-col shadow-2xl border-x border-slate-200 overflow-x-clip">
        <TableOrderView
          tableId={tableInfo.id}
          shopId={shopInfo.id}
          tableName={tableInfo.name}
          onBackToMenu={() => setCurrentView('menu')}
          onRequestPayment={(amount, orderId) => {
            if (amount) setCurrentOrderTotal(amount);
            if (orderId) setCurrentOrderId(orderId);
            setCurrentView('payment');
          }}
          refreshTrigger={lastOrderResult}
        />
        {orderToast && (
          <div
            data-testid="order-toast"
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-fade-in max-w-[340px] text-center ${
              orderToast.type === 'success'
                ? 'bg-green-600 text-white'
                : orderToast.type === 'warning'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-red-600 text-white'
            }`}
          >
            {orderToast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {orderToast.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {orderToast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{orderToast.message}</span>
          </div>
        )}
      </div>
    );
  }

  if (currentView === 'payment') {
    return (
      <div className="w-full md:max-w-[375px] md:mx-auto min-h-screen min-h-[100dvh] bg-slate-50 relative flex flex-col shadow-2xl border-x border-slate-200 overflow-x-clip">
        <PaymentView
          tableName={tableInfo.name}
          shopName={shopInfo.name}
          totalAmount={currentOrderTotal || totalAmount || 0}
          orderId={currentOrderId || '—'}
          tableId={tableInfo.id}
          payosEnabled={Boolean(shopInfo.payosEnabled || searchParams.get('payosMock') === '1')}
          cancelBanner={showPayosCancelAlert}
          orderEditedVersion={orderEditedVersion}
          onDismissCancelBanner={() => setShowPayosCancelAlert(false)}
          onBack={() => setCurrentView('order')}
          onRequestPayment={(method) => {
            if (method === 'payos') {
              wsClient?.sendServiceCall('Khách báo đã chuyển khoản PayOS - cần kiểm tra');
              setOrderToast({
                type: 'success',
                message: 'Đã báo nhân viên hỗ trợ kiểm tra giao dịch PayOS',
              });
            } else {
              const text =
                method === 'vietqr'
                  ? 'Yêu cầu thanh toán - Chuyển khoản VietQR'
                  : 'Yêu cầu thanh toán - Tiền mặt tại bàn';
              wsClient?.sendServiceCall(text);
              setOrderToast({ type: 'success', message: 'Đã gửi yêu cầu thanh toán tới nhân viên' });
            }
          }}
        />
        {orderToast && (
          <div
            data-testid="order-toast"
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-fade-in max-w-[340px] text-center ${
              orderToast.type === 'success'
                ? 'bg-green-600 text-white'
                : orderToast.type === 'warning'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-red-600 text-white'
            }`}
          >
            {orderToast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {orderToast.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {orderToast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{orderToast.message}</span>
          </div>
        )}
      </div>
    );
  }

  if (currentView === 'paid') {
    return (
      <div className="w-full md:max-w-[375px] md:mx-auto min-h-screen min-h-[100dvh] bg-slate-50 relative flex flex-col shadow-2xl border-x border-slate-200 overflow-x-clip">
        <ThankYouView
          shopName={paidData?.shopName || shopInfo?.name}
          tableName={paidData?.tableName || tableInfo.name}
          orderNumber={paidData?.orderNumber || currentOrderId || '—'}
          totalAmount={paidData?.totalAmount ?? currentOrderTotal ?? totalAmount ?? 0}
          payType={paidData?.payType || 1}
          orderItems={paidData?.orderItems}
          onBackToMenu={() => setCurrentView('menu')}
        />
      </div>
    );
  }

  return (
    <div className="w-full md:max-w-[375px] md:mx-auto min-h-screen min-h-[100dvh] bg-slate-50 relative flex flex-col shadow-2xl border-x border-slate-200 overflow-x-clip">
      <ClientHeader
        shopName={shopInfo.name}
        tableName={tableInfo.name}
        position={shopInfo.position}
        isOnline={isWsOnline}
        onRetryConnect={onRetryConnect}
        onViewOrder={() => setCurrentView('order')}
        onCallService={() => setIsServiceModalOpen(true)}
      />

      {/* Sticky Category Chips Nav (Ẩn khi toàn quán chưa có món hoặc có lỗi/đang tải) */}
      {!menuLoading && !menuError && visibleCategories.length > 0 && (
        <CategoryNav
          categories={categoryTabs}
          activeCategoryId={activeCategoryId}
          onSelectCategory={handleSelectCategory}
        />
      )}

      {/* Scrollable Content Area */}
      <main className="flex-1 px-3.5 py-3 space-y-5 pb-28">
        {/* State 2: Loading Skeleton */}
        {menuLoading && <MenuSkeleton />}

        {/* State 4 / Error: Lỗi nạp thực đơn */}
        {!menuLoading && menuError && (
          <div
            data-testid="menu-error-banner"
            className="p-4 my-6 bg-red-50 border border-red-200 rounded-2xl flex flex-col items-center text-center space-y-3"
          >
            <WifiOff className="w-8 h-8 text-red-500" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Không thể tải thực đơn</h3>
              <p className="text-xs text-slate-600 mt-1">
                Đã có lỗi xảy ra khi kết nối máy chủ quán. Vui lòng thử lại!
              </p>
            </div>
            <button
              type="button"
              onClick={loadMenu}
              className="min-h-[44px] px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-xs flex items-center gap-1.5 transition active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Thử lại</span>
            </button>
          </div>
        )}

        {/* State 3: Quán chưa có món nào */}
        {!menuLoading && !menuError && visibleCategories.length === 0 && (
          <EmptyMenu onRefresh={loadMenu} />
        )}

        {/* State 1: Normal Menu View */}
        {!menuLoading && !menuError && visibleCategories.length > 0 && (
          <div id="view-normal" className="space-y-6">
            {visibleCategories.map((category) => (
              <section
                key={category.id}
                id={`cat-${category.id}`}
                data-category-id={category.id}
                data-testid={`category-section-${category.id}`}
                className="space-y-3 scroll-mt-16"
              >
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1 border-l-2 border-red-600 pl-2">
                  {category.sort} ({category.list.length} món)
                </div>
                <div className="space-y-3">
                  {category.list.map((product) => (
                    <ProductItem
                      key={product.id}
                      product={product}
                      onSelect={handleSelectProduct}
                      peerBadge={recentPeerAdds?.[String(product.id)] ? 'Bạn cùng bàn vừa thêm' : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Product Sheet */}
      <ProductSheet
        product={selectedProductForSheet}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onAddToCart={handleAddToCart}
      />

      {/* Floating Cart Bar */}
      <FloatingCartBar
        tableName={tableInfo.name}
        onViewCart={() => setCurrentView('cart')}
      />

      {/* Quick feedback toast */}
      {addedToast && (
        <div
          data-testid="add-toast"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 whitespace-nowrap animate-fade-in"
        >
          <span>✓</span>
          <span>{addedToast}</span>
        </div>
      )}

      {/* Peer cart feedback toast */}
      {peerToast && (
        <div
          data-testid="peer-toast"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 whitespace-nowrap animate-fade-in border border-slate-700"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span>{peerToast}</span>
        </div>
      )}

      {/* Order placement status toast */}
      {orderToast && (
        <div
          data-testid="order-toast"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-fade-in max-w-[340px] text-center ${
            orderToast.type === 'success'
              ? 'bg-green-600 text-white'
              : orderToast.type === 'warning'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-red-600 text-white'
          }`}
        >
          {orderToast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {orderToast.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0" />}
          {orderToast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{orderToast.message}</span>
        </div>
      )}
      {/* Service Call Modal */}
      <ServiceCallModal
        isOpen={isServiceModalOpen}
        onClose={() => setIsServiceModalOpen(false)}
        tableName={tableInfo.name}
        onSendCall={(text) => {
          wsClient?.sendServiceCall(text);
          setOrderToast({ type: 'success', message: `Đã gửi yêu cầu: ${text}` });
        }}
        onOpenPayment={() => {
          setIsServiceModalOpen(false);
          setCurrentView('payment');
        }}
      />
    </div>
  );
};

export const ClientPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const rawShopId = searchParams.get('shopId');
  const rawTableId = searchParams.get('tableId');
  const qrParam = searchParams.get('qr');
  const mockMode = import.meta.env.DEV ? searchParams.get('mock') : null;

  // Page level states
  const [pageState, setPageState] = useState<'loading' | 'ready' | 'invalid' | 'pending' | 'network-error' | 'qr-revoked'>('loading');
  const [shopInfo, setShopInfo] = useState<AppShopInfo | null>(null);
  const [tableInfo, setTableInfo] = useState<AppTableInfo | null>(null);
  const [isWsOnline, setIsWsOnline] = useState<boolean>(false);
  const wsClientRef = useRef<WebSocketClient | null>(null);

  // Menu states
  const [menu, setMenu] = useState<AppProductSort[]>([]);
  const [menuLoading, setMenuLoading] = useState<boolean>(true);
  const [menuError, setMenuError] = useState<boolean>(false);

  const loadData = useCallback(() => {
    // Check mock modes (for DevTools preview & testing without mutating shared DB)
    if (mockMode === 'pending') {
      const parsedShopId = Number(rawShopId);
      const parsedTableId = Number(rawTableId);
      setShopInfo({
        id: Number.isFinite(parsedShopId) ? parsedShopId : 0,
        name: 'Nhà Hàng Bếp Việt (Cơ sở 2)',
        position: 'Số 45 Lê Duẩn, Quận 1, TP.HCM',
        auditStatus: 0,
        shopStatus: 1,
      });
      setTableInfo({
        id: Number.isFinite(parsedTableId) ? parsedTableId : 0,
        name: 'Bàn 01',
        shopId: Number.isFinite(parsedShopId) ? parsedShopId : 0,
      });
      setPageState('pending');
      return;
    }

    if (mockMode === 'network-error') {
      setPageState('network-error');
      return;
    }

    let isCancelled = false;

    // 1. T-1: Đổi QR token lấy phiên bàn an toàn
    if (qrParam) {
      setPageState('loading');
      resolveQrToken(qrParam)
        .then((res) => {
          if (isCancelled) return;
          try {
            window.history.replaceState(null, '', window.location.pathname);
          } catch {
            // Ignore history replacement exceptions in restricted environments
          }

          const sInfo: AppShopInfo = {
            id: res.shopId,
            name: res.shopName,
            position: '',
            shopStatus: res.shopStatus ?? 1,
            auditStatus: res.auditStatus ?? 1,
          };
          const tInfo: AppTableInfo = {
            id: res.tableId,
            name: res.tableName,
            shopId: res.shopId,
          };

          if (sInfo.auditStatus !== 1 || sInfo.shopStatus === 0) {
            setShopInfo(sInfo);
            setTableInfo(tInfo);
            setPageState('pending');
            return;
          }

          setShopInfo(sInfo);
          setTableInfo(tInfo);
          setPageState('ready');
        })
        .catch((err: unknown) => {
          if (isCancelled) return;
          console.error('Lỗi giải mã QR token:', err);
          if (err instanceof ApiError && (err.code === 404 || err.code === 400 || err.code === 429)) {
            setPageState('invalid');
          } else {
            setPageState('network-error');
          }
        });

      return () => {
        isCancelled = true;
      };
    }

    // 2. Kiểm tra phiên bàn trong sessionStorage
    const session = getTableSession();
    if (session && session.tableAccessToken && session.shopId && session.tableId) {
      setPageState('loading');
      getClientShopInfo()
        .then((shop) => {
          if (isCancelled) return;
          const tInfo: AppTableInfo = {
            id: session.tableId,
            name: session.tableName,
            shopId: session.shopId,
          };

          if (shop.auditStatus !== 1 || shop.shopStatus === 0) {
            setShopInfo(shop);
            setTableInfo(tInfo);
            setPageState('pending');
            return;
          }

          setShopInfo(shop);
          setTableInfo(tInfo);
          setPageState('ready');
        })
        .catch((err: unknown) => {
          if (isCancelled) return;
          if (err instanceof ApiError && (err.code === 401 || err.code === 403)) {
            setTableSession(null);
            setPageState('qr-revoked');
            return;
          }
          // Fallback với thông tin phiên đã lưu
          const sInfo: AppShopInfo = {
            id: session.shopId,
            name: session.shopName || '',
            position: '',
            shopStatus: 1,
            auditStatus: 1,
          };
          const tInfo: AppTableInfo = {
            id: session.tableId,
            name: session.tableName,
            shopId: session.shopId,
          };
          setShopInfo(sInfo);
          setTableInfo(tInfo);
          setPageState('ready');
        });

      return () => {
        isCancelled = true;
      };
    }

    // 3. Fallback chế độ dev: ?shopId=...&tableId=...
    const isValidShopId = rawShopId !== null && /^\d+$/.test(rawShopId) && Number(rawShopId) > 0;
    const isValidTableId = rawTableId !== null && /^\d+$/.test(rawTableId) && Number(rawTableId) > 0;

    if (!isValidShopId || !isValidTableId) {
      setPageState('invalid');
      return;
    }

    setShopId(rawShopId);
    setPageState('loading');

    Promise.all([getClientShopInfo(), getClientTableInfo(rawTableId)])
      .then(([shop, table]) => {
        if (isCancelled) return;

        // Check if shop is pending audit or closed/inactive
        if (shop.auditStatus !== 1 || shop.shopStatus === 0) {
          setShopInfo(shop);
          setTableInfo(table);
          setPageState('pending');
          return;
        }

        setShopInfo(shop);
        setTableInfo(table);
        setPageState('ready');
      })
      .catch((err: unknown) => {
        if (isCancelled) return;
        console.error('Lỗi nạp thông tin quán/bàn:', err);

        const isBusinessInvalid =
          err instanceof ApiError && (err.code === 201 || (err.code >= 400 && err.code < 500));

        if (isBusinessInvalid) {
          setPageState('invalid');
        } else {
          setPageState('network-error');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [qrParam, rawShopId, rawTableId, mockMode]);

  useEffect(() => {
    const cancel = loadData();
    return () => {
      if (cancel) cancel();
    };
  }, [loadData]);

  // Load menu once page is ready
  const loadMenu = useCallback(async () => {
    if (mockMode === 'empty' || mockMode === 'menu-empty') {
      setMenu([]);
      setMenuLoading(false);
      setMenuError(false);
      return;
    }

    if (mockMode === 'loading' || mockMode === 'menu-loading') {
      setMenuLoading(true);
      setMenuError(false);
      return;
    }

    if (mockMode === 'menu-error') {
      setMenuLoading(false);
      setMenuError(true);
      return;
    }

    setMenuLoading(true);
    setMenuError(false);
    try {
      const data = await getMenu();
      setMenu(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('Lỗi nạp thực đơn:', err);
      if (err instanceof ApiError && (err.code === 401 || err.code === 403)) {
        setTableSession(null);
        setPageState('qr-revoked');
        return;
      }
      setMenuError(true);
    } finally {
      setMenuLoading(false);
    }
  }, [mockMode]);

  useEffect(() => {
    if (pageState === 'ready') {
      loadMenu();
    }
  }, [pageState, loadMenu]);

  const activeShopId = shopInfo?.id ? String(shopInfo.id) : (rawShopId || '');
  const activeTableId = tableInfo?.id ? String(tableInfo.id) : (rawTableId || '');

  // WebSocket lifecycle: only open when ready
  useEffect(() => {
    if (pageState !== 'ready' || !activeShopId || !activeTableId) {
      if (wsClientRef.current) {
        wsClientRef.current.close();
        wsClientRef.current = null;
        setIsWsOnline(false);
      }
      return;
    }

    const ws = getOrCreateClientWebSocket(activeShopId, activeTableId);
    wsClientRef.current = ws;
    const unsubscribeStatus = ws.subscribeStatus((online) => {
      setIsWsOnline(mockMode === 'ws-down' || mockMode === 'disconnected' ? false : online);
    });

    return () => {
      unsubscribeStatus();
    };
  }, [pageState, activeShopId, activeTableId, mockMode]);

  if (pageState === 'loading') {
    return (
      <div className="w-full md:max-w-[375px] md:mx-auto min-h-screen min-h-[100dvh] bg-slate-50 relative flex flex-col items-center justify-center p-6 text-center border-x border-slate-200 overflow-x-clip">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <p className="text-xs font-semibold text-slate-500 mt-3">Đang kết nối bàn ăn...</p>
      </div>
    );
  }

  if (pageState === 'qr-revoked') {
    return (
      <InvalidQrScreen
        variant="invalid"
        title="Mã QR Đã Thay Mới"
        message="Mã QR của bàn đã được tạo mới hoặc phiên đã hết hạn. Quý khách vui lòng quét lại mã QR dán trên bàn."
        onRetry={() => {
          setTableSession(null);
          window.location.reload();
        }}
      />
    );
  }

  if (pageState === 'invalid') {
    return (
      <InvalidQrScreen
        variant="invalid"
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (pageState === 'pending') {
    return (
      <InvalidQrScreen
        variant="pending"
        shopName={shopInfo?.name}
      />
    );
  }

  if (pageState === 'network-error') {
    return (
      <InvalidQrScreen
        variant="network-error"
        onRetry={loadData}
      />
    );
  }

  return (
    <CartProvider
      shopId={activeShopId}
      tableId={activeTableId}
      onUserChange={(newItems) => {
        wsClientRef.current?.sendChange(newItems);
      }}
    >
      <ClientPageContent
        shopInfo={shopInfo!}
        tableInfo={tableInfo!}
        menu={menu}
        menuLoading={menuLoading}
        menuError={menuError}
        loadMenu={loadMenu}
        isWsOnline={isWsOnline}
        wsClient={wsClientRef.current}
        onRetryConnect={() => wsClientRef.current?.reconnect()}
        mockMode={mockMode}
        onTokenRevoked={() => setPageState('qr-revoked')}
      />
    </CartProvider>
  );
};
