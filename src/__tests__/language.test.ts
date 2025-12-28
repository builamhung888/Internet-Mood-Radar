import { detectLanguage, containsHebrew, containsRussian } from '../lib/language';

describe('Language Detection', () => {
  describe('detectLanguage', () => {
    it('should detect English text', () => {
      expect(detectLanguage('This is English text')).toBe('en');
      expect(detectLanguage('Breaking news from the US')).toBe('en');
    });

    it('should detect Hebrew text', () => {
      expect(detectLanguage('זוהי כתבה בעברית')).toBe('he');
      expect(detectLanguage('ראש הממשלה נתניהו')).toBe('he');
    });

    it('should detect Russian text', () => {
      expect(detectLanguage('Это русский текст')).toBe('ru');
      expect(detectLanguage('Новости из Израиля')).toBe('ru');
    });

    it('should detect mixed Hebrew/English as Hebrew when Hebrew dominates', () => {
      // Hebrew chars should make up the majority for Hebrew detection
      expect(detectLanguage('צה״ל הכוחות שלנו IDF')).toBe('he');
    });

    it('should detect mixed Hebrew/English as English when English dominates', () => {
      expect(detectLanguage('The IDF צה״ל released a statement today about operations')).toBe('en');
    });

    it('should return other for empty or invalid input', () => {
      expect(detectLanguage('')).toBe('other');
      expect(detectLanguage('12345')).toBe('other');
      expect(detectLanguage('   ')).toBe('other');
    });

    it('should handle URLs and special characters', () => {
      expect(detectLanguage('https://example.com Breaking news')).toBe('en');
    });
  });

  describe('containsHebrew', () => {
    it('should return true for text with Hebrew characters', () => {
      expect(containsHebrew('שלום')).toBe(true);
      expect(containsHebrew('Hello שלום world')).toBe(true);
    });

    it('should return false for text without Hebrew characters', () => {
      expect(containsHebrew('Hello world')).toBe(false);
      expect(containsHebrew('Новости')).toBe(false);
    });
  });

  describe('containsRussian', () => {
    it('should return true for text with Russian characters', () => {
      expect(containsRussian('Привет')).toBe(true);
      expect(containsRussian('Hello Привет world')).toBe(true);
    });

    it('should return false for text without Russian characters', () => {
      expect(containsRussian('Hello world')).toBe(false);
      expect(containsRussian('שלום')).toBe(false);
    });
  });
});
