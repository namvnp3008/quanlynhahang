import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  OrderAllDto,
  OrderItem,
  RestaurantTable,
  getOpenOrders,
  getTables,
  adminSetOrderItemStatus,
  getAdminShopId,
} from '../../services/api';
import { getOrCreateAdminWebSocket } from '../../services/websocket';
import { WsIncomingMessage } from '../../types/websocket';
import {
  Volume2,
  VolumeX,
  ArrowLeft,
  Utensils,
} from 'lucide-react';

/**
 * Web Audio API synthesizer for kitchen chime
 */
function playKitchenChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.25, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  } catch {
    // Ignore audio errors
  }
}

export type KitchenStatusFilter = 'ALL' | 0 | 1 | 2;

export const KitchenDisplay: React.FC = () => {
  const navigate = useNavigate();
  const [openOrders, setOpenOrders] = useState<OrderAllDto[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<KitchenStatusFilter>('ALL');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());

  const activeShopId = getAdminShopId() || 1;

  // Realtime clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setCurrentDate(
        now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch tables and open orders
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [fetchedOrders, fetchedTables] = await Promise.all([
        getOpenOrders().catch((err) => {
          console.warn('Lỗi nạp đơn hàng mở cho bếp:', err);
          return [] as OrderAllDto[];
        }),
        getTables().catch((err) => {
          console.warn('Lỗi nạp danh sách bàn:', err);
          return [] as RestaurantTable[];
        }),
      ]);
      setOpenOrders(Array.isArray(fetchedOrders) ? fetchedOrders : []);
      setTables(Array.isArray(fetchedTables) ? fetchedTables : []);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu KDS:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, activeShopId]);

  // WebSocket listeners
  useEffect(() => {
    if (!activeShopId) return;
    const wsClient = getOrCreateAdminWebSocket(activeShopId);

    const unsubscribe = wsClient.subscribe((msg: WsIncomingMessage) => {
      if (msg.type === 'newOrder') {
        if (soundEnabled) playKitchenChime();
        loadData(true);
      } else if (msg.type === 'orderEdited') {
        // OE-5: chủ quán sửa đơn → vị trí món thay đổi, tải lại toàn bộ
        loadData(true);
      } else if (msg.type === 'itemStatus') {
        const itemData = msg.data as {
          tableId?: string | number;
          index?: number;
          status?: number;
        };
        if (itemData && itemData.tableId !== undefined && itemData.index !== undefined && itemData.status !== undefined) {
          // Optimistically update item status in openOrders
          setOpenOrders((prevOrders) =>
            prevOrders.map((ord) => {
              if (String(ord.orderInfo.tableId) === String(itemData.tableId)) {
                const newItems = [...ord.orderItems];
                if (newItems[itemData.index!]) {
                  newItems[itemData.index!] = {
                    ...newItems[itemData.index!],
                    status: itemData.status,
                  };
                }
                return { ...ord, orderItems: newItems };
              }
              return ord;
            })
          );
        } else {
          loadData(true);
        }
      } else if (msg.type === 'paid') {
        loadData(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeShopId, soundEnabled, loadData]);

  // Map tables by ID for display name
  const tableNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tables) {
      map.set(String(t.id), t.name);
    }
    return map;
  }, [tables]);

  // Compute live item summary counts
  const counts = useMemo(() => {
    let pending = 0; // 0 = Chờ làm
    let cooking = 0; // 1 = Đang nấu / Đang làm
    let done = 0; // 2 = Đã lên bàn / Đã xong

    for (const ord of openOrders) {
      for (const item of ord.orderItems || []) {
        const st = item.status ?? 0;
        if (st === 1) cooking++;
        else if (st === 2) done++;
        else pending++;
      }
    }
    return { pending, cooking, done, total: pending + cooking + done };
  }, [openOrders]);

  // Cycle status: 0 -> 1 -> 2 -> 0
  const handleToggleStatus = async (
    tableId: string | number,
    itemIndex: number,
    currentStatus?: number
  ) => {
    const itemKey = `${tableId}-${itemIndex}`;
    if (updatingItems.has(itemKey)) return;

    const curr = currentStatus ?? 0;
    // Cycle: 0 (Chờ làm) -> 1 (Đang nấu) -> 2 (Đã lên bàn) -> 0 (Chờ làm)
    const nextStatus = curr === 0 ? 1 : curr === 1 ? 2 : 0;

    // Optimistic update
    setOpenOrders((prevOrders) =>
      prevOrders.map((ord) => {
        if (String(ord.orderInfo.tableId) === String(tableId)) {
          const newItems = [...ord.orderItems];
          if (newItems[itemIndex]) {
            newItems[itemIndex] = {
              ...newItems[itemIndex],
              status: nextStatus,
            };
          }
          return { ...ord, orderItems: newItems };
        }
        return ord;
      })
    );

    setUpdatingItems((prev) => new Set(prev).add(itemKey));

    try {
      await adminSetOrderItemStatus(tableId, itemIndex, nextStatus);
    } catch (err) {
      console.error('Lỗi khi cập nhật trạng thái món:', err);
      // Rollback on failure
      setOpenOrders((prevOrders) =>
        prevOrders.map((ord) => {
          if (String(ord.orderInfo.tableId) === String(tableId)) {
            const newItems = [...ord.orderItems];
            if (newItems[itemIndex]) {
              newItems[itemIndex] = {
                ...newItems[itemIndex],
                status: curr,
              };
            }
            return { ...ord, orderItems: newItems };
          }
          return ord;
        })
      );
    } finally {
      setUpdatingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemKey);
        return next;
      });
    }
  };

  // Mark all items of a table as completed (status = 2)
  const handleMarkAllTableDone = async (tableId: string | number, items: OrderItem[]) => {
    const pendingIndices: number[] = [];
    items.forEach((it, idx) => {
      if ((it.status ?? 0) < 2) {
        pendingIndices.push(idx);
      }
    });

    if (pendingIndices.length === 0) return;

    // Optimistic update
    setOpenOrders((prevOrders) =>
      prevOrders.map((ord) => {
        if (String(ord.orderInfo.tableId) === String(tableId)) {
          const newItems = ord.orderItems.map((it) => ({
            ...it,
            status: 2,
          }));
          return { ...ord, orderItems: newItems };
        }
        return ord;
      })
    );

    try {
      await Promise.all(
        pendingIndices.map((idx) => adminSetOrderItemStatus(tableId, idx, 2))
      );
    } catch (err) {
      console.error('Lỗi khi đánh dấu xong hết bàn:', err);
      loadData(true);
    }
  };

  // Calculate elapsed time in minutes from createTime
  const getElapsedMinutes = (createTimeStr?: string): number => {
    if (!createTimeStr) return 0;
    try {
      const created = new Date(createTimeStr).getTime();
      if (isNaN(created)) return 0;
      const now = Date.now();
      return Math.max(0, Math.floor((now - created) / 60000));
    } catch {
      return 0;
    }
  };

  // Filter tickets according to current status tab
  const filteredOrders = useMemo(() => {
    if (filter === 'ALL') return openOrders;
    return openOrders
      .map((ord) => {
        const matchingItems = (ord.orderItems || []).filter(
          (it) => (it.status ?? 0) === filter
        );
        return {
          ...ord,
          orderItems: matchingItems,
        };
      })
      .filter((ord) => ord.orderItems.length > 0);
  }, [openOrders, filter]);

  return (
    <div
      data-testid="kitchen-display"
      className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans select-none"
    >
      {/* KITCHEN TOP BAR */}
      <header className="h-16 bg-slate-950 border-b border-slate-800 px-6 flex items-center justify-between shrink-0 z-10">
        {/* Brand & Kitchen Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-base shadow-md">
            🍳
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white tracking-wide">MÀN HÌNH BẾP (KDS)</h1>
              <span className="px-2 py-0.5 bg-red-600/30 text-red-400 border border-red-500/40 rounded-full text-xs font-bold uppercase tracking-wider">
                Khu Bếp Nấu
              </span>
            </div>
            <div className="text-xs text-slate-400 font-medium">Hệ thống điều phối bếp</div>
          </div>
        </div>

        {/* Live summary counts & audio control */}
        <div className="flex items-center gap-3">
          {/* Counters pill */}
          <div className="flex items-center gap-3 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-slate-400 font-medium">Chờ làm:</span>
              <strong data-testid="total-pending" className="text-amber-400 font-bold">
                {counts.pending}
              </strong>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="text-slate-400 font-medium">Đang nấu:</span>
              <strong data-testid="total-cooking" className="text-blue-400 font-bold">
                {counts.cooking}
              </strong>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
              <span className="text-slate-400 font-medium">Đã xong:</span>
              <strong data-testid="total-done" className="text-green-400 font-bold">
                {counts.done}
              </strong>
            </div>
          </div>

          {/* Online badge */}
          <span className="text-xs text-green-400 font-bold bg-green-950/60 border border-green-800 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-ping"></span>
            Bếp Trực Tuyến
          </span>

          {/* Sound Toggle */}
          <button
            type="button"
            data-testid="kitchen-sound-toggle"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              soundEnabled
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
            }`}
            title={soundEnabled ? 'Tắt âm báo' : 'Bật âm báo'}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                <span>🔔 Bật</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                <span>🔕 Tắt</span>
              </>
            )}
          </button>

          {/* Back to Orders */}
          <button
            type="button"
            data-testid="back-to-orders-btn"
            onClick={() => navigate('/admin/orders')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Về Thu Ngân</span>
          </button>

          {/* Clock */}
          <div className="text-right pl-1 min-w-[75px]">
            <div data-testid="kitchen-clock" className="text-sm font-black text-white">
              {currentTime || '00:00:00'}
            </div>
            <div className="text-xs text-slate-400">{currentDate || '22/10/2026'}</div>
          </div>
        </div>
      </header>

      {/* FILTER TABS BAR */}
      <div className="h-12 bg-slate-900/90 border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            data-testid="filter-all"
            onClick={() => setFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
              filter === 'ALL'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>Tất cả</span>
            <span className="bg-slate-950/60 px-1.5 py-0.2 rounded-full text-2xs">
              {counts.total}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-pending"
            onClick={() => setFilter(0)}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
              filter === 0
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>Chờ làm (0)</span>
            <span className="bg-slate-950/40 px-1.5 py-0.2 rounded-full text-2xs">
              {counts.pending}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-cooking"
            onClick={() => setFilter(1)}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
              filter === 1
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            <span>Đang nấu (1)</span>
            <span className="bg-slate-950/40 px-1.5 py-0.2 rounded-full text-2xs">
              {counts.cooking}
            </span>
          </button>

          <button
            type="button"
            data-testid="filter-done"
            onClick={() => setFilter(2)}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
              filter === 2
                ? 'bg-green-600 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            <span>Đã lên bàn (2)</span>
            <span className="bg-slate-950/40 px-1.5 py-0.2 rounded-full text-2xs">
              {counts.done}
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-400 font-medium">
          Chạm vào từng món để đổi trạng thái: <span className="text-amber-400 font-bold">Chờ làm</span> → <span className="text-blue-400 font-bold">Đang nấu</span> → <span className="text-green-400 font-bold">Đã lên bàn</span>
        </div>
      </div>

      {/* HORIZONTAL ORDER TICKETS CANVAS */}
      <main
        data-testid="kitchen-tickets-canvas"
        className="flex-1 p-5 overflow-x-auto overflow-y-hidden flex gap-4 bg-slate-900/90"
      >
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold">Đang nạp thực đơn bếp...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3">
            <Utensils className="w-12 h-12 text-slate-600" />
            <div className="text-sm font-bold text-slate-300">Hiện tại không có món ăn nào</div>
            <div className="text-xs text-slate-500">
              {filter !== 'ALL'
                ? 'Không có món ăn nào thuộc bộ lọc này.'
                : 'Mọi đơn đặt món từ các bàn đã được chế biến và phục vụ hoàn tất!'}
            </div>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const tableId = order.orderInfo.tableId;
            const tableName =
              tableNameMap.get(String(tableId)) ||
              (tableId ? `BÀN ${String(tableId).padStart(2, '0')}` : 'Mang về');

            const elapsedMinutes = getElapsedMinutes(order.orderInfo.createTime);
            const isUrgent = elapsedMinutes >= 12;

            const allDone =
              order.orderItems.length > 0 &&
              order.orderItems.every((it) => (it.status ?? 0) === 2);

            return (
              <div
                key={order.orderInfo.id || String(tableId)}
                data-testid={`kitchen-ticket-${tableId}`}
                className={`w-[310px] bg-slate-950 rounded-2xl shadow-xl flex flex-col shrink-0 h-full overflow-hidden transition ${
                  allDone
                    ? 'border border-slate-800 opacity-70 hover:opacity-100'
                    : isUrgent
                    ? 'border-2 border-red-500/80'
                    : 'border border-slate-700'
                }`}
              >
                {/* Ticket Header */}
                <div
                  className={`p-3.5 border-b flex items-center justify-between ${
                    isUrgent && !allDone
                      ? 'bg-red-950/40 border-red-900/50'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-white">{tableName}</span>
                      {allDone ? (
                        <span className="px-2 py-0.5 bg-green-950 text-green-400 border border-green-800 font-bold text-xs rounded-md">
                          Đã phục vụ
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 font-bold text-xs rounded-md ${
                            isUrgent
                              ? 'bg-red-500 text-white font-black uppercase animate-pulse'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {elapsedMinutes > 0 ? `${elapsedMinutes} phút` : 'Vừa vào'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Đơn #{order.orderInfo.id?.slice(-8) || 'ORD'} •{' '}
                      {order.orderInfo.createTime
                        ? new Date(order.orderInfo.createTime).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Mới nhận'}
                    </div>
                  </div>

                  {!allDone && (
                    <button
                      type="button"
                      data-testid={`mark-all-done-btn-${tableId}`}
                      onClick={() => handleMarkAllTableDone(tableId, order.orderItems)}
                      className="px-2.5 py-1.5 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded-xl shadow-xs transition shrink-0"
                      title="Xong hết bàn"
                    >
                      Xong hết
                    </button>
                  )}
                </div>

                {/* Ticket Items List */}
                <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
                  {order.orderItems.map((item, idx) => {
                    const st = item.status ?? 0;
                    const itemKey = `${tableId}-${idx}`;
                    const isUpdating = updatingItems.has(itemKey);

                    // Colors per status
                    let borderClass = 'border-amber-500/70 hover:border-amber-400';
                    let badgeClass = 'text-amber-400';
                    let qtyBadgeClass = 'bg-amber-600';
                    let statusLabel = 'Chờ làm';

                    if (st === 1) {
                      borderClass = 'border-blue-500/70 hover:border-blue-400';
                      badgeClass = 'text-blue-400';
                      qtyBadgeClass = 'bg-blue-600';
                      statusLabel = 'Đang nấu...';
                    } else if (st === 2) {
                      borderClass = 'border-green-500/70 hover:border-green-400';
                      badgeClass = 'text-green-400';
                      qtyBadgeClass = 'bg-green-600';
                      statusLabel = '✓ Đã lên món';
                    }

                    return (
                      <div
                        key={`${item.name}-${idx}`}
                        data-testid={`kitchen-item-${tableId}-${idx}`}
                        onClick={() => handleToggleStatus(tableId, idx, item.status)}
                        className={`p-3 bg-slate-900 border-2 ${borderClass} rounded-xl cursor-pointer hover:bg-slate-850 transition relative group select-none ${
                          isUpdating ? 'opacity-60 pointer-events-none' : ''
                        }`}
                        title="Bấm để chuyển trạng thái tiếp theo"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div
                              className={`font-bold text-sm ${
                                st === 2
                                  ? 'text-slate-400 line-through opacity-80'
                                  : 'text-white'
                              }`}
                            >
                              {item.name}
                            </div>
                            {item.propsText && (
                              <div className="text-xs text-amber-400 font-semibold mt-0.5 truncate">
                                {item.propsText}
                              </div>
                            )}
                          </div>
                          <span
                            className={`text-xs font-black text-white px-2 py-0.5 rounded-lg shrink-0 ${qtyBadgeClass}`}
                          >
                            x{item.quantity}
                          </span>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                          <span className={`${badgeClass} font-bold flex items-center gap-1.5`}>
                            {st === 1 && (
                              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                            )}
                            {st === 0 && (
                              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                            )}
                            <span>{statusLabel}</span>
                          </span>
                          <span className="text-slate-500 font-medium">Chạm để đổi</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Ticket Footer */}
                <div className="p-3 bg-slate-950 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                  <span>Tổng: {order.orderItems.length} món</span>
                  {allDone ? (
                    <span className="text-green-400 font-bold">100% hoàn thành</span>
                  ) : isUrgent ? (
                    <span className="text-red-400 font-bold">Cần ưu tiên trả món!</span>
                  ) : (
                    <span className="text-slate-400 font-medium">Đang chế biến</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
};
