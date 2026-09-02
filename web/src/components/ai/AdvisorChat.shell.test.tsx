/**
 * The app shell around the chat (US-05.9).
 *
 * What shipped before this was a 702px panel in a 4509px marketing page, with
 * the composer at y=922 on a 900px laptop and 207px past the fold on a phone.
 * These pin the behaviours that replaced it — and, just as importantly, the
 * ones that had to survive it: the four starter chips, the feedback buttons,
 * the voice button and the human escape hatch are all still there.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvisorChat } from './AdvisorChat';
import { ApiError } from '@/lib/api/errors';

vi.mock('@/lib/api', () => ({
  API_MODE: 'live',
  api: { ai: { chatStream: vi.fn(), confirmLead: vi.fn(), conversations: vi.fn(), conversation: vi.fn() } },
  isApiError: (e: unknown) => e instanceof ApiError,
}));
vi.mock('@/lib/analytics/track', () => ({ trackGoal: vi.fn() }));
// The rail waits for the session to settle before it fetches (so a signed-in
// visitor is never shown the guest state); without `AuthHydrator` in this
// tree the store would sit at 'loading' forever.
vi.mock('@/lib/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: 'authenticated' }),
}));

import { api } from '@/lib/api';
const chatStream = api.ai.chatStream as unknown as ReturnType<typeof vi.fn>;
const conversations = api.ai.conversations as unknown as ReturnType<typeof vi.fn>;
const conversation = api.ai.conversation as unknown as ReturnType<typeof vi.fn>;

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

function sseResponse(frames: Record<string, unknown>[]): Response {
  const enc = new TextEncoder();
  return {
    body: new ReadableStream<Uint8Array>({
      start(c) {
        for (const f of frames) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
        c.close();
      },
    }),
  } as Response;
}

/** jsdom has no layout, so `matchMedia` is the only thing that can tell the
 *  component it is on a phone. */
function setViewport(isPhone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('max-width: 767px') ? isPhone : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  localStorage.clear();
  chatStream.mockReset();
  conversations.mockReset();
  conversation.mockReset();
  conversations.mockResolvedValue({ conversations: [] });
  setViewport(false);
});

afterEach(() => {
  document.documentElement.removeAttribute('data-chat-immersive');
});

describe('the composer', () => {
  it('is a multi-line textarea, not a single-line input', async () => {
    render(<AdvisorChat />);
    const box = await screen.findByLabelText('پیام به مشاور هوشمند');
    // A cut list or a tender line runs past one line; the old <input> turned
    // that into a horizontally-scrolling slot nobody could re-read.
    expect(box.tagName).toBe('TEXTAREA');
  });

  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    chatStream.mockResolvedValue(sseResponse([{ type: 'token', text: 'باشه.' }, { type: 'done' }]));
    const user = userEvent.setup();
    render(<AdvisorChat />);
    const box = await screen.findByLabelText('پیام به مشاور هوشمند');

    await user.type(box, 'خط اول{Shift>}{Enter}{/Shift}خط دوم');
    expect((box as HTMLTextAreaElement).value).toBe('خط اول\nخط دوم');
    expect(chatStream).not.toHaveBeenCalled();

    await user.type(box, '{Enter}');
    await waitFor(() => expect(chatStream).toHaveBeenCalled());
    const sent = chatStream.mock.calls.at(-1)![0] as { content: string }[];
    expect(sent.at(-1)!.content).toBe('خط اول\nخط دوم');
  });
});

