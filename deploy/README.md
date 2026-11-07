# Triển khai và vận hành website BFC

Sổ tay cho người quản lý server: dựng lần đầu, cập nhật, sao lưu, khôi phục, theo dõi, bảo trì, xử lý sự cố.
Việc của người sửa nội dung trong admin xem [docs/huong-dan-quan-tri.md](../docs/huong-dan-quan-tri.md).
Lý do chọn kiến trúc: [ADR 0006](../backend/docs/adr/0006-trien-khai-docker-compose.md).

## 1. Kiến trúc

Toàn bộ chạy trên **một server Linux** bằng Docker Compose (`docker-compose.yml`, tên dự án `bfc-web`).
Chỉ Nginx mở cổng ra Internet (80, 443).

```
Khách ──https──► nginx ─┬─► web   (Next.js, cổng 3000)  ──http nội bộ──► cms
                        │                                                  │
Quản trị ─https─► nginx ┴─► cms   (Django + Wagtail, gunicorn, 8000) ──► postgres
                        └─► /media/ (ảnh, Nginx đọc thẳng volume)        └──► clamav (quét tệp đính kèm)
```

| Dịch vụ | Image | Việc | Dữ liệu (volume) |
| --- | --- | --- | --- |
| `nginx` | nginx:1.28.0-alpine | HTTPS, chuyển `www` về domain chính, phục vụ ảnh `/media/` | (chứng chỉ ở `/etc/letsencrypt` của server) |
| `web` | build từ `frontend/Dockerfile` | Website công khai `https://WEB_DOMAIN` | không có, dựng lại được bất cứ lúc nào |
| `cms` | build từ `backend/Dockerfile` | Admin `https://CMS_DOMAIN/admin/`, API cho web | `media` (ảnh), `private` (tệp đính kèm form Liên hệ) |
| `postgres` | postgres:17.6 | Database của CMS | `pgdata` |
| `clamav` | clamav/clamav:1.4.3 | Quét virus tệp khách gửi qua form Liên hệ (ADR 0009) | `clamav-db` (tự cập nhật mẫu virus) |

Cách hai bên nói chuyện:

- Web đọc nội dung từ CMS qua `http://cms:8000/api/v1` (nội bộ, không ra Internet).
- Sửa và xuất bản trong admin: CMS gọi webhook `http://web:3000/api/revalidate` (ký bằng `CMS_SHARED_SECRET`),
  web làm mới đúng trang liên quan ngay. Webhook lỗi thì web tự làm mới sau tối đa 1 giờ.
- Form Liên hệ: web kiểm tra captcha (Cloudflare Turnstile) rồi gửi sang CMS, CMS lưu, quét virus tệp, gửi email.
- Xem trước bản nháp: admin mở web trong khung, link ký ngắn hạn (ADR 0014).
- **Lúc build**, Next.js dựng sẵn trang bằng cách gọi CMS qua `https://CMS_DOMAIN/api/v1`, nên CMS phải
  chạy và có dữ liệu trước khi build web. `deploy.sh` lo đúng thứ tự này.

Nội dung (sản phẩm, vật liệu, trang, menu, cài đặt) **không cần deploy lại**: sửa trong admin là lên web.
Chỉ deploy khi đổi code.

## 2. Chuẩn bị

### Server

| Mục | Tối thiểu | Ghi chú |
| --- | --- | --- |
| Hệ điều hành | Ubuntu 24.04 LTS | Bản Linux khác chạy Docker được cũng dùng được |
| CPU / RAM | 2 vCPU / 4 GB | ClamAV dùng khoảng 1,5 GB RAM; build Next.js cần thêm 1 đến 2 GB. Nên có swap 2 GB |
| Ổ đĩa | 40 GB SSD | Ảnh sản phẩm, image Docker, bản sao lưu 14 ngày |
| Phần mềm | Docker Engine + plugin `docker compose`, `git`, `curl`, `certbot` | Cài Docker theo hướng dẫn chính thức của Docker cho Ubuntu |
| Tường lửa | Mở 22 (SSH), 80, 443 | Không mở 5432, 8000, 3000 |

