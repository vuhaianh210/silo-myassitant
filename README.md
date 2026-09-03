# Silo

Silo là PWA quản lý thu nhập và chi tiêu cá nhân theo kỳ. Mọi giao dịch được nhập thủ công và lưu trong bộ nhớ trình duyệt trên thiết bị; GitHub Pages chỉ lưu mã nguồn.

## Chạy trên máy Mac

```bash
cd silo-myassitant
python3 -m http.server 4173
```

Mở `http://localhost:4173/`.

## Kiểm thử

```bash
npm test
```

Không cần chạy `npm install`; dự án không có dependency.

## Cài trên iPhone

1. Mở URL GitHub Pages bằng Safari.
2. Chọn Chia sẻ.
3. Chọn Thêm vào Màn hình chính.
4. Mở Silo một lần khi có mạng để lưu bộ ứng dụng dùng offline.

## Dữ liệu và quyền riêng tư

- Dữ liệu chi tiêu nằm trong vùng lưu trữ của Silo trên thiết bị.
- Silo không kết nối ngân hàng, không có analytics và không gửi giao dịch lên GitHub.
- Phiên bản này không có xuất, sao lưu hoặc khôi phục dữ liệu. Xóa web app hoặc dữ liệu website có thể làm mất dữ liệu.

## Triển khai

GitHub Pages phát hành từ nhánh `main`. Sau khi kiểm thử, đẩy commit lên `main`, mở URL Pages khi có mạng và chấp nhận banner cập nhật của Silo.
