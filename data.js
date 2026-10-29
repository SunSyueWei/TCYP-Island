// 台中青少年 TCYP — 網站資料
// 更新行事曆：修改 EVENTS 即可，網站會自動計算「下一場」與「已結束」狀態。

export const SITE = {
  name: '台中青少年 TCYP',
  org: '台中市召會 青少年組',
  tagline: '一起認識主、享受召會生活，在同伴中成長。',
  updated: '2026-10-27',
  // 公開聯絡窗口（例如 LINE 官方帳號、Instagram、Email）。填入後會顯示在「第一次參加」與各活動中。
  // 例：{ label: 'LINE 官方帳號', url: 'https://lin.ee/xxxx' }
  contact: { label: 'Instagram @tc_yp', url: 'https://www.instagram.com/tc_yp/' },
  // 官方社群連結（顯示在上方列、首頁與文字版）
  links: [
    { icon: '📷', label: 'Instagram @tc_yp', url: 'https://www.instagram.com/tc_yp/' },
    { icon: '▶️', label: 'YouTube @tcyp479', url: 'https://www.youtube.com/@tcyp479' },
  ],
};

// 日期格式 YYYY-MM-DD；end 可省略（單日活動）
// status：'confirmed'（已確認）或 'tentative'（暫定，不顯示倒數）
// 選填：time、audience（適合對象）、signup（報名方式）、deadline（報名截止 YYYY-MM-DD）、fee（費用）
//       meet（集合）、prep（行前準備，陣列）、bring（攜帶物品，陣列）、plan（行程重點，陣列）、note（備註）
//       major: true（重大行動）：活動前 30 天起，網站會跳出「海嘯警報」並在上方顯示提醒條（alertDays 可改天數）
//       重大行動：寒暑假特會、中幹成全、福音聚會、弟兄姊妹之家試住週
// 順序不拘，網站會依日期排序
export const EVENTS = [
  { start: '2026-06-11', end: '2026-06-13', title: '高三畢業生特會暨畢業聚會', place: '南投魚池', audience: '高三畢業生', status: 'confirmed' },
  { start: '2026-06-21', title: '小六升國一迎新聚會', place: '各區自行舉辦', audience: '小六升國一學生與家長', status: 'confirmed' },
  { start: '2026-07-04', end: '2026-07-06', title: '青少年暑假特會', major: true, place: '新竹小叮噹科學園區、阿里山青年活動中心', audience: '國中生、高中生（國中組、高中組分開舉行）', status: 'confirmed' },
  { start: '2026-07-12', end: '2026-07-18', title: '全台高中一週成全訓練', place: '新竹、台南', audience: '高中生', status: 'confirmed' },
  { start: '2026-07-31', end: '2026-08-01', title: '小六升國一生命成長園', place: '復興大樓', audience: '小六升國一學生', status: 'confirmed' },
  { start: '2026-08-02', title: '得榮少年證書頒發聚會', place: '各照顧區', audience: '得榮少年與家長', status: 'confirmed' },
  { start: '2026-08-06', end: '2026-08-11', title: '青少年韓國親子相調', place: '韓國', audience: '青少年與家長', status: 'confirmed' },
  { start: '2026-08-30', title: '青少年期初特會暨小五六喜樂相調', time: '09:30–12:30', place: '復興大樓二樓', audience: '國中生、高中生、小五六學生', status: 'confirmed' },
  { start: '2026-10-02', title: '青少年福音聚會', major: true, time: '17:00–19:30', place: '復興大樓二樓', audience: '國中生、高中生，歡迎邀請同學朋友', status: 'confirmed' },
  {
    start: '2026-10-30', end: '2026-10-31', title: '秋季相調訪問之旅（新竹・台北）', status: 'confirmed',
    time: '兩天一夜', place: '新竹市召會、台北市召會',
    audience: '青少年', fee: '800 元', signup: '已報名者請依服事者發的行前通知準備',
    plan: ['和新竹、台北的青少年相調聚會', '參訪交通大學、運動相調'],
    note: '集合時間、地點與行前準備已另外通知報名者',
  },
  { start: '2026-12-11', end: '2026-12-12', title: '秋季青少年中幹成全', major: true, time: '週五 19:00 – 週六 15:00', place: '復興大樓', audience: '國中生、高中生', status: 'confirmed', note: '原訂 10/23–24，延期至 12/11–12；週六 13:00–15:00 為國高中分年級相調' },
  { start: '2027-01-30', end: '2027-02-01', title: '青少年寒假特會', major: true, place: '台南曾文青年活動中心', audience: '國中生、高中生', status: 'tentative', note: '日期以正式通啟為準' },
  // 弟兄姊妹之家試住週：日期確定後取消註解、填入日期
  // { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', title: '弟兄姊妹之家試住週', major: true, place: '弟兄之家、姊妹之家', audience: '高中弟兄、姊妹（經家長同意）', status: 'confirmed' },
];