Người chạy deploy cần thuộc nhóm `docker` (`sudo usermod -aG docker <user>`, đăng nhập lại).

### Những thứ BFC cung cấp

| Thứ | Dùng cho | Biến |
| --- | --- | --- |
| Domain web và subdomain CMS, ví dụ `bfcfurniture.com` và `cms.bfcfurniture.com` | Địa chỉ site, chứng chỉ HTTPS | `WEB_DOMAIN`, `CMS_DOMAIN` |
| Tài khoản SMTP gửi email, domain đã cấu hình SPF / DKIM | Email báo có yêu cầu liên hệ, email cảm ơn khách, quên mật khẩu admin | `EMAIL_*` trong `.env.cms` |
| Email người nhận yêu cầu liên hệ | Thông báo khi khách gửi form | `INQUIRY_NOTIFY_EMAILS` (sau sửa được trong admin) |
| Widget Cloudflare Turnstile (khai báo domain web) | Captcha form Liên hệ | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| Nơi chép bản sao lưu ra ngoài server | Phòng mất cả server | mục 6 |
| Danh sách người quản trị | Tạo tài khoản admin | mục 3, bước 6 |

### DNS

Trỏ bản ghi A (và AAAA nếu server có IPv6) về IP server **trước** khi xin chứng chỉ:

```
bfcfurniture.com       A   <IP server>
www.bfcfurniture.com   A   <IP server>
cms.bfcfurniture.com   A   <IP server>
```

Kiểm tra: `dig +short cms.bfcfurniture.com` ra đúng IP. Chính server cũng phải phân giải được
`CMS_DOMAIN` (lúc build web gọi tới đó).

## 3. Dựng lần đầu

Ví dụ dùng thư mục `/opt/bfc-web`. Đổi domain theo thực tế.

**Bước 1. Lấy code**

```bash
sudo mkdir -p /opt/bfc-web && sudo chown "$USER" /opt/bfc-web
git clone <địa chỉ repo> /opt/bfc-web
cd /opt/bfc-web/deploy
```

**Bước 2. Biến môi trường** (hai file này chứa bí mật: không commit, quyền 600)

```bash
cp .env.example .env
cp .env.cms.example .env.cms
chmod 600 .env .env.cms
python3 -c "import secrets; print(secrets.token_urlsafe(32))"   # POSTGRES_PASSWORD
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # CMS_SHARED_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # DJANGO_SECRET_KEY (.env.cms)
nano .env        # domain, mật khẩu Postgres, bí mật chung, khoá Turnstile, nơi lưu backup
nano .env.cms    # DJANGO_SECRET_KEY, SMTP, email nhận yêu cầu
```

Ý nghĩa từng biến ghi ngay trong file mẫu. Bắt buộc: `WEB_DOMAIN`, `CMS_DOMAIN`, `POSTGRES_PASSWORD`,
`CMS_SHARED_SECRET`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `DJANGO_SECRET_KEY`. Thiếu biến bắt buộc
thì `docker compose` dừng và báo tên biến.

**Bước 3. Chứng chỉ HTTPS** (lần đầu dùng chế độ standalone vì Nginx chưa chạy, cổng 80 phải đang trống)

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --standalone -d bfcfurniture.com -d www.bfcfurniture.com
sudo certbot certonly --standalone -d cms.bfcfurniture.com
```

Kết quả phải có `/etc/letsencrypt/live/bfcfurniture.com/` và `/etc/letsencrypt/live/cms.bfcfurniture.com/`
(Nginx đọc đúng hai đường dẫn này). Gia hạn về sau dùng webroot qua Nginx đang chạy, xem bước 7.

**Bước 4. Deploy lần đầu**

```bash
./deploy.sh --first
```

Script làm lần lượt: build CMS, bật Postgres và ClamAV, migrate, tạo locale vi/en và nhóm Quản trị
(`bootstrap`), nhập thông tin chung (`import_site`), phân loại (`sync_taxonomy`), 50 sản phẩm mẫu
(`import_mock`), trang nội dung (`import_pages`), bật CMS và Nginx, chờ `https://CMS_DOMAIN/readyz`, build web
rồi bật web. Lần đầu mất 10 đến 20 phút (tải image, build). ClamAV cần thêm vài phút tải mẫu virus; trong lúc
đó tệp đính kèm được đánh dấu chờ và cron quét lại sau.

