import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RestaurantTable,
  OrderAllDto,
  OrderItem,
  getTables,
  getOpenOrders,
  adminSetOrderItemStatus,
  adminCheckout,
  getAdminShopId,
  getShopByIds,
  addOpenOrderItem,
  updateOpenOrderItemQuantity,
  removeOpenOrderItem,
  ApiError,
} from '../../services/api';
import { OrderEditResult } from '../../types/order';
import { AddItemDialog, AddItemSelection, ReduceItemDialog } from './OrderEditDialogs';
import { getOrCreateAdminWebSocket, WebSocketClient } from '../../services/websocket';
import { WsIncomingMessage, WsNewOrderData, WsPayosMismatchData } from '../../types/websocket';
import { formatVND } from '../../utils/currency';
import {
  ReceiptPrintPortal,
  AdminReceipt,
  triggerReceiptPrint,
} from '../common/ReceiptPrintPortal';
import {
  Bell,
  Check,
  Clock,
  Printer,
  X,
  CreditCard,
  Banknote,
  AlertTriangle,
  Pencil,
  Trash2,
  Plus,
  Minus,
} from 'lucide-react';

/**
 * Web Audio API synthesizer for new order notification chime.
 * Generates a clean two-tone chime (E5 -> B5) without external audio files.
 */
function playNewOrderChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // First tone (E5: 659.25Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second tone (B5: 987.77Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.15);
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);
  } catch {
    // Ignore audio error if not permitted
  }
}

