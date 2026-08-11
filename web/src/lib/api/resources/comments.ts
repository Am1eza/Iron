import { http } from '../http';

export type ArticleComment = { id: string; status: 'pending' | 'approved' | 'rejected' };

/** Reader comments on an article (US-14.8) — submit-only from the public
 *  client; the approved list itself is server-rendered with the article
 *  page (`getApprovedComments`), never fetched here. */
export const commentsApi = {
  create: (slug: string, body: string) =>
    http.post<{ comment: ArticleComment }>(`/api/articles/${encodeURIComponent(slug)}/comments`, { body }),
  /** "این نظر مفید بود؟" (US-14.9) — a toggle; calling it again removes
   *  the viewer's own vote. Returns the count AFTER the toggle. */
  toggleHelpful: (commentId: string) =>
    http.post<{ voted: boolean; count: number }>(`/api/comments/${commentId}/helpful`, {}),
  /** Which of these comment ids the current viewer already voted
   *  "helpful" on — resolved client-side (see the route's own comment
   *  for why this can't be server-rendered on an ISR page). */
  myVotes: (commentIds: string[]) =>
    http.get<{ ids: string[] }>(`/api/comments/my-votes?ids=${commentIds.map(encodeURIComponent).join(',')}`),
};
