export const cleanNoticeContent = (value?: string): string => (value || '')
  .replace(/^\[Setor:\s*.+?\]\s*/i, '')
  .trim();

export const noticePreview = (value?: string, maxLength = 120): string => {
  const content = cleanNoticeContent(value).replace(/\s+/g, ' ');
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength).trimEnd()}…`;
};

export const noticeAuthor = (employeeName?: string, responsible?: string): string =>
  employeeName || responsible || 'Equipe Campo Legado';

