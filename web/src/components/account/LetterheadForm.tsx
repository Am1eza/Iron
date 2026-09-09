'use client';
/**
 * پولادی-tier custom پیش‌فاکتور letterhead editor — lives in ClubPanel, visible
 * only to پولادی members. Logo uploads immediately (own endpoint, own storage
 * write); company name/address/phone save together on submit, matching the
 * rest of the account forms (edit, then one explicit save) rather than the
 * logo's "pick and it's done" pattern, since typos in a company name are more
 * costly to leave half-saved than a wrong logo is to re-pick.
 */
import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { meApi } from '@/lib/api/resources/me';
import { ApiError } from '@/lib/api/errors';
import { compressImageForUpload } from '@/lib/utils/compressImage';
import { isLetterheadUsable } from '@/lib/utils/letterhead';
import { useToast } from '@/lib/hooks/useToast';
import { Button, Badge } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import styles from './LetterheadForm.module.css';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export interface LetterheadValue {
  logoUrl: string | null;
  companyName: string | null;
  address: string | null;
  phone: string | null;
}

export function LetterheadForm({ initial }: { initial: LetterheadValue }) {
  const toast = useToast();
  const t = useTranslations('account.letterhead');
  const errId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [companyName, setCompanyName] = useState(initial.companyName ?? '');
  const [address, setAddress] = useState(initial.address ?? '');
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const usable = isLetterheadUsable({ logoUrl, companyName });

  const handleLogo = async (file: File) => {
    setLogoError(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setLogoError(t('logoTypeError'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setLogoError(t('logoSizeError'));
      return;
    }
    setLogoBusy(true);
    try {
      const { url } = await meApi.letterhead.uploadLogo(await compressImageForUpload(file));
      setLogoUrl(url);
      toast.success(t('logoSuccess'));
    } catch (err) {
      setLogoError(err instanceof ApiError ? err.message : t('logoUploadError'));
    } finally {
      setLogoBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await meApi.letterhead.update({
        companyName: companyName.trim(),
        address: address.trim(),
        phone: phone.trim(),
      });
      toast.success(t('saveSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h4 className={styles.title}>{t('title')}</h4>
        {usable ? <Badge tone="gain">{t('activeBadge')}</Badge> : null}
      </div>
      <p className={styles.lead}>{t('lead')}</p>

      <div className={styles.logoRow}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className={styles.logoPreview} />
        ) : (
          <div className={styles.logoPlaceholder} aria-hidden="true" />
        )}
        <div className={styles.logoActions}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={logoBusy}
            disabled={logoBusy}
            onClick={() => inputRef.current?.click()}
          >
            {logoUrl ? t('logoChange') : t('logoChoose')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="visually-hidden"
            aria-describedby={logoError ? errId : undefined}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleLogo(file);
            }}
          />
        </div>
      </div>
      {logoError ? (
        <p id={errId} role="alert" className={styles.error}>
          {logoError}
        </p>
      ) : null}

      <div className={styles.fields}>
        <TextInput
          label={t('companyNameLabel')}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          maxLength={80}
          placeholder={t('companyNamePlaceholder')}
        />
        <TextInput
          label={t('addressLabel')}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={300}
        />
        <TextInput
          label={t('phoneLabel')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          dir="ltr"
          maxLength={20}
        />
      </div>

      <Button onClick={save} disabled={saving} loading={saving}>
        {saving ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
