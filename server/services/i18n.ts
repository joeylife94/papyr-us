/**
 * i18n (Internationalization) Service
 * 
 * Multi-language support for Papyr.us:
 * - Server-side translations for API responses
 * - Client-side translation loading
 * - Language detection and preference management
 */

import { Router, type Request, Response, NextFunction } from 'express';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import logger from './logger.js';

// Supported languages
export const SUPPORTED_LANGUAGES = ['en', 'ko', 'ja', 'zh', 'es', 'de', 'fr'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

// Language metadata
export const LANGUAGE_META: Record<SupportedLanguage, { name: string; nativeName: string; direction: 'ltr' | 'rtl' }> = {
  en: { name: 'English', nativeName: 'English', direction: 'ltr' },
  ko: { name: 'Korean', nativeName: '한국어', direction: 'ltr' },
  ja: { name: 'Japanese', nativeName: '日本語', direction: 'ltr' },
  zh: { name: 'Chinese', nativeName: '中文', direction: 'ltr' },
  es: { name: 'Spanish', nativeName: 'Español', direction: 'ltr' },
  de: { name: 'German', nativeName: 'Deutsch', direction: 'ltr' },
  fr: { name: 'French', nativeName: 'Français', direction: 'ltr' },
};

// Translation namespaces
export type TranslationNamespace = 'common' | 'auth' | 'pages' | 'teams' | 'errors' | 'notifications';

// Translation store
const translations = new Map<string, Record<string, any>>();

/**
 * Load translations from files
 */
export function loadTranslations(localesDir: string = join(process.cwd(), 'locales')): void {
  if (!existsSync(localesDir)) {
    logger.warn('Locales directory not found, using default translations', { localesDir });
    loadDefaultTranslations();
    return;
  }

  for (const lang of SUPPORTED_LANGUAGES) {
    const langDir = join(localesDir, lang);
    if (!existsSync(langDir)) {
      logger.debug(`Language directory not found: ${lang}`);
      continue;
    }

    const files = readdirSync(langDir).filter(f => f.endsWith('.json'));
    const langTranslations: Record<string, any> = {};

    for (const file of files) {
      try {
        const namespace = file.replace('.json', '');
        const content = readFileSync(join(langDir, file), 'utf-8');
        langTranslations[namespace] = JSON.parse(content);
      } catch (err) {
        logger.error('Failed to load translation file', { lang, file, error: err });
      }
    }

    translations.set(lang, langTranslations);
    logger.debug(`Loaded translations for ${lang}`, { namespaces: Object.keys(langTranslations) });
  }

  logger.info('Translations loaded', { languages: Array.from(translations.keys()) });
}

/**
 * Load default translations (English) if no files exist
 */
function loadDefaultTranslations(): void {
  const defaultTranslations: Record<string, any> = {
    common: {
      appName: 'Papyr.us',
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      search: 'Search',
      settings: 'Settings',
      home: 'Home',
      back: 'Back',
      next: 'Next',
      previous: 'Previous',
      close: 'Close',
      confirm: 'Confirm',
      yes: 'Yes',
      no: 'No',
      ok: 'OK',
    },
    auth: {
      login: 'Log In',
      logout: 'Log Out',
      register: 'Sign Up',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      forgotPassword: 'Forgot Password?',
      resetPassword: 'Reset Password',
      loginWithGoogle: 'Continue with Google',
      loginWithGithub: 'Continue with GitHub',
      loginWithSSO: 'Continue with SSO',
      invalidCredentials: 'Invalid email or password',
      emailRequired: 'Email is required',
      passwordRequired: 'Password is required',
      passwordTooShort: 'Password must be at least 8 characters',
      emailAlreadyExists: 'An account with this email already exists',
      accountCreated: 'Account created successfully',
    },
    pages: {
      newPage: 'New Page',
      untitled: 'Untitled',
      lastEdited: 'Last edited',
      createdAt: 'Created',
      pageNotFound: 'Page not found',
      pageDeleted: 'Page deleted',
      pageCreated: 'Page created',
      pageSaved: 'Page saved',
      shareSettings: 'Share Settings',
      publicPage: 'Public page',
      privatePage: 'Private page',
      copyLink: 'Copy link',
      linkCopied: 'Link copied to clipboard',
    },
    teams: {
      createTeam: 'Create Team',
      teamName: 'Team Name',
      teamMembers: 'Team Members',
      addMember: 'Add Member',
      removeMember: 'Remove Member',
      owner: 'Owner',
      admin: 'Admin',
      member: 'Member',
      viewer: 'Viewer',
      leaveTeam: 'Leave Team',
      deleteTeam: 'Delete Team',
      teamSettings: 'Team Settings',
      inviteLink: 'Invite Link',
      pendingInvitations: 'Pending Invitations',
    },
    errors: {
      genericError: 'Something went wrong',
      networkError: 'Network error. Please check your connection.',
      unauthorized: 'You are not authorized to perform this action',
      forbidden: 'Access denied',
      notFound: 'Resource not found',
      serverError: 'Server error. Please try again later.',
      validationError: 'Please check your input',
      sessionExpired: 'Your session has expired. Please log in again.',
      rateLimitExceeded: 'Too many requests. Please slow down.',
    },
    notifications: {
      newComment: 'New comment on your page',
      pageShared: 'A page was shared with you',
      teamInvitation: 'You have been invited to join a team',
      mentionedInPage: 'You were mentioned in a page',
      taskAssigned: 'A task was assigned to you',
      taskCompleted: 'A task you created was completed',
      markAllRead: 'Mark all as read',
      noNotifications: 'No notifications',
    },
  };

  translations.set('en', defaultTranslations);
  
  // Korean translations
  const koTranslations: Record<string, any> = {
    common: {
      appName: 'Papyr.us',
      loading: '로딩 중...',
      save: '저장',
      cancel: '취소',
      delete: '삭제',
      edit: '수정',
      create: '생성',
      search: '검색',
      settings: '설정',
      home: '홈',
      back: '뒤로',
      next: '다음',
      previous: '이전',
      close: '닫기',
      confirm: '확인',
      yes: '예',
      no: '아니오',
      ok: '확인',
    },
    auth: {
      login: '로그인',
      logout: '로그아웃',
      register: '회원가입',
      email: '이메일',
      password: '비밀번호',
      confirmPassword: '비밀번호 확인',
      forgotPassword: '비밀번호를 잊으셨나요?',
      resetPassword: '비밀번호 재설정',
      loginWithGoogle: 'Google로 계속하기',
      loginWithGithub: 'GitHub로 계속하기',
      loginWithSSO: 'SSO로 계속하기',
      invalidCredentials: '이메일 또는 비밀번호가 올바르지 않습니다',
      emailRequired: '이메일을 입력해주세요',
      passwordRequired: '비밀번호를 입력해주세요',
      passwordTooShort: '비밀번호는 최소 8자 이상이어야 합니다',
      emailAlreadyExists: '이미 사용 중인 이메일입니다',
      accountCreated: '계정이 생성되었습니다',
    },
    pages: {
      newPage: '새 페이지',
      untitled: '제목 없음',
      lastEdited: '마지막 수정',
      createdAt: '생성일',
      pageNotFound: '페이지를 찾을 수 없습니다',
      pageDeleted: '페이지가 삭제되었습니다',
      pageCreated: '페이지가 생성되었습니다',
      pageSaved: '페이지가 저장되었습니다',
      shareSettings: '공유 설정',
      publicPage: '공개 페이지',
      privatePage: '비공개 페이지',
      copyLink: '링크 복사',
      linkCopied: '링크가 클립보드에 복사되었습니다',
    },
    teams: {
      createTeam: '팀 생성',
      teamName: '팀 이름',
      teamMembers: '팀원',
      addMember: '멤버 추가',
      removeMember: '멤버 제거',
      owner: '소유자',
      admin: '관리자',
      member: '멤버',
      viewer: '뷰어',
      leaveTeam: '팀 나가기',
      deleteTeam: '팀 삭제',
      teamSettings: '팀 설정',
      inviteLink: '초대 링크',
      pendingInvitations: '대기 중인 초대',
    },
    errors: {
      genericError: '문제가 발생했습니다',
      networkError: '네트워크 오류입니다. 연결을 확인해주세요.',
      unauthorized: '이 작업을 수행할 권한이 없습니다',
      forbidden: '접근이 거부되었습니다',
      notFound: '리소스를 찾을 수 없습니다',
      serverError: '서버 오류입니다. 잠시 후 다시 시도해주세요.',
      validationError: '입력값을 확인해주세요',
      sessionExpired: '세션이 만료되었습니다. 다시 로그인해주세요.',
      rateLimitExceeded: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    },
    notifications: {
      newComment: '페이지에 새 댓글이 달렸습니다',
      pageShared: '페이지가 공유되었습니다',
      teamInvitation: '팀에 초대되었습니다',
      mentionedInPage: '페이지에서 멘션되었습니다',
      taskAssigned: '작업이 할당되었습니다',
      taskCompleted: '생성한 작업이 완료되었습니다',
      markAllRead: '모두 읽음으로 표시',
      noNotifications: '알림이 없습니다',
    },
  };

  translations.set('ko', koTranslations);
}

/**
 * Get translation for a key
 */
export function t(
  lang: SupportedLanguage,
  namespace: TranslationNamespace,
  key: string,
  params?: Record<string, string | number>
): string {
  const langTranslations = translations.get(lang) || translations.get(DEFAULT_LANGUAGE);
  if (!langTranslations) {
    return key;
  }

  const namespaceTranslations = langTranslations[namespace];
  if (!namespaceTranslations) {
    // Fallback to default language
    const defaultTranslations = translations.get(DEFAULT_LANGUAGE);
    if (defaultTranslations?.[namespace]?.[key]) {
      return interpolate(defaultTranslations[namespace][key], params);
    }
    return key;
  }

  const value = namespaceTranslations[key];
  if (value === undefined) {
    // Fallback to default language
    const defaultTranslations = translations.get(DEFAULT_LANGUAGE);
    if (defaultTranslations?.[namespace]?.[key]) {
      return interpolate(defaultTranslations[namespace][key], params);
    }
    return key;
  }

  return interpolate(value, params);
}

/**
 * Interpolate parameters into translation string
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Detect language from request
 */
export function detectLanguage(req: Request): SupportedLanguage {
  // 1. Check query parameter
  const queryLang = req.query.lang || req.query.locale;
  if (queryLang && SUPPORTED_LANGUAGES.includes(queryLang as SupportedLanguage)) {
    return queryLang as SupportedLanguage;
  }

  // 2. Check cookie
  const cookieLang = req.cookies?.locale || req.cookies?.lang;
  if (cookieLang && SUPPORTED_LANGUAGES.includes(cookieLang as SupportedLanguage)) {
    return cookieLang as SupportedLanguage;
  }

  // 3. Check Accept-Language header
  const acceptLanguage = req.headers['accept-language'];
  if (acceptLanguage) {
    const preferredLanguages = acceptLanguage
      .split(',')
      .map(lang => {
        const [code, q = 'q=1'] = lang.trim().split(';');
        return {
          code: code.split('-')[0].toLowerCase(),
          quality: parseFloat(q.replace('q=', '')) || 1,
        };
      })
      .sort((a, b) => b.quality - a.quality);

    for (const pref of preferredLanguages) {
      if (SUPPORTED_LANGUAGES.includes(pref.code as SupportedLanguage)) {
        return pref.code as SupportedLanguage;
      }
    }
  }

  return DEFAULT_LANGUAGE;
}

/**
 * i18n middleware - adds language detection and translation helper to request
 */
export function i18nMiddleware(req: Request, res: Response, next: NextFunction): void {
  const lang = detectLanguage(req);
  
  // Add language and translation function to request
  (req as any).language = lang;
  (req as any).t = (namespace: TranslationNamespace, key: string, params?: Record<string, string | number>) => {
    return t(lang, namespace, key, params);
  };

  // Add language to response headers
  res.setHeader('Content-Language', lang);

  next();
}

/**
 * Create i18n API router
 */
export function createI18nRouter(): Router {
  const router = Router();

  // Get list of supported languages
  router.get('/languages', (req, res) => {
    const languages = SUPPORTED_LANGUAGES.map(code => ({
      code,
      ...LANGUAGE_META[code],
    }));

    res.json({ languages, default: DEFAULT_LANGUAGE });
  });

  // Get translations for a language
  router.get('/translations/:lang', (req, res) => {
    const { lang } = req.params;
    const namespace = req.query.ns as string | undefined;

    if (!SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
      return res.status(400).json({ message: 'Unsupported language' });
    }

    const langTranslations = translations.get(lang as SupportedLanguage);
    if (!langTranslations) {
      return res.status(404).json({ message: 'Translations not found' });
    }

    if (namespace) {
      const nsTranslations = langTranslations[namespace];
      if (!nsTranslations) {
        return res.status(404).json({ message: 'Namespace not found' });
      }
      return res.json({ [namespace]: nsTranslations });
    }

    res.json(langTranslations);
  });

  // Set language preference (via cookie)
  router.post('/set-language', (req, res) => {
    const { lang } = req.body;

    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      return res.status(400).json({ message: 'Unsupported language' });
    }

    res.cookie('locale', lang, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    res.json({ success: true, language: lang });
  });

  return router;
}

// Initialize with default translations
loadDefaultTranslations();

export default {
  t,
  loadTranslations,
  detectLanguage,
  i18nMiddleware,
  createI18nRouter,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_META,
};
