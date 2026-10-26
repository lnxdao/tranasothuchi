# Tiệm Trà Trái Cây Trà Na — Sổ Thu Chi

Hướng dẫn đưa app này lên mạng bằng GitHub + Vercel + Supabase (tài khoản bạn đã có sẵn cho Tiệm Giặt Cherry), **hoàn toàn tách biệt**, không đụng gì tới web Cherry đang chạy.

## Vì sao phải làm thêm bước này?

Bản bạn đang xem trong Claude lưu dữ liệu bằng một bộ nhớ chỉ hoạt động **bên trong Claude**. Muốn có một trang web thật, mở được từ điện thoại/máy tính bất kỳ, dữ liệu cần một nơi lưu trữ thật — ở đây dùng Supabase. Toàn bộ phần code đã được chuyển sang dùng Supabase sẵn trong gói này rồi, bạn chỉ cần làm theo các bước dưới.

## Bước 1 — Tạo bảng dữ liệu trên Supabase (5 phút)

1. Vào [supabase.com](https://supabase.com) → đăng nhập tài khoản đang dùng cho Cherry.
2. Bấm **New project** (KHÔNG chọn project của Cherry) → đặt tên ví dụ `tra-na` → chọn vùng gần Việt Nam (Singapore) → Create.
   *(Việc tạo project mới, tách biệt hoàn toàn là để chắc chắn không ảnh hưởng gì tới dữ liệu/khoá API của Cherry.)*
3. Đợi project khởi tạo xong, vào mục **SQL Editor** ở thanh bên trái → **New query**.
4. Mở file `supabase-setup.sql` trong gói này, copy toàn bộ nội dung, dán vào → bấm **Run**.
   → Việc này tạo ra 1 bảng tên `tra_na_data` để chứa toàn bộ dữ liệu thu chi/kho.
5. Vào **Project Settings** (icon bánh răng) → **API** → lưu lại 2 giá trị:
   - **Project URL**
   - **anon public key**
   (Sẽ cần dán vào Vercel ở Bước 3.)

## Bước 2 — Đưa code lên GitHub (repo MỚI, riêng)

1. Vào [github.com](https://github.com) → **New repository**.
2. Đặt tên ví dụ `tra-na-so-thu-chi` → Private hoặc Public tuỳ bạn → Create repository.
   *(Đây là repo mới, khác hoàn toàn với repo của Cherry.)*
3. Trên trang repo vừa tạo, bấm **uploading an existing file** (hoặc **Add file → Upload files**).
4. Kéo thả **toàn bộ** các file/thư mục trong gói này vào (giữ nguyên cấu trúc thư mục `src/`) → Commit changes.

## Bước 3 — Deploy trên Vercel (project MỚI, riêng)

1. Vào [vercel.com](https://vercel.com) → đăng nhập tài khoản đang dùng cho Cherry.
2. Bấm **Add New → Project**.
3. Chọn repo `tra-na-so-thu-chi` vừa tạo ở Bước 2 → Import.
   *(Đây là một Vercel Project hoàn toàn mới — độc lập với project của Cherry, deploy/khôi phục/xoá đều không ảnh hưởng lẫn nhau.)*
4. Vercel tự nhận ra đây là dự án Vite, không cần đổi gì ở phần Build Settings.
5. Mở rộng mục **Environment Variables**, thêm 2 dòng lấy từ Bước 1:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
6. Bấm **Deploy**. Đợi khoảng 1 phút, xong bạn sẽ có link dạng `tra-na-so-thu-chi.vercel.app`.

## Sau khi deploy xong

- Mở link vừa nhận được — app chạy y như bản trong Claude, nhưng giờ dữ liệu lưu trên Supabase, mở từ điện thoại/máy tính nào cũng thấy cùng một dữ liệu.
- Muốn cập nhật app sau này (thêm món mới, sửa giao diện...): quay lại đây nhờ mình sửa code, rồi upload đè file mới lên đúng repo GitHub này (Vercel sẽ tự deploy lại) — không đụng gì tới Cherry.
- **Lưu ý bảo mật nhỏ:** app hiện chưa có đăng nhập/mật khẩu (ai có link cũng vào xem/nhập được), phù hợp dùng nội bộ. Nếu muốn khoá lại bằng mật khẩu đơn giản hoặc giới hạn người xem, cứ nói mình làm thêm.

## Chạy thử trên máy trước khi deploy (không bắt buộc)

Nếu muốn xem trước khi đưa lên Vercel:
```
npm install
cp .env.example .env
# rồi điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào file .env
npm run dev
```
