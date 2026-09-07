import { detectVietnamesePhone } from "@/lib/ai/phone-detector";
import type { SalesIntent } from "@/lib/types";

const intentPatterns: Array<[SalesIntent, RegExp]> = [
  ["human_request", /(gap|gặp|noi chuyen|nói chuyện|lien he|liên hệ|goi lai|gọi lại|tu van vien|tư vấn viên|nhan vien|nhân viên|nguoi that|người thật|sales|kinh doanh)/i],
  ["complaint", /(khieu nai|khiếu nại|bong troc|bong tróc|phan nan|phàn nàn|khong hai long|không hài lòng|bao hanh|bảo hành|loi|lỗi)/i],
  ["quotation_request", /(bao gia|báo giá|bang gia|bảng giá|tinh gia|tính giá|du toan|dự toán|bao cu the|báo cụ thể|quote)/i],
  ["discount_question", /(khuyen mai|khuyến mãi|giam gia|giảm giá|chiet khau|chiết khấu|uu dai|ưu đãi|bot|bớt)/i],
  ["delivery_question", /(giao hang|giao hàng|van chuyen|vận chuyển|ship|gui hang|gửi hàng|bao gio giao|bao giờ giao|khi nao giao|khi nào giao)/i],
  ["address_provided", /(dia chi|địa chỉ|nhan hang|nhận hàng|giao toi|giao tới|phuong|phường|quan|quận|huyen|huyện|thanh pho|thành phố|tinh|tỉnh|tp\.?)/i],
  ["quantity_provided", /(\b\d+\s*(thung|thùng|lon|lit|lít|bo|bộ|kg)\b|lay\s+\d+|lấy\s+\d+)/i],
  ["dealer_question", /(dai ly|đại lý|mua o dau|mua ở đâu|cua hang|cửa hàng|phan phoi|phân phối|showroom)/i],
  ["contractor_question", /(nha thau|nhà thầu|tho son|thợ sơn|cai thau|cai thầu|thi cong tron goi|thi công trọn gói)/i],
  ["coverage_question", /(do phu|độ phủ|bao nhieu m2|bao nhiêu m2|bao nhieu met|bao nhiêu mét|lit son duoc|lít sơn được|1 thung.*m2|1 thùng.*m2)/i],
  ["waterproofing", /(chong tham|chống thấm|tham nuoc|thấm nước|san thuong|sân thượng|nha ve sinh|nhà vệ sinh|ban cong|ban công)/i],
  ["exterior_paint", /(ngoai that|ngoại thất|ben ngoai|bên ngoài|mat tien|mặt tiền|tuong ngoai|tường ngoài|ngoai troi|ngoài trời)/i],
  ["interior_paint", /(noi that|nội thất|trong nha|trong nhà|phong khach|phòng khách|phong ngu|phòng ngủ|trong thoi|trong thôi)/i],
  ["new_house", /(xay moi|xây mới|nha moi|nhà mới|dang xay|đang xây|moi xay|mới xây|xay nha|xây nhà)/i],
  ["renovation", /(son lai|sơn lại|sua lai|sửa lại|sua nha|sửa nhà|dang sua|đang sửa|cai tao|cải tạo|nha cu|nhà cũ|lam moi|làm mới)/i],
  ["color_question", /(mau|màu|phoi mau|phối màu|bang mau|bảng màu|tone|tong|tông)/i],
  ["technical_question", /(thi cong|thi công|son lot|sơn lót|quy trinh|quy trình|xu ly|xử lý|ky thuat|kỹ thuật|pha son|pha sơn|bot tret|bột trét)/i],
  ["purchase_intent", /(muon mua|muốn mua|dat hang|đặt hàng|lay luon|lấy luôn|can mua|cần mua|chot|chốt|mua luon|mua luôn)/i],
  ["product_question", /(loai son|loại sơn|san pham|sản phẩm|dong nao|dòng nào|hang nao|hãng nào|son gi|sơn gì|loai nao tot|loại nào tốt|nen dung|nên dùng)/i],
  ["price_inquiry", /(gia|giá|bao nhieu tien|bao nhiêu tiền|mac|mắc|re|rẻ|chi phi|chi phí|tam bao nhieu|tầm bao nhiêu)/i],
  ["greeting", /^(xin chao|xin chào|chao|chào|hello|hi|alo|ad oi|ad ơi|shop oi|shop ơi|em oi|em ơi)\b/i]
];

export function detectIntent(message: string): SalesIntent {
  if (detectVietnamesePhone(message).valid) return "phone_provided";
  const normalized = message.trim().toLowerCase();
  for (const [intent, pattern] of intentPatterns) {
    if (pattern.test(normalized)) return intent;
  }
  return "unknown";
}
