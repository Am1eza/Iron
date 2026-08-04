/**
 * The combobox semantics ARE the fix here — before this, a screen-reader user
 * could not pick a country at all — so they are asserted through real
 * interaction (roles, aria-activedescendant, focus return), not a render
 * smoke test. The lazy metadata chunk is exercised for real: these tests
 * `await` the dynamic import of `lib/utils/phoneMeta`, which is the same code
 * path the browser takes.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CountrySelect } from './CountrySelect';

vi.mock('next-intl', () => ({
  useLocale: () => 'fa',
  useTranslations: () => (key: string) =>
    ({ country: 'کشور', searchCountry: 'جستجوی کشور', noCountry: 'کشوری یافت نشد' })[key] ?? key,
}));

const openIt = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button'));
  // The country list arrives with the dynamically imported metadata chunk.
  return waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(1));
};

describe('CountrySelect', () => {
  it('names the trigger with the CURRENT country, not just «کشور»', () => {
    render(<CountrySelect value="IR" onChange={() => {}} />);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAccessibleName(/کشور/);
    expect(trigger).toHaveAccessibleName(/ایران/);
    // Iran's dial code is static — it must render with zero metadata loaded.
    expect(trigger).toHaveTextContent('+98');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('exposes a combobox + listbox and tracks the highlight with aria-activedescendant', async () => {
    const user = userEvent.setup();
    render(<CountrySelect value="IR" onChange={() => {}} />);
    await openIt(user);

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    const combobox = screen.getByRole('combobox');
    const listbox = screen.getByRole('listbox');
    expect(combobox).toHaveAttribute('aria-controls', listbox.id);
    expect(combobox).toHaveAttribute('aria-autocomplete', 'list');

    const first = combobox.getAttribute('aria-activedescendant');
    expect(first).toBeTruthy();
    expect(document.getElementById(first as string)).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    const second = combobox.getAttribute('aria-activedescendant');
    expect(second).not.toBe(first);
    expect(document.getElementById(second as string)).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById(first as string)).toHaveAttribute('aria-selected', 'false');
  });

  it('type-ahead filters and Enter selects the highlighted country', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CountrySelect value="IR" onChange={onChange} />);
    await openIt(user);

    await user.type(screen.getByRole('combobox'), '971');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('AE');
    // Selecting closes the popup and hands focus back to the trigger.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveFocus();
  });

  it('Escape closes and returns focus to the trigger instead of dropping it', async () => {
    const user = userEvent.setup();
    render(<CountrySelect value="IR" onChange={() => {}} />);
    await openIt(user);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveFocus();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens from the collapsed trigger with ArrowDown (2.1.1 Keyboard)', async () => {
    const user = userEvent.setup();
    render(<CountrySelect value="IR" onChange={() => {}} />);
    screen.getByRole('button').focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
  });

  it('marks the country in use separately from the highlight', async () => {
    const user = userEvent.setup();
    render(<CountrySelect value="IR" onChange={() => {}} />);
    await openIt(user);
    // Iran is pinned first in the list and is the current value.
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-current', '');
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('(انتخاب‌شده)');
  });
});