`--first` chỉ dùng **một lần**. Chạy lại sẽ tạo lại các mục phân loại mà admin đã cố ý xoá.

**Bước 5. Kiểm tra**

```bash
docker compose ps                                   # 5 dịch vụ Up, cms và web (healthy)
curl -fsS https://cms.bfcfurniture.com/readyz       # {"status": "ok", ...}
curl -I https://bfcfurniture.com/                   # 200
curl -I https://www.bfcfurniture.com/               # 301 về https://bfcfurniture.com/
```

Mở web, đổi sang tiếng Anh, mở vài trang sản phẩm, gửi thử form Liên hệ có đính kèm.

**Bước 6. Tài khoản quản trị**

```bash
docker compose exec cms python manage.py createsuperuser
```

Tài khoản đầu tiên là superuser. Người quản trị khác: đăng nhập admin → Cài đặt → Người dùng → Thêm,
cho vào nhóm **Quản trị** (ADR 0004). Không dùng chung tài khoản.

**Bước 7. Lịch chạy định kỳ**

```bash
crontab -e     # dán nội dung deploy/crontab.example, sửa /opt/bfc-web nếu khác
```

| Lịch | Việc |
| --- | --- |
| 5 phút | `publish_scheduled`: xuất bản / gỡ nội dung đã hẹn giờ trong admin |
| 15 phút | `scan_attachments`: quét lại tệp đính kèm chưa quét được |
| 02:00 hằng ngày | `backup.sh`: sao lưu database, ảnh, tệp đính kèm |
| 03:30 hằng ngày | `certbot renew` + nạp lại Nginx khi có chứng chỉ mới |

Dòng `certbot renew` cần quyền root: đặt vào `sudo crontab -e`, hoặc cho user chạy cron quyền ghi
`/etc/letsencrypt`. Thử gia hạn: `sudo certbot renew --dry-run --webroot -w /var/www/certbot`.

**Bước 8. Sau khi lên**

- Admin → **Rà soát SEO**: xử lý hết mục Lỗi trước khi công bố (ADR 0015).
- Admin → Cài đặt → **Liên hệ**: kiểm tra email người nhận.
- Đăng ký domain với Google Search Console (dán thẻ meta xác minh ở Admin → Cài đặt → Thông tin chung → SEO),
  gửi `https://bfcfurniture.com/sitemap.xml`.
- Tạo thuộc tính GA4 cho domain, dán Measurement ID ở Admin → Cài đặt → Thông tin chung → SEO.
- Cài theo dõi từ bên ngoài (mục 7) và chép bản sao lưu ra ngoài (mục 6).

## 4. Cập nhật code

```bash
cd /opt/bfc-web
git pull
cd deploy && ./deploy.sh
```

`deploy.sh` (không `--first`) build lại CMS, migrate, tạo trang nội dung còn thiếu (không ghi đè phần đã sửa
trong admin), khởi động lại CMS, build lại web rồi thay container web. Web cũ vẫn phục vụ trong lúc build;
khách chỉ bị gián đoạn vài giây lúc thay container.

Trước khi cập nhật bản có migration lớn, chạy `./backup.sh` bằng tay.

**Quay về bản trước** khi bản mới lỗi:

```bash
cd /opt/bfc-web
git log --oneline -5            # tìm commit đang ổn
git checkout <commit>
cd deploy && ./deploy.sh
```

Migration không tự quay lui. Nếu bản lỗi đã đổi cấu trúc database theo cách bản cũ không đọc được, khôi phục
bản sao lưu chụp trước khi cập nhật (mục 6). Sửa xong thì `git checkout main && git pull` rồi deploy lại.

