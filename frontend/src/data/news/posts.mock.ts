import type { NewsKind } from "./types";

/*
 * 10 bài mẫu "Cuộc sống tại BFC" (2026-11-09) để duyệt giao diện trước khi làm CMS. Nội dung kiểu tin
 * nội bộ / thông báo thường gặp của một nhà máy nội thất; không nêu số liệu, tên hội chợ hay chứng
 * nhận cụ thể (chưa có nguồn thật). Có CMS thì các bài này sẽ là dữ liệu ban đầu để import.
 * Nội dung bài là HTML giống rich text Wagtail sẽ trả về (p, h2, ul, strong), thành khối "Đoạn văn"
 * đầu tiên; vài bài có thêm khối minh hoạ (gallery, ảnh, ảnh + chữ, trích dẫn, bảng, nút) ở
 * `demoBlocks` để thấy các kiểu khối CMS hỗ trợ. Video / tệp đính kèm không có mẫu (cần tệp thật).
 * `slug` là slug bản tiếng Việt; bản tiếng Anh có slug riêng tạo từ tiêu đề tiếng Anh (enSlug, giống
 * cách CMS tự tạo, user 10/11).
 */

type Text = { title: string; excerpt: string; body: string };

/** Chữ song ngữ */
type L<T = string> = { vi: T; en: T };

/** Khối nội dung song ngữ (giống khối CMS, chữ cả hai bản để import tạo bản dịch) */
export type MockBlock =
  | { type: "paragraph"; html: L }
  | { type: "image"; image: string; size: "text" | "wide"; caption?: L }
  | {
      type: "gallery";
      layout: "grid-2" | "grid-3" | "slider";
      images: { image: string; caption?: L }[];
      caption?: L;
    }
  | {
      type: "image_text";
      image: string;
      imagePosition: "left" | "right";
      heading?: L;
      html: L;
    }
  | { type: "quote"; quote: L; author?: string; role?: L }
  | {
      type: "table";
      columns: L<string[]>;
      rows: L<string[][]>;
      caption?: L;
    }
  | { type: "button"; label: L; url: string };

export type MockPost = {
  slug: string;
  kind: NewsKind;
  /** yyyy-mm-dd */
  date: string;
  cover: string;
  vi: Text;
  en: Text;
};

