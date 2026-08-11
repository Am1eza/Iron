import { http } from '../http';

export type ArticleComment = { id: string; status: 'pending' | 'approved' | 'rejected' };

/** Reader comments on an article (US-14.8) — submit-only from the public
 *  client; the approved list itself is server-rendered with the article
 *  page (`getApprovedComments`), never fetched here. */
export const commentsApi = {
  create: (slug: string, body: string) =>
    http.post<{ comment: ArticleComment }>(`/api/articles/${encodeURIComponent(slug)}/comments`, { body }),
};