**Khi nào cần build lại web mà không đổi code:** sau khi khôi phục bản sao lưu, hoặc khi trang nào đó vẫn hiện
nội dung cũ quá 1 giờ dù đã xuất bản (thường do webhook lỗi, xem mục 8). Chạy `./deploy.sh` là đủ.

## 5. Lệnh hằng ngày

Chạy trong `/opt/bfc-web/deploy`.

| Việc | Lệnh |
| --- | --- |
| Trạng thái dịch vụ | `docker compose ps` |
| Xem log | `docker compose logs -f --tail=200 cms` (hoặc `web`, `nginx`, `postgres`, `clamav`) |
| Khởi động lại một dịch vụ | `docker compose restart cms` |
| Dừng / bật toàn bộ | `docker compose stop` / `docker compose up -d` |
| Lệnh quản trị CMS | `docker compose exec cms python manage.py <lệnh>` |
| Đổi mật khẩu admin | `docker compose exec cms python manage.py changepassword <tên>` |
| Mở khoá tài khoản bị khoá do sai mật khẩu 5 lần | `docker compose exec cms python manage.py axes_reset_username <tên>` (tự mở sau 1 giờ) |
| Quét lại tệp đính kèm ngay | `docker compose exec cms python manage.py scan_attachments` |
| Vào database | `docker compose exec postgres psql -U bfc bfc_cms` |
| Dung lượng | `df -h`, `docker system df`, `du -sh /var/backups/bfc-web` |

Log CMS dạng JSON, mỗi dịch vụ giữ tối đa 5 file x 10 MB. Mức log đổi bằng `LOG_LEVEL` trong `.env.cms`.

## 6. Sao lưu và khôi phục

### Sao lưu gồm gì

`backup.sh` tạo `BACKUP_DIR/<ngày-giờ>/` (mặc định `/var/backups/bfc-web`):

| File | Nội dung |
| --- | --- |
| `db.dump` | Toàn bộ database (sản phẩm, trang, cài đặt, yêu cầu liên hệ, tài khoản, lịch sử sửa) |
| `media.tar.gz` | Ảnh và tài liệu tải lên admin |
| `private.tar.gz` | Tệp khách đính kèm form Liên hệ |

Script kiểm tra bản dump đọc được, rồi xoá bản cũ hơn `BACKUP_KEEP_DAYS` ngày (mặc định 14). Không cần sao lưu
image Docker hay web: dựng lại được từ code.

Chạy tay: `./backup.sh`. Log cron: `/var/log/bfc-web-backup.log`.

### Chép ra ngoài server (bắt buộc)

Bản sao lưu trên cùng server sẽ mất cùng server. Chép mỗi ngày ra nơi khác BFC chọn (server khác, ổ mạng,
dịch vụ lưu trữ). Ví dụ với một server khác qua SSH, thêm vào cron sau giờ backup:

```bash
30 2 * * *  rsync -a --delete /var/backups/bfc-web/ backup@<máy lưu>:/srv/bfc-web-backups/
```

Bản sao lưu có thông tin khách hàng (yêu cầu liên hệ, tệp đính kèm): nơi lưu phải giới hạn người truy cập,
nên mã hoá nếu là dịch vụ bên ngoài.

### Khôi phục

```bash
./restore.sh /var/backups/bfc-web/20261107-020000
./deploy.sh              # dựng lại web theo dữ liệu vừa khôi phục
```

`restore.sh` hỏi xác nhận (gõ `khoi phuc`), dừng web và CMS, ghi đè database, ảnh, tệp đính kèm, rồi bật lại.
Mọi thay đổi sau thời điểm sao lưu sẽ mất.

**Dựng lại trên server mới** (server cũ hỏng): làm mục 3 bước 1 đến 3 với `.env` / `.env.cms` cũ (giữ nguyên
`DJANGO_SECRET_KEY` và mật khẩu), chạy `./deploy.sh` (không `--first`), chép bản sao lưu về rồi `./restore.sh`.

**Diễn tập** mỗi quý: khôi phục bản mới nhất lên staging, mở admin và web kiểm tra. Bản sao lưu chưa từng
khôi phục thử thì chưa chắc dùng được.

