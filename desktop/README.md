# PageBot Desktop

Desktop app cho Windows, quản lý nhiều profile trình duyệt Facebook và tích hợp trợ lý AI ngay trong cùng một màn hình.

## Tính năng bản đầu

- Tạo nhiều browser profile độc lập.
- Mỗi profile dùng Electron persistent session riêng, nên tài khoản Facebook đăng nhập không dùng chung cookie.
- Mở Facebook Business Suite / Messenger ngay trong app.
- Chọn Gemini hoặc Meta Model API cho từng profile.
- Lưu API key bằng `safeStorage` của Electron/Windows thay vì ghi text thô.
- Lưu dữ liệu sản phẩm, giá, FAQ và phong cách trả lời riêng cho từng profile.
- Đọc hội thoại đang mở, AI soạn câu trả lời và gửi vào ô chat.
- Auto Chat theo profile đang mở, có cooldown và giới hạn tối đa 6 tin/phút.
- Không có gửi hàng loạt, không có cơ chế ẩn/né phát hiện, không can thiệp checkpoint hay xác minh Facebook.

## Chạy khi phát triển

```bash
cd desktop
npm install
npm start
```

## Build Windows installer

```bash
cd desktop
npm install
npm run check
npm run dist
```

File cài đặt sẽ nằm trong `desktop/dist/`.

## Cách dùng nhanh

1. Bấm **Tạo profile trình duyệt**.
2. Đặt tên profile, ví dụ `FB Bao - TNANO`.
3. Đăng nhập Facebook bình thường trong khung trình duyệt giữa màn hình.
4. Ở bảng AI bên phải, chọn Gemini hoặc Meta Model API và nhập Model ID.
5. Lưu API key.
6. Nhập dữ liệu sản phẩm / giá / FAQ cho profile.
7. Mở một cuộc hội thoại trong Business Suite hoặc Messenger.
8. Bấm **◎** để kiểm tra app đọc được cuộc chat.
9. Bấm **AI soạn câu trả lời** rồi **Gửi vào Facebook**.
10. Khi đã test ổn, bật **Auto** để app tự trả lời hội thoại đang mở.

## Lưu ý kỹ thuật

Facebook thay đổi DOM thường xuyên. Bản đầu dùng heuristic để tìm ô chat và tin nhắn đang hiển thị, nên một số layout hoặc ngôn ngữ giao diện có thể cần cập nhật selector. Khi Auto Chat không đọc đúng, hãy tắt Auto và dùng nút kiểm tra hội thoại trước.

Bản desktop này không thay thế Messenger API chính thức. Nó chỉ thao tác trên phiên Facebook mà người dùng đang trực tiếp đăng nhập và mở trong app.
