import { isValidPageIcon } from '../../../shared/page-icon';

/** One emoji the icon picker offers (#103 E4). `name` is the Korean label screen readers hear. */
export interface EmojiEntry {
  emoji: string;
  name: string;
  /** Korean and English search terms, lower case. */
  keywords: readonly string[];
}

const e = (emoji: string, name: string, keywords: string): EmojiEntry => ({
  emoji,
  name,
  keywords: keywords.split(',').map((keyword) => keyword.trim()),
});

/**
 * A curated set of common emojis for page icons, grouped loosely by use: documents and work
 * first, then status, people, nature, food, activities, places and flags.
 */
export const EMOJI_CATALOG: readonly EmojiEntry[] = [
  // Documents and work
  e('📄', '문서', 'document, page, file, 페이지, 파일'),
  e('📝', '메모', 'memo, note, write, 노트, 작성, 기록'),
  e('📌', '압정', 'pin, pushpin, 고정, 핀'),
  e('📎', '클립', 'paperclip, attach, 첨부'),
  e('📁', '폴더', 'folder, directory, 디렉터리'),
  e('📂', '열린 폴더', 'open folder, folder, 폴더'),
  e('🗂️', '분류', 'index dividers, organize, 정리'),
  e('📚', '책', 'books, library, docs, 도서관, 문서'),
  e('📖', '펼친 책', 'open book, read, guide, 읽기, 가이드'),
  e('📓', '공책', 'notebook, 노트'),
  e('📒', '장부', 'ledger, 회계'),
  e('📋', '클립보드', 'clipboard, checklist, 체크리스트'),
  e('📅', '달력', 'calendar, date, schedule, 일정, 날짜'),
  e('🗓️', '일정표', 'spiral calendar, planner, 일정, 계획'),
  e('⏰', '알람', 'alarm, clock, deadline, 시계, 마감'),
  e('⏳', '모래시계', 'hourglass, wait, 대기, 시간'),
  e('📊', '막대 그래프', 'bar chart, stats, report, 차트, 통계, 보고서'),
  e('📈', '상승 그래프', 'chart increasing, growth, trend, 상승, 성장'),
  e('📉', '하락 그래프', 'chart decreasing, decline, 하락'),
  e('🧮', '주판', 'abacus, calculate, 계산'),
  e('💼', '서류 가방', 'briefcase, work, business, 업무, 회사'),
  e('🏢', '회사', 'office, building, company, 사무실, 건물'),
  e('🗃️', '카드 상자', 'card file box, archive, 보관, 아카이브'),
  e('🗄️', '서류함', 'file cabinet, archive, 보관'),
  e('🔖', '북마크', 'bookmark, 책갈피'),
  e('🏷️', '태그', 'tag, label, 라벨'),
  e('✏️', '연필', 'pencil, edit, draft, 편집, 초안'),
  e('🖊️', '펜', 'pen, write, 쓰기'),
  e('🖋️', '만년필', 'fountain pen, sign, 서명'),
  e('✂️', '가위', 'scissors, cut, 자르기'),
  e('📏', '자', 'ruler, measure, 측정'),
  e('📐', '삼각자', 'triangular ruler, design, 설계'),
  e('🔍', '돋보기', 'magnifying glass, search, find, 검색, 찾기'),
  e('💡', '전구', 'light bulb, idea, tip, 아이디어, 팁'),
  e('🧠', '두뇌', 'brain, think, knowledge, 생각, 지식'),
  e('🎯', '과녁', 'target, goal, 목표'),
  e('🚀', '로켓', 'rocket, launch, release, 출시, 배포'),
  e('🔥', '불', 'fire, hot, urgent, 긴급, 인기'),
  e('⭐', '별', 'star, favorite, 즐겨찾기'),
  e('🌟', '빛나는 별', 'glowing star, highlight, 강조'),
  e('✨', '반짝임', 'sparkles, new, magic, 새로운'),
  e('⚡', '번개', 'lightning, fast, power, 빠른'),
  e('💬', '말풍선', 'speech balloon, chat, comment, 대화, 댓글'),
  e('💭', '생각 풍선', 'thought balloon, think, 생각'),
  e('📣', '확성기', 'megaphone, announce, 공지'),
  e('📢', '스피커', 'loudspeaker, announcement, 공지, 안내'),
  e('🔔', '종', 'bell, notification, 알림'),
  e('📬', '우편함', 'mailbox, inbox, 받은편지함'),
  e('✉️', '편지', 'envelope, mail, letter, 메일'),
  e('📧', '이메일', 'e-mail, email, 메일'),
  e('📞', '전화', 'telephone, call, 통화'),
  e('💻', '노트북', 'laptop, computer, dev, 컴퓨터, 개발'),
  e('🖥️', '데스크톱', 'desktop computer, monitor, 모니터'),
  e('⌨️', '키보드', 'keyboard, type, 입력'),
  e('🖱️', '마우스', 'computer mouse, click, 클릭'),
  e('📱', '휴대폰', 'mobile phone, app, 모바일, 앱'),
  e('🔒', '자물쇠', 'lock, secure, private, 보안, 비공개'),
  e('🔑', '열쇠', 'key, password, access, 비밀번호, 권한'),
  e('🛡️', '방패', 'shield, security, 보안'),
  e('⚙️', '톱니바퀴', 'gear, settings, config, 설정'),
  e('🔧', '렌치', 'wrench, tool, fix, 도구, 수리'),
  e('🔨', '망치', 'hammer, build, 빌드'),
  e('🛠️', '공구', 'hammer and wrench, tools, build, 도구'),
  e('🧪', '시험관', 'test tube, experiment, test, 실험, 테스트'),
  e('🔬', '현미경', 'microscope, research, 연구'),
  e('🧩', '퍼즐', 'puzzle piece, integration, plugin, 연동'),
  e('🐛', '벌레', 'bug, issue, 버그, 이슈'),
  e('📦', '상자', 'package, box, release, 패키지, 배포'),
  e('🔗', '링크', 'link, chain, url, 연결'),
  e('🧭', '나침반', 'compass, guide, direction, 방향'),
  e('🗺️', '지도', 'world map, map, roadmap, 로드맵'),
  e('🏁', '결승 깃발', 'chequered flag, finish, 완료, 결승'),
  e('🚩', '깃발', 'triangular flag, milestone, 마일스톤'),
  // Status and symbols
  e('✅', '완료', 'check mark button, done, complete, 체크'),
  e('☑️', '체크박스', 'check box, todo, 할 일, 체크'),
  e('✔️', '체크 표시', 'check mark, ok, 확인'),
  e('❌', '엑스', 'cross mark, no, cancel, 취소'),
  e('⚠️', '경고', 'warning, caution, 주의'),
  e('🚧', '공사 중', 'construction, wip, 작업 중'),
  e('🚫', '금지', 'prohibited, forbidden, 금지'),
  e('❓', '물음표', 'question, help, faq, 질문, 도움말'),
  e('❗', '느낌표', 'exclamation, important, 중요'),
  e('ℹ️', '정보', 'information, info, 안내'),
  e('➕', '더하기', 'plus, add, 추가'),
  e('♻️', '재활용', 'recycle, reuse, 반복'),
  e('🔄', '새로고침', 'arrows, sync, refresh, 동기화'),
  e('💯', '백점', 'hundred points, perfect, 완벽'),
  e('🎉', '축하', 'party popper, celebrate, tada, 파티'),
  e('🎁', '선물', 'gift, present, 선물'),
  e('🏆', '트로피', 'trophy, win, award, 우승'),
  e('🥇', '금메달', 'gold medal, first, 1등'),
  e('💰', '돈주머니', 'money bag, budget, 돈, 예산'),
  e('💳', '신용카드', 'credit card, payment, 결제'),
  e('🛒', '장바구니', 'shopping cart, shopping, 쇼핑'),
  e('❤️', '하트', 'red heart, love, like, 사랑, 좋아요'),
  e('🧡', '주황 하트', 'orange heart, 주황'),
  e('💛', '노란 하트', 'yellow heart, 노랑'),
  e('💚', '초록 하트', 'green heart, 초록'),
  e('💙', '파란 하트', 'blue heart, 파랑'),
  e('💜', '보라 하트', 'purple heart, 보라'),
  e('🖤', '검은 하트', 'black heart, 검정'),
  e('🔴', '빨간 원', 'red circle, 빨강'),
  e('🟡', '노란 원', 'yellow circle, 노랑'),
  e('🟢', '초록 원', 'green circle, 초록'),
  e('🔵', '파란 원', 'blue circle, 파랑'),
  // Faces and people
  e('😀', '웃는 얼굴', 'grinning face, smile, happy, 웃음, 미소, 행복'),
  e('😊', '미소', 'smiling face, blush, 웃음'),
  e('😂', '기쁨의 눈물', 'face with tears of joy, laugh, 웃음'),
  e('🥰', '사랑스러운 얼굴', 'smiling face with hearts, love, 사랑'),
  e('😎', '선글라스', 'sunglasses, cool, 멋진'),
  e('🤔', '생각하는 얼굴', 'thinking face, hmm, 생각, 고민'),
  e('😴', '잠자는 얼굴', 'sleeping face, sleep, 잠, 졸림'),
  e('😅', '식은땀', 'grinning face with sweat, 땀, 민망'),
  e('🥳', '파티 얼굴', 'partying face, party, 파티, 축하'),
  e('😭', '우는 얼굴', 'loudly crying face, sad, 울음, 슬픔'),
  e('🤯', '머리 폭발', 'exploding head, mind blown, 충격'),
  e('👍', '좋아요', 'thumbs up, like, ok, 엄지'),
  e('👏', '박수', 'clapping hands, applause, 박수'),
  e('🙌', '만세', 'raising hands, hooray, 만세'),
  e('🙏', '부탁', 'folded hands, please, thanks, 감사, 기도'),
  e('💪', '근육', 'flexed biceps, strong, 힘'),
  e('✋', '손바닥', 'raised hand, stop, 손'),
  e('👋', '손 흔들기', 'waving hand, hello, hi, 안녕, 인사'),
  e('🤝', '악수', 'handshake, deal, partner, 협력'),
  e('👀', '눈', 'eyes, look, review, 보기, 검토'),
  e('👤', '사람', 'bust in silhouette, person, user, profile, 사용자'),
  e('👥', '사람들', 'busts in silhouette, people, team, group, 팀, 그룹'),
  e('🧑‍💻', '개발자', 'technologist, developer, coder, 프로그래머'),
  e('👩‍💻', '여성 개발자', 'woman technologist, developer, 개발자'),
  e('🧑‍🎨', '디자이너', 'artist, designer, 예술가'),
  e('🧑‍🏫', '선생님', 'teacher, education, 교육'),
  e('🧑‍🔬', '과학자', 'scientist, research, 연구'),
  e('🧑‍🤝‍🧑', '함께', 'people holding hands, together, 동료'),
  e('👶', '아기', 'baby, new, 신규'),
  // Animals and nature
  e('🐶', '강아지', 'dog, puppy, 개'),
  e('🐱', '고양이', 'cat, kitten, 냥이'),
  e('🐻', '곰', 'bear, 곰돌이'),
  e('🐼', '판다', 'panda, 판다'),
  e('🦊', '여우', 'fox, 여우'),
  e('🐰', '토끼', 'rabbit, bunny, 토끼'),
  e('🐸', '개구리', 'frog, 개구리'),
  e('🐧', '펭귄', 'penguin, 펭귄'),
  e('🦉', '부엉이', 'owl, wise, 지혜'),
  e('🐝', '꿀벌', 'honeybee, bee, busy, 벌'),
  e('🦄', '유니콘', 'unicorn, 유니콘'),
  e('🐳', '고래', 'whale, docker, 고래'),
  e('🌱', '새싹', 'seedling, grow, start, 시작, 성장'),
  e('🌳', '나무', 'tree, 나무'),
  e('🌵', '선인장', 'cactus, 선인장'),
  e('🍀', '네잎클로버', 'four leaf clover, luck, 행운'),
  e('🌸', '벚꽃', 'cherry blossom, spring, 봄, 꽃'),
  e('🌻', '해바라기', 'sunflower, flower, 꽃'),
  e('🍁', '단풍', 'maple leaf, autumn, 가을'),
  e('🌈', '무지개', 'rainbow, 무지개'),
  e('☀️', '해', 'sun, sunny, 맑음, 태양'),
  e('🌙', '달', 'crescent moon, night, 밤'),
  e('⛅', '구름', 'sun behind cloud, weather, 날씨'),
  e('❄️', '눈송이', 'snowflake, winter, 눈, 겨울'),
  e('🌊', '파도', 'water wave, ocean, sea, 바다'),
  e('🌍', '지구', 'globe, earth, world, global, 세계'),
  // Food and drink
  e('☕', '커피', 'hot beverage, coffee, 카페'),
  e('🍵', '차', 'teacup, tea, 녹차'),
  e('🍕', '피자', 'pizza, 피자'),
  e('🍔', '햄버거', 'hamburger, burger, 버거'),
  e('🍜', '라면', 'steaming bowl, ramen, noodles, 국수'),
  e('🍚', '밥', 'cooked rice, rice, 식사'),
  e('🍰', '케이크', 'shortcake, cake, 디저트'),
  e('🍎', '사과', 'red apple, apple, 과일'),
  e('🍓', '딸기', 'strawberry, 과일'),
  e('🍺', '맥주', 'beer mug, beer, 회식'),
  // Activities
  e('⚽', '축구', 'soccer ball, football, 공'),
  e('🏀', '농구', 'basketball, 공'),
  e('🎮', '게임', 'video game, game, 게임기'),
  e('🎨', '팔레트', 'artist palette, art, design, 미술, 디자인'),
  e('🎵', '음표', 'musical note, music, 음악'),
  e('🎬', '영화', 'clapper board, movie, film, 촬영'),
  e('📷', '카메라', 'camera, photo, 사진'),
  e('🎤', '마이크', 'microphone, talk, 발표'),
  e('🎓', '학사모', 'graduation cap, education, learn, 졸업, 학습'),
  e('🏃', '달리기', 'person running, sprint, 스프린트'),
  e('🧘', '명상', 'person in lotus position, meditation, yoga, 요가'),
  // Travel and places
  e('✈️', '비행기', 'airplane, travel, trip, 여행, 출장'),
  e('🚗', '자동차', 'automobile, car, 차'),
  e('🚲', '자전거', 'bicycle, bike, 자전거'),
  e('🏠', '집', 'house, home, 홈'),
  e('🏡', '정원 있는 집', 'house with garden, home, 집'),
  e('🏖️', '해변', 'beach with umbrella, vacation, 휴가'),
  e('⛰️', '산', 'mountain, hiking, 등산'),
  e('🏥', '병원', 'hospital, health, 건강'),
  e('🏫', '학교', 'school, 학교'),
  // Flags and keycaps
  e('🇰🇷', '대한민국', 'south korea, korea, flag, 한국, 국기'),
  e('🇺🇸', '미국', 'united states, usa, flag, 국기'),
  e('🇯🇵', '일본', 'japan, flag, 국기'),
  e('🏳️‍🌈', '무지개 깃발', 'rainbow flag, pride, 무지개'),
  e('1️⃣', '숫자 1', 'keycap one, number, 하나, 숫자'),
  e('2️⃣', '숫자 2', 'keycap two, number, 둘, 숫자'),
  e('3️⃣', '숫자 3', 'keycap three, number, 셋, 숫자'),
  e('#️⃣', '샵', 'keycap number sign, hash, 해시'),
];

/**
 * Catalog entries for a picker query, best matches first: names or keywords that start with the
 * query, then those that contain it. An empty query lists the whole catalog. A query that is
 * itself one emoji (typed or pasted, e.g. from the system emoji panel) is offered first, so any
 * emoji can be chosen, not only catalog ones.
 */
export function searchEmojis(
  query: string,
  catalog: readonly EmojiEntry[] = EMOJI_CATALOG
): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...catalog];

  const starts: EmojiEntry[] = [];
  const contains: EmojiEntry[] = [];
  for (const entry of catalog) {
    const terms = [entry.name.toLowerCase(), ...entry.keywords];
    if (entry.emoji === q || terms.some((term) => term.startsWith(q))) starts.push(entry);
    else if (terms.some((term) => term.includes(q))) contains.push(entry);
  }
  const results = [...starts, ...contains];

  const typed = query.trim();
  if (isValidPageIcon(typed) && !results.some((entry) => entry.emoji === typed)) {
    results.unshift({ emoji: typed, name: typed, keywords: [] });
  }
  return results;
}
