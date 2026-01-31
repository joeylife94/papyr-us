# 국제화 (i18n) 가이드

> 마지막 업데이트: 2026-02-01

Papyr.us의 다국어 지원 구현 가이드입니다.

## 목차

- [지원 언어](#지원-언어)
- [언어 감지](#언어-감지)
- [서버 사이드 사용법](#서버-사이드-사용법)
- [클라이언트 사이드 사용법](#클라이언트-사이드-사용법)
- [번역 추가](#번역-추가)

---

## 지원 언어

| 코드 | 언어 | 지역 |
|------|------|------|
| `en` | English | 미국/영국 |
| `ko` | 한국어 | 대한민국 |
| `ja` | 日本語 | 일본 |
| `zh` | 中文 | 중국 |
| `es` | Español | 스페인/중남미 |
| `de` | Deutsch | 독일 |
| `fr` | Français | 프랑스 |

---

## 언어 감지

언어는 다음 우선순위로 감지됩니다:

1. **쿼리 파라미터**: `?lang=ko`
2. **쿠키**: `lang=ko`
3. **Accept-Language 헤더**: `Accept-Language: ko-KR,ko;q=0.9,en;q=0.8`
4. **기본값**: `en`

### 사용자 언어 설정

```typescript
// 쿠키로 저장
res.cookie('lang', 'ko', { maxAge: 365 * 24 * 60 * 60 * 1000 });

// 쿼리 파라미터로 변경
GET /api/pages?lang=ko
```

---

## 서버 사이드 사용법

### 미들웨어 설정

```typescript
import { i18nMiddleware } from './services/i18n.js';

app.use(i18nMiddleware);
```

### 번역 함수 사용

```typescript
import { t, getTranslations } from './services/i18n.js';

// 단일 키 번역
const message = t('errors.notFound', 'ko');
// → "찾을 수 없습니다"

// 매개변수 포함
const greeting = t('common.welcome', 'ko', { name: '홍길동' });
// → "환영합니다, 홍길동님!"

// 전체 번역 객체
const translations = getTranslations('ko');
```

### API 응답에서 사용

```typescript
app.get('/api/pages/:id', (req, res) => {
  const lang = req.language || 'en'; // 미들웨어가 설정
  
  const page = await getPage(id);
  if (!page) {
    return res.status(404).json({
      error: t('errors.notFound', lang),
      code: 'PAGE_NOT_FOUND'
    });
  }
});
```

---

## 클라이언트 사이드 사용법

### 컨텍스트 설정

```tsx
// App.tsx
import { I18nProvider } from './contexts/i18n';

function App() {
  return (
    <I18nProvider defaultLanguage="ko">
      <Router />
    </I18nProvider>
  );
}
```

### 훅 사용

```tsx
import { useTranslation } from './hooks/useTranslation';

function MyComponent() {
  const { t, language, setLanguage } = useTranslation();

  return (
    <div>
      <h1>{t('pages.title')}</h1>
      <p>{t('common.welcome', { name: 'User' })}</p>
      
      <select 
        value={language} 
        onChange={(e) => setLanguage(e.target.value)}
      >
        <option value="en">English</option>
        <option value="ko">한국어</option>
        <option value="ja">日本語</option>
      </select>
    </div>
  );
}
```

### 언어 선택기 컴포넌트

```tsx
function LanguageSelector() {
  const { language, setLanguage, availableLanguages } = useTranslation();

  return (
    <select value={language} onChange={(e) => setLanguage(e.target.value)}>
      {availableLanguages.map(lang => (
        <option key={lang.code} value={lang.code}>
          {lang.nativeName}
        </option>
      ))}
    </select>
  );
}
```

---

## 번역 추가

### 번역 키 구조

```typescript
// server/services/i18n.ts
const translations = {
  en: {
    common: {
      welcome: 'Welcome, {{name}}!',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      loading: 'Loading...',
    },
    pages: {
      title: 'Pages',
      create: 'Create Page',
      edit: 'Edit Page',
      empty: 'No pages found',
    },
    errors: {
      notFound: 'Not found',
      unauthorized: 'Unauthorized',
      serverError: 'Server error occurred',
    },
  },
  ko: {
    common: {
      welcome: '환영합니다, {{name}}님!',
      save: '저장',
      cancel: '취소',
      delete: '삭제',
      loading: '로딩 중...',
    },
    pages: {
      title: '페이지',
      create: '페이지 생성',
      edit: '페이지 편집',
      empty: '페이지가 없습니다',
    },
    errors: {
      notFound: '찾을 수 없습니다',
      unauthorized: '권한이 없습니다',
      serverError: '서버 오류가 발생했습니다',
    },
  },
  // ... 다른 언어들
};
```

### 새 번역 키 추가

1. 모든 언어 파일에 동일한 키 추가
2. 영어(en)는 필수, 다른 언어는 점진적 추가 가능
3. 누락된 키는 영어로 폴백

```typescript
// 새 키 추가 예시
const translations = {
  en: {
    teams: {
      invite: 'Invite Member',
      leave: 'Leave Team',
    },
  },
  ko: {
    teams: {
      invite: '멤버 초대',
      leave: '팀 나가기',
    },
  },
  // ja, zh, es, de, fr도 추가...
};
```

---

## API 엔드포인트

### 지원 언어 목록

```
GET /api/i18n/languages

Response:
{
  "languages": [
    { "code": "en", "name": "English", "nativeName": "English" },
    { "code": "ko", "name": "Korean", "nativeName": "한국어" },
    ...
  ],
  "current": "ko"
}
```

### 번역 데이터 조회

```
GET /api/i18n/translations?lang=ko

Response:
{
  "language": "ko",
  "translations": {
    "common": { ... },
    "pages": { ... },
    ...
  }
}
```

### 언어 변경

```
POST /api/i18n/language

Body:
{ "language": "ko" }

Response:
{ "success": true, "language": "ko" }
```

---

## 날짜/시간 포맷

### 로케일별 날짜 포맷

```typescript
import { formatDate, formatRelativeTime } from './services/i18n.js';

// 날짜 포맷
formatDate(new Date(), 'ko');
// → "2026년 2월 1일"

formatDate(new Date(), 'en');
// → "February 1, 2026"

// 상대 시간
formatRelativeTime(new Date(Date.now() - 3600000), 'ko');
// → "1시간 전"

formatRelativeTime(new Date(Date.now() - 3600000), 'en');
// → "1 hour ago"
```

### 숫자 포맷

```typescript
import { formatNumber, formatCurrency } from './services/i18n.js';

formatNumber(1234567, 'ko');
// → "1,234,567"

formatNumber(1234567, 'de');
// → "1.234.567"
```

---

## 복수형 처리

```typescript
// 영어
t('items.count', 'en', { count: 1 });  // → "1 item"
t('items.count', 'en', { count: 5 });  // → "5 items"

// 한국어 (복수형 없음)
t('items.count', 'ko', { count: 1 });  // → "1개 항목"
t('items.count', 'ko', { count: 5 });  // → "5개 항목"
```

### 복수형 키 정의

```typescript
const translations = {
  en: {
    items: {
      count_one: '{{count}} item',
      count_other: '{{count}} items',
    },
  },
  ko: {
    items: {
      count: '{{count}}개 항목',  // 복수형 불필요
    },
  },
};
```

---

## 모범 사례

### 1. 키 네이밍 컨벤션

```
# 좋은 예
common.save
pages.createNew
errors.validation.required

# 피해야 할 예
btn1
save_button
ERROR_MSG
```

### 2. 매개변수 사용

```typescript
// 좋은 예
t('user.greeting', { name: userName });
// "Hello, {{name}}!"

// 피해야 할 예
`Hello, ${userName}!`  // 번역 불가
```

### 3. 문장 분리 금지

```typescript
// 좋은 예
t('status.pageCreated', { title: pageTitle });
// "Page '{{title}}' has been created."

// 피해야 할 예
t('status.page') + pageTitle + t('status.created');
// 어순이 다른 언어에서 문제 발생
```

### 4. HTML 포함 번역

```typescript
// 링크가 포함된 번역
const translations = {
  en: {
    help: 'Need help? <link>Contact us</link>',
  },
};

// 렌더링
<Trans
  i18nKey="help"
  components={{ link: <a href="/contact" /> }}
/>
```