export const mockPosts: MockPost[] = [
  {
    slug: "lich-nghi-tet-nguyen-dan-2027",
    kind: "notice",
    date: "2026-11-05",
    cover: "/Assets/Company_Gate.png",
    vi: {
      title: "Thông báo lịch nghỉ Tết Nguyên đán 2027 và kế hoạch giao hàng",
      excerpt:
        "BFC thông báo kế hoạch sản xuất, đóng container và lịch nghỉ Tết Nguyên đán 2027 để khách hàng chủ động sắp xếp đơn hàng.",
      body: `<p>Kính gửi Quý khách hàng và đối tác,</p>
<p>Tết Nguyên đán là kỳ nghỉ dài nhất trong năm tại Việt Nam. Để đơn hàng của Quý khách không bị gián đoạn, BFC xin thông báo kế hoạch sản xuất và giao hàng quanh kỳ nghỉ Tết 2027.</p>
<h2>Kế hoạch sản xuất trước Tết</h2>
<ul>
<li>Đơn hàng xác nhận sớm sẽ được ưu tiên xếp lịch sản xuất và đóng container trước kỳ nghỉ.</li>
<li>Đơn hàng xác nhận sau thời hạn chốt sẽ được sản xuất ngay khi nhà máy hoạt động trở lại.</li>
<li>Bộ phận kinh doanh sẽ gửi lịch chốt đơn và ngày đóng hàng cụ thể tới từng khách hàng.</li>
</ul>
<h2>Trong thời gian nghỉ</h2>
<p>Nhà máy và văn phòng tạm nghỉ theo lịch nghỉ Tết của nhà nước. Email vẫn được tiếp nhận và bộ phận kinh doanh sẽ phản hồi ngay khi làm việc trở lại.</p>
<p>Quý khách có kế hoạch nhập hàng cho mùa mới, vui lòng liên hệ bộ phận kinh doanh sớm để được tư vấn lịch sản xuất phù hợp.</p>
<p>Trân trọng cảm ơn Quý khách đã đồng hành cùng BFC trong năm qua.</p>`,
    },
    en: {
      title: "Lunar New Year 2027 holiday schedule and delivery plan",
      excerpt:
        "Our production, container loading and holiday plan around Lunar New Year 2027, so you can schedule your orders in good time.",
      body: `<p>Dear customers and partners,</p>
<p>Lunar New Year (Tet) is the longest holiday of the year in Vietnam. To keep your orders on track, BFC would like to share our production and shipping plan around the 2027 holiday.</p>
<h2>Production before the holiday</h2>
<ul>
<li>Orders confirmed early are given priority for production and container loading before the break.</li>
<li>Orders confirmed after the cut-off date go into production as soon as the factory reopens.</li>
<li>Our sales team will send each customer the exact cut-off and loading dates.</li>
</ul>
<h2>During the holiday</h2>
<p>The factory and office close in line with the national Tet holiday. Emails are still received and our sales team will reply as soon as we are back.</p>
<p>If you are planning orders for the new season, please contact our sales team early so we can find the right production slot for you.</p>
<p>Thank you for working with BFC this year.</p>`,
    },
  },
  {
    slug: "don-doan-khach-hang-tham-quan-nha-may",
    kind: "news",
    date: "2026-10-28",
    cover: "/Assets/Slideshow_1_6.jpg",
    vi: {
      title: "Đón đoàn khách hàng tham quan nhà máy và xưởng mẫu",
      excerpt:
        "Đoàn khách hàng nhập khẩu đến thăm nhà máy, đi qua các xưởng gỗ, nhôm, đan dây và làm việc trực tiếp với đội phát triển mẫu.",
      body: `<p>Tuần qua, BFC đón một đoàn khách hàng nhập khẩu nội thất ngoài trời đến thăm nhà máy. Đây là dịp để khách hàng tận mắt xem quy trình làm ra sản phẩm mà họ đang đặt hàng.</p>
<h2>Đi qua từng công đoạn</h2>
<p>Đoàn bắt đầu từ kho gỗ và xưởng sơ chế, đi tiếp qua xưởng hàn nhôm, xưởng đan dây và khu hoàn thiện. Ở mỗi xưởng, tổ trưởng giới thiệu cách kiểm tra chất lượng tại công đoạn đó và những lỗi thường gặp cần tránh.</p>
<h2>Làm việc tại xưởng mẫu</h2>
<p>Buổi chiều, khách hàng làm việc với đội phát triển mẫu về các thiết kế cho mùa hàng tới: chọn màu khung, kiểu dây đan và vải nệm, góp ý trực tiếp lên mẫu thử. Những điều chỉnh được ghi lại để làm mẫu chỉnh sửa ngay sau buổi làm việc.</p>
<p>BFC luôn sẵn sàng đón khách hàng đến thăm nhà máy. Quý khách muốn đặt lịch tham quan, vui lòng liên hệ bộ phận kinh doanh.</p>`,
    },
    en: {
      title: "Welcoming customers on a factory and sample room visit",
      excerpt:
        "A group of importers toured our wood, aluminium and rope workshops and worked directly with our sample development team.",
      body: `<p>Last week BFC welcomed a group of outdoor furniture importers to our factory. It was a chance for them to see first hand how the products they order are made.</p>
<h2>Through every stage</h2>
<p>The visit started at the timber yard and wood preparation workshop, then moved on to aluminium welding, rope weaving and finishing. In each workshop the team leader explained the quality checks at that stage and the common defects we work to prevent.</p>
<h2>In the sample room</h2>
<p>In the afternoon our guests worked with the sample development team on designs for the coming season: choosing frame colours, weave patterns and cushion fabrics, and commenting directly on the prototypes. Every change was noted so revised samples could start right after the meeting.</p>
<p>Customers are always welcome at our factory. To book a visit, please contact our sales team.</p>`,
    },
  },
  {
    slug: "dien-tap-phong-chay-chua-chay-dinh-ky",
    kind: "news",
    date: "2026-10-20",
    cover: "/Assets/Slideshow_1_3.jpg",
    vi: {
      title: "Diễn tập phòng cháy chữa cháy định kỳ tại nhà máy",
      excerpt:
        "Toàn bộ người lao động tham gia buổi diễn tập thoát nạn và chữa cháy ban đầu, phối hợp cùng lực lượng PCCC địa phương.",
      body: `<p>Nhà máy nội thất làm việc hằng ngày với gỗ, sơn, vải và mút xốp, nên phòng cháy chữa cháy luôn là việc được đặt lên hàng đầu. BFC vừa tổ chức buổi diễn tập PCCC định kỳ với sự tham gia của toàn bộ người lao động.</p>
<h2>Nội dung diễn tập</h2>
<ul>
<li>Báo động và thoát nạn theo lối thoát hiểm của từng xưởng, tập trung tại điểm an toàn.</li>
<li>Đội PCCC cơ sở thực hành chữa cháy ban đầu bằng bình chữa cháy và hệ thống họng nước.</li>
<li>Sơ cứu và đưa người bị nạn ra khỏi khu vực giả định có cháy.</li>
</ul>
<p>Buổi diễn tập có sự hướng dẫn của lực lượng PCCC địa phương. Sau buổi diễn tập, các xưởng rà soát lại lối thoát hiểm, biển báo và vị trí bình chữa cháy, đặc biệt ở khu sơn và kho vật tư.</p>
<p>An toàn của người lao động là nền tảng để nhà máy sản xuất ổn định và giao hàng đúng hẹn.</p>`,
    },
    en: {
      title: "Routine fire drill at the factory",
      excerpt:
        "All staff took part in an evacuation and first response fire drill, together with the local fire service.",
      body: `<p>A furniture factory works every day with timber, coatings, fabric and foam, so fire safety is always a top priority. BFC has just held its routine fire drill with every member of staff taking part.</p>
<h2>What the drill covered</h2>
<ul>
<li>Raising the alarm and evacuating along each workshop's escape route to the assembly point.</li>
<li>The in-house fire team practising first response with extinguishers and hose reels.</li>
<li>First aid and moving casualties out of the simulated fire area.</li>
</ul>
<p>The drill was guided by the local fire service. Afterwards each workshop reviewed its escape routes, signage and extinguisher positions, with special attention to the paint line and material stores.</p>
<p>Keeping our people safe is the basis for steady production and on-time delivery.</p>`,
    },
  },
  {
    slug: "tuyen-dung-cong-nhan-san-xuat",
    kind: "notice",
    date: "2026-10-12",
    cover: "/Assets/Slideshow_Alu_3.JPG",
    vi: {
      title: "Thông báo tuyển dụng công nhân sản xuất và tổ trưởng",
      excerpt:
        "BFC tuyển công nhân cho các xưởng gỗ, nhôm, đan dây, hoàn thiện và tổ trưởng sản xuất, nhận cả người chưa có kinh nghiệm.",
      body: `<p>Để chuẩn bị cho mùa hàng mới, BFC cần tuyển thêm người lao động cho nhiều vị trí trong nhà máy.</p>
<h2>Vị trí tuyển dụng</h2>
<ul>
<li>Công nhân xưởng gỗ: cắt, bào, lắp ráp khung.</li>
<li>Công nhân xưởng nhôm: hàn, mài, lắp ráp.</li>
<li>Công nhân đan dây và đan mây nhựa.</li>
<li>Công nhân hoàn thiện, đóng gói.</li>
<li>Tổ trưởng sản xuất có kinh nghiệm quản lý tổ.</li>
</ul>
<h2>Quyền lợi</h2>
<ul>
<li>Nhận người chưa có kinh nghiệm, được tổ trưởng kèm cặp tại xưởng.</li>
<li>Đóng bảo hiểm đầy đủ theo quy định, khám sức khỏe định kỳ.</li>
<li>Lương thưởng theo năng lực, tăng ca có phụ cấp.</li>
</ul>
<h2>Cách ứng tuyển</h2>
<p>Người lao động nộp hồ sơ trực tiếp tại phòng nhân sự ở cổng nhà máy trong giờ hành chính, hoặc liên hệ qua số điện thoại trên website để được hướng dẫn.</p>`,
    },
    en: {
      title: "We are hiring production workers and team leaders",
      excerpt:
        "BFC is recruiting for the wood, aluminium, weaving and finishing workshops, plus production team leaders. No experience needed for most roles.",
      body: `<p>To prepare for the new season, BFC is hiring for several roles in the factory.</p>
<h2>Open positions</h2>
<ul>
<li>Wood workshop: cutting, planing and frame assembly.</li>
<li>Aluminium workshop: welding, grinding and assembly.</li>
<li>Rope and synthetic wicker weaving.</li>
<li>Finishing and packing.</li>
<li>Production team leaders with experience running a team.</li>
</ul>
<h2>What we offer</h2>
<ul>
<li>No experience needed: you will be trained on the job by your team leader.</li>
<li>Full statutory insurance and regular health checks.</li>
<li>Pay based on skill, with overtime allowances.</li>
</ul>
<h2>How to apply</h2>
<p>Apply in person at the HR office by the factory gate during office hours, or call the number on our website for help.</p>`,
    },
  },
  {
    slug: "mau-noi-that-ngoai-troi-mua-moi",
    kind: "news",
    date: "2026-09-30",
    cover: "/Assets/Slideshow_Teak_2.jpg",
    vi: {
      title: "Ra mắt các mẫu nội thất ngoài trời cho mùa hàng mới",
      excerpt:
        "Đội phát triển mẫu hoàn thiện loạt thiết kế mới kết hợp gỗ teak, khung nhôm và dây đan, sẵn sàng gửi mẫu cho khách hàng.",
      body: `<p>Sau nhiều tháng phát triển, đội mẫu của BFC đã hoàn thiện loạt thiết kế nội thất ngoài trời mới cho mùa hàng tới.</p>
<h2>Điểm mới của loạt mẫu</h2>
<ul>
<li>Kết hợp tay vịn gỗ teak với khung nhôm sơn tĩnh điện, nhẹ và bền ngoài trời.</li>
<li>Kiểu đan dây mới cho lưng ghế, nhiều lựa chọn màu dây.</li>
<li>Bộ sofa và bàn ăn có thể ghép linh hoạt theo không gian.</li>
</ul>
<h2>Từ bản vẽ tới mẫu thật</h2>
<p>Mỗi mẫu đều qua các bước làm mẫu thử, ngồi thử, chỉnh kích thước và kiểm tra độ bền trước khi đưa vào danh mục. Quy cách đóng gói cũng được tính từ đầu để tối ưu số lượng xếp container.</p>
<p>Khách hàng quan tâm có thể xem các mẫu tại xưởng mẫu của nhà máy hoặc liên hệ bộ phận kinh doanh để nhận hình ảnh và thông số chi tiết.</p>`,
    },
    en: {
      title: "New outdoor furniture designs for the coming season",
      excerpt:
        "Our sample team has finished a new range combining teak, aluminium frames and rope weaving, ready to sample for customers.",
      body: `<p>After months of development, the BFC sample team has finished a new range of outdoor furniture for the coming season.</p>
<h2>What is new</h2>
<ul>
<li>Teak armrests on powder coated aluminium frames: light and durable outdoors.</li>
<li>A new rope weave for chair backs, with a wide choice of rope colours.</li>
<li>Sofa and dining sets that can be combined to fit the space.</li>
</ul>
<h2>From drawing to real sample</h2>
<p>Every design goes through prototyping, sit testing, dimension adjustment and durability checks before it joins the range. Packing is planned from the start to make the most of each container.</p>
<p>Customers are welcome to see the new designs in our sample room, or contact our sales team for photos and full specifications.</p>`,
    },
  },
  {
    slug: "kham-suc-khoe-dinh-ky-nguoi-lao-dong",
    kind: "news",
    date: "2026-09-18",
    cover: "/Assets/Slideshow_1_8.jpg",
    vi: {
      title: "Khám sức khỏe định kỳ cho người lao động",
      excerpt:
        "BFC phối hợp với đơn vị y tế tổ chức khám sức khỏe định kỳ ngay tại nhà máy cho toàn bộ người lao động.",
      body: `<p>Như mọi năm, BFC phối hợp cùng một đơn vị y tế tổ chức khám sức khỏe định kỳ cho người lao động ngay tại nhà máy.</p>
<h2>Khám tại chỗ, không ảnh hưởng công việc</h2>
<p>Lịch khám được chia theo từng xưởng và từng ca để người lao động không phải đi xa và sản xuất vẫn diễn ra bình thường. Nội dung khám gồm khám tổng quát, đo thị lực, thính lực và các xét nghiệm cơ bản.</p>
<h2>Quan tâm tới người làm ở khu đặc thù</h2>
<p>Người lao động ở khu sơn, khu chà nhám và xưởng hàn được khám thêm các hạng mục phù hợp với môi trường làm việc. Kết quả khám là căn cứ để nhà máy tiếp tục cải thiện bảo hộ lao động và điều kiện làm việc tại từng xưởng.</p>
<p>Sức khỏe của người lao động là điều BFC luôn quan tâm.</p>`,
    },
    en: {
      title: "Annual health checks for our staff",
      excerpt:
        "BFC worked with a medical provider to run on-site health checks for everyone at the factory.",
      body: `<p>As every year, BFC worked with a medical provider to run health checks for our staff right at the factory.</p>
<h2>On site, without disrupting work</h2>
<p>Appointments were scheduled by workshop and shift, so nobody had to travel and production carried on as normal. The checks covered a general examination, eyesight, hearing and basic tests.</p>
<h2>Extra care for specialised areas</h2>
<p>Staff working on the paint line, in sanding and in welding received additional checks suited to their work environment. The results help us keep improving protective equipment and working conditions in each workshop.</p>
<p>The health of our people always comes first at BFC.</p>`,
    },
  },
  {
    slug: "ngay-hoi-the-thao-bfc",
    kind: "news",
    date: "2026-09-05",
    cover: "/Assets/Slideshow_1_9.jpg",
    vi: {
      title: "Ngày hội thể thao và gắn kết của người lao động BFC",
      excerpt:
        "Các xưởng tranh tài bóng đá, kéo co và trò chơi tập thể trong ngày hội thể thao, kết thúc bằng bữa liên hoan chung.",
      body: `<p>Cuối tuần qua, sân nhà máy rộn ràng với ngày hội thể thao do công đoàn BFC tổ chức. Người lao động từ các xưởng và khối văn phòng cùng tham gia, nhiều gia đình đưa con em đến cổ vũ.</p>
<h2>Các nội dung thi đấu</h2>
<ul>
<li>Bóng đá mini giữa các xưởng.</li>
<li>Kéo co, nhảy bao bố và chạy tiếp sức.</li>
<li>Trò chơi tập thể cho các đội ghép giữa xưởng và văn phòng.</li>
</ul>
<p>Ngày hội khép lại bằng phần trao giải và bữa liên hoan chung. Đây là dịp để mọi người gặp gỡ đồng nghiệp ngoài giờ làm, hiểu nhau hơn và phối hợp tốt hơn trong công việc hằng ngày.</p>
<p>Cảm ơn công đoàn và các bạn tình nguyện viên đã chuẩn bị cho một ngày thật vui.</p>`,
    },
    en: {
      title: "BFC sports day brings the team together",
      excerpt:
        "Workshops competed in football, tug of war and team games at our sports day, followed by a shared meal.",
      body: `<p>Last weekend the factory grounds came alive with the sports day organised by the BFC trade union. Staff from every workshop and the office took part, and many brought their families along to cheer.</p>
<h2>The events</h2>
<ul>
<li>Five a side football between workshops.</li>
<li>Tug of war, sack races and relay races.</li>
<li>Team games with mixed teams from the workshops and the office.</li>
</ul>
<p>The day ended with prizes and a meal together. It was a chance to meet colleagues outside work, get to know each other better and work together more smoothly every day.</p>
<p>Thank you to the union and our volunteers for preparing such a fun day.</p>`,
    },
  },
  {
    slug: "bfc-tham-gia-hoi-cho-noi-that-quoc-te",
    kind: "news",
    date: "2026-08-22",
    cover: "/Assets/Slideshow_Wicker_4.jpg",
    vi: {
      title: "BFC tham gia hội chợ nội thất quốc tế",
      excerpt:
        "Gian hàng BFC giới thiệu các mẫu ngoài trời bằng gỗ teak, nhôm và dây đan, gặp gỡ khách hàng cũ và nhiều nhà nhập khẩu mới.",
      body: `<p>BFC vừa tham gia một hội chợ nội thất quốc tế dành cho các nhà nhập khẩu và nhà bán lẻ. Đây là dịp để chúng tôi giới thiệu năng lực sản xuất và các mẫu mới tới khách hàng.</p>
<h2>Tại gian hàng</h2>
<p>Gian hàng trưng bày các bộ sofa, bàn ăn và ghế thư giãn ngoài trời kết hợp gỗ teak, khung nhôm và dây đan. Khách tham quan có thể ngồi thử, xem cận chất liệu và mẫu màu hoàn thiện.</p>
<h2>Gặp gỡ khách hàng</h2>
<p>Đội kinh doanh đã gặp lại nhiều khách hàng lâu năm và làm quen với các nhà nhập khẩu mới quan tâm tới sản xuất OEM. Các yêu cầu báo giá và mẫu thử sau hội chợ đang được đội ngũ xử lý.</p>
<p>Cảm ơn Quý khách đã ghé thăm gian hàng BFC. Quý khách chưa kịp trao đổi tại hội chợ, vui lòng liên hệ với chúng tôi qua trang Liên hệ.</p>`,
    },
    en: {
      title: "BFC at an international furniture fair",
      excerpt:
        "Our booth showed outdoor designs in teak, aluminium and rope, meeting long term customers and many new importers.",
      body: `<p>BFC has just taken part in an international furniture fair for importers and retailers. It was a chance to present our production capabilities and new designs to buyers.</p>
<h2>At the booth</h2>
<p>We showed outdoor sofa sets, dining sets and lounge chairs combining teak, aluminium frames and rope weaving. Visitors could sit on the pieces and look closely at materials and finish samples.</p>
<h2>Meeting customers</h2>
<p>Our sales team caught up with many long term customers and met new importers interested in OEM production. Quote and sample requests from the fair are now being handled by the team.</p>
<p>Thank you for visiting the BFC booth. If we did not get the chance to talk at the fair, please reach us through our Contact page.</p>`,
    },
  },
  {
    slug: "thay-doi-gio-lam-viec-khoi-van-phong",
    kind: "notice",
    date: "2026-08-10",
    cover: "/Assets/Landing.jpg",
    vi: {
      title: "Thông báo thay đổi giờ làm việc khối văn phòng",
      excerpt:
        "Khối văn phòng điều chỉnh giờ làm việc để khớp với ca sản xuất và thuận tiện trao đổi với khách hàng ở nhiều múi giờ.",
      body: `<p>Kính gửi Quý khách hàng và đối tác,</p>
<p>Để phối hợp tốt hơn với các ca sản xuất và thuận tiện trao đổi với khách hàng ở nhiều múi giờ, khối văn phòng BFC điều chỉnh giờ làm việc kể từ tháng này.</p>
<h2>Những điểm thay đổi</h2>
<ul>
<li>Giờ bắt đầu làm việc buổi sáng sớm hơn, trùng với giờ vào ca của nhà máy.</li>
<li>Bộ phận kinh doanh bố trí người trực để trả lời email của khách hàng châu Âu và châu Mỹ.</li>
<li>Giờ nhận hàng mẫu và tài liệu tại cổng nhà máy không thay đổi.</li>
</ul>
<p>Giờ làm việc cụ thể được cập nhật ở chân trang website. Mọi yêu cầu gửi qua email hoặc biểu mẫu liên hệ vẫn được tiếp nhận và phản hồi trong ngày làm việc.</p>
<p>Trân trọng.</p>`,
    },
    en: {
      title: "Change to office working hours",
      excerpt:
        "Our office has adjusted its working hours to match production shifts and to make it easier to talk with customers in other time zones.",
      body: `<p>Dear customers and partners,</p>
<p>To work more closely with our production shifts and make it easier to talk with customers in different time zones, the BFC office has adjusted its working hours from this month.</p>
<h2>What changes</h2>
<ul>
<li>The office opens earlier in the morning, in line with the start of the factory shift.</li>
<li>The sales team has staff on duty to answer emails from customers in Europe and the Americas.</li>
<li>Hours for receiving samples and documents at the factory gate stay the same.</li>
</ul>
<p>Our exact working hours are shown in the website footer. Requests sent by email or through the contact form are still received and answered within the working day.</p>
<p>Kind regards.</p>`,
    },
  },
  {
    slug: "tap-huan-an-toan-lao-dong-va-5s",
    kind: "news",
    date: "2026-07-25",
    cover: "/Assets/Slideshow_Rope_3.jpg",
    vi: {
      title: "Tập huấn an toàn lao động và 5S tại các xưởng",
      excerpt:
        "Người lao động được tập huấn an toàn máy móc, bảo hộ cá nhân và cách sắp xếp nơi làm việc gọn gàng theo 5S.",
      body: `<p>BFC vừa tổ chức đợt tập huấn an toàn lao động và 5S cho người lao động ở tất cả các xưởng.</p>
<h2>An toàn khi vận hành máy</h2>
<p>Người lao động được hướng dẫn lại cách vận hành an toàn máy cưa, máy bào, máy hàn và máy chà nhám, cách dùng đúng đồ bảo hộ như kính, khẩu trang, găng tay và nút tai chống ồn.</p>
<h2>Nơi làm việc gọn gàng theo 5S</h2>
<p>Phần 5S tập trung vào sàng lọc, sắp xếp, sạch sẽ, săn sóc và sẵn sàng. Mỗi tổ tự rà soát khu vực của mình, đánh dấu vị trí dụng cụ và vật tư để dễ tìm, dễ kiểm.</p>
<p>Xưởng gọn gàng giúp giảm tai nạn, giảm hư hỏng bán thành phẩm và giữ chất lượng ổn định cho từng đơn hàng. Ban quản lý sẽ đi kiểm tra định kỳ và ghi nhận những tổ làm tốt.</p>`,
    },
    en: {
      title: "Safety and 5S training across our workshops",
      excerpt:
        "Staff were trained on machine safety, personal protective equipment and keeping a tidy workplace with 5S.",
      body: `<p>BFC has just run a round of health and safety and 5S training for staff in every workshop.</p>
<h2>Working safely with machines</h2>
<p>Staff went through safe operation of saws, planers, welders and sanders again, and the correct use of protective equipment such as safety glasses, masks, gloves and ear plugs.</p>
<h2>A tidy workplace with 5S</h2>
<p>The 5S session covered sort, set in order, shine, standardise and sustain. Each team reviewed its own area and marked places for tools and materials so they are easy to find and check.</p>
<p>A tidy workshop means fewer accidents, less damage to parts in progress and steady quality on every order. Management will carry out regular checks and recognise the teams that do well.</p>`,
    },
  },
];