## 7. Theo dõi

| Kiểm tra | Cách |
| --- | --- |
| Web và CMS còn sống | Dịch vụ theo dõi uptime bên ngoài gọi `https://WEB_DOMAIN/` và `https://CMS_DOMAIN/readyz` mỗi 5 phút, báo email khi lỗi |
| Container tự hồi phục | Mọi dịch vụ `restart: unless-stopped`; `cms` và `web` có healthcheck, `docker compose ps` hiện `(unhealthy)` khi lỗi |
| Sao lưu chạy | Mỗi tuần xem `ls /var/backups/bfc-web` có bản mỗi ngày, xem cuối `/var/log/bfc-web-backup.log` |
| Chứng chỉ | Let's Encrypt gửi email trước khi hết hạn nếu gia hạn tự động hỏng |
| Ổ đĩa | Còn dưới 20% thì dọn: `docker image prune -a`, giảm `BACKUP_KEEP_DAYS` |
| Yêu cầu liên hệ | Admin → Liên hệ; tệp bị đánh dấu nhiễm virus không tải được |

`/healthz` chỉ báo tiến trình còn chạy; `/readyz` kiểm tra cả database. Hai địa chỉ này không bị chuyển hướng
HTTPS để công cụ nội bộ gọi được.

## 8. Sự cố thường gặp

| Hiện tượng | Nguyên nhân hay gặp | Cách xử lý |
| --- | --- | --- |
| `deploy.sh` dừng ở "CMS chưa lên sau 60 giây" | Sai biến trong `.env.cms`, DNS `CMS_DOMAIN` chưa trỏ, thiếu chứng chỉ | `docker compose logs cms nginx`; `curl -v https://CMS_DOMAIN/readyz` ngay trên server |
| Build web lỗi `fetch failed` | Server không gọi được `https://CMS_DOMAIN` (DNS, tường lửa chặn chiều ra) | Sửa DNS / tường lửa, chạy lại `./deploy.sh` (build có tự thử lại khi rớt mạng) |
| Nginx không khởi động | Thiếu thư mục chứng chỉ `/etc/letsencrypt/live/<domain>` | Làm lại mục 3 bước 3, `docker compose logs nginx` |
| Web 502 | Container web đang khởi động hoặc lỗi | `docker compose ps`, `docker compose logs web` |
| Xuất bản trong admin mà web chưa đổi | Webhook làm mới lỗi (sai `CMS_SHARED_SECRET` giữa hai bên) | `docker compose logs cms` tìm "revalidate"; web tự làm mới sau tối đa 1 giờ; `./deploy.sh` để làm mới ngay |
| Form Liên hệ luôn báo lỗi | Thiếu / sai khoá Turnstile, domain chưa khai báo trong widget | `docker compose logs web` tìm "[contact]"; sửa `.env`, `./deploy.sh` (khoá công khai gắn lúc build) |
| Không nhận email yêu cầu | SMTP sai, email người nhận trống | `docker compose logs cms`; Admin → Cài đặt → Liên hệ |
| Email cảm ơn vào hộp Spam của khách | Domain gửi chưa có SPF / DKIM / DMARC | Nhờ người quản lý domain thêm bản ghi DNS theo hướng dẫn của nhà cung cấp email; `DEFAULT_FROM_EMAIL` phải cùng domain với tài khoản SMTP |
| Tệp đính kèm mãi "chờ quét" | ClamAV chưa tải xong mẫu virus hoặc thiếu RAM | `docker compose logs clamav`; cron quét lại mỗi 15 phút |
| Không đăng nhập được admin | Bị khoá sau 5 lần sai | Chờ 1 giờ hoặc `axes_reset_username` (mục 5) |
| Ảnh không hiện | Volume `media` trống sau khi chuyển server | Khôi phục `media.tar.gz` (mục 6) |
| Xem trước bản nháp trong admin trắng | `CMS_ADMIN_ORIGIN` lúc build web khác domain CMS | Kiểm tra `CMS_DOMAIN` trong `.env`, `./deploy.sh` |

