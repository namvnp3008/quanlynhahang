import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Rocket,
  Info,
  Building2,
  FileText,
} from 'lucide-react';
import { saveOrUpdateShop, uploadImg, Shop } from '../../services/api';

export const ShopCreate: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState<string>('');
  const [intro, setIntro] = useState<string>('');
  const [position, setPosition] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [openTime, setOpenTime] = useState<string>('07:00');
  const [closeTime, setCloseTime] = useState<string>('22:30');
  const [certificateUrl, setCertificateUrl] = useState<string>('');
  const [certificateFileName, setCertificateFileName] = useState<string>('');

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ name: string } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Kích thước ảnh không được vượt quá 5MB');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    try {
      const url = await uploadImg(file, 'shop');
      setCertificateUrl(url);
      setCertificateFileName(file.name);
    } catch (err) {
      console.error('Lỗi tải ảnh giấy phép:', err);
      setCertificateUrl('');
      setCertificateFileName('');
      setErrorMessage('Tải ảnh giấy phép lên máy chủ thất bại. Vui lòng thử lại.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    const trimmedPosition = position.trim();

    if (!trimmedName) {
      setErrorMessage('Vui lòng nhập tên quán ăn / tên chi nhánh');
      return;
    }

    if (!trimmedPosition) {
      setErrorMessage('Vui lòng nhập địa chỉ chi tiết của quán');
      return;
    }

    setIsSubmitting(true);

    try {
      const newShop: Shop = {
        name: trimmedName,
        intro: intro.trim(),
        position: trimmedPosition,
        phone: phone.trim(),
        openTime,
        closeTime,
        businessHours: `${openTime} - ${closeTime}`,
        certificate: certificateUrl || undefined,
        // Server will set auditStatus = 2 (Chờ duyệt)
      };

      await saveOrUpdateShop(newShop);

      setSuccessInfo({ name: trimmedName });
    } catch (err) {
      console.error('Lỗi khi gửi hồ sơ tạo quán:', err);
      setErrorMessage('Không thể gửi hồ sơ tạo quán. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="shop-create-page"
      className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 font-sans select-none"
    >
      {/* HEADER (64px) */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="shop-create-back-btn"
            onClick={() => navigate('/admin/dashboard')}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-900 transition cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">Đăng Ký Tạo Quán Ăn Mới</h1>
            <p className="text-xs text-slate-500">Mở thêm chi nhánh hoặc quán ăn mới thuộc quyền quản lý của bạn</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="shop-create-cancel-btn"
            onClick={() => navigate('/admin/dashboard')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            data-testid="shop-create-submit-btn"
            disabled={isSubmitting}
            onClick={() => handleSubmit()}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang nộp hồ sơ...</span>
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" />
                <span>Nộp Hồ Sơ Tạo Quán</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* SCROLLABLE FORM BODY */}
      <main className="flex-1 p-8 overflow-y-auto space-y-6">
        {/* Success Modal / Banner */}
        {successInfo && (
          <div
            data-testid="shop-create-success-banner"
            className="p-5 bg-green-50 border-2 border-green-300 rounded-2xl flex items-start justify-between gap-4 animate-in fade-in duration-200"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-xs">
                <div className="font-bold text-sm text-green-900">
                  Đã gửi hồ sơ tạo quán &quot;{successInfo.name}&quot; thành công!
                </div>
                <p className="text-green-800 leading-relaxed">
                  Quán đang ở trạng thái <strong>Chờ duyệt</strong> từ Quản trị nền tảng. Bạn có thể tiếp tục cấu hình thực đơn và sơ đồ bàn trước khi quán chính thức mở phục vụ khách.
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="success-navigate-btn"
              onClick={() => navigate('/admin/dashboard')}
              className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-xs font-bold rounded-xl shrink-0 transition"
            >
              Về Tổng Quan
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div
            data-testid="shop-create-error-banner"
            className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-xs font-medium"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Explanatory Banner (P2 Workflow) */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center text-sm shrink-0 mt-0.5">
            <Info className="w-4 h-4" />
          </div>
          <div className="text-xs text-amber-900 space-y-1">
            <div className="font-bold">Quy trình kích hoạt quán ăn mới trên sàn:</div>
            <p className="text-amber-800 leading-relaxed">
              Sau khi nộp hồ sơ, quán sẽ ở trạng thái <strong>Chờ xét duyệt</strong> từ Quản trị nền tảng. Bạn vẫn có thể đăng nhập ngay để tạo danh mục, thêm món ăn và sơ đồ bàn. Đường link quét mã QR bàn ăn của quán sẽ chính thức kích hoạt ngay khi hồ sơ được phê duyệt.
            </p>
          </div>
        </div>

        {/* Shop Info Form Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-red-600" />
            <span>Thông Tin Chi Nhánh Quán Ăn</span>
          </h2>

          <div className="grid grid-cols-2 gap-5 text-xs">
            {/* Shop Name */}
            <div className="col-span-2">
              <label className="font-bold text-slate-700 block mb-1">
                Tên quán ăn / Tên chi nhánh <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                data-testid="shop-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Nhà Hàng Bếp Việt - CN Cầu Giấy"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-red-500"
              />
              <p className="text-slate-400 text-2xs mt-1">
                Tên quán sẽ xuất hiện ở đỉnh menu khi khách quét mã QR tại bàn.
              </p>
            </div>

            {/* Intro */}
            <div className="col-span-2">
              <label className="font-bold text-slate-700 block mb-1">Giới thiệu ngắn về quán ăn</label>
              <textarea
                rows={2}
                data-testid="shop-intro-input"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                placeholder="Ví dụ: Chuyên các món phở truyền thống gia truyền, không gian ấm cúng, phục vụ tận tình..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-red-500"
              ></textarea>
            </div>

            {/* Position / Address */}
            <div className="col-span-2">
              <label className="font-bold text-slate-700 block mb-1">
                Địa chỉ chi tiết của quán <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                data-testid="shop-position-input"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Ví dụ: Số 128 Đường Xuân Thủy, Phường Dịch Vọng Hậu, Cầu Giấy, Hà Nội"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-red-500"
              />
            </div>

            {/* Phone */}
            <div className="col-span-2 sm:col-span-1">
              <label className="font-bold text-slate-700 block mb-1">Số điện thoại liên hệ quán</label>
              <input
                type="tel"
                data-testid="shop-phone-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ví dụ: 0912 345 678"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500"
              />
            </div>

            {/* Business Hours */}
            <div className="col-span-2">
              <label className="font-bold text-slate-700 block mb-1">Giờ mở & đóng cửa phục vụ</label>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Giờ mở cửa</span>
                  <input
                    type="time"
                    data-testid="shop-open-time-input"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Giờ đóng cửa</span>
                  <input
                    type="time"
                    data-testid="shop-close-time-input"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Certificate Upload Section (Giấy phép ĐKKD / ATVSTP) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-600" />
              <span>Giấy Tờ Đăng Ký Kinh Doanh / Vệ Sinh ATTP</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tải lên hình ảnh giấy chứng nhận để Admin sàn đối chiếu và phê duyệt nhanh chóng
            </p>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            data-testid="certificate-file-input"
            onChange={handleFileChange}
            accept="image/*,.pdf"
            className="hidden"
          />

          <div
            data-testid="certificate-dropzone"
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 hover:border-red-400 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-slate-50 hover:bg-slate-100 transition cursor-pointer"
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
                <span className="text-xs font-bold text-slate-700">Đang tải ảnh giấy phép lên...</span>
              </div>
            ) : certificateUrl ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div data-testid="certificate-filename" className="text-xs font-bold text-slate-800">
                  {certificateFileName || 'Đã tải lên giấy phép'}
                </div>
                <button
                  type="button"
                  className="mt-1 px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold shadow-2xs hover:bg-slate-50"
                >
                  Chọn ảnh khác
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-slate-400 mb-2" />
                <div className="text-xs font-bold text-slate-800">
                  Kéo thả ảnh giấy phép hoặc bấm vào đây để chọn tệp
                </div>
                <div className="text-slate-400 text-2xs mt-1">Hỗ trợ ảnh JPG, PNG hoặc file PDF (tối đa 5MB)</div>
                <button
                  type="button"
                  className="mt-3 px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold shadow-2xs hover:bg-slate-50"
                >
                  Chọn ảnh từ máy
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