// 校園排：day 0=日 1=一 … 6=六
// time 不確定時可省略，網站會顯示「時間請洽詢」
// place 只填公開場所（會所、復興大樓）；校內教室、聖徒家不填，網站會顯示「地點請洽服事者」
export const CAMPUS = [
  { area: '南一', name: '居仁國中排', day: 3, time: '17:30', place: '復興大樓' },
  { area: '南一', name: '光明國中排', day: 3, time: '17:30' },
  { area: '南一', name: '向上國中排', day: 5, time: '17:30' },
  { area: '南一', name: '臺中女中排', day: 1, time: '17:30' },
  { area: '南一', name: '明道中學排', day: 2, time: '17:30' },
  { area: '南二', name: '附農・大明・明德・家商排', day: 4, time: '17:30', place: '復興大樓' },
  { area: '南二', name: '臺中高工・僑泰中學排', day: 5, time: '17:10' },
  { area: '南三', name: '立人高中排', day: 2, time: '17:30', place: '大里會所' },
  { area: '南三', name: '興大附中排', day: 1, time: '17:30' },
  { area: '南三', name: '光正國中排', day: 3, time: '16:30' },
  { area: '北一', name: '東山中學排', day: 3, time: '17:30', place: '軍功會所' },
  { area: '北一', name: '潭子・潭秀國中排', day: 3, time: '16:05' },
  { area: '北一', name: '北新・崇德・三光國中排', day: 4, time: '17:10' },
  { area: '北二', name: '豐原高商排', day: 5, time: '16:30', place: '豐原會所' },
  { area: '北二', name: '豐南國中排', day: 3, time: '17:15' },
  { area: '北二', name: '東勢高工排', day: 5, time: '16:15', place: '東勢會所' },
  { area: '北二', name: '卓蘭中學排', day: 4, time: '12:30' },
  { area: '西一', name: '福科國中・中科實中排', day: 5, time: '17:20' },
  { area: '西一', name: '安和國中排', day: 3, time: '17:30' },
  { area: '西一', name: '東大附中排', day: 4, time: '17:00' },
  { area: '西二', name: '沙鹿高工・沙鹿國中排', day: 3, time: '17:30' },
  { area: '西二', name: '鹿寮・清水國中排', day: 4, time: '18:10' },
  { area: '中一', name: '臺中二中排', day: 4, time: '17:30' },
  { area: '中一', name: '五權國中排', day: 3, time: '17:30' },
  { area: '中二', name: '西苑國高中排', day: 3, time: '17:30' },
  { area: '中二', name: '嶺東中學排', day: 4, time: '17:30', place: '嶺東會所' },
  { area: '中二', name: '忠明中學排', day: 5, time: '17:30' },
  { area: '中二', name: '惠文中學排', day: 4, time: '17:20' },
  { area: '中三', name: '臺中一中排', day: 4, time: '17:15' },
  { area: '中三', name: '雙十國中排', day: 5, time: '17:15', place: '雙十會所' },
  { area: '中三', name: '中科新民排', day: 3, time: '17:30', place: '雙十會所' },
];

// 社區青少年排
// freq 填寫非每週的聚集（例如「每月一次」），這類排不會被算進「今天有聚集」
export const COMMUNITY = [
  { area: '南一', name: '大新區', day: 0, time: '17:00' },
  { area: '南一', name: '大新區（二七大區）', day: 5, place: '仁德會所' },
  { area: '南一', name: '向上區', day: 6, time: '12:00', freq: '每月一次' },
  { area: '南一', name: '崇光區', day: 6, time: '16:30' },
  { area: '南二', name: '忠孝區・復興區', day: 5, time: '19:30' },
  { area: '南三', name: '議會區', day: 6, place: '霧峰會所', freq: '兩週一次' },
  { area: '南三', name: '大里區', day: 5, time: '18:00', place: '大里會所' },
  { area: '南三', name: '光正區', day: 4, time: '17:00', place: '仁化會所' },
  { area: '南三', name: '勤益區', day: 5, time: '19:30' },
  { area: '北一', name: '東山區', day: 6, time: '19:00' },
  { area: '北一', name: '潭美區', day: 6, time: '19:00' },
  { area: '北二', name: '中雅區', day: 6, time: '16:00', place: '大雅會所' },
  { area: '北二', name: '西安區', day: 6, time: '20:00' },
  { area: '北二', name: '東勢石岡', day: 5, time: '18:00' },
  { area: '西一', name: '東海區', day: 6, time: '19:30' },
  { area: '西二', name: '頂街區', day: 5, time: '19:30', place: '大肚會所' },
  { area: '西二', name: '新美區', day: 6, time: '19:30' },
  { area: '中一', name: '立中區', day: 6, time: '19:30', place: '美德會所' },
  { area: '中一', name: '立中區（三五大區）', day: 5, time: '19:00', place: '美德會所' },
  { area: '中三', name: '北屯崇德區', day: 5, time: '20:00' },
  { area: '中三', name: '崇德區（六大區）', day: 6, time: '19:30' },
];

EVENTS.sort((a, b) => a.start.localeCompare(b.start));

// 得榮少年教育專案（台北市私立得榮社會福利基金會）
export const GLORY = {
  url: 'https://www.glory.org.tw',
  // 初次申請期間（每年兩次，月-日）；以基金會最新公告為準
  windows: [['05-01', '05-31'], ['11-15', '12-15']],
};
