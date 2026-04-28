import classNames from 'classnames';
import { useTranslation } from 'react-i18next';

import TextLink from '@/ds-components/TextLink';
import useTenantPathname from '@/hooks/use-tenant-pathname';

import styles from './index.module.scss';

function UpsellNotice() {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { navigate } = useTenantPathname();

  // [UNLOCKED] Upsell notice disabled — branding features available in all environments.
  // Original condition: if (!isCloud || isBringYourUiEnabled) { return null; }

  return (
    <div className={classNames(styles.inlineNotification, styles.info, styles.plain)}>
      <div className={styles.content}>{t('upsell.paywall.branding_customization')}</div>
      <div className={styles.action}>
        <TextLink
          onClick={() => {
            navigate('/tenant-settings/subscription');
          }}
        >
          {t('upsell.view_plans')}
        </TextLink>
      </div>
    </div>
  );
}

export default UpsellNotice;
