# PageBot Desktop DEV

Desktop app cho Windows để quản lý nhiều profile trình duyệt Facebook và dùng trợ lý AI ngay trong cùng một màn hình. Giai đoạn hiện tại chỉ tập trung làm bản development chạy ổn; chưa đóng gói installer chính thức.

## Tính năng đang có

- Tạo nhiều browser profile độc lập.
- Mỗi profile dùng Electron persistent session riêng, nên tài khoản Facebook đăng nhập không dùng chung cookie.
- Nhớ trang cuối cùng của từng profile để mở lại đúng vị trí đang làm việc.
- Mở Facebook Business Suite / Messenger ngay trong app.
- Chọn Gemini hoặc Meta Model API cho từng profile.
- Lưu API key bằng `safeStorage` của Electron/Windows thay vì ghi text thô.
- Lưu dữ liệu sản phẩm, giá, FAQ và phong cách trả lời riêng cho từng profile.
- Nút **Kiểm tra AI** để test API + model trước khi dùng chat.
- Nút **◎** để chẩn đoán app có đọc đúng ô chat, chiều tin nhắn và độ tin cậy hay không.
- Đọc hội thoại đang mở, AI soạn câu trả lời và gửi vào ô chat.
- Auto Chat chỉ hoạt động trên Business Suite Inbox / Messenger của profile đang mở.
- Auto Chat có mốc ban đầu, debounce tin mới, cooldown, giới hạn tốc độ và kiểm tra lại hội thoại trước khi gửi để giảm nguy cơ gửi nhầm/trùng.
- Không có gửi hàng loạt, không có cơ chế ẩn/né phát hiện, không can thiệp checkpoint hay xác minh Facebook.

## Chạy bản development trên Windows

Cách đơn giản nhất: chạy `desktop/run-dev.bat`.

File này sẽ:

1. Kiểm tra Node.js.
2. Cài dependencies nếu máy chưa có.
3. Chạy kiểm tra JavaScript + test tự động.
4. Chỉ mở app khi các kiểm tra pass.

Hoặc chạy thủ công:

```bash
cd desktop
npm install
npm run verify
npm start
```

## Quy trình test hiện tại

1. Tạo profile `Test 1` và đăng nhập một Facebook account.
2. Tạo profile `Test 2` và đăng nhập Facebook account khác.
3. Chuyển qua lại hai profile để xác nhận cookie/session không bị dùng chung.
4. Mở Business Suite Inbox hoặc Messenger trong profile cần test.
5. Chọn Gemini/Meta, nhập Model ID và lưu API key.
6. Bấm **Kiểm tra AI**. Chỉ tiếp tục khi log báo provider hoạt động.
7. Mở một hội thoại rồi bấm **◎**. Kiểm tra khung chẩn đoán nhận đúng: trang chat, ô nhập, tin cuối là Khách hay Bạn/Page và độ tin cậy.
8. Bấm **AI soạn câu trả lời**. Đọc lại nội dung trước khi bấm **Gửi vào Facebook**.
9. Khi gửi thủ công đã ổn nhiều lần, mới bật **Auto**.
10. Khi vừa bật Auto, app lấy hội thoại đang mở làm mốc và không trả lời lại tin cũ. Gửi một tin mới từ tài khoản khác để test.

## Khi có lỗi đọc chat

Tắt Auto trước. Bấm **◎**, chụp toàn bộ cửa sổ PageBot gồm Facebook và khung chẩn đoán bên phải, rồi ghi rõ:

- đang dùng `business.facebook.com` hay `messenger.com`;
- giao diện Facebook đang để tiếng Việt hay tiếng Anh;
- khung chẩn đoán ghi `Tin cuối: Khách`, `Bạn/Page` hay `Chưa rõ`;
- app có tìm thấy ô nhập hay không.

Thông tin này dùng để chỉnh selector/heuristic cho đúng layout Facebook thực tế thay vì đoán.

## Lưu ý kỹ thuật

Facebook thay đổi DOM thường xuyên. App dùng heuristic trên chính giao diện mà người dùng đang mở, vì vậy phải test thực tế trước khi coi Auto Chat là ổn định. Auto chỉ gửi khi trang thuộc bề mặt chat hỗ trợ và độ tin cậy nhận diện đạt ngưỡng an toàn.

Bản desktop này không thay thế Messenger API chính thức. Nó thao tác trên phiên Facebook mà người dùng trực tiếp đăng nhập trong app.