function formatVnd(amount: number | string | undefined | null): string {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

function formatTime(isoOrTimestamp?: string | number): string {
  if (!isoOrTimestamp) {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
  try {
    const d = new Date(isoOrTimestamp);
    if (isNaN(d.getTime())) return String(isoOrTimestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return String(isoOrTimestamp);
  }
}

interface ServiceCallItem {
  id: string;
  tableId: number | string;
  tableName: string;
  text: string;
  time: string;
  isPaymentRequest: boolean;
}

interface NewOrderAlert {
  tableNumber: string;
  itemCount: number;
  totalAmount: number;
  time: string;
}

interface PayosMismatchAlert {
  id: string;
  tableId: number | string;
  orderCode?: number | string;
  paidAmount: number;
  dueAmount: number;
  message: string;
  time: string;
}

export const OrderMonitor: React.FC = () => {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [openOrders, setOpenOrders] = useState<OrderAllDto[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | string | null>(null);
  const [filter, setFilter] = useState<'all' | 'eating' | 'payment_pending' | 'empty'>('all');
  const [loading, setLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  // Realtime alerts & service calls
  const [serviceCalls, setServiceCalls] = useState<ServiceCallItem[]>([]);
  const [serviceCallToast, setServiceCallToast] = useState<ServiceCallItem | null>(null);
  const [isServiceCallListOpen, setIsServiceCallListOpen] = useState(false);
  const [newOrderToast, setNewOrderToast] = useState<NewOrderAlert | null>(null);
  const [payosMismatchAlert, setPayosMismatchAlert] = useState<PayosMismatchAlert | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Payment checkout modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPayType, setSelectedPayType] = useState<number>(4); // 4 = Cash, 1 = VietQR
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);

  // OE-4: Sửa đơn đang mở
  const [isEditMode, setIsEditMode] = useState(false);
  const [savingKey, setSavingKey] = useState<number | 'add' | null>(null);
  const [reduceTarget, setReduceTarget] = useState<{ index: number; item: OrderItem; newQuantity: number | null } | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Shop info for 80mm thermal receipt printing (PR-1)
  const [shopInfo, setShopInfo] = useState<{ name: string; position?: string; phone?: string }>({
    name: '',
  });

  const activeShopId = getAdminShopId() || 1;

  useEffect(() => {
    const shopId = getAdminShopId();
    if (shopId) {
      getShopByIds([shopId])
        .then((res) => {
          if (res && res[0]) {
            setShopInfo({
              name: res[0].name || '',
              position: res[0].position || res[0].address || '',
              phone: res[0].phone || '',
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  const handlePrintReceipt = () => {
    if (!selectedOrder) return;
    triggerReceiptPrint();
  };

  // Auto clear feedback toast
  useEffect(() => {
    if (!feedbackToast) return;
    const timer = setTimeout(() => setFeedbackToast(null), 3500);
    return () => clearTimeout(timer);
  }, [feedbackToast]);

  // Load tables & open orders
  const refreshData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const [fetchedTables, fetchedOrders] = await Promise.all([
        getTables().catch(() => []),
        getOpenOrders().catch(() => []),
      ]);
      setTables(fetchedTables || []);
      setOpenOrders(fetchedOrders || []);

      const now = new Date();
      setLastSyncTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      );

      // Select default table if none selected or current is invalid
      setSelectedTableId((prev) => {
        if (prev && (fetchedTables || []).some((t) => String(t.id) === String(prev))) {
          return prev;
        }
        // Prefer first table with open orders
        const occupiedOrder = (fetchedOrders || []).find((o) => o?.orderInfo?.tableId);
        if (occupiedOrder) {
          return occupiedOrder.orderInfo.tableId;
        }
        return fetchedTables?.[0]?.id ?? null;
      });
    } catch (err) {
      console.error('Lỗi tải dữ liệu đơn thời gian thực:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  // Initial load + 20s polling backup
  useEffect(() => {
    refreshData();
    const interval = setInterval(() => {
      refreshData(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // WebSocket connection for live orders & service calls
  useEffect(() => {
    const wsClient: WebSocketClient = getOrCreateAdminWebSocket(activeShopId);

    const unsubscribe = wsClient.subscribe((msg: WsIncomingMessage) => {
      if (msg.type === 'newOrder') {
        const data = msg.data as WsNewOrderData;
        playNewOrderChime();

        // Extract order info
        const tableNum = data?.tableNum || data?.tableId ? `Bàn ${data.tableNum || data.tableId}` : 'Khách';
        const itemCount = Array.isArray(data?.orderItems) ? data.orderItems.length : 1;
        const totalAmount = Number(data?.payAmount) || Number(data?.amount) || 0;

        setNewOrderToast({
          tableNumber: tableNum,
          itemCount,
          totalAmount,
          time: 'Vừa xong',
        });

        // Trigger silent refresh
        refreshData(true);
      } else if (msg.type === 'serviceCall') {
        const rawData = msg.data as
          | { tableId?: string | number; text?: string; content?: string; message?: string; time?: string }
          | string;
        let callText = '';
        let callTableId: number | string = '0';
        let callTime = formatTime();

        if (typeof rawData === 'string') {
          callText = rawData;
        } else if (rawData && typeof rawData === 'object') {
          callText = rawData.content || rawData.text || rawData.message || '';
          callTableId = rawData.tableId || '0';
          if (rawData.time) {
            callTime = formatTime(rawData.time);
          }
        }

        const isPayment =
          callText.toLowerCase().includes('thanh toán') ||
          callText.toLowerCase().includes('tính tiền');

        const newCall: ServiceCallItem = {
          id: `call-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          tableId: callTableId,
          tableName: callTableId !== '0' ? `Bàn ${String(callTableId).padStart(2, '0')}` : 'Bàn gọi',
          text: callText || 'Cần hỗ trợ',
          time: callTime,
          isPaymentRequest: isPayment,
        };

        playNewOrderChime();
        setServiceCalls((prev) => [newCall, ...prev.filter((c) => c.id !== newCall.id)]);
        setServiceCallToast(newCall);
      } else if (msg.type === 'paid') {
        // Table was paid
        refreshData(true);
      } else if (msg.type === 'payosMismatch') {
        // PayOS amount mismatch notification (Story F-5 / P-1)
        const data = msg.data as WsPayosMismatchData;
        playNewOrderChime();
        const tableId = data?.tableId || '0';
        const paid = Number(data?.paidAmount) || 0;
        const due = Number(data?.dueAmount) || 0;
        const alertMessage = `Bàn ${tableId} chuyển khoản PayOS ${formatVND(paid)}, chưa khớp đơn ${formatVND(due)} – kiểm tra`;

        setPayosMismatchAlert({
          id: `mismatch-${Date.now()}`,
          tableId,
          orderCode: data?.orderCode,
          paidAmount: paid,
          dueAmount: due,
          message: alertMessage,
          time: formatTime(),
        });
        refreshData(true);
      } else if (msg.type === 'itemStatus') {
        // An item status changed
        refreshData(true);
      } else if (msg.type === 'orderEdited') {
        // OE-3: đơn của bàn vừa được sửa (tab / máy khác)
        refreshData(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeShopId, refreshData]);

  // Helper: map open order by tableId
  const orderMap = useMemo(() => {
    const map = new Map<string, OrderAllDto>();
    for (const order of openOrders) {
      if (order && order.orderInfo && order.orderInfo.tableId !== undefined) {
        map.set(String(order.orderInfo.tableId), order);
      }
    }
    return map;
  }, [openOrders]);

  // Helper: check if table has payment service call
  const paymentRequestedTableIds = useMemo(() => {
    const set = new Set<string>();
    for (const sc of serviceCalls) {
      if (sc.isPaymentRequest && sc.tableId) {
        set.add(String(sc.tableId));
      }
    }
    return set;
  }, [serviceCalls]);

  // Tables classified with live status
  const tablesWithStatus = useMemo(() => {
    return tables.map((t) => {
      const order = orderMap.get(String(t.id));
      const hasOrder = !!order;
      const isPaymentPending = hasOrder && paymentRequestedTableIds.has(String(t.id));

      let statusType: 'payment_pending' | 'eating' | 'empty' = 'empty';
      if (isPaymentPending) {
        statusType = 'payment_pending';
      } else if (hasOrder) {
        statusType = 'eating';
      }

      return {
        ...t,
        order,
        statusType,
      };
    });
  }, [tables, orderMap, paymentRequestedTableIds]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    if (filter === 'all') return tablesWithStatus;
    return tablesWithStatus.filter((t) => t.statusType === filter);
  }, [tablesWithStatus, filter]);

  // Count stats for tabs
  const counts = useMemo(() => {
    let eating = 0;
    let payment_pending = 0;
    let empty = 0;
    for (const t of tablesWithStatus) {
      if (t.statusType === 'payment_pending') payment_pending++;
      else if (t.statusType === 'eating') eating++;
      else empty++;
    }
    return {
      total: tablesWithStatus.length,
      eating,
      payment_pending,
      empty,
    };
  }, [tablesWithStatus]);

  // Currently selected table and its order
  const selectedTable = useMemo(() => {
    if (!selectedTableId) return null;
    return tablesWithStatus.find((t) => String(t.id) === String(selectedTableId)) || null;
  }, [tablesWithStatus, selectedTableId]);

  const selectedOrder = selectedTable?.order || null;

  // OE-4: đổi bàn hoặc bàn hết đơn thì thoát chế độ sửa
  useEffect(() => {
    setIsEditMode(false);
    setReduceTarget(null);
    setIsAddDialogOpen(false);
  }, [selectedTableId]);

  useEffect(() => {
    if (isEditMode && !selectedOrder) setIsEditMode(false);
  }, [isEditMode, selectedOrder]);

  const applyEditResult = (result: OrderEditResult) => {
    setOpenOrders((prev) =>
      prev.map((ord) =>
        String(ord.orderInfo?.tableId) === String(selectedTableId)
          ? { ...ord, orderInfo: result.orderInfo, orderItems: result.orderItems || [] }
          : ord
      )
    );
  };

  const PAYOS_CANCELLED_NOTE = 'Đã huỷ mã PayOS cũ của bàn vì tổng tiền thay đổi.';

  const runOrderEdit = async (
    key: number | 'add',
    action: (version: number) => Promise<OrderEditResult>,
    successMessage?: string
  ) => {
    if (!selectedTableId || !selectedOrder) return false;
    setSavingKey(key);
    try {
      const result = await action(Number(selectedOrder.orderInfo?.version ?? 0));
      applyEditResult(result);
      const parts = [successMessage, result.payosCancelled ? PAYOS_CANCELLED_NOTE : undefined].filter(Boolean);
      if (parts.length > 0) setFeedbackToast(parts.join(' '));
      return true;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 0;
      if (code === 409) {
        setFeedbackToast('Đơn vừa thay đổi (khách gọi thêm món), đã tải lại. Vui lòng thao tác lại.');
      } else if (code === 404) {
        setFeedbackToast('Bàn này không còn đơn đang mở (đã thanh toán).');
        setIsEditMode(false);
      } else {
        setFeedbackToast(err instanceof Error && err.message ? err.message : 'Lỗi sửa đơn, vui lòng thử lại');
      }
      refreshData(true);
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  // Món đang làm (1) hoặc đã lên (2) thì giảm / xoá phải chọn lý do
  const itemNeedsReason = (item: OrderItem) => item.status === 1 || item.status === 2;

  const handleChangeQuantity = (index: number, item: OrderItem, nextQuantity: number) => {
    if (!selectedTableId) return;
    const current = item.quantity || 1;
    if (nextQuantity < 1) {
      setReduceTarget({ index, item, newQuantity: null });
      return;
    }
    if (nextQuantity < current && itemNeedsReason(item)) {
      setReduceTarget({ index, item, newQuantity: nextQuantity });
      return;
    }
    runOrderEdit(index, (version) =>
      updateOpenOrderItemQuantity(selectedTableId, index, { version, quantity: nextQuantity })
    );
  };

  const handleConfirmReduce = async (reason?: string) => {
    if (!selectedTableId || !reduceTarget) return;
    const { index, newQuantity, item } = reduceTarget;
    await runOrderEdit(
      index,
      (version) =>
        newQuantity === null
          ? removeOpenOrderItem(selectedTableId, index, { version, reason })
          : updateOpenOrderItemQuantity(selectedTableId, index, { version, quantity: newQuantity, reason }),
      newQuantity === null ? `Đã xoá ${item.name} khỏi đơn.` : `Đã giảm ${item.name}.`
    );
    setReduceTarget(null);
  };

  const handleAddItem = async (selection: AddItemSelection) => {
    if (!selectedTableId) return;
    const ok = await runOrderEdit(
      'add',
      (version) => addOpenOrderItem(selectedTableId, { version, ...selection }),
      'Đã thêm món vào đơn.'
    );
    if (ok) setIsAddDialogOpen(false);
  };

  // Toggle order item status: 0/1 (Chờ lên) <-> 2 (Đã lên)
  const handleToggleItemStatus = async (index: number, currentStatus?: number) => {
    if (!selectedTableId) return;
    const targetStatus = currentStatus === 2 ? 0 : 2;

    try {
      // Optimistic update
      setOpenOrders((prevOrders) =>
        prevOrders.map((ord) => {
          if (String(ord.orderInfo?.tableId) === String(selectedTableId)) {
            const nextItems = [...(ord.orderItems || [])];
            if (nextItems[index]) {
              nextItems[index] = { ...nextItems[index], status: targetStatus };
            }
            return { ...ord, orderItems: nextItems };
          }
          return ord;
        })
      );

      await adminSetOrderItemStatus(selectedTableId, index, targetStatus);
      setFeedbackToast(
        targetStatus === 2
          ? 'Đã đánh dấu món "Đã lên bàn"'
          : 'Đã chuyển món về "Chờ lên"'
      );
    } catch (err) {
      console.error('Lỗi cập nhật trạng thái món:', err);
      setFeedbackToast('Không thể cập nhật trạng thái món, vui lòng thử lại');
      refreshData(true);
    }
  };

  // Confirm checkout
  const handleConfirmCheckout = async () => {
    if (!selectedTableId) return;
    setIsSubmittingCheckout(true);

    try {
      await adminCheckout({
        tableId: String(selectedTableId),
        payType: selectedPayType,
        openid: '',
      });

      setFeedbackToast(`Đã xác nhận thu tiền cho ${selectedTable?.name || `Bàn ${selectedTableId}`}!`);
      setIsPaymentModalOpen(false);

      // Remove from service calls if pending payment
      setServiceCalls((prev) => prev.filter((sc) => String(sc.tableId) !== String(selectedTableId)));

      // Silent refresh to update status to empty
      await refreshData(true);
    } catch (err) {
      console.error('Lỗi xác nhận thu tiền:', err);
      setFeedbackToast('Lỗi xác nhận thu tiền, vui lòng kiểm tra lại');
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  // Dismiss a service call item
  const handleDismissServiceCall = (id: string) => {
    setServiceCalls((prev) => prev.filter((sc) => sc.id !== id));
    setServiceCallToast((prev) => (prev?.id === id ? null : prev));
  };

  const handleDismissAllServiceCalls = () => {
    setServiceCalls([]);
    setServiceCallToast(null);
    setIsServiceCallListOpen(false);
  };

  return (
    <div
      data-testid="order-monitor-container"
      className="flex-1 flex flex-col min-w-0 bg-slate-100 h-full overflow-hidden relative select-none"
    >
      {/* 1. Top Bar */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-slate-900 truncate">
            Sơ Đồ Bàn & Đơn Hàng Trực Tiếp
          </h1>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#F0FDF4] text-[#15803D] border border-[#DCFCE7] shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse"></span>
            Trực Tuyến
          </span>
        </div>

        {/* Service Call Bar (Story A8 / A7) */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-[650px] no-scrollbar relative">
          {serviceCalls.length === 0 ? (
            <div className="text-xs text-slate-400 italic hidden sm:block">
              Không có yêu cầu phục vụ nào đang chờ
            </div>
          ) : (
            <>
              {/* Stacked list toggle button if > 1 call */}
              {serviceCalls.length > 1 && (
                <button
                  type="button"
                  data-testid="service-calls-stacked-toggle-btn"
                  onClick={() => setIsServiceCallListOpen(!isServiceCallListOpen)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs shrink-0"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span>Xếp chồng ({serviceCalls.length})</span>
                </button>
              )}

              {/* Quick visible chips */}
              {serviceCalls.slice(0, 2).map((call) => (
                <div
                  key={call.id}
                  data-testid={`service-call-chip-${call.id}`}
                  className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 shadow-xs shrink-0 ${
                    call.isPaymentRequest
                      ? 'bg-[#FFFBEB] border border-[#FEF3C7] text-[#B45309]'
                      : 'bg-[#FFF7ED] border border-[#FFEDD5] text-[#C2410C]'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      call.isPaymentRequest ? 'bg-[#B45309] animate-ping' : 'bg-[#C2410C]'
                    }`}
                  ></span>
                  <span>
                    <strong>{call.tableName}</strong>: {call.text}
                  </span>
                  <span className="text-[10px] opacity-75 font-mono">({call.time})</span>
                  <button
                    type="button"
                    onClick={() => handleDismissServiceCall(call.id)}
                    className={`ml-1 px-2.5 py-1 text-white rounded-lg text-xs font-bold transition ${
                      call.isPaymentRequest
                        ? 'bg-[#B45309] hover:bg-[#78350F]'
                        : 'bg-[#C2410C] hover:bg-[#9A3412]'
                    }`}
                  >
                    Đã xử lý
                  </button>
                </div>
              ))}

              {/* Stacked Dropdown Popover */}
              {isServiceCallListOpen && (
                <div
                  data-testid="service-calls-stacked-list"
                  className="absolute right-0 top-12 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-amber-600" />
                      <span className="font-bold text-xs text-slate-900">
                        Yêu cầu đang chờ ({serviceCalls.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDismissAllServiceCalls}
                      className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline"
                    >
                      Đã xử lý tất cả
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {serviceCalls.map((call) => (
                      <div
                        key={call.id}
                        className={`p-2.5 rounded-xl border text-xs flex flex-col gap-1.5 ${
                          call.isPaymentRequest
                            ? 'bg-[#FFFBEB] border-[#FEF3C7] text-[#B45309]'
                            : 'bg-[#FFF7ED] border-[#FFEDD5] text-[#C2410C]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold">{call.tableName}</span>
                          <span className="text-[10px] font-mono opacity-80">{call.time}</span>
                        </div>
                        <div className="font-medium text-slate-800">{call.text}</div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          {call.tableId && call.tableId !== '0' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTableId(call.tableId);
                                setIsServiceCallListOpen(false);
                              }}
                              className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-[11px] font-bold"
                            >
                              Xem bàn
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDismissServiceCall(call.id)}
                            className="px-2.5 py-0.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold"
                          >
                            Đã xử lý
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {/* 2. Main Dual-Pane Workspace */}
      <div className="flex-1 flex overflow-hidden p-5 gap-5">
        {/* Left: Table Grid (3 Columns) */}
        <div className="flex-1 flex flex-col space-y-3 overflow-y-auto pr-1">
          {/* Filter Tabs & Auto Sync Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3.5 py-1.5 rounded-lg whitespace-nowrap text-xs font-bold transition ${
                  filter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                Tất cả ({counts.total} bàn)
              </button>
              <button
                type="button"
                onClick={() => setFilter('eating')}
                className={`px-3.5 py-1.5 rounded-lg whitespace-nowrap text-xs font-bold transition ${
                  filter === 'eating'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                Đang ăn ({counts.eating})
              </button>
              <button
                type="button"
                onClick={() => setFilter('payment_pending')}
                className={`px-3.5 py-1.5 rounded-lg whitespace-nowrap text-xs font-bold transition ${
                  filter === 'payment_pending'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                Chờ tính tiền ({counts.payment_pending})
              </button>
              <button
                type="button"
                onClick={() => setFilter('empty')}
                className={`px-3.5 py-1.5 rounded-lg whitespace-nowrap text-xs font-bold transition ${
                  filter === 'empty'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                Bàn trống ({counts.empty})
              </button>
            </div>
            <div className="text-xs text-slate-500 whitespace-nowrap">
              Đồng bộ tự động: <strong>{lastSyncTime || '--:--:--'}</strong>
            </div>
          </div>

          {/* Table Cards Grid (3 Columns) */}
          {loading && tablesWithStatus.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-xs text-slate-500">
              Đang tải danh sách bàn và đơn trực tiếp...
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3.5">
              {filteredTables.map((table) => {
                const isSelected = String(table.id) === String(selectedTableId);
                const order = table.order;
                const itemsCount = order?.orderItems?.length || 0;
                const payAmount = order?.orderInfo?.payAmount || 0;
                const orderTime = formatTime(order?.orderInfo?.createTime);

                if (table.statusType === 'empty') {
                  return (
                    <div
                      key={table.id}
                      data-testid={`table-card-${table.id}`}
                      onClick={() => setSelectedTableId(table.id)}
                      className={`p-4 rounded-2xl border shadow-xs cursor-pointer transition ${
                        isSelected
                          ? 'bg-white border-2 border-red-600 shadow-md relative'
                          : 'bg-white/60 border-dashed border-slate-300 hover:bg-white opacity-75'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute -top-2.5 right-3 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Đang xem
                        </span>
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-500 text-base truncate">
                          {table.name || `Bàn ${table.tableNum || table.id}`}
                        </span>
                        <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 text-xs font-semibold rounded-full whitespace-nowrap">
                          Bàn trống
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">Sẵn sàng đón khách</div>
                    </div>
                  );
                }

                if (table.statusType === 'payment_pending') {
                  return (
                    <div
                      key={table.id}
                      data-testid={`table-card-${table.id}`}
                      onClick={() => setSelectedTableId(table.id)}
                      className={`bg-white p-4 rounded-2xl cursor-pointer transition relative ${
                        isSelected
                          ? 'border-2 border-red-600 shadow-md'
                          : 'border border-amber-300 hover:border-amber-400 shadow-xs'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute -top-2.5 right-3 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Đang xem
                        </span>
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-slate-900 text-base flex items-center gap-1.5 truncate">
                          {table.name || `Bàn ${table.tableNum || table.id}`}
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0"></span>
                        </span>
                        <span className="px-2.5 py-0.5 bg-[#FFFBEB] text-[#B45309] border border-[#FEF3C7] text-xs font-bold rounded-full whitespace-nowrap">
                          Chờ tính tiền
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <div className="whitespace-nowrap">
                          {itemsCount} món •{' '}
                          <strong className="text-red-600 font-bold">
                            {formatVnd(payAmount)}
                          </strong>
                        </div>
                        <div className="text-xs text-[#B45309] font-bold whitespace-nowrap truncate">
                          ⚠️ Khách yêu cầu: Tiền mặt
                        </div>
                      </div>
                    </div>
                  );
                }

                // Normal occupied ("Đang ăn")
                return (
                  <div
                    key={table.id}
                    data-testid={`table-card-${table.id}`}
                    onClick={() => setSelectedTableId(table.id)}
                    className={`bg-white p-4 rounded-2xl cursor-pointer transition relative ${
                      isSelected
                        ? 'border-2 border-red-600 shadow-md'
                        : 'border border-slate-200 hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute -top-2.5 right-3 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Đang xem
                      </span>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 text-base truncate">
                        {table.name || `Bàn ${table.tableNum || table.id}`}
                      </span>
                      <span className="px-2.5 py-0.5 bg-[#F0FDF4] text-[#15803D] border border-[#DCFCE7] text-xs font-bold rounded-full whitespace-nowrap">
                        Đang ăn
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-1">
                      <div className="whitespace-nowrap">
                        {itemsCount} món •{' '}
                        <strong className="text-slate-900 font-bold">
                          {formatVnd(payAmount)}
                        </strong>
                      </div>
                      <div className="text-xs text-slate-400 whitespace-nowrap">
                        Vào bàn: {orderTime}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Table Detail Panel */}
        <div
          data-testid="table-detail-panel"
          className="w-[380px] bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between overflow-hidden flex-shrink-0 h-full relative"
        >
          {!selectedTable ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-slate-400">
              Chọn một bàn từ danh sách bên trái để xem chi tiết đơn hàng
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div
                className={`p-4 border-b flex-shrink-0 ${
                  isEditMode ? 'border-blue-100 bg-blue-50' : 'border-slate-100 bg-slate-50/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900 truncate">
                        {isEditMode ? 'Sửa đơn –' : 'Chi Tiết'} {selectedTable.name || `Bàn ${selectedTable.id}`}
                      </h2>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                          selectedTable.statusType === 'payment_pending'
                            ? 'bg-[#FFFBEB] text-[#B45309] border border-[#FEF3C7]'
                            : selectedTable.statusType === 'eating'
                            ? 'bg-[#F0FDF4] text-[#15803D] border border-[#DCFCE7]'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {selectedTable.statusType === 'payment_pending'
                          ? 'Chờ tính tiền'
                          : selectedTable.statusType === 'eating'
                          ? 'Đang ăn'
                          : 'Bàn trống'}
                      </span>
                    </div>
                    <div className={`text-xs mt-0.5 truncate ${isEditMode ? 'text-blue-700' : 'text-slate-500'}`}>
                      {isEditMode ? (
                        'Mỗi thay đổi được lưu ngay, bếp và khách thấy liền.'
                      ) : selectedOrder?.orderInfo ? (
                        <>
                          Mã đơn: <strong>#ORD-{selectedOrder.orderInfo.id}</strong> •{' '}
                          {formatTime(selectedOrder.orderInfo.createTime)}
                        </>
                      ) : (
                        'Chưa có đơn hàng nào'
                      )}
                    </div>
                  </div>

                  {/* OE-4: Sửa đơn / Xong */}
                  {selectedOrder && (
                    <button
                      type="button"
                      data-testid={isEditMode ? 'finish-edit-order-btn' : 'edit-order-btn'}
                      onClick={() => setIsEditMode((v) => !v)}
                      disabled={savingKey !== null}
                      className={`shrink-0 min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 ${
                        isEditMode
                          ? 'bg-blue-600 hover:bg-blue-700 text-white px-4'
                          : 'border border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isEditMode ? (
                        'Xong'
                      ) : (
                        <>
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Sửa đơn</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* More Actions Dropdown Menu (•••) */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                      className="min-w-[40px] min-h-[40px] p-2 rounded-xl text-slate-500 hover:bg-slate-200 transition font-bold"
                      title="Tùy chọn khác"
                      aria-label="Tùy chọn khác"
                    >
                      •••
                    </button>

                    {isActionMenuOpen && (
                      <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30">
                        {/* Note per sprint-3: "Đặt lại bàn" temporarily hidden because backend has no admin clear API yet */}
                        <div className="px-4 py-2 text-xs text-slate-400 italic">
                          (Tùy chọn nâng cao)
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Guest Remark if any */}
                {selectedOrder?.orderInfo?.remark && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900">
                    <span className="font-bold">Ghi chú của khách:</span> "{selectedOrder.orderInfo.remark}"
                  </div>
                )}
              </div>

              {/* Order Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Danh Sách Món Đã Đặt ({selectedOrder?.orderItems?.length || 0})
                </div>

                {!selectedOrder || !selectedOrder.orderItems || selectedOrder.orderItems.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    {selectedOrder ? 'Đơn chưa có món nào.' : 'Bàn hiện đang trống. Sẵn sàng đón khách.'}
                  </div>
                ) : isEditMode ? (
                  selectedOrder.orderItems.map((item: OrderItem, idx: number) => {
                    const qty = item.quantity || 1;
                    const isSaving = savingKey === idx;
                    const busy = savingKey !== null;
                    const statusText =
                      item.status === 2 ? 'Đã lên – giảm/xoá cần lý do' : item.status === 1 ? 'Đang làm – giảm/xoá cần lý do' : 'Chờ làm';
                    return (
                      <div
                        key={`edit-${item.id || idx}-${item.productId}`}
                        data-testid={`edit-item-${idx}`}
                        className={`p-3 rounded-xl border border-slate-200 bg-white ${isSaving ? 'opacity-60' : ''}`}
                      >
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 truncate">{item.name}</div>
                            <div className="text-xs text-slate-500">
                              {item.propsText ? `${item.propsText} · ` : ''}
                              {formatVnd(item.price)} / phần ·{' '}
                              <span className={item.status === 2 ? 'text-[#15803D]' : 'text-[#C2410C]'}>{statusText}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid={`remove-item-btn-${idx}`}
                            aria-label={`Xoá ${item.name}`}
                            disabled={busy}
                            onClick={() => setReduceTarget({ index: idx, item, newQuantity: null })}
                            className="w-11 h-11 shrink-0 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 flex items-center justify-center disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              data-testid={`decrease-item-btn-${idx}`}
                              aria-label={`Giảm 1 ${item.name}`}
                              disabled={busy}
                              onClick={() => handleChangeQuantity(idx, item, qty - 1)}
                              className="w-11 h-11 rounded-xl border border-slate-300 font-bold flex items-center justify-center disabled:opacity-40"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span data-testid={`edit-item-qty-${idx}`} className="w-8 text-center font-bold">
                              {qty}
                            </span>
                            <button
                              type="button"
                              data-testid={`increase-item-btn-${idx}`}
                              aria-label={`Tăng 1 ${item.name}`}
                              disabled={busy || qty >= 99}
                              onClick={() => handleChangeQuantity(idx, item, qty + 1)}
                              className="w-11 h-11 rounded-xl border border-slate-300 font-bold flex items-center justify-center disabled:opacity-40"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          {isSaving ? (
                            <span className="text-xs text-slate-500">Đang lưu…</span>
                          ) : (
                            <span className="text-sm font-bold text-red-600">{formatVnd(Number(item.price) * qty)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  selectedOrder.orderItems.map((item: OrderItem, idx: number) => {
                    const isServed = item.status === 2;
                    return (
                      <div
                        key={`${item.id || idx}-${item.productId}`}
                        data-testid={`order-item-${idx}`}
                        className={`p-3 rounded-xl flex items-start justify-between gap-3 transition ${
                          isServed
                            ? 'bg-slate-50 border border-slate-200 opacity-80'
                            : 'bg-[#FFF7ED]/60 border border-[#FFEDD5]'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className={`font-bold text-sm truncate ${
                              isServed ? 'text-slate-700 line-through' : 'text-slate-900'
                            }`}
                          >
                            {item.quantity}x {item.name}
                          </div>
                          {item.propsText && (
                            <div className="text-xs text-slate-500 truncate">{item.propsText}</div>
                          )}
                          <div
                            className={`text-xs font-bold mt-1 ${
                              isServed ? 'text-slate-500' : 'text-red-600'
                            }`}
                          >
                            {formatVnd(Number(item.price) * (item.quantity || 1))}
                          </div>
                        </div>

                        {/* Status Toggle Button: 0/1 (Chờ lên) <-> 2 (Đã lên) */}
                        <button
                          type="button"
                          data-testid={`toggle-status-btn-${idx}`}
                          onClick={() => handleToggleItemStatus(idx, item.status)}
                          className={`min-h-[36px] px-3 py-1 text-xs font-bold rounded-lg border transition shrink-0 flex items-center gap-1 ${
                            isServed
                              ? 'bg-[#F0FDF4] hover:bg-green-100 text-[#15803D] border-[#DCFCE7]'
                              : 'bg-[#FFF7ED] hover:bg-orange-100 text-[#C2410C] border-[#FFEDD5]'
                          }`}
                          title={isServed ? 'Bấm để chuyển về Chờ lên' : 'Bấm để đánh dấu đã phục vụ'}
                        >
                          {isServed ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>✓ Đã lên</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5" />
                              <span>⏳ Chờ lên</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}

                {isEditMode && selectedOrder && (
                  <button
                    type="button"
                    data-testid="open-add-item-btn"
                    disabled={savingKey !== null}
                    onClick={() => setIsAddDialogOpen(true)}
                    className="w-full min-h-[44px] rounded-xl border-2 border-dashed border-blue-300 text-blue-700 text-sm font-bold bg-blue-50/50 hover:bg-blue-50 disabled:opacity-50"
                  >
                    + Thêm món
                  </button>
                )}
              </div>

              {/* Footer Actions & Total */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex-shrink-0 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    {isEditMode ? 'Tổng tiền (tính lại ở máy chủ):' : 'Tổng tiền bàn cần thu:'}
                  </span>
                  <span
                    data-testid="detail-total-amount"
                    className="text-xl font-extrabold text-red-600"
                  >
                    {formatVnd(selectedOrder?.orderInfo?.payAmount || 0)}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    data-testid="admin-print-receipt-btn"
                    onClick={handlePrintReceipt}
                    disabled={!selectedOrder}
                    className="min-h-[44px] py-2.5 px-3 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-300 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
                    title="In hóa đơn tạm tính"
                  >
                    <Printer className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">In hoá đơn</span>
                  </button>

                  <button
                    type="button"
                    data-testid="checkout-button"
                    onClick={() => setIsPaymentModalOpen(true)}
                    disabled={!selectedOrder || isEditMode || Number(selectedOrder?.orderInfo?.payAmount || 0) <= 0}
                    className="col-span-2 min-h-[44px] py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    {isEditMode ? (
                      <span className="whitespace-nowrap">Bấm "Xong" để thu tiền</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4 shrink-0" />
                        <span className="whitespace-nowrap">Xác Nhận Đã Thu Tiền</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. New Order Toast Alert (Placed at bottom-6 right-[420px] to NEVER cover the total or checkout button!) */}
      {newOrderToast && (
        <div
          id="new-order-toast"
          data-testid="new-order-toast"
          role="alert"
          className="absolute bottom-6 right-[420px] z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border-2 border-red-500 flex items-center gap-3.5 animate-bounce"
        >
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white text-xl flex-shrink-0">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                Đơn Mới Vừa Tới! (Ting-ting)
              </span>
              <span className="text-xs bg-red-500/30 text-red-200 px-2 py-0.5 rounded font-medium">
                {newOrderToast.time}
              </span>
            </div>
            <div className="text-sm font-bold text-white mt-0.5">
              {newOrderToast.tableNumber} vừa gọi {newOrderToast.itemCount} món •{' '}
              {formatVnd(newOrderToast.totalAmount)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNewOrderToast(null)}
            className="ml-2 text-slate-400 hover:text-white p-1"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3b. Floating Service Call Toast Alert */}
      {serviceCallToast && (
        <div
          data-testid="service-call-floating-toast"
          role="alert"
          className="absolute bottom-28 right-[420px] z-50 bg-white text-slate-900 p-4 rounded-2xl shadow-2xl border-2 border-amber-500 flex items-center gap-3.5 max-w-md animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                Yêu cầu phục vụ mới!
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono font-medium">
                {serviceCallToast.time}
              </span>
            </div>
            <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
              {serviceCallToast.tableName}: {serviceCallToast.text}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="service-call-toast-dismiss-btn"
              onClick={() => handleDismissServiceCall(serviceCallToast.id)}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              Đã xử lý
            </button>
            <button
              type="button"
              onClick={() => setServiceCallToast(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              aria-label="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3c. Floating PayOS Mismatch Alert (Story F-5 / P-1) */}
      {payosMismatchAlert && (
        <div
          data-testid="payos-mismatch-toast"
          role="alert"
          className="absolute bottom-28 right-[420px] z-50 bg-white text-slate-900 p-4 rounded-2xl shadow-2xl border-2 border-red-600 flex items-center gap-3.5 max-w-lg animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-red-700 uppercase tracking-wider">
                Lệch Tiền PayOS!
              </span>
              <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded font-mono font-medium">
                {payosMismatchAlert.time}
              </span>
            </div>
            <div
              data-testid="payos-mismatch-message"
              className="text-xs font-bold text-slate-900 mt-0.5 leading-snug"
            >
              {payosMismatchAlert.message}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="payos-mismatch-dismiss-btn"
              onClick={() => setPayosMismatchAlert(null)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              Đã kiểm tra
            </button>
            <button
              type="button"
              onClick={() => setPayosMismatchAlert(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              aria-label="Đóng cảnh báo lệch tiền"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 4. Feedback Toast */}
      {feedbackToast && (
        <div
          role="status"
          className="absolute top-4 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <span>{feedbackToast}</span>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="text-slate-400 hover:text-white ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* OE-4: Hộp thoại giảm / xoá món và thêm món */}
      {reduceTarget && (
        <ReduceItemDialog
          title={
            reduceTarget.newQuantity === null
              ? `Xoá ${reduceTarget.item.quantity || 1}x ${reduceTarget.item.name} khỏi đơn?`
              : `Giảm ${reduceTarget.item.name} từ ${reduceTarget.item.quantity || 1} xuống ${reduceTarget.newQuantity}?`
          }
          needsReason={itemNeedsReason(reduceTarget.item)}
          statusLabel={reduceTarget.item.status === 2 ? 'đã lên' : 'đang làm'}
          confirmLabel={reduceTarget.newQuantity === null ? 'Xoá món' : 'Giảm số lượng'}
          isSubmitting={savingKey !== null}
          onCancel={() => setReduceTarget(null)}
          onConfirm={handleConfirmReduce}
        />
      )}
      {isAddDialogOpen && selectedTable && (
        <AddItemDialog
          tableName={selectedTable.name || `Bàn ${selectedTable.id}`}
          isSubmitting={savingKey === 'add'}
          onClose={() => setIsAddDialogOpen(false)}
          onSubmit={handleAddItem}
        />
      )}

      {/* 5. Payment Modal (Modal 1: Xác Nhận Thu Tiền) */}
      {isPaymentModalOpen && selectedTable && (
        <div
          data-testid="payment-modal"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Xác Nhận Thu Tiền – {selectedTable.name || `Bàn ${selectedTable.id}`}
              </h3>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center py-2">
              <div className="text-xs text-slate-500">Số tiền cần thu thực tế</div>
              <div className="text-3xl font-black text-red-600 mt-1">
                {formatVnd(selectedOrder?.orderInfo?.payAmount || 0)}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">
                Chọn phương thức khách đã trả:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="paytype-cash-btn"
                  onClick={() => setSelectedPayType(4)}
                  className={`p-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                    selectedPayType === 4
                      ? 'border-2 border-red-600 bg-red-50/50 text-red-700'
                      : 'border border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span>💵 Tiền Mặt</span>
                </button>
                <button
                  type="button"
                  data-testid="paytype-vietqr-btn"
                  onClick={() => setSelectedPayType(1)}
                  className={`p-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                    selectedPayType === 1
                      ? 'border-2 border-red-600 bg-red-50/50 text-red-700'
                      : 'border border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>📲 Chuyển Khoản VietQR</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                disabled={isSubmittingCheckout}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                data-testid="confirm-checkout-btn"
                onClick={handleConfirmCheckout}
                disabled={isSubmittingCheckout}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
              >
                {isSubmittingCheckout ? 'Đang xử lý...' : 'Hoàn tất & đặt lại bàn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PR-1: 80mm Thermal Receipt via React Portal into #print-root */}
      {selectedOrder && (
        <ReceiptPrintPortal>
          <AdminReceipt
            shopName={shopInfo.name}
            shopAddress={shopInfo.position}
            shopPhone={shopInfo.phone}
            tableName={selectedTable?.name || (selectedTable?.id ? `Bàn ${selectedTable.id}` : 'Bàn ăn')}
            orderId={selectedOrder.orderInfo?.id}
            orderNumber={selectedOrder.orderInfo?.orderNumber}
            printTime={new Date().toLocaleString('vi-VN')}
            orderItems={selectedOrder.orderItems || []}
            totalAmount={Number(selectedOrder.orderInfo?.payAmount || 0)}
          />
        </ReceiptPrintPortal>
      )}
    </div>
  );
};