## 9. Bảo trì định kỳ

| Tần suất | Việc |
| --- | --- |
| Hằng tuần | Xem bản sao lưu và chỗ chép ra ngoài; xem Admin → Liên hệ có yêu cầu tồn; xem `docker compose ps` |
| Hằng tháng | `sudo apt update && sudo apt upgrade` (hệ điều hành, Docker); khởi động lại server nếu cần, rồi `docker compose ps`; Admin → Rà soát SEO |
| Mỗi quý | Diễn tập khôi phục (mục 6); rà danh sách tài khoản admin, xoá người đã nghỉ; nâng phiên bản thư viện và image (dưới đây) |
| Khi có cảnh báo bảo mật | Nâng ngay thư viện / image liên quan |

**Nâng phiên bản.** Mọi phiên bản đều ghim chính xác (ADR 0001): image trong `docker-compose.yml` và hai
Dockerfile, thư viện trong `backend/uv.lock` và `frontend/package-lock.json`. Chỉ chọn bản đã phát hành ít nhất
2 tuần. Nâng trên máy dev, chạy kiểm tra (`poe check`, CI frontend), đẩy lên, CI xanh rồi mới deploy. Postgres
chỉ nâng bản vá trong cùng số chính (17.x); nâng số chính cần dump và khôi phục, làm trên staging trước.

CI GitHub Actions tự chạy khi có thay đổi:

| Workflow | Kiểm tra |
| --- | --- |
| `backend.yml` | Lint, type, migration thiếu, test trên Postgres + coverage, cấu hình production (`check --deploy`), OpenAPI khớp code, lỗ hổng thư viện (pip-audit), build image CMS |
| `frontend.yml` | Kiểu API khớp `openapi.yaml`, type, lint, format, build, lỗ hổng thư viện, build image web |
| `deploy.yml` | Cú pháp `docker-compose.yml`, Nginx nạp được cấu hình, shellcheck các script |

## 10. Bí mật và đổi bí mật

| Bí mật | Ở đâu | Đổi thì |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | `.env.cms` | Mọi người bị đăng xuất, link đặt lại mật khẩu cũ hết hiệu lực. `docker compose up -d cms` |
| `CMS_SHARED_SECRET` | `.env` | Phải dùng chung cho cả web và CMS: `./deploy.sh` để cả hai nhận cùng lúc |
| `POSTGRES_PASSWORD` | `.env` | Đổi trong database trước: `docker compose exec postgres psql -U bfc -c "ALTER USER bfc PASSWORD '<mới>'"`, sửa `.env`, rồi `docker compose up -d cms` |
| `EMAIL_HOST_PASSWORD` | `.env.cms` | `docker compose up -d cms` |
| Khoá Turnstile | `.env` | `./deploy.sh` (khoá công khai gắn vào web lúc build) |
| Mật khẩu admin | database | Admin → tài khoản, hoặc `changepassword` |

Đổi ngay khi người biết bí mật nghỉ việc, hoặc nghi lộ. Không gửi bí mật qua chat, email; không commit `.env*`.

## 11. Staging

Staging là bản sao để thử bản mới và diễn tập khôi phục trước khi đụng PROD. Dùng đúng bộ này trên server
(hoặc thư mục) khác với domain riêng, ví dụ `staging.bfcfurniture.com` và `cms-staging.bfcfurniture.com`,
`.env` riêng, bí mật riêng, không dùng chung database với PROD. Nên chặn người ngoài (tường lửa theo IP công ty
hoặc mật khẩu ở Nginx) để Google không lập chỉ mục bản staging.

## 12. Còn chờ BFC chốt trước khi lên PROD

- Domain, VPS, nơi chép bản sao lưu ra ngoài và số ngày giữ.
- Tài khoản SMTP, email nhận yêu cầu liên hệ, widget Turnstile.
- Danh sách người quản trị; có bật xác thực hai bước (2FA) cho admin không.
- Duyệt nội dung Chính sách bảo mật, Điều khoản (các chỗ NULL) và xử lý mục Lỗi trong Rà soát SEO.