/** Khối minh hoạ thêm sau phần chữ của vài bài */
const demoBlocks: Record<string, MockBlock[]> = {
  "don-doan-khach-hang-tham-quan-nha-may": [
    {
      type: "gallery",
      layout: "grid-3",
      images: [
        {
          image: "/Assets/Slideshow_1_3.jpg",
          caption: { vi: "Xưởng gỗ", en: "Wood workshop" },
        },
        {
          image: "/Assets/Slideshow_Alu_4.jpg",
          caption: { vi: "Xưởng hàn nhôm", en: "Aluminium welding" },
        },
        {
          image: "/Assets/Slideshow_Rope_4.jpg",
          caption: { vi: "Xưởng đan dây", en: "Rope weaving" },
        },
      ],
      caption: {
        vi: "Các xưởng đoàn khách đi qua trong buổi tham quan",
        en: "The workshops our guests visited",
      },
    },
    {
      type: "button",
      label: { vi: "Đặt lịch tham quan", en: "Book a factory visit" },
      url: "/contact",
    },
  ],
  "mau-noi-that-ngoai-troi-mua-moi": [
    {
      type: "image_text",
      image: "/Assets/Slideshow_Wicker_5.jpg",
      imagePosition: "right",
      heading: { vi: "Kết hợp nhiều chất liệu", en: "Mixing materials" },
      html: {
        vi: "<p>Loạt mẫu mới phối gỗ teak với khung nhôm sơn tĩnh điện và dây đan, để cùng một bộ sản phẩm có thể chọn nhiều màu khung và kiểu đan khác nhau.</p>",
        en: "<p>The new range pairs teak with powder coated aluminium frames and rope weaving, so the same set can be ordered in different frame colours and weave patterns.</p>",
      },
    },
    {
      type: "gallery",
      layout: "grid-2",
      images: [
        { image: "/Assets/Slideshow_Teak_4.JPG" },
        { image: "/Assets/Slideshow_Alu_5.jpg" },
      ],
    },
  ],
  "kham-suc-khoe-dinh-ky-nguoi-lao-dong": [
    {
      type: "table",
      columns: {
        vi: ["Nhóm người lao động", "Nội dung khám"],
        en: ["Staff group", "Checks"],
      },
      rows: {
        vi: [
          [
            "Tất cả người lao động",
            "Khám tổng quát, đo thị lực, thính lực, xét nghiệm cơ bản",
          ],
          [
            "Khu sơn, khu chà nhám, xưởng hàn",
            "Khám thêm các hạng mục phù hợp với môi trường làm việc",
          ],
        ],
        en: [
          ["All staff", "General examination, eyesight, hearing, basic tests"],
          [
            "Paint line, sanding, welding",
            "Additional checks suited to the work environment",
          ],
        ],
      },
      caption: { vi: "Nội dung khám theo nhóm", en: "Checks by staff group" },
    },
  ],
  "ngay-hoi-the-thao-bfc": [
    {
      type: "gallery",
      layout: "slider",
      images: [
        { image: "/Assets/Slideshow_1_7.jpg" },
        { image: "/Assets/Slideshow_1_10.jpg" },
        { image: "/Assets/Slideshow_1_8.jpg" },
        { image: "/Assets/Slideshow_1_9.jpg" },
      ],
      caption: { vi: "Ảnh minh hoạ", en: "Illustrative photos" },
    },
  ],
  "bfc-tham-gia-hoi-cho-noi-that-quoc-te": [
    {
      type: "image",
      image: "/Assets/Slideshow_Teak_3.jpg",
      size: "wide",
      caption: {
        vi: "Bộ sofa ngoài trời kết hợp gỗ teak và dây đan",
        en: "An outdoor sofa set combining teak and rope weaving",
      },
    },
    {
      type: "quote",
      quote: {
        vi: "Mỗi hội chợ là dịp để chúng tôi nghe trực tiếp khách hàng cần gì cho mùa hàng tới.",
        en: "Every fair is a chance to hear first hand what customers need for the coming season.",
      },
      author: "BFC",
      role: { vi: "Đội kinh doanh", en: "Sales team" },
    },
  ],
};

/** Slug từ tiêu đề, bỏ dấu tiếng Việt (cùng cách CMS tự tạo: apps/core/text.py slugify_text) */
export function slugify(text: string, max = 100): string {
  const slug = text
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  return cut.includes("-") ? cut.slice(0, cut.lastIndexOf("-")) : cut;
}

/** Slug từng ngôn ngữ của bài mẫu: bản Việt dùng `slug`, bản Anh tạo từ tiêu đề tiếng Anh */
export function mockSlugs(p: MockPost): { vi: string; en: string } {
  return { vi: p.slug, en: slugify(p.en.title) };
}

/** Toàn bộ khối của một bài: phần chữ (khối Đoạn văn) rồi khối minh hoạ nếu có */
export function mockBlocks(p: MockPost): MockBlock[] {
  return [
    { type: "paragraph", html: { vi: p.vi.body, en: p.en.body } },
    ...(demoBlocks[p.slug] ?? []),
  ];
}