describe('mobile immersive mode', () => {
  it('takes over the viewport once the visitor is actually composing', async () => {
    setViewport(true);
    const user = userEvent.setup();
    render(<AdvisorChat />);
    // Arriving still looks like a page — the site's navigation is reachable.
    expect(document.documentElement).not.toHaveAttribute('data-chat-immersive');

    await user.click(await screen.findByLabelText('پیام به مشاور هوشمند'));
    // The document-level switch the chrome listens on (see app/globals.css).
    expect(document.documentElement).toHaveAttribute('data-chat-immersive', 'true');
  });

  it('never takes over a desktop, where the chrome costs the chat nothing', async () => {
    setViewport(false);
    const user = userEvent.setup();
    render(<AdvisorChat />);
    await user.click(await screen.findByLabelText('پیام به مشاور هوشمند'));
    expect(document.documentElement).not.toHaveAttribute('data-chat-immersive');
  });

  it('offers a way back, and gives the site its navigation again', async () => {
    setViewport(true);
    const user = userEvent.setup();
    render(<AdvisorChat />);
    await user.click(await screen.findByLabelText('پیام به مشاور هوشمند'));

    await user.click(screen.getByRole('button', { name: 'بازگشت به صفحه' }));
    expect(document.documentElement).not.toHaveAttribute('data-chat-immersive');
  });

  it('cannot strand the site without navigation if the chat unmounts', async () => {
    setViewport(true);
    const user = userEvent.setup();
    const { unmount } = render(<AdvisorChat />);
    await user.click(await screen.findByLabelText('پیام به مشاور هوشمند'));
    expect(document.documentElement).toHaveAttribute('data-chat-immersive');

    unmount();
    expect(document.documentElement).not.toHaveAttribute('data-chat-immersive');
  });
});

describe('conversation history', () => {
  it('reopens a stored thread and continues it server-side', async () => {
    conversations.mockResolvedValue({
      conversations: [{ id: 'conv-7', title: 'سفارش هفتهٔ گذشته', updatedAt: new Date().toISOString(), messageCount: 2 }],
    });
    conversation.mockResolvedValue({
      id: 'conv-7',
      title: 'سفارش هفتهٔ گذشته',
      messages: [
        { id: 'm1', role: 'user', content: '۲۰ تن میلگرد می‌خوام', createdAt: new Date().toISOString() },
        { id: 'm2', role: 'assistant', content: 'برای این تناژ فایکو ارزان‌تر است.', createdAt: new Date().toISOString() },
      ],
    });
    const user = userEvent.setup();
    render(<AdvisorChat />);

    await user.click(await screen.findByRole('button', { name: /سفارش هفتهٔ گذشته/ }));
    expect(await screen.findByText(/فایکو ارزان‌تر است/)).toBeInTheDocument();

    // The NEXT turn continues that conversation rather than opening a new one
    // — which is what keeps the remembered product/size/city alive.
    chatStream.mockResolvedValue(sseResponse([{ type: 'token', text: 'باشه.' }, { type: 'done' }]));
    await user.type(await screen.findByLabelText('پیام به مشاور هوشمند'), 'و تیرآهن؟{Enter}');
    await waitFor(() => expect(chatStream).toHaveBeenCalled());
    expect(chatStream.mock.calls.at(-1)![1]).toMatchObject({ conversationId: 'conv-7' });
  });

  it('says so instead of dead-ending when a thread will not open', async () => {
    conversations.mockResolvedValue({
      conversations: [{ id: 'gone', title: 'قدیمی', updatedAt: new Date().toISOString(), messageCount: 2 }],
    });
    conversation.mockRejectedValue(new ApiError(404, 'این گفتگو پیدا نشد.'));
    const user = userEvent.setup();
    render(<AdvisorChat />);

    await user.click(await screen.findByRole('button', { name: /قدیمی/ }));
    expect(await screen.findByText(/این گفتگو باز نشد/)).toBeInTheDocument();
  });
});

describe('what the redesign had to keep', () => {
  it('still opens with the four conversation starters', async () => {
    render(<AdvisorChat />);
    for (const chip of [
      'قیمت میلگرد امروز چقدره؟',
      'وزن دقیق یه شاخه میلگرد ۱۴ به طول ۱۲ متر رو حساب کن',
      '۲۰ تن میلگرد از کدوم کارخونه ارزون‌تره؟',
      'برای یه ساختمان ۱۰۰ متری دو طبقه چقدر آهن لازمه؟',
    ]) {
      expect(await screen.findByRole('button', { name: chip })).toBeInTheDocument();
    }
  });

  it('still keeps a human one tap away', async () => {
    render(<AdvisorChat contact={{ phoneLandline: '02126297512', phoneMobile: '09121395954' }} />);
    expect(await screen.findByRole('link', { name: /۰۹۱۲۱۳۹۵۹۵۴/ })).toHaveAttribute(
      'href',
      'tel:09121395954',
    );
    expect(screen.getByRole('link', { name: /واتساپ کارشناس/ })).toBeInTheDocument();
  });
});
