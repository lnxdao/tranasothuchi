-- Chạy trong Supabase Dashboard > SQL Editor > New query > Run
-- Tạo 1 bảng RIÊNG cho app Trà Na, không đụng gì tới bảng của Tiệm Giặt Cherry.

create table if not exists tra_na_data (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table tra_na_data enable row level security;

-- Vì app này không có đăng nhập (chỉ mình chị chủ dùng nội bộ),
-- cho phép đọc/ghi bằng anon key. Nếu sau này muốn khoá kỹ hơn,
-- có thể thêm mật khẩu ở tầng ứng dụng hoặc bật Supabase Auth.
create policy "cho phép đọc tra_na_data"
  on tra_na_data for select
  using (true);

create policy "cho phép ghi tra_na_data"
  on tra_na_data for insert
  with check (true);

create policy "cho phép cập nhật tra_na_data"
  on tra_na_data for update
  using (true);
